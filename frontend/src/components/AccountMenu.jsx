import { useEffect, useRef, useState } from 'react';
import { IconLogout, IconUser } from './Icons';

export default function AccountMenu({
  user,
  onSignIn,
  onRegister,
  onProfile,
  onPreferences,
  onToggleAudiobookMode,
  audiobookModeActive = false,
  onDeleteAccount,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function close(fn) {
    return () => { if (typeof fn === 'function') fn(); setOpen(false); };
  }

  return (
    <div className="account-menu-wrapper" ref={ref}>
      <button
        className="account-btn"
        onClick={() => setOpen((o) => !o)}
        title={user ? user.username : 'Account'}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user ? (
          <div className="account-avatar">{user.username.charAt(0).toUpperCase()}</div>
        ) : (
          <IconUser size={18} />
        )}
      </button>

      {open && (
        <div className="account-dropdown" role="menu">
          {user ? (
            <>
              <div className="account-dropdown-header">
                <div className="account-dropdown-name">{user.username}</div>
                <div className="account-dropdown-email">{user.email}</div>
                {user.role && user.role !== 'user' && (
                  <div className="account-dropdown-role">{user.role}</div>
                )}
              </div>
              <div className="account-dropdown-divider" />
              <button className="account-dropdown-item" role="menuitem" onClick={close(onProfile)}>
                Personal data
              </button>
              <button className="account-dropdown-item" role="menuitem" onClick={close(onPreferences)}>
                Preferences
              </button>
              <button className="account-dropdown-item" role="menuitem" onClick={close(onToggleAudiobookMode)}>
                {audiobookModeActive ? 'Disable audiobook mode' : 'Enable audiobook mode'}
              </button>
              <div className="account-dropdown-divider" />
              <button className="account-dropdown-item account-dropdown-danger" role="menuitem" onClick={close(onDeleteAccount)}>
                Delete account
              </button>
              <button className="account-dropdown-item" role="menuitem" onClick={close(onSignOut)}>
                <IconLogout size={13} /> Sign out
              </button>
            </>
          ) : (
            <>
              <button className="account-dropdown-item account-dropdown-primary" role="menuitem" onClick={close(onSignIn)}>
                Sign in
              </button>
              <button className="account-dropdown-item" role="menuitem" onClick={close(onRegister)}>
                Create account
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
