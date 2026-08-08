mod crypto;
mod db;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Non-sensitive auth metadata persisted to disk: the salt and a
/// verification hash. The master password and derived key are NEVER
/// written here — see crypto.rs.
#[derive(Serialize, Deserialize, Default)]
struct AuthMeta {
    salt: Option<String>,
    verify_hash: Option<String>,
}

struct AppState {
    /// Session key lives only in memory, only while the app is unlocked.
    /// Wiped on lock/quit and never written to disk.
    session_key: Mutex<Option<Vec<u8>>>,
    db: Mutex<Connection>,
    auth_path: std::path::PathBuf,
    db_path: std::path::PathBuf,
}

#[derive(Serialize, Deserialize)]
struct BackupPayload {
    auth: AuthMeta,
    db: String,
}

fn load_auth(path: &std::path::Path) -> AuthMeta {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_auth(path: &std::path::Path, meta: &AuthMeta) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, serde_json::to_string_pretty(meta).unwrap_or_default());
}

// ---------- Auth commands ----------

#[tauri::command]
fn auth_status(state: State<AppState>) -> serde_json::Value {
    let meta = load_auth(&state.auth_path);
    serde_json::json!({ "hasMasterPassword": meta.salt.is_some() })
}

#[tauri::command]
fn auth_setup(password: String, state: State<AppState>) -> serde_json::Value {
    let salt = crypto::generate_salt();
    let verify_hash = crypto::hash_for_verification(&password, &salt);

    save_auth(
        &state.auth_path,
        &AuthMeta {
            salt: Some(hex::encode(&salt)),
            verify_hash: Some(verify_hash),
        },
    );

    let key = crypto::derive_key(&password, &salt);
    *state.session_key.lock().unwrap() = Some(key);
    serde_json::json!({ "ok": true })
}

#[tauri::command]
fn auth_unlock(password: String, state: State<AppState>) -> serde_json::Value {
    let meta = load_auth(&state.auth_path);
    let (salt_hex, verify_hash) = match (meta.salt, meta.verify_hash) {
        (Some(s), Some(v)) => (s, v),
        _ => return serde_json::json!({ "ok": false, "reason": "not-setup" }),
    };

    let salt = match hex::decode(&salt_hex) {
        Ok(s) => s,
        Err(_) => return serde_json::json!({ "ok": false, "reason": "corrupted-auth-data" }),
    };

    if !crypto::verify_password(&password, &salt, &verify_hash) {
        return serde_json::json!({ "ok": false, "reason": "wrong-password" });
    }

    let key = crypto::derive_key(&password, &salt);
    *state.session_key.lock().unwrap() = Some(key);
    serde_json::json!({ "ok": true })
}

#[tauri::command]
fn auth_lock(state: State<AppState>) -> serde_json::Value {
    *state.session_key.lock().unwrap() = None;
    serde_json::json!({ "ok": true })
}

