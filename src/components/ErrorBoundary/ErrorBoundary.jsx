import { Component } from 'react';
import { recordError } from '../../lib/errorReport.js';
import { I18nContext } from '../../i18n/I18nContext.jsx';
import styles from './ErrorBoundary.module.css';

// If a page crashes, show a calm message instead of a blank screen, keep a
// scrubbed report (see lib/errorReport.js), and offer a way out. The
// journal itself is untouched: it is saved separately from the page.
export class ErrorBoundary extends Component {
  static contextType = I18nContext;

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
    const { t } = this.context;
    return (
      <div className={`container ${styles.box}`} role="alert">
        <h1 className={styles.heading}>{t('crash.heading')}</h1>
        <p className={styles.text}>{t('crash.text')}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            {t('crash.reload')}
          </button>
          <a className={styles.link} href="#/">
            {t('crash.home')}
          </a>
        </div>
      </div>
    );
  }
}
