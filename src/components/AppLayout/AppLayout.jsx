import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.jsx';
import styles from './AppLayout.module.css';

// Persistent left navigation shell wrapping every route.
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        {/* Shown while a page that loads on demand (see App.jsx) arrives. */}
        <Suspense
          fallback={
            <p className="container page-loading" role="status">
              Loading…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
