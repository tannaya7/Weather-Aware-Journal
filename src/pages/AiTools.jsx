import { Link } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { getServerUrl } from '../lib/syncClient.js';
import styles from './AiTools.module.css';

// One place that lists the four optional Gemini tasks, says whether they can
// be used right now, and opens each where it lives. Nothing here sends
// anything: every task is started by its own button on its own page.
export function AiTools() {
  const { t } = useI18n();
  const { entries, sync, settings } = useEntriesContext();

  const hasServer = Boolean(getServerUrl());
  const consented = Boolean(settings.geminiAi?.consented);
  const latest = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  let status = 'ai.hub.ready';
  if (!hasServer) status = 'ai.hub.noServer';
  else if (!sync.enabled) status = 'ai.needSync';
  else if (!consented) status = 'ai.hub.needConsent';

  const tools = [
    {
      key: 'org',
      icon: '🗂️',
      to: latest ? `/entry/${latest.id}` : '/new',
      state: latest ? { focus: 'gemini-organize-heading' } : undefined,
      link: latest ? 'ai.hub.org.go' : 'ai.hub.org.none',
    },
    {
      key: 'plan',
      icon: '🗓️',
      to: '/',
      state: { focus: 'forecast-heading' },
      link: 'ai.hub.plan.go',
    },
    {
      key: 'wp',
      icon: '💡',
      to: '/new',
      state: { focus: 'gemini-prompt-open' },
      link: 'ai.hub.wp.go',
    },
    {
      key: 'review',
      icon: '🔎',
      to: '/insights',
      state: { focus: 'gemini-review-heading' },
      link: 'ai.hub.review.go',
    },
  ];

  return (
    <>
      <Header title={t('page.ai')}>
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <p className={styles.text}>{t('ai.hub.intro')}</p>

        <p className={styles.status} role="status">
          {t(status)}{' '}
          {hasServer && !sync.enabled && (
            <Link to="/settings">{t('ai.hub.openSettings')}</Link>
          )}
        </p>

        <ul className={styles.list} aria-label={t('page.ai')}>
          {tools.map((tool) => (
            <li key={tool.key} className={styles.card}>
              <h2 className={styles.name}>
                <span aria-hidden="true">{tool.icon}</span> {t(`ai.hub.${tool.key}.name`)}
              </h2>
              <p className={styles.text}>{t(`ai.hub.${tool.key}.what`)}</p>
              <p className={styles.sends}>{t(`ai.hub.${tool.key}.sends`)}</p>
              <p className={styles.where}>{t(`ai.hub.${tool.key}.where`)}</p>
              <Link className={styles.go} to={tool.to} state={tool.state}>
                {t(tool.link)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
