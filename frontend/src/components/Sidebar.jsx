import {
  IconMusic, IconAlbum, IconUpload, IconUser, IconLogout, IconLyrics, IconAdmin,
} from './Icons';

const NAV_ITEMS = [
  { id: 'library',  label: 'Library',  Icon: IconMusic },
  { id: 'albums',   label: 'Albums',   Icon: IconAlbum },
  { id: 'lyrics',   label: 'Lyrics',   Icon: IconLyrics },
  { id: 'upload',   label: 'Upload',   Icon: IconUpload },
  { id: 'profile',  label: 'Profile',  Icon: IconUser },
];

export default function Sidebar({ view, setView, user, onLogout, isOpen }) {
  const isAdmin = user?.role === 'admin';

  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      <div className="sidebar-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Neferkey
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Menu</div>
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <div
            key={id}
            className={`sidebar-item${view === id ? ' active' : ''}`}
            onClick={() => setView(id)}
          >
            <Icon size={16} />
            {label}
          </div>
        ))}
        {isAdmin && (
          <div
            className={`sidebar-item${view === 'admin' ? ' active' : ''}`}
            onClick={() => setView('admin')}
          >
            <IconAdmin size={16} />
            Admin
          </div>
        )}
      </div>

      {user && (
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', padding: '0.75rem 0' }}>
          <div className="sidebar-label">Signed in as</div>
          <div className="sidebar-item" style={{ cursor: 'default', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{user.username}</span>
          </div>
          <div className="sidebar-item" onClick={onLogout}>
            <IconLogout size={16} />
            Sign out
          </div>
        </div>
      )}
    </aside>
  );
}
