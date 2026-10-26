import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './styles/global.css';
import { installErrorReporting } from './lib/errorReport.js';

// Keep a scrubbed note of errors nothing else caught (see lib/errorReport.js).
installErrorReporting();

document.documentElement.setAttribute('lang', 'en');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
