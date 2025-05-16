use actix_cors::Cors;
use actix_files::Files;
use actix_multipart::Multipart;
use actix_web::http::header;
use actix_web::{
    App, HttpRequest, HttpResponse, HttpServer, Responder, delete, get, post, put, web,
};
use diesel::RunQueryDsl;
use diesel::pg::PgConnection;
use diesel::prelude::*;
use dotenv::dotenv;
use env_logger;
use futures::{StreamExt, TryStreamExt};
use log::{error, info};
use mime::Mime;
use sanitize_filename::sanitize;
use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use uuid::Uuid;

pub mod auth;
pub mod db;
pub mod email;
pub mod models;
pub mod schema;

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use serde::{Deserialize, Serialize};

const UPLOAD_DIR: &str =
    "/home/maria/Documents/cryptocurrency-exchange/crypto-exchange-app/uploads/id_documents";

fn is_valid_image(content_type: &Mime) -> bool {
    match content_type.to_string().as_str() {
        "image/jpeg" | "image/png" | "application/pdf" => true,
        _ => false,
    }
}

#[post("/id-document")]
async fn upload_id_document(
    req: HttpRequest,
    mut payload: Multipart,
    pool: web::Data<db::DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let current_user_id = auth::extract_user_id(&req)?;

    // Create upload directory if it doesn't exist
    if !Path::new(UPLOAD_DIR).exists() {
        if let Err(e) = std::fs::create_dir_all(UPLOAD_DIR) {
            error!("Failed to create upload directory: {}", e);
            return Err(actix_web::error::ErrorInternalServerError(
                "Failed to process upload",
            ));
        }
    }

    // Process file upload
    while let Ok(Some(mut field)) = payload.try_next().await {
        let content_disposition = field.content_disposition();

        let filename = content_disposition
            .get_filename()
            .map_or_else(|| Uuid::new_v4().to_string(), sanitize);

        let content_type = field
            .content_type()
            .map(|ct| ct.clone())
            .unwrap_or(mime::APPLICATION_OCTET_STREAM);

        // Validate file type
        if !is_valid_image(&content_type) {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid file type. Only JPG, PNG, and PDF files are allowed."
            })));
        }

        // Generate a unique filename
        let file_ext = match content_type.to_string().as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "application/pdf" => "pdf",
            _ => "bin",
        };

        let file_name = format!(
            "{}_id_front_{}.{}",
            current_user_id,
            Uuid::new_v4(),
            file_ext
        );
        let file_path = format!("{}/{}", UPLOAD_DIR, file_name);
        let db_path = format!("/uploads/id_documents/{}", file_name);
        let db_path_clone = db_path.clone(); // Clone db_path to avoid move issues

        // Create the file
        let file_path_clone = file_path.clone();
        use std::sync::{Arc, Mutex};
        let file = Arc::new(Mutex::new(
            match web::block(move || std::fs::File::create(&file_path_clone)).await {
                Ok(file) => file,
                Err(_) => {
                    error!("Failed to create file: {}", file_path);
                    return Err(actix_web::error::ErrorInternalServerError(
                        "Failed to create file",
                    ));
                }
            },
        ));

        // Write to the file
        while let Some(chunk) = field.next().await {
            let data = chunk.map_err(|_| {
                error!("Failed to read file chunk");
                actix_web::error::ErrorInternalServerError("Failed to upload file")
            })?;

            let file_clone = Arc::clone(&file);
            web::block(move || {
                let mut file = file_clone.lock().map_err(|_| {
                    std::io::Error::new(std::io::ErrorKind::Other, "Failed to acquire file lock")
                })?;
                if let Ok(ref mut file) = *file {
                    file.write_all(&data)
                } else {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "Failed to access file",
                    ))
                }
            })
            .await
            .map_err(|_| {
                error!("Failed to write to file");
                actix_web::error::ErrorInternalServerError("Failed to upload file")
            })?;
        }

        // Update the user_verifications table
        let mut conn = pool.get().map_err(|_| {
            actix_web::error::ErrorInternalServerError("Failed to get database connection")
        })?;

        use schema::user_verifications::dsl::*;
        let result = web::block(move || {
            diesel::update(user_verifications.filter(user_id.eq(current_user_id)))
                .set((
                    id_front_path.eq(&db_path_clone),
                    id_verification_status.eq("pending_review"),
                    updated_at.eq(diesel::dsl::now),
                ))
                .get_result::<models::UserVerification>(&mut conn)
                .optional()
        })
        .await
        .map_err(|_| {
            error!("Failed to update verification record");
            actix_web::error::ErrorInternalServerError("Failed to update verification record")
        })?;

        // Check if user has a verification record
        if result.is_err() {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "You must complete personal information verification before uploading ID document"
            })));
        }

        // Set appropriate permissions for the file
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&file_path)
                .map_err(|e| {
                    actix_web::error::ErrorInternalServerError(format!(
                        "Failed to get permissions: {}",
                        e
                    ))
                })?
                .permissions();

            // Set read/write permissions for owner and read permissions for group
            perms.set_mode(0o644); // Owner can read/write, group and others can read
            std::fs::set_permissions(&file_path, perms).map_err(|e| {
                actix_web::error::ErrorInternalServerError(format!(
                    "Failed to set permissions: {}",
                    e
                ))
            })?;
        }

        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "message": "ID document uploaded successfully",
            "status": "pending_review",
            "file_path": db_path
        })));
    }

    Ok(HttpResponse::BadRequest().json(serde_json::json!({
        "error": "No file uploaded"
    })))
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Failed to hash password: {}", e))
}

