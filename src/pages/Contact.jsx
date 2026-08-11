import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import styles from './Contact.module.css';

export function Contact() {
  return (
    <>
      <Header title="Contact Us">
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden="true">
            ✉️
          </span>
          <h1 className={styles.title}>Get in touch</h1>
          <p className={styles.text}>
            Questions, feedback, or a feature you&apos;d love to see in your journal? Send an
            email — this app doesn&apos;t have a backend, so there&apos;s no contact form here,
            just a direct line.
          </p>
          <a className={styles.email} href="mailto:tannayasupriya157@gmail.com">
            tannayasupriya157@gmail.com
          </a>
        </div>
      </div>
    </>
  );
}
