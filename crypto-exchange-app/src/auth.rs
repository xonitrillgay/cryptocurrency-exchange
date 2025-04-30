use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};
use actix_web::{HttpRequest, error::ErrorUnauthorized};
use chrono::{Utc, Duration};
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // Subject (user_id)
    pub exp: i64,    // Expiration time
    pub iat: i64,    // Issued at
}

pub fn generate_token(user_id: i32) -> Result<String, jsonwebtoken::errors::Error> {
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "2117d884ab7b763f40f0c8e6a946d99016985544c851194b6add24bc23eb5d51ce2e4fa05099bf4030a0202e179bebf37645a12e022b17ab1cb31be3b06992e3".to_string());
    let expiration = Utc::now() + Duration::hours(24);
    
    let claims = Claims {
        sub: user_id.to_string(),
        exp: expiration.timestamp(),
        iat: Utc::now().timestamp(),
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes())
    )
}

pub fn extract_user_id(req: &HttpRequest) -> Result<i32, actix_web::Error> {
    let auth_header = req.headers().get("Authorization")
        .ok_or_else(|| ErrorUnauthorized("Missing authorization header"))?;
    
    let auth_str = auth_header.to_str()
        .map_err(|_| ErrorUnauthorized("Invalid authorization header"))?;
    
    if !auth_str.starts_with("Bearer ") {
        return Err(ErrorUnauthorized("Invalid authorization format"));
    }
    
    let token = &auth_str[7..]; // Skip "Bearer "
    
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "2117d884ab7b763f40f0c8e6a946d99016985544c851194b6add24bc23eb5d51ce2e4fa05099bf4030a0202e179bebf37645a12e022b17ab1cb31be3b06992e3".to_string());
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default()
    ).map_err(|_| ErrorUnauthorized("Invalid token"))?;
    
    let user_id = token_data.claims.sub.parse::<i32>()
        .map_err(|_| ErrorUnauthorized("Invalid user ID in token"))?;
    
    Ok(user_id)
}