#[tauri::command]
fn auth_change_password(
    current_password: String,
    new_password: String,
    state: State<AppState>,
) -> Result<serde_json::Value, String> {
    let meta = load_auth(&state.auth_path);
    let (salt_hex, verify_hash) = match (meta.salt, meta.verify_hash) {
        (Some(s), Some(v)) => (s, v),
        _ => return Err("Vault is not configured".to_string()),
    };

    let salt = hex::decode(&salt_hex).map_err(|_| "corrupted-auth-data".to_string())?;
    if !crypto::verify_password(&current_password, &salt, &verify_hash) {
        return Err("wrong-password".to_string());
    }

    let old_key = crypto::derive_key(&current_password, &salt);
    let new_salt = crypto::generate_salt();
    let new_key = crypto::derive_key(&new_password, &new_salt);
    let new_meta = AuthMeta {
        salt: Some(hex::encode(&new_salt)),
        verify_hash: Some(crypto::hash_for_verification(&new_password, &new_salt)),
    };

    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut stmt = tx.prepare("SELECT id, data FROM vault_items").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let items: Result<Vec<(i64, String)>, String> = rows
        .map(|item_result| item_result.map_err(|e| e.to_string()))
        .collect();
    let items = items?;
    drop(stmt);

    for (id, encrypted_data) in items {
        let plaintext = crypto::decrypt_field(&encrypted_data, &old_key);
        let reencrypted = crypto::encrypt_field(&plaintext, &new_key);
        tx.execute(
            "UPDATE vault_items SET data = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![reencrypted, id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    save_auth(&state.auth_path, &new_meta);
    *state.session_key.lock().unwrap() = Some(new_key);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn auth_reset(state: State<AppState>) -> Result<serde_json::Value, String> {
    require_session_key(&state)?;
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM vault_items", []).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&state.auth_path);
    *state.session_key.lock().unwrap() = None;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn vault_backup(state: State<AppState>) -> Result<String, String> {
    let auth = load_auth(&state.auth_path);
    if auth.salt.is_none() || auth.verify_hash.is_none() {
        return Err("Vault is not configured".to_string());
    }
    let db_bytes = std::fs::read(&state.db_path).map_err(|e| e.to_string())?;
    let payload = BackupPayload {
        auth,
        db: STANDARD.encode(&db_bytes),
    };
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_restore(backup_json: String, state: State<AppState>) -> Result<serde_json::Value, String> {
    let payload: BackupPayload = serde_json::from_str(&backup_json).map_err(|e| e.to_string())?;
    if payload.auth.salt.is_none() || payload.auth.verify_hash.is_none() {
        return Err("Invalid backup file".to_string());
    }
    let db_bytes = STANDARD.decode(&payload.db).map_err(|e| e.to_string())?;

    // Temporarily replace the live database connection so the file can be swapped safely.
    let old_conn = std::mem::replace(&mut *state.db.lock().unwrap(), Connection::open(&state.db_path).map_err(|e| e.to_string())?);
    drop(old_conn);

    std::fs::write(&state.db_path, db_bytes).map_err(|e| e.to_string())?;
    save_auth(&state.auth_path, &payload.auth);
    *state.session_key.lock().unwrap() = None;
    let new_conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut conn_guard = state.db.lock().unwrap();
    let _old_conn = std::mem::replace(&mut *conn_guard, new_conn);
    drop(_old_conn);
    Ok(serde_json::json!({ "ok": true }))
}

fn require_session_key(state: &State<AppState>) -> Result<Vec<u8>, String> {
    state
        .session_key
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Locked: unlock with your master password first.".to_string())
}

// ---------- Vault commands ----------
// Sensitive field ("data") is encrypted before it ever touches the DB,
// and decrypted only here, in the Rust backend, before being sent to
// the frontend over Tauri's IPC.

#[derive(Serialize)]
struct VaultItemOut {
    id: i64,
    title: String,
    data: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[tauri::command]
fn vault_list(state: State<AppState>) -> Result<Vec<VaultItemOut>, String> {
    let key = require_session_key(&state)?;
    let conn = state.db.lock().unwrap();
    let rows = db::list_items(&conn).map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| VaultItemOut {
            id: r.id,
            title: r.title,
            data: crypto::decrypt_field(&r.data, &key),
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

#[tauri::command]
fn vault_add(title: String, data: String, state: State<AppState>) -> Result<serde_json::Value, String> {
    let key = require_session_key(&state)?;
    let encrypted = crypto::encrypt_field(&data, &key);
    let conn = state.db.lock().unwrap();
    let row = db::insert_item(&conn, &title, &encrypted).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "id": row.id, "title": row.title, "createdAt": row.created_at }))
}

#[tauri::command]
fn vault_update(
    id: i64,
    title: String,
    data: String,
    state: State<AppState>,
) -> Result<serde_json::Value, String> {
    let key = require_session_key(&state)?;
    let encrypted = crypto::encrypt_field(&data, &key);
    let conn = state.db.lock().unwrap();
    db::update_item(&conn, id, &title, &encrypted).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn vault_delete(id: i64, state: State<AppState>) -> Result<serde_json::Value, String> {
    require_session_key(&state)?;
    let conn = state.db.lock().unwrap();
    db::delete_item(&conn, id).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data directory");
            std::fs::create_dir_all(&app_dir).expect("could not create app data directory");

            let db_path = app_dir.join("app-data.sqlite");
            let conn = Connection::open(&db_path).expect("failed to open database");
            db::init(&conn).expect("failed to initialize database schema");

            app.manage(AppState {
                session_key: Mutex::new(None),
                db: Mutex::new(conn),
                auth_path: app_dir.join("auth.json"),
                db_path,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_status,
            auth_setup,
            auth_unlock,
            auth_lock,
            auth_change_password,
            auth_reset,
            vault_list,
            vault_add,
            vault_update,
            vault_delete,
            vault_backup,
            vault_restore
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
