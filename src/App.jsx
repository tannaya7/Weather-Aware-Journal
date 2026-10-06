import { lazy } from 'react';
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

// Pages you don't need on every visit load only when opened, which keeps
// the first load small: the map (Leaflet is the biggest dependency),
// Insights' charts, Export's drawing and backups, and Settings' passkeys.
function lazyPage(load, name) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const MapPage = lazyPage(() => import('./pages/MapPage.jsx'), 'MapPage');
const Insights = lazyPage(() => import('./pages/Insights.jsx'), 'Insights');
const ExportPage = lazyPage(() => import('./pages/ExportPage.jsx'), 'ExportPage');
const Settings = lazyPage(() => import('./pages/Settings.jsx'), 'Settings');

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
                <Route path="/map" element={<MapPage />} />
                <Route path="/export" element={<ExportPage />} />
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
