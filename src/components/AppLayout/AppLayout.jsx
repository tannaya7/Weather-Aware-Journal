import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.jsx';
import { SyncStatusBar } from '../SyncStatusBar/SyncStatusBar.jsx';
import { StorageNotice } from '../StorageNotice/StorageNotice.jsx';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary.jsx';
import styles from './AppLayout.module.css';

// Persistent left navigation shell wrapping every route.
export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <SyncStatusBar />
        <StorageNotice />
        {/* Shown while a page that loads on demand (see App.jsx) arrives. */}
        <Suspense
          fallback={
            <p className="container page-loading" role="status">
              Loading…
            </p>
          }
        >
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
}
