// @generated automatically by Diesel CLI.

pub mod sql_types {
    #[derive(diesel::query_builder::QueryId, Clone, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "verification_action"))]
    pub struct VerificationAction;
}

diesel::table! {
    user_verifications (id) {
        id -> Int4,
        user_id -> Int4,
        #[max_length = 255]
        first_name -> Varchar,
        #[max_length = 255]
        last_name -> Varchar,
        dob_day -> Int4,
        dob_month -> Int4,
        dob_year -> Int4,
        #[max_length = 255]
        street_address -> Varchar,
        #[max_length = 255]
        apartment -> Nullable<Varchar>,
        #[max_length = 255]
        city -> Varchar,
        #[max_length = 50]
        postal_code -> Varchar,
        #[max_length = 10]
        country_code -> Varchar,
        #[max_length = 50]
        phone_number -> Varchar,
        #[max_length = 255]
        occupation -> Varchar,
        #[max_length = 50]
        verification_status -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        #[max_length = 255]
        id_front_path -> Nullable<Varchar>,
        #[max_length = 50]
        id_verification_status -> Varchar,
        id_verified_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    users (id) {
        id -> Int4,
        #[max_length = 255]
        username -> Varchar,
        #[max_length = 255]
        email -> Varchar,
        #[max_length = 255]
        password -> Varchar,
        created_at -> Timestamptz,
        is_admin -> Bool,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::VerificationAction;

    verification_audits (id) {
        id -> Uuid,
        user_id -> Int4,
        admin_id -> Int4,
        action -> VerificationAction,
        reason -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::joinable!(user_verifications -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    user_verifications,
    users,
    verification_audits,
);
