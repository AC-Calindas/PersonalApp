import { useState } from "react";
import { api } from "./api";
import type { VaultItem } from "./types";

interface VaultPageProps {
  items: VaultItem[];
  onRefresh: () => Promise<void>;
  onRestoreSuccess?: () => void;
}

type Mode = "grid" | "detail" | "form";

export default function VaultPage({ items, onRefresh, onRestoreSuccess }: VaultPageProps) {
  const [mode, setMode] = useState<Mode>("grid");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [data, setData] = useState("");

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const isEditingExisting = editingId !== null;
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showData, setShowData] = useState(false);

  // ---------- navigation ----------

  function openItem(item: VaultItem) {
    setSelectedId(item.id);
    setShowData(false);
    setMode("detail");
  }

  function backToGrid() {
    setSelectedId(null);
    setEditingId(null);
    setMode("grid");
  }

  function openNewForm() {
    setEditingId(null);
    setTitle("");
    setData("");
    setMode("form");
  }

  function openEditForm(item: VaultItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setData(item.data);
    setMode("form");
  }

  function cancelForm() {
    // If we were editing an existing item, go back to its detail view; otherwise back to the grid.
    if (editingId !== null) {
      setSelectedId(editingId);
      setEditingId(null);
      setMode("detail");
    } else {
      backToGrid();
    }
  }

  // ---------- actions ----------

  async function handleSave() {
    if (!title.trim() || !data.trim()) return;

    if (isEditingExisting && editingId !== null) {
      await api.vault.update(editingId, title, data);
      await onRefresh();
      setSelectedId(editingId);
      setEditingId(null);
      setMode("detail");
    } else {
      await api.vault.add(title, data);
      await onRefresh();
      backToGrid();
    }
  }

  async function handleDelete(id: number) {
    await api.vault.remove(id);
    await onRefresh();
    backToGrid();
  }

  // Vault backup/restore removed from UI per request.

  // ---------- views ----------

  if (mode === "form") {
    return (
      <div className="page detail-view">
        <button className="back-button" onClick={cancelForm}>
          ← Back
        </button>

        <h1>{isEditingExisting ? "Edit note" : "New note"}</h1>

        <input
          className="field detail-title-input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="field detail-content-input"
          placeholder="Sensitive data (encrypted before it's saved)"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />

        <div className="card-actions">
          <button onClick={handleSave}>{isEditingExisting ? "Update (encrypted)" : "Save (encrypted)"}</button>
          <button className="secondary" onClick={cancelForm}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "detail" && selectedItem) {
    return (
      <div className="page detail-view">
        <button className="back-button" onClick={backToGrid}>
          ← Back
        </button>

        <h1>{selectedItem.title}</h1>
        <p className="muted detail-meta">
          Updated {new Date(selectedItem.updatedAt).toLocaleString()}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="secondary" onClick={() => setShowData((s) => !s)}>{showData ? 'Hide' : 'Show'} content</button>
          <div className="muted">(Content is blurred for privacy)</div>
        </div>

        <p className="detail-content" style={{ filter: showData ? 'none' : 'blur(6px)', WebkitFilter: showData ? 'none' : 'blur(6px)' }}>{selectedItem.data}</p>

        <div className="card-actions">
          <button className="secondary" onClick={() => openEditForm(selectedItem)}>
            Edit
          </button>
          <button className="secondary danger" onClick={() => handleDelete(selectedItem.id)}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  // mode === "grid"
  return (
    <div className="page">
      <div className="page-header">
        <h1>Vault</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={openNewForm}>+ New note</button>
        </div>
      </div>

      {statusMessage && <p style={{ color: "green" }}>{statusMessage}</p>}
      {errorMessage && <p style={{ color: "crimson" }}>{errorMessage}</p>}

      <div className="vault-grid">
        {items.map((item) => (
          <button key={item.id} className="vault-card" onClick={() => openItem(item)}>
            <strong className="vault-card-title">{item.title}</strong>
            <p className="vault-card-preview" style={{ filter: "blur(6px)", WebkitFilter: "blur(6px)" }}>{item.data}</p>
          </button>
        ))}
      </div>

      {items.length === 0 && <p className="muted">No items yet. Click "+ New note" to add one.</p>}
    </div>
  );
}
