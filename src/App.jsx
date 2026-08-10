import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AnnouncerProvider } from './context/AnnouncerContext.jsx';
import { EntriesProvider } from './context/EntriesContext.jsx';
import { SkipLink } from './components/SkipLink/SkipLink.jsx';
import { GlobalUndoToast } from './components/UndoToast/GlobalUndoToast.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { EntryFormPage } from './pages/EntryFormPage.jsx';
import { EntryDetail } from './pages/EntryDetail.jsx';

export function App() {
  return (
    <ThemeProvider>
      <AnnouncerProvider>
        <EntriesProvider>
          <HashRouter>
            <SkipLink />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<EntryFormPage />} />
              <Route path="/edit/:id" element={<EntryFormPage />} />
              <Route path="/entry/:id" element={<EntryDetail />} />
            </Routes>
            <GlobalUndoToast />
          </HashRouter>
        </EntriesProvider>
      </AnnouncerProvider>
    </ThemeProvider>
  );
}