fn verify_password(stored_hash: &str, password: &str) -> Result<bool, String> {
    let parsed_hash =
        PasswordHash::new(stored_hash).map_err(|e| format!("Failed to parse hash: {}", e))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

#[get("/")]
async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now()
    }))
}

pub fn get_users(connection: &mut PgConnection) -> Vec<models::User> {
    use schema::users::dsl::*;

    users
        .load::<models::User>(connection)
        .expect("Error loading users")
}

#[get("/users")]
async fn users_route(pool: web::Data<db::DbPool>) -> impl Responder {
    let mut conn = pool.get().expect("Failed to get db connection from pool");

    let users = web::block(move || get_users(&mut *conn)).await.unwrap();

    // Convert User objects to UserResponse objects to avoid sending passwords
    let user_responses: Vec<models::UserResponse> =
        users.into_iter().map(models::UserResponse::from).collect();

    HttpResponse::Ok().json(user_responses)
}

fn validate_password(password: &str) -> Result<(), String> {
    if password.len() < 12 {
        return Err("Password must be at least 12 characters long".to_string());
    }

    if !password.chars().any(|c| c.is_numeric()) {
        return Err("Password must contain at least 1 number".to_string());
    }

    if !password.chars().any(|c| c.is_alphabetic()) {
        return Err("Password must contain at least 1 letter".to_string());
    }

    if !password.chars().any(|c| !c.is_alphanumeric()) {
        return Err("Password must contain at least 1 special character".to_string());
    }

    Ok(())
}

#[post("/sign-up")]
async fn sign_up(
    pool: web::Data<db::DbPool>,
    new_user: web::Json<models::NewUser>,
) -> Result<HttpResponse, actix_web::Error> {
    // Existing validation code
    if let Err(message) = validate_password(&new_user.password) {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": message
        })));
    }

    // Existing password hashing
    let hashed_password = match hash_password(&new_user.password) {
        Ok(hash) => hash,
        Err(e) => {
            error!("Password hashing error: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to process password"
            })));
        }
    };

    // Replace plain password with hashed password
    let mut new_user_inner = new_user.into_inner();
    new_user_inner.password = hashed_password;

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // CHANGE: Get the created user record back
    let user = web::block(move || {
        diesel::insert_into(schema::users::table)
            .values(&new_user_inner)
            .get_result::<models::User>(&mut *conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to create user: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to create user")
    })?;

    // Generate token for the user
    let user = match user {
        Ok(user) => user,
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve user data"
            })));
        }
    };

    let token = match auth::generate_token(user.id) {
        Ok(token) => token,
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to generate authentication token"
            })));
        }
    };

    // Return user data with the token
    let user_response = models::UserResponse::from(user);

    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": "User created successfully",
        "user": user_response,
        "token": token
    })))
}

