import styles from './Header.module.css';

export function Header({ title, icon, children }) {
  return (
    <header className={styles.header} role="banner">
      <div className={styles.logoTitle}>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
        <h1>{title}</h1>
      </div>
      <div className={styles.actions}>{children}</div>
    </header>
  );
}
