import { Component } from 'react';
import { recordError } from '../../lib/errorReport.js';
import styles from './ErrorBoundary.module.css';

// If a page crashes, show a calm message instead of a blank screen, keep a
// scrubbed report (see lib/errorReport.js), and offer a way out. The
// journal itself is untouched: it is saved separately from the page.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    recordError(error, { kind: 'page-crash', componentStack: info?.componentStack || '' });
  }

  componentDidUpdate(prevProps) {
    // Going to another page gives it a fresh start.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`container ${styles.box}`} role="alert">
        <h1 className={styles.heading}>This page ran into a problem</h1>
        <p className={styles.text}>
          Your journal is safe: entries are saved separately and nothing was lost. A short report (without anything
          you wrote) was kept on this device.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            Reload the app
          </button>
          <a className={styles.link} href="#/">
            Go to your journal
          </a>
        </div>
      </div>
    );
  }
}