#[post("/login")]
async fn login(
    pool: web::Data<db::DbPool>,
    login_data: web::Json<models::LoginRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Extract credentials before moving login_data
    let user_email = login_data.email.clone();
    let user_password = login_data.password.clone();

    // Find the user by email
    use schema::users::dsl::*;
    let user_result = web::block(move || {
        users
            .filter(email.eq(&user_email))
            .first::<models::User>(&mut *conn)
            .optional()
    })
    .await
    .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to query database"))?;

    // Fixed match statement
    match user_result {
        Ok(Some(user)) => {
            match verify_password(&user.password, &user_password) {
                Ok(true) => {
                    // Generate JWT token
                    let token = match auth::generate_token(user.id) {
                        Ok(token) => token,
                        Err(_) => {
                            return Ok(HttpResponse::InternalServerError().json(
                                serde_json::json!({
                                    "error": "Failed to generate authentication token"
                                }),
                            ));
                        }
                    };

                    // Convert to UserResponse to avoid sending password
                    let user_response = models::UserResponse::from(user);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "message": "Login successful",
                        "token": token,
                        "user": user_response
                    })))
                }
                Ok(false) => Ok(HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "Invalid email or password"
                }))),
                Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Authentication error"
                }))),
            }
        }
        Ok(none) => Ok(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Invalid email or password"
        }))),
        Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Database error during login"
        }))),
    }
}

#[put("")]
async fn update_verify(
    pool: web::Data<db::DbPool>,
    verification_data: web::Json<models::VerificationRequest>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let current_user_id = auth::extract_user_id(&req)?;

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Update existing verification or create if it doesn't exist
    use schema::user_verifications::dsl::*;

    // Try to find existing verification
    let existing = web::block(move || {
        user_verifications
            .filter(user_id.eq(current_user_id))
            .first::<models::UserVerification>(&mut conn)
            .optional()
    })
    .await
    .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Update or insert verification
    let verification_result = match existing {
        Ok(Some(existing_verification)) => {
            // Update existing record
            web::block(move || {
                diesel::update(user_verifications.find(existing_verification.id))
                    .set((
                        first_name.eq(&verification_data.first_name),
                        last_name.eq(&verification_data.last_name),
                        dob_day.eq(verification_data.dob_day),
                        dob_month.eq(verification_data.dob_month),
                        dob_year.eq(verification_data.dob_year),
                        street_address.eq(&verification_data.street_address),
                        apartment.eq(&verification_data.apartment),
                        city.eq(&verification_data.city),
                        postal_code.eq(&verification_data.postal_code),
                        country_code.eq(&verification_data.country_code),
                        phone_number.eq(&verification_data.phone_number),
                        occupation.eq(&verification_data.occupation),
                        updated_at.eq(diesel::dsl::now),
                    ))
                    .get_result::<models::UserVerification>(&mut conn)
            })
            .await
        }
        Ok(None) => {
            // Create a new verification
            let new_verification = models::NewUserVerification {
                user_id: current_user_id,
                first_name: verification_data.first_name.clone(),
                last_name: verification_data.last_name.clone(),
                dob_day: verification_data.dob_day,
                dob_month: verification_data.dob_month,
                dob_year: verification_data.dob_year,
                street_address: verification_data.street_address.clone(),
                apartment: verification_data.apartment.clone(),
                city: verification_data.city.clone(),
                postal_code: verification_data.postal_code.clone(),
                country_code: verification_data.country_code.clone(),
                phone_number: verification_data.phone_number.clone(),
                occupation: verification_data.occupation.clone(),
            };

            web::block(move || {
                diesel::insert_into(schema::user_verifications::table)
                    .values(&new_verification)
                    .get_result::<models::UserVerification>(&mut conn)
            })
            .await
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error when retrieving verification info"
            })));
        }
    };

    // Replace the match block in the update_verify function (starting around line 461)
    match verification_result {
        Ok(verification) => {
            // Now we're handling a Result<UserVerification, diesel::result::Error>
            match verification {
                Ok(verification_data) => Ok(HttpResponse::Ok().json(serde_json::json!({
                    "status": verification_data.verification_status,
                    "verification": models::VerificationResponse::from(verification_data)
                }))),
                Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Database error updating verification"
                }))),
            }
        }
        Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Failed to process verification request"
        }))),
    }
}

