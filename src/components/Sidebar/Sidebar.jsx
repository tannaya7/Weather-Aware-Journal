import { NavLink } from 'react-router-dom';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home', emoji: '🏠', end: true },
  { to: '/calendar', label: 'Calendar', emoji: '📅', end: false },
  { to: '/insights', label: 'Insights', emoji: '📈', end: false },
  { to: '/map', label: 'Map', emoji: '🗺️', end: false },
  { to: '/export', label: 'Export', emoji: '📤', end: false },
  { to: '/contact', label: 'Contact', emoji: '✉️', end: false },
  { to: '/settings', label: 'Settings', emoji: '⚙️', end: false },
];

function linkClass({ isActive }) {
  return [styles.link, isActive ? styles.active : ''].filter(Boolean).join(' ');
}

export function Sidebar() {
  const { lockEnabled, lock } = useEntriesContext();

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <NavLink to="/" className={styles.logo} aria-hidden="true" tabIndex={-1}>
        🌥️
      </NavLink>
      <div className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <span className={styles.emoji} aria-hidden="true">
              {item.emoji}
            </span>
            {item.label}
          </NavLink>
        ))}
        {lockEnabled && (
          <button type="button" className={styles.link} onClick={lock}>
            <span className={styles.emoji} aria-hidden="true">
              🔒
            </span>
            Lock
          </button>
        )}
      </div>
    </nav>
  );
}
