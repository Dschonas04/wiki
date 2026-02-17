/**
 * AuthContext.tsx – Authentifizierungskontext der Anwendung
 *
 * Stellt den globalen Authentifizierungsstatus für die gesamte Anwendung bereit.
 * Verwaltet:
 * - Den aktuell angemeldeten Benutzer und dessen Profildaten
 * - Login- und Logout-Funktionalität
 * - Berechtigungsprüfung (hasPermission)
 * - Automatische Abmeldung bei abgelaufener Sitzung (401-Event)
 * - Rollenbasierte Hilfseigenschaften (isAdmin, isAuditor)
 */

// React-Hooks und Typen für Kontextverwaltung importieren
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
// API-Client und Benutzer-Interface importieren
import { api, type User } from '../api/client';

/**
 * AuthContextType – Typdefinition für den Authentifizierungskontext
 *
 * Definiert alle Werte und Funktionen, die über den Kontext bereitgestellt werden.
 */
interface AuthContextType {
  /** Aktuell angemeldeter Benutzer (null wenn nicht angemeldet) */
  user: User | null;
  /** Ladezustand während der initialen Authentifizierungsprüfung */
  loading: boolean;
  /** Funktion zum Anmelden mit Benutzername und Passwort */
  login: (username: string, password: string) => Promise<void>;
  /** Funktion zum Abmelden des aktuellen Benutzers */
  logout: () => Promise<void>;
  /** Funktion zum erneuten Laden der Benutzerdaten vom Server */
  refreshUser: () => Promise<void>;
  /** Prüft ob der Benutzer alle angegebenen Berechtigungen besitzt */
  hasPermission: (...perms: string[]) => boolean;
  /** Ob der aktuelle Benutzer ein Administrator ist */
  isAdmin: boolean;
  /** Ob der aktuelle Benutzer ein Auditor ist */
  isAuditor: boolean;
  /** Ob der aktuelle Benutzer ein Bearbeiter oder höher ist (Editor-Rolle auf Bereichsebene) */
  isEditor: boolean;
}

// Authentifizierungskontext mit Standardwert null erstellen
const AuthContext = createContext<AuthContextType | null>(null);

/**
 * AuthProvider – Provider-Komponente für den Authentifizierungskontext
 *
 * Wickelt die Anwendung ein und stellt den Authentifizierungsstatus bereit.
 * Prüft beim Laden automatisch, ob eine gültige Sitzung vorhanden ist.
 *
 * @param children - Kind-Komponenten, die Zugriff auf den Auth-Kontext erhalten
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Zustand für den aktuellen Benutzer (null = nicht angemeldet)
  const [user, setUser] = useState<User | null>(null);
  // Ladezustand: true während der initialen Authentifizierungsprüfung
  const [loading, setLoading] = useState(true);

  /**
   * checkAuth – Initiale Authentifizierungsprüfung
   *
   * Wird beim ersten Laden ausgeführt, um zu prüfen ob eine gültige Sitzung existiert.
   * Ruft das aktuelle Benutzerprofil vom Server ab.
   */
  const checkAuth = useCallback(async () => {
    try {
      // Benutzerprofil vom Server abrufen
      const me = await api.getMe();
      setUser(me);
    } catch {
      // Bei Fehler (z.B. keine gültige Sitzung) Benutzer auf null setzen
      setUser(null);
    } finally {
      // Ladezustand beenden, unabhängig vom Ergebnis
      setLoading(false);
    }
  }, []);

  /**
   * refreshUser – Benutzerdaten neu laden
   *
   * Kann aufgerufen werden, um die Benutzerdaten vom Server zu aktualisieren,
   * z.B. nach einer Profileinstellung oder Rollenänderung.
   */
  const refreshUser = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      // Bei Fehler wird der Benutzer abgemeldet
      setUser(null);
    }
  }, []);

  // Authentifizierungsprüfung beim ersten Laden der Komponente ausführen
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Auf 401-Events vom API-Client lauschen (Sitzung abgelaufen)
  // Wenn die Sitzung serverseitig abläuft, wird der Benutzer automatisch abgemeldet
  useEffect(() => {
    const handler = () => setUser(null);
    // Event-Listener für das benutzerdefinierte 'auth:expired'-Event registrieren
    window.addEventListener('auth:expired', handler);
    // Aufräumfunktion: Event-Listener beim Unmount entfernen
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  /**
   * login – Benutzeranmeldung
   *
   * Sendet die Anmeldedaten an das Backend und speichert den
   * zurückgegebenen Benutzer im Zustand.
   *
   * @param username - Benutzername
   * @param password - Passwort
   */
  const login = async (username: string, password: string) => {
    const { user: loggedIn } = await api.login(username, password);
    setUser(loggedIn);
  };

  /**
   * logout – Benutzerabmeldung
   *
   * Sendet eine Abmeldeanfrage an das Backend und setzt den
   * lokalen Benutzerzustand auf null zurück.
   */
  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Fehler bei der Abmeldung ignorieren (Benutzer wird trotzdem lokal abgemeldet)
    }
    setUser(null);
  };

  /**
   * hasPermission – Berechtigungsprüfung
   *
   * Prüft ob der aktuelle Benutzer ALLE angegebenen Berechtigungen besitzt.
   *
   * @param perms - Eine oder mehrere zu prüfende Berechtigungen
   * @returns true wenn der Benutzer alle Berechtigungen besitzt
   */
  const hasPermission = (...perms: string[]) => {
    if (!user) return false;
    // Jede angeforderte Berechtigung muss in der Berechtigungsliste des Benutzers enthalten sein
    return perms.every((p) => user.permissions.includes(p));
  };

  // Rollenbasierte Hilfseigenschaften für einfache Prüfungen in Komponenten
  const isAdmin = user?.globalRole === 'admin';
  const isAuditor = user?.globalRole === 'auditor';
  // Bearbeiter-Berechtigung: Benutzer mit pages.create Berechtigung
  const isEditor = hasPermission('pages.create');

  // Kontext-Provider mit allen Werten und Funktionen bereitstellen
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, hasPermission, isAdmin, isAuditor, isEditor }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth – Hook zum Zugriff auf den Authentifizierungskontext
 *
 * Ermöglicht den einfachen Zugriff auf den Auth-Zustand und die Auth-Funktionen
 * in jeder Komponente innerhalb des AuthProviders.
 *
 * @throws Fehler wenn der Hook außerhalb des AuthProviders verwendet wird
 * @returns Das AuthContextType-Objekt mit Benutzer, Login, Logout, etc.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  // Sicherheitsprüfung: Hook darf nur innerhalb des AuthProviders verwendet werden
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
