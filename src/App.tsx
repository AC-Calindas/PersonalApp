import { useEffect, useState } from "react";
import Sidebar, { Page } from "./Sidebar";
import HomePage from "./HomePage";
import SettingsPage from "./SettingsPage";
import VaultPage from "./VaultPage";
import ProgressPage from "./ProgressPage";
import { api } from "./api";
import type { VaultItem, AppSettings, AppearanceTheme } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  passwordHint: "",
  showHintOnUnlock: true,
  backupReminder: true,
  theme: "light",
  backgroundImage: undefined,
  backgroundOpacity: 30
  ,backgroundMaxSizeKB: 250,
  backgroundQuality: 90
};

const THEME_STYLES: Record<AppearanceTheme, Record<string, string>> = {
  light: {
    "--body-bg": "#fafafa",
    "--text-color": "#1a1a1a",
    "--muted-text": "#666",
    "--sidebar-bg": "#1a1a1a",
    "--sidebar-text": "#eee",
    "--sidebar-item": "#ccc",
    "--sidebar-active-bg": "#333",
    "--sidebar-active-text": "#fff",
    "--card-bg": "#ffffff",
    "--border": "#ddd",
    "--button-bg": "#1a1a1a",
    "--button-text": "#ffffff",
    "--secondary-bg": "#ffffff",
    "--secondary-text": "#1a1a1a"
    ,"--scrollbar-bg":"rgba(0,0,0,0.04)",
    "--scrollbar-thumb":"#c0c0c0",
    "--scrollbar-thumb-hover":"#a0a0a0"
  },
  dark: {
    "--body-bg": "#111827",
    "--text-color": "#f8fafc",
    "--muted-text": "#94a3b8",
    "--sidebar-bg": "#0f172a",
    "--sidebar-text": "#e2e8f0",
    "--sidebar-item": "#cbd5e1",
    "--sidebar-active-bg": "#1e293b",
    "--sidebar-active-text": "#ffffff",
    "--card-bg": "#1e293b",
    "--border": "#334155",
    "--button-bg": "#3b82f6",
    "--button-text": "#ffffff",
    "--secondary-bg": "#0f172a",
    "--secondary-text": "#e2e8f0"
    ,"--scrollbar-bg":"rgba(255,255,255,0.03)",
    "--scrollbar-thumb":"#475569",
    "--scrollbar-thumb-hover":"#6b7280"
  },
  blue: {
    "--body-bg": "#e8f1ff",
    "--text-color": "#102a43",
    "--muted-text": "#334e68",
    "--sidebar-bg": "#0f4c81",
    "--sidebar-text": "#f8fafc",
    "--sidebar-item": "#dbeafe",
    "--sidebar-active-bg": "#1e40af",
    "--sidebar-active-text": "#ffffff",
    "--card-bg": "#ffffff",
    "--border": "#bfd7ff",
    "--button-bg": "#0f4c81",
    "--button-text": "#ffffff",
    "--secondary-bg": "#ffffff",
    "--secondary-text": "#102a43"
    ,"--scrollbar-bg":"rgba(15,76,129,0.06)",
    "--scrollbar-thumb":"#1e40af",
    "--scrollbar-thumb-hover":"#153e75"
  },
  green: {
    "--body-bg": "#ecf7ef",
    "--text-color": "#0f3d20",
    "--muted-text": "#375a33",
    "--sidebar-bg": "#166534",
    "--sidebar-text": "#f1f5f9",
    "--sidebar-item": "#dcfce7",
    "--sidebar-active-bg": "#14532d",
    "--sidebar-active-text": "#ffffff",
    "--card-bg": "#ffffff",
    "--border": "#d1fae5",
    "--button-bg": "#166534",
    "--button-text": "#ffffff",
    "--secondary-bg": "#ffffff",
    "--secondary-text": "#0f3d20"
    ,"--scrollbar-bg":"rgba(22,101,52,0.06)",
    "--scrollbar-thumb":"#14532d",
    "--scrollbar-thumb-hover":"#114026"
  },
  solar: {
    "--body-bg": "#fdf6e3",
    "--text-color": "#586e75",
    "--muted-text": "#657b83",
    "--sidebar-bg": "#073642",
    "--sidebar-text": "#eee8d5",
    "--sidebar-item": "#839496",
    "--sidebar-active-bg": "#586e75",
    "--sidebar-active-text": "#fdf6e3",
    "--card-bg": "#fffdf4",
    "--border": "#eee8d5",
    "--button-bg": "#657b83",
    "--button-text": "#f8f4e3",
    "--secondary-bg": "#fdf6e3",
    "--secondary-text": "#586e75"
    ,"--scrollbar-bg":"rgba(7,54,66,0.06)",
    "--scrollbar-thumb":"#586e75",
    "--scrollbar-thumb-hover":"#455a63"
  }
};

