// Good Rust code: Clean Architecture handler delegates to UserService, handles errors via ?
use axum::{extract::State, Json};
use crate::services::user_service;
use crate::AppState;

pub async fn get_user_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<String>>, axum::http::StatusCode> {
    let users = user_service::get_active_users(&state.pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(users))
}
