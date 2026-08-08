import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings } from "./types";

interface BacklogItem {
  id: string;
  title: string;
  description: string;
  category: "reading" | "gaming" | "projects";
  tags?: string[];
  completed: boolean;
}

interface TagDef {
  name: string;
  color?: string;
}

const DEFAULT_BACKLOG: BacklogItem[] = [];

interface ProgressPageProps {
  settings: AppSettings;
}

function ProgressBar({ label, value, max, accent }: { label: string; value: number; max: number; accent: string }) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="card" style={{ padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <strong>{label}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {value} of {max} completed ({percentage}%)
          </p>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{percentage}%</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 10, overflow: "hidden", height: 14 }}>
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: accent,
            transition: "width 0.3s ease"
          }}
        />
      </div>
    </div>
  );
}

function generateBacklogId(category: string) {
  return `${category}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export default function ProgressPage({ settings }: ProgressPageProps) {
  const [backlog, setBacklog] = useState<BacklogItem[]>(() => {
    try {
      const stored = window.localStorage.getItem("unifiedBacklog");
      return stored ? JSON.parse(stored) : DEFAULT_BACKLOG;
    } catch {
      return DEFAULT_BACKLOG;
    }
  });
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<BacklogItem["category"]>("reading");
  const [filter, setFilter] = useState<"all" | "reading" | "gaming" | "completed" | "open">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<BacklogItem["category"]>("reading");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [tags, setTags] = useState<TagDef[]>(() => {
    try {
      const stored = window.localStorage.getItem("unifiedBacklogTags");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      // migration: if stored as array of strings, convert to TagDef with generated color
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
        return parsed.map((n: string) => ({ name: n, color: colorForTag(n) }));
      }
      return parsed as TagDef[];
    } catch {
      return [];
    }
  });
  const [tagEditing, setTagEditing] = useState<string | null>(null);
  const [tagEditValue, setTagEditValue] = useState<string>("");
  const newTitleRef = useRef<HTMLInputElement | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [selectedNewTags, setSelectedNewTags] = useState<string[]>([]);
  const [editSelectedTags, setEditSelectedTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);

  

  useEffect(() => {
    window.localStorage.setItem("unifiedBacklog", JSON.stringify(backlog));
  }, [backlog]);

  useEffect(() => {
    window.localStorage.setItem("unifiedBacklogTags", JSON.stringify(tags));
  }, [tags]);

  function colorForTag(name: string) {
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum = (sum * 31 + name.charCodeAt(i)) >>> 0;
    const h = sum % 360;
    return `hsl(${h} 70% 45%)`;
  }

  function tagTextColor(bg: string) {
    // crude: return white for now
    return "#fff";
  }

  const readingItems = useMemo(() => backlog.filter((item) => item.category === "reading"), [backlog]);
  const gamingItems = useMemo(() => backlog.filter((item) => item.category === "gaming"), [backlog]);

  const readingCompleted = readingItems.filter((item) => item.completed).length;
  const gamingCompleted = gamingItems.filter((item) => item.completed).length;
  const combinedCompleted = backlog.filter((item) => item.completed).length;
  const combinedTotal = backlog.length;

  const filteredItems = useMemo(() => {
    switch (filter) {
      case "reading":
        return readingItems;
      case "gaming":
        return gamingItems;
      case "completed":
        return backlog.filter((item) => item.completed);
      case "open":
        return backlog.filter((item) => !item.completed);
      case "all":
      default:
        return backlog;
    }
  }, [backlog, filter, readingItems, gamingItems]);

  const filteredItemsWithTags = useMemo(() => {
    let items = filteredItems;
    if (tagFilter) items = items.filter((item) => (item.tags || []).includes(tagFilter));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter((item) => (item.title || "").toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q));
    }
    return items;
  }, [filteredItems, tagFilter, searchQuery]);

  function saveBacklog(items: BacklogItem[]) {
    setBacklog(items);
  }

  function startTagEdit(t: string) {
    setTagEditing(t);
    setTagEditValue(t);
  }

  function cancelTagEdit() {
    setTagEditing(null);
    setTagEditValue("");
  }

  function saveTagEdit() {
    if (!tagEditing) return;
    const newTag = tagEditValue.trim();
    if (!newTag) return;
    if (newTag === tagEditing) {
      cancelTagEdit();
      return;
    }
    if (tags.some((tg) => tg.name === newTag)) {
      // avoid duplicate names
      cancelTagEdit();
      return;
    }
    // replace tag name in tags list
    setTags(tags.map((td) => (td.name === tagEditing ? { ...td, name: newTag, color: td.color ?? colorForTag(newTag) } : td)));
    // update backlog items to replace tag
    saveBacklog(
      backlog.map((item) => ({
        ...item,
        tags: (item.tags || []).map((tt) => (tt === tagEditing ? newTag : tt))
      }))
    );
    // update selected tag arrays and active filter
    setSelectedNewTags(selectedNewTags.map((s) => (s === tagEditing ? newTag : s)));
    setEditSelectedTags(editSelectedTags.map((s) => (s === tagEditing ? newTag : s)));
    if (tagFilter === tagEditing) setTagFilter(newTag);
    cancelTagEdit();
  }

  function deleteTag(todel: string) {
    setTags(tags.filter((td) => td.name !== todel));
    saveBacklog(
      backlog.map((item) => ({ ...item, tags: (item.tags || []).filter((tt) => tt !== todel) }))
    );
    setSelectedNewTags(selectedNewTags.filter((s) => s !== todel));
    setEditSelectedTags(editSelectedTags.filter((s) => s !== todel));
    if (tagFilter === todel) setTagFilter(null);
  }

  function focusNewItemInput() {
    setShowQuickAdd(true);
    // wait for the input to render then focus
    setTimeout(() => newTitleRef.current?.focus(), 0);
  }

  function handleAddTagToItem(itemId: string) {
    const t = window.prompt("Enter tag to add to this item:");
    if (!t) return;
    const tag = t.trim();
    if (!tag) return;
    if (!tags.some((td) => td.name === tag)) setTags([{ name: tag, color: colorForTag(tag) }, ...tags]);
    saveBacklog(
      backlog.map((it) =>
        it.id === itemId
          ? { ...it, tags: Array.from(new Set([...(it.tags || []), tag])) }
          : it
      )
    );
  }

  function toggleCompleted(id: string) {
    saveBacklog(
      backlog.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  }

  function addBacklogItem() {
    if (!newTitle.trim()) return;
    const item: BacklogItem = {
      id: generateBacklogId(newCategory),
      title: newTitle.trim(),
      description: newDescription.trim(),
      category: newCategory,
      completed: false,
      tags: selectedNewTags
    };
    saveBacklog([item, ...backlog]);
    setNewTitle("");
    setNewDescription("");
    setSelectedNewTags([]);
    setShowQuickAdd(false);
  }

  function startEdit(item: BacklogItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditCategory(item.category);
    setEditSelectedTags(item.tags || []);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  }

  function saveEdit(id: string) {
    saveBacklog(
      backlog.map((item) =>
        item.id === id
          ? { ...item, title: editTitle.trim() || item.title, description: editDescription.trim(), category: editCategory, tags: editSelectedTags }
          : item
      )
    );
    cancelEdit();
  }

  function deleteItem(id: string) {
    saveBacklog(backlog.filter((item) => item.id !== id));
  }

  function moveItem(sourceId: string, targetId: string) {
    const sourceIndex = backlog.findIndex((item) => item.id === sourceId);
    const targetIndex = backlog.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const next = [...backlog];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    saveBacklog(next);
  }

  function renderItem(item: BacklogItem) {
    const isEditing = editingId === item.id;
    return (
      <div
        key={item.id}
        className="card library-card"
        draggable
        onDragStart={(event) => {
          setDraggingId(item.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.id);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId = event.dataTransfer.getData("text/plain");
          if (sourceId && sourceId !== item.id) {
            moveItem(sourceId, item.id);
          }
          setDraggingId(null);
        }}
        style={{ margin: "10px 0", padding: "14px", opacity: draggingId === item.id ? 0.5 : 1 }}
      >
        {isEditing ? (
          <div style={{ display: "grid", gap: 10 }}>
            <input
              className="field"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
            />
            <textarea
              className="field"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description"
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select className="field" value={editCategory} onChange={(e) => setEditCategory(e.target.value as BacklogItem["category"])}>
                <option value="reading">Reading</option>
                  <option value="projects">Projects</option>
                <option value="gaming">Gaming</option>
              </select>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {tags.map((td) => {
                  const sel = editSelectedTags.includes(td.name);
                  return (
                    <button
                      key={td.name}
                      className={`secondary ${sel ? 'selected' : ''}`}
                      onClick={() => {
                        if (sel) setEditSelectedTags(editSelectedTags.filter(x => x !== td.name));
                        else setEditSelectedTags([...(editSelectedTags || []), td.name]);
                      }}
                      style={{ background: td.color, color: tagTextColor(td.color || '') }}
                    >
                      {td.name}
                    </button>
                  );
                })}
              </div>
              <button className="secondary" onClick={() => saveEdit(item.id)}>
                Save
              </button>
              <button className="secondary" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div className="library-card-badge">{item.category === "reading" ? "Reading" : item.category === "gaming" ? "Gaming" : "Projects"}</div>
              <strong>{item.title}</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>{item.description}</p>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(item.tags || []).map((t) => {
                  const td = tags.find((x) => x.name === t);
                  return (
                    <span key={t} className="tag-chip" style={{ background: td?.color, color: tagTextColor(td?.color || "") }}>{t}</span>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted-text, #666)" }}>
                {item.completed ? "Completed" : "Ongoing"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 130 }}>
              <button className="secondary" onClick={() => toggleCompleted(item.id)}>
                {item.completed ? "Mark undone" : "Mark done"}
              </button>
              <button className="secondary" onClick={() => handleAddTagToItem(item.id)}>
                Add tag
              </button>
              <button className="secondary" onClick={() => startEdit(item)}>
                Edit
              </button>
              <button className="secondary" onClick={() => deleteItem(item.id)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Archives</h1>
          <p className="muted">Track your reading and gaming progress together in one place.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <input
          className="field"
          placeholder="Search title or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="secondary" onClick={() => setSearchQuery("")}>Clear</button>
        <button className="secondary" onClick={() => setShowFilters(!showFilters)} style={{ minWidth: 120 }}>
          {showFilters ? 'Hide filters' : 'Show filters'}
        </button>
      </div>
      {showFilters && (
        <div className="filter-bar">
        {([
          { value: "all", label: "All" },
          { value: "reading", label: "Books" },
          { value: "gaming", label: "Games" },
          { value: "completed", label: "Completed" },
          { value: "open", label: "Ongoing" }
        ] as const).map((option) => (
          <button
            key={option.value}
            className={`secondary ${filter === option.value ? "active-filter" : ""}`}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
        <div style={{ width: 12 }} />
        <div className="muted" style={{ alignSelf: 'center' }}>Tags:</div>
        <button
          className={`secondary ${tagFilter === null ? 'active-filter' : ''}`}
          onClick={() => setTagFilter(null)}
        >
          All
        </button>
        {tags.map((td) => (
          <button
            key={td.name}
            className={`secondary ${tagFilter === td.name ? 'active-filter' : ''}`}
            onClick={() => setTagFilter(tagFilter === td.name ? null : td.name)}
            style={{ background: td.color, color: tagTextColor(td.color || '') }}
          >
            {td.name}
          </button>
        ))}
        </div>
      )}

      <div className="card-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <ProgressBar label="Reading progress" value={readingCompleted} max={readingItems.length} accent="#4f46e5" />
        <ProgressBar label="Gaming progress" value={gamingCompleted} max={gamingItems.length} accent="#059669" />
        <ProgressBar label="Combined daily progress" value={combinedCompleted} max={combinedTotal} accent="#f59e0b" />
      </div>

      {showQuickAdd && (
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <h2>Quick add backlog item</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <input
              ref={newTitleRef}
              className="field"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
            />
            <textarea
              className="field"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description"
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <select className="field" value={newCategory} onChange={(e) => setNewCategory(e.target.value as BacklogItem["category"])}>
                <option value="reading">Books</option>
                <option value="projects">Projects</option>
                <option value="gaming">Games</option>
              </select>
              <button className="secondary" style={{ minWidth: 120 }} onClick={addBacklogItem}>
                Add item
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input className="field" placeholder="New tag" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} style={{ width: 160 }} />
                <button className="secondary" onClick={() => {
                  const t = newTagInput.trim();
                  if (!t) return;
                  if (!tags.some((td) => td.name === t)) setTags([{ name: t, color: colorForTag(t) }, ...tags]);
                  setNewTagInput("");
                }}>Add tag</button>
              </div>
              <div className="tag-list">
                {tags.map((td) => {
                  const selected = selectedNewTags.includes(td.name);
                  return (
                    <div key={td.name} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 6, marginBottom: 6 }}>
                      <button
                        className={`secondary ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          if (selected) setSelectedNewTags(selectedNewTags.filter(x => x !== td.name));
                          else setSelectedNewTags([...(selectedNewTags || []), td.name]);
                        }}
                        style={{ background: td.color, color: tagTextColor(td.color || '') }}
                      >
                        {td.name}
                      </button>
                      {tagEditing === td.name ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input className="field" value={tagEditValue} onChange={(e) => setTagEditValue(e.target.value)} style={{ width: 120 }} />
                          <button className="secondary" onClick={saveTagEdit}>Save</button>
                          <button className="secondary" onClick={cancelTagEdit}>Cancel</button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="secondary" onClick={() => startTagEdit(td.name)} title="Rename tag">✎</button>
                          <button className="danger" onClick={() => {
                            if (!confirm(`Delete tag '${td.name}' from all items?`)) return;
                            deleteTag(td.name);
                          }} title="Delete tag">🗑</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Library</h2>
          <button className="secondary" onClick={focusNewItemInput}>Add item</button>
        </div>
        {filteredItemsWithTags.length === 0 ? (
          <p className="muted">No backlog items match this filter. Try another view or add a new item.</p>
        ) : (
          <div className="library-grid">
            {filteredItemsWithTags.map((item) => renderItem(item))}
          </div>
        )}
      </div>
    </div>
  );
}