// Get verification status
#[get("/status")]
async fn verification_status(
    pool: web::Data<db::DbPool>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let current_user_id = auth::extract_user_id(&req)?;

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Get verification status
    use schema::user_verifications::dsl::*;
    let verification_result = web::block(move || {
        user_verifications
            .filter(user_id.eq(current_user_id))
            .first::<models::UserVerification>(&mut conn)
            .optional()
    })
    .await
    .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

    // Return appropriate response
    match verification_result {
        Ok(Some(verification)) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": verification.verification_status,
            "verification": models::VerificationResponse::from(verification)
        }))),
        Ok(None) => {
            // Not an error - just means the user hasn't submitted verification yet
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "not_submitted",
                "verification": null
            })))
        }
        Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Database error when retrieving verification status"
        }))),
    }
}

#[get("/profile")]
async fn user_profile(
    req: HttpRequest,
    pool: web::Data<db::DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let current_user_id = auth::extract_user_id(&req)?;

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Get user data
    use schema::users::dsl::*;
    let user_result = web::block(move || {
        users
            .filter(id.eq(current_user_id))
            .first::<models::User>(&mut conn)
    })
    .await
    .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to query database"))?;

    let user = match user_result {
        Ok(user) => user,
        Err(_) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "User not found"
            })));
        }
    };

    // Create response with UserResponse which now includes is_admin
    let response = models::UserResponse::from(user);

    Ok(HttpResponse::Ok().json(serde_json::json!({ "user": response })))
}

// Add this new endpoint for admin access

#[get("/check")]
async fn check_admin_access(
    req: HttpRequest,
    pool: web::Data<db::DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Check if the user has admin access
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            // User is an admin
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "message": "You have admin access"
            })))
        }
        Err(response) => {
            // Not an admin, return the error response
            Ok(response)
        }
    }
}

// Add these new imports at the top if not already present
use chrono::NaiveDateTime;

// Add this new endpoint for the verification queue
#[get("/queue")]
async fn verification_queue(
    req: HttpRequest,
    pool: web::Data<db::DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Check if the user has admin access first
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            // User is an admin, proceed to fetch the verification queue
            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Failed to get database connection")
            })?;

            // Get all user verifications with pending ID document verification
            use schema::user_verifications::dsl::*;

            let pending_verifications = web::block(move || {
                user_verifications
                    .filter(id_verification_status.eq("pending_review"))
                    .order_by(updated_at.desc())
                    .load::<models::UserVerification>(&mut conn)
            })
            .await
            .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

            match pending_verifications {
                Ok(verifications) => {
                    // Structure to return verification with user info
                    #[derive(Serialize)]
                    struct VerificationWithUser {
                        verification: models::UserVerification,
                        user: Option<models::User>,
                    }

                    // For each verification, get the associated user
                    let mut verifications_with_users = Vec::new();
                    for verification in verifications {
                        let mut conn = pool.get().map_err(|_| {
                            actix_web::error::ErrorInternalServerError(
                                "Failed to get database connection",
                            )
                        })?;

                        use schema::users::dsl::*;
                        let user_result = web::block(move || {
                            users
                                .filter(id.eq(verification.user_id))
                                .first::<models::User>(&mut conn)
                                .optional()
                        })
                        .await
                        .map_err(|_| {
                            actix_web::error::ErrorInternalServerError("Database error")
                        })?;

                        verifications_with_users.push(VerificationWithUser {
                            verification,
                            user: user_result.unwrap_or(None),
                        });
                    }

                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "queue": verifications_with_users
                    })))
                }
                Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to retrieve verification queue"
                }))),
            }
        }
        Err(response) => {
            // Not an admin, return the error response
            Ok(response)
        }
    }
}

