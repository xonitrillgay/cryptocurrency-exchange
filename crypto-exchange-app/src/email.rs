use lettre::message::{MultiPart, SinglePart, header};
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::Tls;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use log::{error, info};
use std::env;

pub async fn send_password_reset_email(email: &str, reset_token: &str) -> Result<(), String> {
    // Get SMTP settings from environment variables
    let smtp_host = env::var("SMTP_HOST").unwrap_or_else(|_| "smtp.gmail.com".to_string());
    let smtp_port = env::var("SMTP_PORT")
        .unwrap_or_else(|_| "587".to_string())
        .parse::<u16>()
        .unwrap_or(587);
    let smtp_username =
        env::var("SMTP_USERNAME").map_err(|_| "SMTP_USERNAME not configured".to_string())?;
    let smtp_password =
        env::var("SMTP_PASSWORD").map_err(|_| "SMTP_PASSWORD not configured".to_string())?;
    let frontend_url =
        env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());

    // Create the reset link
    let reset_link = format!(
        "{}/reset-password?token={}&email={}",
        frontend_url, reset_token, email
    );

    // Build email
    let email_body_html = format!(
        r#"
        <html>
            <body>
                <h2>Password Reset Request</h2>
                <p>You requested a password reset for your cryptocurrency exchange account.</p>
                <p>Please click the link below to reset your password:</p>
                <p><a href="{}">Reset Password</a></p>
                <p>This link will expire in 1 hour.</p>
                <p>If you did not request this password reset, you can safely ignore this email.</p>
            </body>
        </html>
        "#,
        reset_link
    );

    let email_body_text = format!(
        r#"
        Password Reset Request
        
        You requested a password reset for your cryptocurrency exchange account.
        
        Please copy and paste the following URL into your browser to reset your password:
        {}
        
        This link will expire in 1 hour.
        
        If you did not request this password reset, you can safely ignore this email.
        "#,
        reset_link
    );

    // Create message
    let message = match Message::builder()
        .from(
            format!("Crypto Exchange <{}>", smtp_username)
                .parse()
                .unwrap(),
        )
        .to(email
            .parse()
            .map_err(|e| format!("Invalid email address: {}", e))?)
        .subject("Password Reset Request")
        .multipart(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(header::ContentType::TEXT_PLAIN)
                        .body(email_body_text),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(header::ContentType::TEXT_HTML)
                        .body(email_body_html),
                ),
        ) {
        Ok(message) => message,
        Err(e) => return Err(format!("Failed to build email: {}", e)),
    };

    // Configure SMTP transport
    let credentials = Credentials::new(smtp_username, smtp_password);

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_host)
        .map_err(|e| format!("Failed to create mailer: {}", e))?
        .port(smtp_port)
        .credentials(credentials)
        .build();

    // Send the email
    match mailer.send(message).await {
        Ok(_) => {
            info!("Password reset email sent to {}", email);
            Ok(())
        }
        Err(e) => {
            error!("Failed to send password reset email: {}", e);
            Err(format!("Failed to send email: {}", e))
        }
    }
}
