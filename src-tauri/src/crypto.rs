use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::RngCore;

/// Field-level encryption helpers — Rust equivalent of the Node crypto.ts
/// used in the Electron version.
///
/// Flow:
///  1. User sets a master password on first run.
///  2. We derive a strong 256-bit key from it with Argon2id (+ a random salt, stored locally).
///  3. That key encrypts/decrypts individual sensitive fields with AES-256-GCM.
///
/// The master password itself is NEVER stored — only the salt needed to
/// re-derive the key, plus a verification hash to check the password is right.

const SALT_LENGTH: usize = 16;
const NONCE_LENGTH: usize = 12;

pub fn generate_salt() -> Vec<u8> {
    let mut salt = vec![0u8; SALT_LENGTH];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    salt
}

/// Derives a 32-byte (256-bit) key from a password + salt using Argon2id.
pub fn derive_key(password: &str, salt: &[u8]) -> Vec<u8> {
    let argon2 = Argon2::default();
    let mut key = vec![0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .expect("key derivation failed");
    key
}

/// A hash you can store to verify a password attempt without storing the password itself.
pub fn hash_for_verification(password: &str, salt: &[u8]) -> String {
    hex::encode(derive_key(password, salt))
}

pub fn verify_password(password: &str, salt: &[u8], stored_hash_hex: &str) -> bool {
    let attempt = hash_for_verification(password, salt);
    constant_time_eq(attempt.as_bytes(), stored_hash_hex.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Encrypt a plaintext string. Returns a single base64 string safe to store
/// in SQLite (nonce + ciphertext, self-contained — AES-GCM appends its own auth tag).
pub fn encrypt_field(plaintext: &str, key: &[u8]) -> String {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .expect("encryption failed");

    let mut packed = Vec::with_capacity(NONCE_LENGTH + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    STANDARD.encode(packed)
}

pub fn decrypt_field(packed_b64: &str, key: &[u8]) -> String {
    let packed = STANDARD.decode(packed_b64).expect("bad base64 in stored field");
    let (nonce_bytes, ciphertext) = packed.split_at(NONCE_LENGTH);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .expect("decryption failed — wrong key or corrupted data");
    String::from_utf8(plaintext).expect("decrypted data was not valid utf8")
}