type Screen = "loading" | "setup" | "unlock" | "app";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [page, setPage] = useState<Page>("home");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    api.auth.status().then(({ hasMasterPassword }) => {
      setScreen(hasMasterPassword ? "unlock" : "setup");
    });

    const stored = window.localStorage.getItem("vaultSettings");
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const themeStyles = THEME_STYLES[settings.theme];

    Object.entries(themeStyles).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.style.setProperty(
      "--app-bg-image",
      settings.backgroundImage ? `url(${settings.backgroundImage})` : "none"
    );
    root.style.setProperty("--app-bg-opacity", String(settings.backgroundOpacity / 100));
  }, [settings]);

  async function handleSetup() {
    if (password.length < 8) {
      setError("Use at least 8 characters for your master password.");
      return;
    }
    await api.auth.setup(password);
    setPassword("");
    setScreen("app");
    void refreshItems();
  }

  async function handleUnlock() {
    const result = await api.auth.unlock(password);
    if (!result.ok) {
      setError(result.reason === "wrong-password" ? "Wrong password." : "Something went wrong.");
      return;
    }
    setPassword("");
    setError("");
    setScreen("app");
    void refreshItems();
  }

  async function handleLock() {
    await api.auth.lock();
    setItems([]);
    setPage("home");
    setScreen("unlock");
  }

  async function refreshItems() {
    const list = await api.vault.list();
    setItems(list);
  }

  function handleSaveSettings(updated: AppSettings) {
    setSettings(updated);
    window.localStorage.setItem("vaultSettings", JSON.stringify(updated));
  }

  function handleRestoreSuccess() {
    setItems([]);
    setPage("home");
    setScreen("unlock");
  }

  function handleAppReset() {
    setItems([]);
    setPage("home");
    setScreen("setup");
  }

  // Workaround: TS sometimes mis-infers SettingsPage's JSX type; cast to any for rendering
  const SettingsComponent: any = SettingsPage;

  if (screen === "loading") return <Centered>Loading…</Centered>;

  if (screen === "setup") {
    return (
      <Centered>
        <h1>Set your master password</h1>
        <p>This encrypts everything you store. There's no recovery if you forget it — write it down somewhere safe.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
        />
        <button onClick={handleSetup}>Create vault</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </Centered>
    );
  }

  if (screen === "unlock") {
    return (
      <Centered>
        <h1>Unlock</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          placeholder="Master password"
        />
        <button onClick={handleUnlock}>Unlock</button>
        {settings.showHintOnUnlock && settings.passwordHint && (
          <p style={{ color: "#666", marginTop: 12 }}>
            Hint: {settings.passwordHint}
          </p>
        )}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </Centered>
    );
  }

  // screen === "app"
  return (
    <div className="app-shell">
      <Sidebar current={page} onNavigate={setPage} onLock={handleLock} />
      <main className="main-content">
        {page === "home" && (
          <HomePage itemCount={items.length} showBackupReminder={settings.backupReminder} />
        )}
        {page === "vault" && (
          <VaultPage items={items} onRefresh={refreshItems} onRestoreSuccess={handleRestoreSuccess} />
        )}
        {page === "progress" && <ProgressPage settings={settings} />}
        {page === "settings" && (
          <SettingsComponent settings={settings} onSave={handleSaveSettings} onAppReset={handleAppReset} />
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 400,
        margin: "80px auto",
        textAlign: "center",
        fontFamily: "sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}
    >
      {children}
    </div>
  );
}
