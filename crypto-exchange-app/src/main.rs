use actix_cors::Cors;
use actix_multipart::Multipart;
use actix_web::http::header;
use actix_web::{App, HttpRequest, HttpResponse, HttpServer, Responder, get, post, put, web};
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
pub mod models;
pub mod schema;

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};

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

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::init();

    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());

    let pool = db::establish_connection_pool();

    info!("Starting server at {}:{}", host, port);

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
            .service(health_check)
            .service(users_route)
            .service(sign_up)
            .service(login)
            .service(
                web::scope("/verify")
                    .service(update_verify)
                    .service(verification_status)
                    .service(upload_id_document),
            )
            .service(web::scope("/user").service(user_profile))
            .service(
                web::scope("/admin").service(check_admin_access), // Add more admin endpoints here
            )
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}
