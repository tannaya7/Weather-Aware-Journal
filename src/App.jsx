import { ThemeProvider } from './context/ThemeContext.jsx';
import { AnnouncerProvider } from './context/AnnouncerContext.jsx';
import { SkipLink } from './components/SkipLink/SkipLink.jsx';

export function App() {
  return (
    <ThemeProvider>
      <AnnouncerProvider>
        <SkipLink />
        <p id="main-content">Weather Journal is loading…</p>
      </AnnouncerProvider>
    </ThemeProvider>
  );
}
