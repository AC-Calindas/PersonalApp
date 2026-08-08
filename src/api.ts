import { invoke } from "@tauri-apps/api/core";
import type { VaultItem } from "./types";

// This is the Tauri equivalent of the Electron version's preload.ts +
// contextBridge — a single, explicit surface the UI uses to talk to the
// Rust backend. Components never call invoke() directly; they go through
// here, which keeps the IPC surface easy to audit in one place.

export const api = {
  auth: {
    status: () => invoke<{ hasMasterPassword: boolean }>("auth_status"),
    setup: (password: string) => invoke<{ ok: boolean }>("auth_setup", { password }),
    unlock: (password: string) =>
      invoke<{ ok: boolean; reason?: string }>("auth_unlock", { password }),
    lock: () => invoke<{ ok: boolean }>("auth_lock"),
    changePassword: (currentPassword: string, newPassword: string) =>
      invoke<{ ok: boolean }>("auth_change_password", { currentPassword, newPassword }),
    resetApp: () => invoke<{ ok: boolean }>("auth_reset")
  },
  vault: {
    list: () => invoke<VaultItem[]>("vault_list"),
    add: (title: string, data: string) =>
      invoke<{ id: number; title: string; createdAt: string }>("vault_add", { title, data }),
    update: (id: number, title: string, data: string) =>
      invoke<{ ok: boolean }>("vault_update", { id, title, data }),
    remove: (id: number) => invoke<{ ok: boolean }>("vault_delete", { id }),
    backup: () => invoke<string>("vault_backup"),
    restore: (backupJson: string) => invoke<{ ok: boolean }>("vault_restore", { backupJson })
  }
};
