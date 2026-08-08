import { useState } from "react";
import { api } from "./api";
import type { AppSettings } from "./App";

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onAppReset: () => void;
}

export default function SettingsPage({ settings, onSave, onAppReset }: SettingsPageProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [pendingOriginalSize, setPendingOriginalSize] = useState<number | null>(null);
  const [pendingCompressedSize, setPendingCompressedSize] = useState<number | null>(null);
  const [pendingQualityUsed, setPendingQualityUsed] = useState<number | null>(null);
  const [pendingMaxBytes, setPendingMaxBytes] = useState<number | null>(null);

  async function compressImageFile(
    file: File,
    maxDim = 1600,
    maxBytes = 250000,
    preferredQuality = 0.9
  ): Promise<{ dataUrl: string; size: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("failed-read"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("image-load-failed"));
        img.onload = () => {
          const w = img.width;
          const h = img.height;
          const ratio = Math.min(1, maxDim / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * ratio));
          const ch = Math.max(1, Math.round(h * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas-failed"));
          ctx.drawImage(img, 0, 0, cw, ch);

          const mimePrefer = "image/webp";
          let quality = preferredQuality;
          let dataUrl = canvas.toDataURL(mimePrefer, quality);

          function approxBytes(durl: string) {
            const comma = durl.indexOf(",");
            const base64 = comma >= 0 ? durl.slice(comma + 1) : durl;
            return Math.round((base64.length * 3) / 4);
          }

          let size = approxBytes(dataUrl);
          while (size > maxBytes && quality > 0.45) {
            quality = Math.max(0.45, quality - 0.05);
            dataUrl = canvas.toDataURL(mimePrefer, quality);
            size = approxBytes(dataUrl);
          }

          if (!dataUrl || dataUrl.length === 0) {
            try {
              dataUrl = canvas.toDataURL();
            } catch (e) {
              return reject(e);
            }
          }

          resolve({ dataUrl, size });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleChangePassword() {
    setErrorMessage("");
    setStatusMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage("Fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }

    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatusMessage("Password changed successfully.");
    } catch (error) {
      setErrorMessage("Failed to change password. Check your current password.");
    }
  }

  async function handleResetApp() {
    setErrorMessage("");
    setStatusMessage("");

    const confirmed = window.confirm(
      "Resetting the app will delete all vault data and require a new master password. Continue?"
    );
    if (!confirmed) return;

    try {
      await api.auth.resetApp();
      setStatusMessage("App reset complete. You can now create a new vault.");
      onAppReset();
    } catch (error) {
      setErrorMessage("Failed to reset the app. Try again.");
    }
  }

  async function handleCreateFullBackup() {
    setErrorMessage("");
    setStatusMessage("");
    try {
      // get backend vault backup (stringified JSON or archive)
      const vaultBackup = await api.vault.backup();

      const settingsRaw = window.localStorage.getItem("vaultSettings");
      const backlogRaw = window.localStorage.getItem("unifiedBacklog");
      const tagsRaw = window.localStorage.getItem("unifiedBacklogTags");

      const payload = {
        meta: { createdAt: new Date().toISOString(), app: "PersonalApp" },
        vault: vaultBackup,
        settings: settingsRaw ? JSON.parse(settingsRaw) : null,
        backlog: backlogRaw ? JSON.parse(backlogRaw) : [],
        backlogTags: tagsRaw ? JSON.parse(tagsRaw) : []
      };

      const filename = `personalapp-backup-${new Date().toISOString().slice(0,10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatusMessage(`Backup created: ${filename}`);
    } catch (e) {
      setErrorMessage("Failed to create backup.");
    }
  }

  async function handleRestoreFromFile(file: File | null) {
    setErrorMessage("");
    setStatusMessage("");
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);

      if (obj.settings) {
        window.localStorage.setItem("vaultSettings", JSON.stringify(obj.settings));
      }
      if (obj.backlog) {
        window.localStorage.setItem("unifiedBacklog", JSON.stringify(obj.backlog));
      }
      if (obj.backlogTags) {
        window.localStorage.setItem("unifiedBacklogTags", JSON.stringify(obj.backlogTags));
      }

      if (obj.vault) {
        const res = await api.vault.restore(obj.vault);
        if (!res || !(res as any).ok) {
          setErrorMessage("Vault restore failed on the backend.");
          return;
        }
      }

      setStatusMessage("Restore completed. Please lock and unlock the app to refresh state, or reload the window.");
    } catch (e) {
      setErrorMessage("Failed to restore backup: invalid file or restore error.");
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>General</h2>
        <div className="card">
          <label>
            <strong>Password hint</strong>
            <p className="muted">This hint is shown when the app asks you to unlock.</p>
          </label>
          <input
            className="field"
            value={settings.passwordHint}
            onChange={(e) => onSave({ ...settings, passwordHint: e.target.value })}
            placeholder="Enter a password hint"
          />
        </div>

        <div className="card settings-row">
          <div>
            <strong>Show hint on unlock</strong>
            <p className="muted">Display the password hint when unlocking the vault.</p>
          </div>
          <button
            className="secondary"
            onClick={() => onSave({ ...settings, showHintOnUnlock: !settings.showHintOnUnlock })}
          >
            {settings.showHintOnUnlock ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="card settings-row">
          <div>
            <strong>Backup reminder</strong>
            <p className="muted">Show a reminder to back up your vault after unlocking.</p>
          </div>
          <button
            className="secondary"
            onClick={() => onSave({ ...settings, backupReminder: !settings.backupReminder })}
          >
            {settings.backupReminder ? "Enabled" : "Disabled"}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Security</h2>
        <div className="card">
          <label>
            <strong>Change master password</strong>
            <p className="muted">Enter your current password and choose a new one.</p>
          </label>
          <input
            className="field"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
          />
          <input
            className="field"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
          />
          <input
            className="field"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
          <button onClick={handleChangePassword}>Change password</button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="card">
          <label>
            <strong>Theme</strong>
            <p className="muted">Select a color theme for the app.</p>
          </label>
          <div className="theme-grid">
            {(
              [
                { value: "light", title: "Light" },
                { value: "dark", title: "Dark" },
                { value: "blue", title: "Blue" },
                { value: "green", title: "Green" },
                { value: "solar", title: "Solar" }
              ] as const
            ).map((theme) => (
              <button
                key={theme.value}
                className={"secondary" + (settings.theme === theme.value ? " active-theme" : "")}
                onClick={() => onSave({ ...settings, theme: theme.value })}
              >
                {theme.title}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <label>
            <strong>Background image</strong>
            <p className="muted">Upload an image to show behind the app content.</p>
          </label>
          <input
            className="field"
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              try {
                setErrorMessage("");
                setStatusMessage("");
                setProcessing(true);
                setPendingFile(file);
                setPendingOriginalSize(file.size);
                setPendingCompressedSize(null);
                setPendingDataUrl(null);
                const maxBytes = (settings.backgroundMaxSizeKB || 250) * 1024;
                setPendingMaxBytes(maxBytes);
                const preferredQuality = (settings.backgroundQuality || 90) / 100;
                const { dataUrl, size } = await compressImageFile(file, 1600, maxBytes, preferredQuality);
                setPendingDataUrl(dataUrl);
                setPendingCompressedSize(size);
                setPendingQualityUsed(preferredQuality);
              } catch (err) {
                setErrorMessage("Failed to process image.");
                setPendingFile(null);
              } finally {
                setProcessing(false);
              }
            }}
          />

          <div style={{ marginTop: 8 }}>
            <input
              className="field"
              type="text"
              value={settings.backgroundImage ?? ""}
              onChange={(e) => onSave({ ...settings, backgroundImage: e.target.value || undefined })}
              placeholder="Or paste an image URL"
            />

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
              <label style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: 13, marginBottom: 6 }}>Max size (KB)</span>
                <input
                  className="field"
                  type="number"
                  min={50}
                  max={2000}
                  value={settings.backgroundMaxSizeKB}
                  onChange={(e) => onSave({ ...settings, backgroundMaxSizeKB: Number(e.target.value) || 250 })}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", flex: 2 }}>
                <span style={{ fontSize: 13, marginBottom: 6 }}>Quality</span>
                <input
                  className="field"
                  type="range"
                  min={45}
                  max={95}
                  value={settings.backgroundQuality}
                  onChange={(e) => onSave({ ...settings, backgroundQuality: Number(e.target.value) || 90 })}
                />
                <div style={{ fontSize: 13, color: "#666" }}>Quality: {settings.backgroundQuality}%</div>
              </label>
            </div>
          </div>

          <input
            className="field"
            type="range"
            min={0}
            max={100}
            value={settings.backgroundOpacity}
            onChange={(e) => onSave({ ...settings, backgroundOpacity: Number(e.target.value) })}
          />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
            <span>Opacity: {settings.backgroundOpacity}%</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="secondary"
                onClick={() => onSave({ ...settings, backgroundImage: undefined, backgroundOpacity: 30 })}
              >
                Clear image
              </button>
            </div>
          </div>

          {(pendingDataUrl || settings.backgroundImage) && (
            <div style={{ marginTop: 12 }}>
              <strong>Preview</strong>
              <div style={{ marginTop: 8 }}>
                <img
                  src={pendingDataUrl ?? settings.backgroundImage ?? undefined}
                  alt="background preview"
                  style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, border: "1px solid var(--border, #ddd)" }}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                {processing ? (
                  <em>Processing…</em>
                ) : (
                  <>
                    {pendingOriginalSize != null && <div>Original: {(pendingOriginalSize / 1024).toFixed(1)} KB</div>}
                    {pendingCompressedSize != null && <div>Compressed: {(pendingCompressedSize / 1024).toFixed(1)} KB</div>}
                    {pendingMaxBytes != null && pendingCompressedSize != null && pendingCompressedSize > pendingMaxBytes && (
                      <div style={{ color: "#b3261e" }}>Compressed image still exceeds the max size.</div>
                    )}
                  </>
                )}
              </div>

              {pendingDataUrl && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {pendingCompressedSize != null && pendingMaxBytes != null && pendingCompressedSize <= pendingMaxBytes ? (
                    <button
                      className="secondary"
                      onClick={() => {
                        onSave({ ...settings, backgroundImage: pendingDataUrl });
                        setCompressedSize(pendingCompressedSize ?? null);
                        setOriginalSize(pendingOriginalSize ?? null);
                        setPendingFile(null);
                        setPendingDataUrl(null);
                        setPendingCompressedSize(null);
                        setPendingOriginalSize(null);
                        setPendingQualityUsed(null);
                        setPendingMaxBytes(null);
                        setStatusMessage("Image saved.");
                        setTimeout(() => setStatusMessage(""), 1200);
                      }}
                    >
                      Accept
                    </button>
                  ) : (
                    <>
                      <button
                        className="secondary"
                        onClick={async () => {
                          // retry with lower quality
                          if (!pendingFile || pendingQualityUsed == null || pendingMaxBytes == null) return;
                          const nextQ = Math.max(0.45, (pendingQualityUsed - 0.1));
                          try {
                            setProcessing(true);
                            const { dataUrl, size } = await compressImageFile(pendingFile, 1600, pendingMaxBytes, nextQ);
                            setPendingDataUrl(dataUrl);
                            setPendingCompressedSize(size);
                            setPendingQualityUsed(nextQ);
                          } catch (e) {
                            setErrorMessage("Retry failed.");
                          } finally {
                            setProcessing(false);
                          }
                        }}
                      >
                        Retry (lower quality)
                      </button>

                      <button
                        className="secondary"
                        onClick={() => {
                          // accept anyway
                          onSave({ ...settings, backgroundImage: pendingDataUrl });
                          setCompressedSize(pendingCompressedSize ?? null);
                          setOriginalSize(pendingOriginalSize ?? null);
                          setPendingFile(null);
                          setPendingDataUrl(null);
                          setPendingCompressedSize(null);
                          setPendingOriginalSize(null);
                          setPendingQualityUsed(null);
                          setPendingMaxBytes(null);
                          setStatusMessage("Image saved (accepted anyway).");
                          setTimeout(() => setStatusMessage(""), 1200);
                        }}
                      >
                        Accept anyway
                      </button>
                    </>
                  )}

                  <button
                    className="secondary"
                    onClick={() => {
                      setPendingFile(null);
                      setPendingDataUrl(null);
                      setPendingCompressedSize(null);
                      setPendingOriginalSize(null);
                      setPendingQualityUsed(null);
                      setPendingMaxBytes(null);
                      setStatusMessage("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2>Backup & Restore</h2>
        <div className="card">
          <label>
            <strong>Full backup</strong>
            <p className="muted">Create a single JSON backup containing the encrypted vault plus local settings and backlog. Keep this file safe.</p>
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="secondary" onClick={handleCreateFullBackup}>Create full backup</button>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted">Restore from file</span>
              <input
                className="field"
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  if (!f) return;
                  void handleRestoreFromFile(f);
                }}
              />
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <em className="muted">After restore, lock and unlock or reload the app to apply restored data.</em>
            <div style={{ marginTop: 8 }}>
              <button
                className="secondary"
                onClick={() => {
                  setStatusMessage("");
                  window.location.reload();
                }}
              >
                Reload now
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Maintenance</h2>
        <div className="card">
          <label>
            <strong>Reset app</strong>
            <p className="muted">Delete all vault data and remove the current master password.</p>
          </label>
          <button className="danger" onClick={handleResetApp}>
            Reset app
          </button>
        </div>
      </section>

      {statusMessage && <p style={{ color: "green" }}>{statusMessage}</p>}
      {errorMessage && <p style={{ color: "crimson" }}>{errorMessage}</p>}
    </div>
  );
}