// Add an endpoint to update verification status
#[put("/verify/{verification_id}")]
async fn update_verification_status(
    req: HttpRequest,
    pool: web::Data<db::DbPool>,
    path: web::Path<i32>,
    status_update: web::Json<serde_json::Value>,
) -> Result<HttpResponse, actix_web::Error> {
    // Check if the user has admin access
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            let verification_id = path.into_inner();
            // Extract status string before moving status_update
            let status = status_update
                .get("status")
                .and_then(|s| s.as_str())
                .unwrap_or("pending_review")
                .to_string(); // Convert to owned String to avoid borrowing issues

            if status != "approved" && status != "rejected" {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Invalid status. Must be 'approved' or 'rejected'."
                })));
            }

            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Failed to get database connection")
            })?;

            // Update the verification status
            use schema::user_verifications::dsl::*;
            let result = web::block(move || {
                diesel::update(user_verifications.filter(id.eq(verification_id)))
                    .set((
                        id_verification_status.eq(status),
                        id_verified_at.eq(chrono::Local::now().naive_local()),
                        updated_at.eq(chrono::Local::now().naive_local()),
                    ))
                    .get_result::<models::UserVerification>(&mut conn)
            })
            .await
            .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

            match result {
                Ok(updated_verification) => Ok(HttpResponse::Ok().json(serde_json::json!({
                    "status": "success",
                    "verification": models::VerificationResponse::from(updated_verification)
                }))),
                Err(_) => Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Verification not found or could not be updated"
                }))),
            }
        }
        Err(response) => {
            // Not an admin, return the error response
            Ok(response)
        }
    }
}

// Add this new endpoint

use std::path::PathBuf;

#[get("/document/{filename}")]
async fn serve_document(
    req: HttpRequest,
    filename: web::Path<String>,
    pool: web::Data<db::DbPool>,
) -> Result<actix_files::NamedFile, actix_web::Error> {
    // Only admins can access documents
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            // Admin is authenticated, serve the file
            let filename = filename.into_inner();
            // Fix: Look for files in the correct directory
            let path = PathBuf::from("uploads/id_documents").join(&filename);

            log::info!("Attempting to serve document: {:?}", path);

            match actix_files::NamedFile::open(&path) {
                Ok(file) => {
                    log::info!("Successfully serving document: {:?}", filename);
                    Ok(file)
                }
                Err(e) => {
                    log::error!("Failed to open document {}: {}", filename, e);
                    Err(actix_web::error::ErrorNotFound("Document not found"))
                }
            }
        }
        Err(_) => Err(actix_web::error::ErrorForbidden("Admin access required")),
    }
}

// Get all users (for admin)
#[get("/users")]
async fn admin_get_users(
    req: HttpRequest,
    pool: web::Data<db::DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Check if the user has admin access first
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            // User is an admin, fetch all users
            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Failed to get database connection")
            })?;

            // Get all users
            use schema::users::dsl::*;
            let all_users =
                web::block(move || users.order_by(id.asc()).load::<models::User>(&mut conn))
                    .await
                    .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

            match all_users {
                Ok(user_list) => {
                    // Convert users to UserResponse to avoid sending passwords
                    let user_responses: Vec<models::UserResponse> = user_list
                        .into_iter()
                        .map(models::UserResponse::from)
                        .collect();

                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "users": user_responses
                    })))
                }
                Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to retrieve users"
                }))),
            }
        }
        Err(response) => {
            // Not an admin, return the error response
            Ok(response)
        }
    }
}

// Create new user (admin only)
#[post("/users")]
async fn admin_create_user(
    req: HttpRequest,
    pool: web::Data<db::DbPool>,
    new_user_data: web::Json<models::NewUser>,
) -> Result<HttpResponse, actix_web::Error> {
    // Check if the user has admin access
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            // Validate password
            if let Err(message) = validate_password(&new_user_data.password) {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": message
                })));
            }

            // Hash the password
            let hashed_password = match hash_password(&new_user_data.password) {
                Ok(hash) => hash,
                Err(e) => {
                    error!("Password hashing error: {}", e);
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to process password"
                    })));
                }
            };

            // Create new user with hashed password
            let mut new_user = new_user_data.into_inner();
            new_user.password = hashed_password;

            // Insert into database
            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Failed to get database connection")
            })?;

            let user_result = web::block(move || {
                diesel::insert_into(schema::users::table)
                    .values(&new_user)
                    .get_result::<models::User>(&mut conn)
            })
            .await
            .map_err(|e| {
                error!("Failed to create user: {:?}", e);
                actix_web::error::ErrorInternalServerError("Failed to create user")
            })?;

            match user_result {
                Ok(user) => {
                    let user_response = models::UserResponse::from(user);
                    Ok(HttpResponse::Created().json(serde_json::json!({
                        "message": "User created successfully",
                        "user": user_response
                    })))
                }
                Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to create user"
                }))),
            }
        }
        Err(response) => {
            // Not an admin, return the error response
            Ok(response)
        }
    }
}

