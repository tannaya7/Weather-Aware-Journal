import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.jsx';
import styles from './AppLayout.module.css';

// Persistent left navigation shell wrapping every route.
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}
