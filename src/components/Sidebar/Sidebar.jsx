import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home', emoji: '🏠', end: true },
  { to: '/calendar', label: 'Calendar', emoji: '📅', end: false },
  { to: '/contact', label: 'Contact', emoji: '✉️', end: false },
];

function linkClass({ isActive }) {
  return [styles.link, isActive ? styles.active : ''].filter(Boolean).join(' ');
}

export function Sidebar() {
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
      </div>
    </nav>
  );
}