// Update existing user (admin only)
#[put("/users/{user_id}")]
async fn admin_update_user(
    req: HttpRequest,
    path: web::Path<i32>,
    pool: web::Data<db::DbPool>,
    user_data: web::Json<serde_json::Value>,
) -> Result<HttpResponse, actix_web::Error> {
    // Check if the user has admin access
    match auth::require_admin(&req, &pool).await {
        Ok(_) => {
            let user_id = path.into_inner();
            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Failed to get database connection")
            })?;

            // Check if user exists
            use schema::users::dsl::*;
            let user_exists = web::block(move || {
                users
                    .filter(id.eq(user_id))
                    .count()
                    .get_result::<i64>(&mut conn)
            })
            .await
            .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

            if user_exists.unwrap_or(0) == 0 {
                return Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "User not found"
                })));
            }

            // Prepare update data
            let mut update_data = serde_json::Map::new();

            // Extract fields to update
            if let Some(username_val) = user_data.get("username") {
                if let Some(username_str) = username_val.as_str() {
                    update_data.insert(
                        "username".to_string(),
                        serde_json::Value::String(username_str.to_string()),
                    );
                }
            }

            if let Some(email_val) = user_data.get("email") {
                if let Some(email_str) = email_val.as_str() {
                    update_data.insert(
                        "email".to_string(),
                        serde_json::Value::String(email_str.to_string()),
                    );
                }
            }

            if let Some(is_admin_val) = user_data.get("is_admin") {
                if let Some(is_admin_bool) = is_admin_val.as_bool() {
                    update_data.insert(
                        "is_admin".to_string(),
                        serde_json::Value::Bool(is_admin_bool),
                    );
                }
            }

            // Handle password separately (needs to be hashed)
            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Failed to get database connection")
            })?;

            if let Some(password_val) = user_data.get("password") {
                if let Some(password_str) = password_val.as_str() {
                    if !password_str.is_empty() {
                        // Validate password
                        if let Err(message) = validate_password(password_str) {
                            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                                "error": message
                            })));
                        }

                        // Hash the password
                        let hashed_password = match hash_password(password_str) {
                            Ok(hash) => hash,
                            Err(e) => {
                                error!("Password hashing error: {}", e);
                                return Ok(HttpResponse::InternalServerError().json(
                                    serde_json::json!({
                                        "error": "Failed to process password"
                                    }),
                                ));
                            }
                        };

                        update_data.insert(
                            "password".to_string(),
                            serde_json::Value::String(hashed_password),
                        );
                    }
                }
            }

            // If nothing to update, return early
            if update_data.is_empty() {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "No valid fields to update"
                })));
            }

            // Perform the update
            let update_user_id = user_id; // Clone for the closure
            let update_result = web::block(move || -> Result<i32, diesel::result::Error> {
                // Perform updates directly without collecting them first

                // Collect all the fields to update
                if let Some(username_val) = update_data.get("username") {
                    if let Some(username_str) = username_val.as_str() {
                        diesel::update(users.filter(id.eq(update_user_id)))
                            .set(username.eq(username_str))
                            .execute(&mut conn)?;
                    }
                }

                if let Some(email_val) = update_data.get("email") {
                    if let Some(email_str) = email_val.as_str() {
                        diesel::update(users.filter(id.eq(update_user_id)))
                            .set(email.eq(email_str))
                            .execute(&mut conn)?;
                    }
                }

                if let Some(password_val) = update_data.get("password") {
                    if let Some(password_str) = password_val.as_str() {
                        diesel::update(users.filter(id.eq(update_user_id)))
                            .set(password.eq(password_str))
                            .execute(&mut conn)?;
                    }
                }

                if let Some(is_admin_val) = update_data.get("is_admin") {
                    if let Some(is_admin_bool) = is_admin_val.as_bool() {
                        diesel::update(users.filter(id.eq(update_user_id)))
                            .set(is_admin.eq(is_admin_bool))
                            .execute(&mut conn)?;
                    }
                }

                // Return 1 to indicate success
                Ok(1)
            })
            .await
            .map_err(|e| {
                error!("Failed to update user: {:?}", e);
                actix_web::error::ErrorInternalServerError("Failed to update user")
            })?;

            match update_result {
                Ok(_) => {
                    // Fetch the updated user to return in response
                    let mut conn = pool.get().map_err(|_| {
                        actix_web::error::ErrorInternalServerError(
                            "Failed to get database connection",
                        )
                    })?;

                    let updated_user = web::block(move || {
                        users
                            .filter(id.eq(user_id))
                            .first::<models::User>(&mut conn)
                    })
                    .await
                    .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

                    match updated_user {
                        Ok(user) => {
                            let user_response = models::UserResponse::from(user);
                            Ok(HttpResponse::Ok().json(serde_json::json!({
                                "message": "User updated successfully",
                                "user": user_response
                            })))
                        }
                        Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                            "error": "Failed to retrieve updated user"
                        }))),
                    }
                }
                Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to update user"
                }))),
            }
        }
        Err(response) => {
            // Not an admin, return the error response
            Ok(response)
        }
    }
}

