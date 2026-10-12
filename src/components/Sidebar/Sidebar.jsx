import { NavLink } from 'react-router-dom';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'nav.home', emoji: '🏠', end: true },
  { to: '/calendar', label: 'nav.calendar', emoji: '📅', end: false },
  { to: '/insights', label: 'nav.insights', emoji: '📈', end: false },
  { to: '/map', label: 'nav.map', emoji: '🗺️', end: false },
  { to: '/export', label: 'nav.export', emoji: '📤', end: false },
  { to: '/contact', label: 'nav.contact', emoji: '✉️', end: false },
  { to: '/settings', label: 'nav.settings', emoji: '⚙️', end: false },
];

function linkClass({ isActive }) {
  return [styles.link, isActive ? styles.active : ''].filter(Boolean).join(' ');
}

export function Sidebar() {
  const { lockEnabled, lock } = useEntriesContext();
  const { t } = useI18n();

  return (
    <nav className={styles.sidebar} aria-label={t('nav.label')}>
      <NavLink to="/" className={styles.logo} aria-hidden="true" tabIndex={-1}>
        🌥️
      </NavLink>
      <div className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <span className={styles.emoji} aria-hidden="true">
              {item.emoji}
            </span>
            {t(item.label)}
          </NavLink>
        ))}
        {lockEnabled && (
          <button type="button" className={styles.link} onClick={lock}>
            <span className={styles.emoji} aria-hidden="true">
              🔒
            </span>
            {t('nav.lock')}
          </button>
        )}
      </div>
    </nav>
  );
}
