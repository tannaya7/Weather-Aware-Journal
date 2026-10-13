import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AnnouncerProvider } from './context/AnnouncerContext.jsx';
import { EntriesProvider } from './context/EntriesContext.jsx';
import { SkipLink } from './components/SkipLink/SkipLink.jsx';
import { GlobalUndoToast } from './components/UndoToast/GlobalUndoToast.jsx';
import { AppLayout } from './components/AppLayout/AppLayout.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { EntryFormPage } from './pages/EntryFormPage.jsx';
import { EntryDetail } from './pages/EntryDetail.jsx';
import { Calendar } from './pages/Calendar.jsx';
import { Contact } from './pages/Contact.jsx';
import { Settings } from './pages/Settings.jsx';
import { Insights } from './pages/Insights.jsx';

// Leaflet is the app's biggest dependency, so the map loads only when opened.
const MapPage = lazy(() => import('./pages/MapPage.jsx').then((m) => ({ default: m.MapPage })));

export function App() {
  return (
    <ThemeProvider>
      <AnnouncerProvider>
        <EntriesProvider>
          <HashRouter>
            <SkipLink />
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/new" element={<EntryFormPage />} />
                <Route path="/edit/:id" element={<EntryFormPage />} />
                <Route path="/entry/:id" element={<EntryDetail />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/insights" element={<Insights />} />
                <Route
                  path="/map"
                  element={
                    <Suspense fallback={<p className="container">Loading the map…</p>}>
                      <MapPage />
                    </Suspense>
                  }
                />
                <Route path="/contact" element={<Contact />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
            <GlobalUndoToast />
          </HashRouter>
        </EntriesProvider>
      </AnnouncerProvider>
    </ThemeProvider>
  );
}
