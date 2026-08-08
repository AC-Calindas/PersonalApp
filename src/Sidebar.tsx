export type Page = "home" | "vault" | "progress" | "settings";

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  onLock: () => void;
}

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "vault", label: "Vault", icon: "🔒" },
  { id: "progress", label: "Backlog", icon: "📚" },
  { id: "settings", label: "Settings", icon: "⚙" }
];

export default function Sidebar({ current, onNavigate, onLock }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Vollerei's Domain</div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${current === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <button className="sidebar-lock" onClick={onLock}>
        Lock
      </button>
    </aside>
  );
}
