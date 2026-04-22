import AccountMenu from './AccountMenu';

export function IconMenu({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function TopBar({
  viewTitle,
  user,
  sidebarOpen,
  onToggleSidebar,
  onSignIn,
  onRegister,
  onProfile,
  onPreferences,
  onDeleteAccount,
  onSignOut,
}) {
  return (
    <div className="top-bar">
      <button
        className="hamburger-btn"
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Close menu' : 'Open menu'}
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
      >
        <IconMenu size={20} />
      </button>
      <span className="top-bar-title">{viewTitle}</span>
      <AccountMenu
        user={user}
        onSignIn={onSignIn}
        onRegister={onRegister}
        onProfile={onProfile}
        onPreferences={onPreferences}
        onDeleteAccount={onDeleteAccount}
        onSignOut={onSignOut}
      />
    </div>
  );
}
