import { ThemeProvider } from './context/ThemeContext.jsx';
import { AnnouncerProvider } from './context/AnnouncerContext.jsx';
import { EntriesProvider } from './context/EntriesContext.jsx';
import { SkipLink } from './components/SkipLink/SkipLink.jsx';

export function App() {
  return (
    <ThemeProvider>
      <AnnouncerProvider>
        <EntriesProvider>
          <SkipLink />
          <p id="main-content">Weather Journal is loading…</p>
        </EntriesProvider>
      </AnnouncerProvider>
    </ThemeProvider>
  );
}