// This would go in your main.rs or a separate auth file
#[post("/user/request-password-reset")]
async fn request_password_reset(
    pool: web::Data<db::DbPool>,
    request_data: web::Json<models::PasswordResetRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_email = request_data.email.clone();

    // Check if user exists first
    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    use schema::users::dsl::*;
    // Clone the email before moving it into the closure
    let email_for_query = user_email.clone();
    let user_result = web::block(move || {
        users
            .filter(email.eq(email_for_query))
            .first::<models::User>(&mut conn)
            .optional()
    })
    .await
    .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

    // We'll generate and send a reset token only if the user exists
    if let Ok(Some(user)) = user_result {
        // Generate a secure random token
        let reset_token = uuid::Uuid::new_v4().to_string();

        // Set token expiration (1 hour from now)
        let token_expires_at = chrono::Utc::now() + chrono::Duration::hours(1);

        // Get a new connection for the next operation
        let mut conn = pool.get().map_err(|_| {
            actix_web::error::ErrorInternalServerError("Failed to get database connection")
        })?;

        // Store token in password_reset_tokens table
        use schema::password_reset_tokens::dsl::*;

        // First, delete any existing tokens for this user
        let user_id_for_delete = user.id;
        let delete_result = web::block(move || {
            diesel::delete(password_reset_tokens.filter(user_id.eq(user_id_for_delete)))
                .execute(&mut conn)
        })
        .await;

        // Log but don't fail if deletion fails
        if let Err(e) = &delete_result {
            log::warn!("Failed to delete existing tokens: {:?}", e);
        }

        // Get a new connection after the delete operation
        let mut conn = pool.get().map_err(|_| {
            actix_web::error::ErrorInternalServerError("Failed to get database connection")
        })?;

        // Create new reset token record
        let new_token = models::NewPasswordResetToken {
            user_id: user.id,
            token: reset_token.clone(),
            expires_at: token_expires_at.naive_utc(),
        };

        let insert_result = web::block(move || {
            diesel::insert_into(schema::password_reset_tokens::table)
                .values(&new_token)
                .execute(&mut conn)
        })
        .await;

        match insert_result {
            Ok(_) => {
                // Send the reset email
                if let Err(err) =
                    crate::email::send_password_reset_email(&user.email, &reset_token).await
                {
                    // Log the error but don't reveal it to the user
                    error!("Failed to send password reset email: {}", err);

                    // Fall back to logging the token for development environments
                    info!(
                        "Password reset link for {}: http://localhost:3000/reset-password?token={}&email={}",
                        user.email, reset_token, user.email
                    );
                }
            }
            Err(e) => {
                // Log the error but continue to return success for security
                error!("Failed to store password reset token: {:?}", e);
            }
        }
    } else {
        // User not found, but we don't want to reveal this fact for security reasons
        info!(
            "Password reset requested for non-existent email: {}",
            user_email
        );
    }

    // For security reasons, always return success even if there were internal errors
    // This prevents user enumeration attacks
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "If an account with that email exists, a reset link has been sent."
    })))
}

