use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Queryable, Selectable, Debug, Clone, Serialize)]
#[diesel(table_name = crate::schema::users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub password: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_admin: bool, // Add this new field
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::users)]
pub struct NewUser {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_admin: bool, // Add this new field
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        UserResponse {
            id: user.id,
            username: user.username,
            email: user.email,
            created_at: user.created_at,
            is_admin: user.is_admin, // Add this new field
        }
    }
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Queryable, Selectable, Debug, Clone, Serialize)]
#[diesel(table_name = crate::schema::user_verifications)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct UserVerification {
    pub id: i32,
    pub user_id: i32,
    pub first_name: String,
    pub last_name: String,
    pub dob_day: i32,
    pub dob_month: i32,
    pub dob_year: i32,
    pub street_address: String,
    pub apartment: Option<String>,
    pub city: String,
    pub postal_code: String,
    pub country_code: String,
    pub phone_number: String,
    pub occupation: String,
    pub verification_status: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub id_front_path: Option<String>,
    pub id_verification_status: String,
    pub id_verified_at: Option<chrono::NaiveDateTime>,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::user_verifications)]
pub struct NewUserVerification {
    pub user_id: i32,
    pub first_name: String,
    pub last_name: String,
    pub dob_day: i32,
    pub dob_month: i32,
    pub dob_year: i32,
    pub street_address: String,
    pub apartment: Option<String>,
    pub city: String,
    pub postal_code: String,
    pub country_code: String,
    pub phone_number: String,
    pub occupation: String,
}

#[derive(Deserialize)]
pub struct VerificationRequest {
    pub first_name: String,
    pub last_name: String,
    pub dob_day: i32,
    pub dob_month: i32,
    pub dob_year: i32,
    pub street_address: String,
    pub apartment: Option<String>,
    pub city: String,
    pub postal_code: String,
    pub country_code: String,
    pub phone_number: String,
    pub occupation: String,
}

#[derive(Serialize)]
pub struct VerificationResponse {
    pub id: i32,
    pub verification_status: String,
    pub created_at: chrono::NaiveDateTime,
    pub id_document: Option<IdDocumentResponse>,
}

impl From<UserVerification> for VerificationResponse {
    fn from(verification: UserVerification) -> Self {
        let id_document = if verification.id_front_path.is_some() {
            Some(IdDocumentResponse {
                id_verification_status: verification.id_verification_status,
                id_front_path: verification.id_front_path,
                id_verified_at: verification.id_verified_at,
            })
        } else {
            None
        };

        Self {
            id: verification.id,
            verification_status: verification.verification_status,
            created_at: verification.created_at,
            id_document,
        }
    }
}

impl<E> From<Result<UserVerification, E>> for VerificationResponse {
    fn from(verification_result: Result<UserVerification, E>) -> Self {
        match verification_result {
            Ok(verification) => Self {
                id: verification.id,
                verification_status: verification.verification_status,
                created_at: verification.created_at,
                id_document: if verification.id_front_path.is_some() {
                    Some(IdDocumentResponse {
                        id_verification_status: verification.id_verification_status,
                        id_front_path: verification.id_front_path,
                        id_verified_at: verification.id_verified_at,
                    })
                } else {
                    None
                },
            },
            Err(_) => {
                // Provide default values for error case
                Self {
                    id: 0,
                    verification_status: "error".to_string(),
                    created_at: chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap_or_default(),
                    id_document: None,
                }
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct IdDocumentResponse {
    pub id_verification_status: String,
    pub id_front_path: Option<String>,
    pub id_verified_at: Option<chrono::NaiveDateTime>,
}
