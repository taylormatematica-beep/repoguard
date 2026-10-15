// Bad Rust code: Direct SQLx query inside an Axum route handler (bypassing service/repo layer)
use axum::{extract::State, Json};
use sqlx::PgPool;

pub async fn get_user_handler(
    State(pool): State<PgPool>,
) -> Result<Json<Vec<String>>, axum::http::StatusCode> {
    let rows = sqlx::query!("SELECT username FROM users")
        .fetch_all(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows.into_iter().map(|r| r.username).collect()))
}
