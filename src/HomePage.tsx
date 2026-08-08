interface HomePageProps {
  itemCount: number;
  showBackupReminder: boolean;
}

export default function HomePage({ itemCount, showBackupReminder }: HomePageProps) {
  return (
    <div className="page">
      <h1>Vollerei's Domain</h1>
      <p>Welcome back Boss. Here's a quick overview.</p>

      <div className="stat-card">
        <div className="stat-number">{itemCount}</div>
        <div className="stat-label">item{itemCount === 1 ? "" : "s"} in your vault</div>
      </div>

      {showBackupReminder && itemCount > 0 && (
        <div className="card">
          <h3>Backup reminder</h3>
          <p>It’s a good idea to back up your vault regularly so you don’t lose data.</p>
        </div>
      )}

      <p className="muted">
        Proceed here to polish Boss:  <code>Sidebar.tsx</code>.
      </p>
    </div>
  );
}
