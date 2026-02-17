/**
 * main.tsx – Einstiegspunkt der Frontend-Anwendung
 *
 * Diese Datei initialisiert die React-Anwendung und bindet sie an das DOM.
 * Sie konfiguriert den BrowserRouter für clientseitiges Routing
 * und aktiviert den React StrictMode für zusätzliche Entwicklungsprüfungen.
 */

// React-Kernbibliothek importieren
import React from 'react';
// ReactDOM für das Rendern in den Browser-DOM
import ReactDOM from 'react-dom/client';
// BrowserRouter ermöglicht clientseitiges Routing mit der History-API
import { BrowserRouter } from 'react-router-dom';
// Hauptkomponente der Anwendung
import App from './App';
// Globale Stylesheets importieren
import './styles/index.css';

// Root-Element aus dem HTML-Dokument holen und React-Anwendung rendern
ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode aktiviert zusätzliche Warnungen und Prüfungen während der Entwicklung
  <React.StrictMode>
    {/* BrowserRouter stellt den Routing-Kontext für die gesamte Anwendung bereit */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