#[post("/user/reset-password")]
async fn reset_password(
    pool: web::Data<db::DbPool>,
    request_data: web::Json<models::ResetPasswordRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Validate the new password
    if let Err(message) = validate_password(&request_data.new_password) {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": message
        })));
    }

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Get user ID from email
    use schema::users::dsl as users_dsl;
    let email_for_query = request_data.email.clone();
    let user_result = web::block(move || {
        users_dsl::users
            .filter(users_dsl::email.eq(email_for_query))
            .select(users_dsl::id)
            .first::<i32>(&mut conn)
            .optional()
    })
    .await
    .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

    // Get new connection for next query
    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Check if user exists and validate the token
    if let Ok(Some(user_id)) = user_result {
        // Check if token is valid, not expired, and not used
        use schema::password_reset_tokens::dsl as tokens_dsl;
        let token_for_query = request_data.token.clone();
        let token_result = web::block(move || {
            tokens_dsl::password_reset_tokens
                .filter(tokens_dsl::user_id.eq(user_id))
                .filter(tokens_dsl::token.eq(token_for_query))
                .filter(tokens_dsl::expires_at.gt(chrono::Utc::now().naive_utc()))
                .filter(tokens_dsl::used.eq(false))
                .first::<models::PasswordResetToken>(&mut conn)
                .optional()
        })
        .await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

        match token_result {
            Ok(Some(token_record)) => {
                // Token is valid, hash the new password
                let hashed_password = match hash_password(&request_data.new_password) {
                    Ok(hash) => hash,
                    Err(e) => {
                        error!("Password hashing error: {}", e);
                        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                            "error": "Failed to process password"
                        })));
                    }
                };

                // Get new connection for update operations
                let mut conn = pool.get().map_err(|_| {
                    actix_web::error::ErrorInternalServerError("Failed to get database connection")
                })?;

                // Update the user's password
                let user_id_for_update = token_record.user_id;
                let update_result = web::block(move || {
                    diesel::update(users_dsl::users.filter(users_dsl::id.eq(user_id_for_update)))
                        .set(users_dsl::password.eq(&hashed_password))
                        .execute(&mut conn)
                })
                .await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database error"))?;

                if let Ok(rows_affected) = update_result {
                    if rows_affected > 0 {
                        // Password updated successfully, now mark the token as used
                        let mut conn = pool.get().map_err(|_| {
                            actix_web::error::ErrorInternalServerError(
                                "Failed to get database connection",
                            )
                        })?;

                        let token_id = token_record.id;
                        let _ = web::block(move || {
                            diesel::update(tokens_dsl::password_reset_tokens.find(token_id))
                                .set(tokens_dsl::used.eq(true))
                                .execute(&mut conn)
                        })
                        .await;

                        return Ok(HttpResponse::Ok().json(serde_json::json!({
                            "message": "Password has been reset successfully. You can now log in with your new password."
                        })));
                    }
                }

                // If we reach this point, password update failed
                Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to update password"
                })))
            }
            _ => {
                // Token is invalid, expired, or already used
                Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Invalid or expired password reset token"
                })))
            }
        }
    } else {
        // User not found, but for security reasons we use the same error message
        Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid or expired password reset token"
        })))
    }
}
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    if std::env::var("SMTP_PASSWORD").is_err() {
        eprintln!("Warning: SMTP_PASSWORD not found in environment");
    }
    env_logger::init();

    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());

    let pool = db::establish_connection_pool();

    info!("Starting server at {}:{}", host, port);

    // Create uploads directory if it doesn't exist
    let uploads_dir = Path::new("uploads");
    if !uploads_dir.exists() {
        std::fs::create_dir_all(uploads_dir).expect("Failed to create uploads directory");
    }

    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("http://localhost:3000")
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::CONTENT_TYPE,
                actix_web::http::header::ACCEPT,
            ])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .app_data(web::Data::new(pool.clone()))
            .wrap(actix_web::middleware::Logger::default())
            .wrap(cors)
            // Add this line to serve static files
            .service(Files::new("/uploads", "uploads").show_files_listing())
            .service(health_check)
            .service(users_route)
            .service(sign_up)
            .service(login)
            .service(request_password_reset)
            .service(reset_password)
            .service(
                web::scope("/verify")
                    .service(update_verify)
                    .service(verification_status)
                    .service(upload_id_document),
            )
            .service(
                web::scope("/user")
                    .service(user_profile), // Add this line
            )
            .service(
                web::scope("/admin")
                    .service(check_admin_access)
                    .service(verification_queue)
                    .service(update_verification_status)
                    .service(serve_document)
                    .service(admin_get_users)
                    .service(admin_create_user)
                    .service(admin_update_user), // Remove the password reset endpoint from here
            )
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}
