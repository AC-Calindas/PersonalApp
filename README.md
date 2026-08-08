# Personal App — Tauri + Rust + Encrypted SQLite Starter

The same app as the Electron version, rebuilt on **Tauri**: a Rust backend
instead of Node, a much smaller installed footprint, and the same React UI
reused almost unchanged.

## Stack

- **Tauri 2** — packages the app as a native `.exe` / `.dmg` / `.AppImage`, using the OS's built-in webview instead of bundling Chromium (this is the main reason Tauri apps are dramatically smaller and lighter than Electron apps — often 10-20x smaller install size)
- **Rust** — the backend: window management, auth, encryption, database, all in `src-tauri/`
- **React + TypeScript** — same UI code as the Electron version, talking to Rust instead of Node
- **rusqlite** (bundled SQLite) — embedded local database
- **`aes-gcm` + `argon2` crates** — AES-256-GCM field encryption, key derived from a master password via Argon2id (Rust's modern standard for password-based key derivation — the Electron version uses Node's `scrypt`; both are strong choices, Argon2id is the more current recommendation)

## How this differs from the Electron version

| | Electron version | Tauri version |
|---|---|---|
| Backend language | Node (TypeScript) | Rust |
| IPC | `ipcMain.handle` + `contextBridge` (`preload.ts`) | `#[tauri::command]` + `invoke()` (`api.ts`) |
| Key derivation | `scrypt` (Node crypto) | Argon2id (`argon2` crate) |
| Database | `better-sqlite3` (native Node addon) | `rusqlite` (native Rust, bundled SQLite) |
| Non-sensitive config storage | `electron-store` | plain JSON file written via `std::fs` |
| Runtime | Bundles Chromium + Node | Uses the OS's native webview |
| Typical install size | ~150-250MB | ~10-20MB |

The **security model is identical**: master password → salt + verification
hash stored locally (never the password) → key derived in memory only,
wiped on lock/quit → AES-256-GCM encrypts sensitive fields before they
touch disk → the frontend never sees the encryption key, only plaintext
over IPC.

## Project layout

```
src/                        # React frontend (same UI as Electron version)
  App.tsx
  Sidebar.tsx
  HomePage.tsx
  VaultPage.tsx
  api.ts                    # equivalent of preload.ts — the only IPC surface the UI uses
  types.ts
  main.tsx
  index.css
src-tauri/
  src/
    lib.rs                  # equivalent of main.ts — commands, window setup, app state
    crypto.rs                # equivalent of crypto.ts — Argon2id + AES-256-GCM
    db.rs                    # equivalent of db.ts — SQLite queries
    main.rs                  # thin entry point
  icons/                     # app icons (all formats)
  tauri.conf.json            # window config, bundle/icon config
  Cargo.toml                 # Rust dependencies
```

## Prerequisites

Unlike the Electron version, you need the Rust toolchain installed:

1. Install Rust: https://www.rust-lang.org/tools/install (`rustup`)
2. Platform-specific dependencies:
   - **Windows:** Microsoft C++ Build Tools + WebView2 (usually already present on Windows 10/11)
   - **Mac:** Xcode Command Line Tools (`xcode-select --install`)
   - **Linux:** varies by distro — see https://v2.tauri.app/start/prerequisites/

Full details: https://v2.tauri.app/start/prerequisites/

## Getting started

**Same advice as the Electron version: work from a local drive, not a
synced/network/mapped drive.** Rust's compiler is even more sensitive to
this than Node's native module builds — file locking on synced drives can
cause build failures that are confusing to debug.

```bash
npm install
npm run dev
```

First launch compiles the Rust backend (slower the first time — a minute
or two is normal — much faster on subsequent runs since Cargo caches
build artifacts). It opens the app with the same "Set your master
password" flow as the Electron version.

## Building the executable

```bash
npm run build
```

Outputs to `src-tauri/target/release/bundle/` — installers/executables
for whatever platform you build on. Like Electron, cross-compiling to a
different OS than you're building on needs extra setup; easiest is to
build natively on each target OS or use CI.

## Adding a new feature

Same pattern as the Electron version, just in Rust instead of Node:

1. **Need new data stored?** Add a table/column and queries in `src-tauri/src/db.rs`.
2. **Need new backend logic?** Add a `#[tauri::command] fn your_command(...)` in `src-tauri/src/lib.rs`, and register it in the `tauri::generate_handler![...]` list.
3. **Expose it to the UI:** add a method in `src/api.ts`.
4. **Build the UI:** call `api.yourThing.method()` from a React component.

Same idea as before: route sensitive fields through `crypto::encrypt_field` / `crypto::decrypt_field` and you don't need to think about encryption again when adding features.

## Troubleshooting

- **First build is slow / seems stuck:** normal — Cargo is compiling Rust dependencies (including SQLite from source, since it's the `bundled` feature). Can take a few minutes the first time. Subsequent builds are much faster.
- **"linker not found" or similar Rust build errors:** you're likely missing a platform prerequisite — see the Prerequisites section above, most commonly Windows needs the C++ Build Tools installed.
- **Long install / file-lock errors on Windows:** same fix as the Electron version — move off network/synced drives (`Y:/`, OneDrive folders, etc.) onto a local path.
