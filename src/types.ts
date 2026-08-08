export interface VaultItem {
  id: number;
  title: string;
  data: string;
  createdAt: string;
  updatedAt: string;
}

export type AppearanceTheme = "light" | "dark" | "blue" | "green" | "solar";

export interface AppSettings {
  passwordHint: string;
  showHintOnUnlock: boolean;
  backupReminder: boolean;
  theme: AppearanceTheme;
  backgroundImage?: string;
  backgroundOpacity: number;
  backgroundMaxSizeKB: number;
  backgroundQuality: number;
}
