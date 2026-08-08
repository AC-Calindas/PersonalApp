use rusqlite::{params, Connection, Result};

pub struct VaultItemRow {
    pub id: i64,
    pub title: String,
    pub data: String, // still encrypted at this layer
    pub created_at: String,
    pub updated_at: String,
}

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vault_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;
    Ok(())
}

fn row_to_item(row: &rusqlite::Row) -> Result<VaultItemRow> {
    Ok(VaultItemRow {
        id: row.get(0)?,
        title: row.get(1)?,
        data: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn insert_item(conn: &Connection, title: &str, encrypted_data: &str) -> Result<VaultItemRow> {
    conn.execute(
        "INSERT INTO vault_items (title, data) VALUES (?1, ?2)",
        params![title, encrypted_data],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, title, data, created_at, updated_at FROM vault_items WHERE id = ?1",
        params![id],
        row_to_item,
    )
}

pub fn list_items(conn: &Connection) -> Result<Vec<VaultItemRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, data, created_at, updated_at FROM vault_items ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_item)?;
    rows.collect()
}

pub fn update_item(conn: &Connection, id: i64, title: &str, encrypted_data: &str) -> Result<()> {
    conn.execute(
        "UPDATE vault_items SET title = ?1, data = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![title, encrypted_data, id],
    )?;
    Ok(())
}

pub fn delete_item(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM vault_items WHERE id = ?1", params![id])?;
    Ok(())
}
