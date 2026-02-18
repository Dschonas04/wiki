/**
 * client.ts – API-Client für das Nexora Wissensmanagement-System
 *
 * Diese Datei definiert alle TypeScript-Schnittstellen (Interfaces) für die
 * Datenmodelle der Nexora-Anwendung und stellt einen zentralen API-Client bereit,
 * der alle HTTP-Anfragen an das Backend kapselt.
 *
 * Enthält:
 * - Interfaces für alle Datentypen (Seiten, Bereiche, Ordner, Benutzer, Tags, etc.)
 * - Generische Request-Funktion mit Fehlerbehandlung und Authentifizierungsprüfung
 * - API-Objekt mit allen verfügbaren Endpunkten, gruppiert nach Funktionsbereichen
 */

// ===== Workflow-Status-Typ =====
export type WorkflowStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published' | 'archived';
export type GlobalRole = 'admin' | 'auditor' | 'user';
export type SpaceRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

// ===== Datenmodell-Interfaces =====

/**
 * Organization – Organisation im Nexora-System
 */
export interface Organization {
  id: number;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
  /** Anzahl der Team-Bereiche (optional, je nach Endpoint) */
  space_count?: number;
}

/**
 * TeamSpace – Team-Bereich innerhalb einer Organisation
 */
export interface TeamSpace {
  id: number;
  organization_id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  is_archived: boolean;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  /** Anzahl veröffentlichter Seiten */
  page_count?: number;
  /** Anzahl der Mitglieder */
  member_count?: number;
  /** Rolle des aktuellen Benutzers in diesem Bereich */
  my_role?: SpaceRole | null;
}

/**
 * SpaceMembership – Mitgliedschaft in einem Team-Bereich
 */
export interface SpaceMembership {
  id: number;
  space_id: number;
  user_id: number;
  role: SpaceRole;
  username?: string;
  display_name?: string;
  email?: string;
  global_role?: GlobalRole;
  joined_at?: string;
}

/**
 * Folder – Ordner innerhalb eines Team-Bereichs
 */
export interface Folder {
  id: number;
  space_id: number;
  name: string;
  slug: string;
  parent_folder_id?: number | null;
  depth: number;
  sort_order: number;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  /** Anzahl der Seiten im Ordner */
  page_count?: number;
  /** Unterordner (hierarchisch geladen) */
  children?: Folder[];
}

/**
 * PrivateSpace – Privater Bereich eines Benutzers
 */
export interface PrivateSpace {
  id: number;
  user_id: number;
  created_at: string;
  /** Seiten im privaten Bereich */
  pages?: WikiPage[];
  /** Offene Veröffentlichungsanträge */
  pending_requests?: PublishRequest[];
}

/**
 * WikiPage – Repräsentiert eine Wiki-Seite im Nexora-System
 */
export interface WikiPage {
  id: number;
  title: string;
  content: string;
  content_type?: 'markdown' | 'html';
  parent_id?: number | null;
  parent_title?: string | null;
  children_count?: number;
  /** Breadcrumb-Kette (Elternseiten) */
  breadcrumbs?: { id: number; title: string }[];
  /** Unterseiten */
  children?: { id: number; title: string }[];
  /** Bereichs-Zuordnung */
  space_id?: number | null;
  space_name?: string | null;
  folder_id?: number | null;
  folder_name?: string | null;
  private_space_id?: number | null;
  /** Workflow-Status */
  workflow_status?: WorkflowStatus;
  /** Ersteller */
  created_by?: number;
  created_by_name?: string;
  updated_by?: number;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  /** Versionszähler (optional) */
  version_count?: number;
}

/**
 * PublishRequest – Veröffentlichungsantrag
 */
export interface PublishRequest {
  id: number;
  page_id: number;
  requested_by: number;
  requested_by_name?: string;
  target_space_id: number;
  target_space_name?: string;
  target_folder_id?: number | null;
  target_folder_name?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  comment?: string | null;
  review_comment?: string | null;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  page_title?: string;
  page_content?: string;
  content_type?: string;
  current_status?: WorkflowStatus;
  created_at: string;
}

/**
 * HealthData – Systemstatus-Daten
 */
export interface HealthData {
  status: string;
  database: string;
  ldap?: string;
  rbac?: string;
  roles?: string[];
  timestamp: string;
  uptime?: number;
  counts?: { users: number; pages: number };
}

/**
 * ApiError – Fehlerantwort der API
 */
export interface ApiError {
  error: string;
  errors?: string[];
}

/**
 * User – Vollständiges Benutzerprofil im Nexora-System
 */
export interface User {
  id: number;
  username: string;
  displayName: string;
  email: string;
  /** Globale Rolle: Administrator, Auditor oder Benutzer */
  globalRole: GlobalRole;
  authSource: 'local' | 'ldap';
  lastLogin?: string;
  createdAt: string;
  mustChangePassword?: boolean;
  permissions: string[];
}

/**
 * UserListItem – Benutzer in der Übersichtsliste (Verwaltung)
 */
export interface UserListItem {
  id: number;
  username: string;
  displayName: string;
  email: string;
  globalRole: GlobalRole;
  authSource: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

/**
 * AuditEntry – Einzelner Eintrag im Audit-Protokoll
 */
export interface AuditEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: number;
  details?: Record<string, unknown>;
  ip_address: string;
  space_id?: number;
  created_at: string;
}

/**
 * AuditResponse – Paginierte Antwort für Audit-Einträge
 */
export interface AuditResponse {
  items: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * PageVersion – Versionseintrag einer Wiki-Seite
 */
export interface PageVersion {
  id: number;
  page_id: number;
  title: string;
  content: string;
  content_type?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  version_number: number;
  change_summary?: string;
}

/**
 * Tag – Schlagwort zur Kategorisierung von Seiten
 */
export interface Tag {
  id: number;
  name: string;
  color: string;
  page_count?: number;
  created_by?: number;
  created_at: string;
}

/**
 * FavoritePage – Favorisierte Wiki-Seite
 */
export interface FavoritePage extends WikiPage {
  favorited_at: string;
}

/**
 * UserBasic – Vereinfachtes Benutzerprofil (Auswahllisten)
 */
export interface UserBasic {
  id: number;
  username: string;
  displayName: string;
}

/**
 * Attachment – Dateianhang einer Wiki-Seite
 */
export interface Attachment {
  id: number;
  page_id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: number;
  uploaded_by_name?: string;
  created_at: string;
}

/**
 * TrashItem – Element im Papierkorb
 */
export interface TrashItem {
  id: number;
  title: string;
  workflow_status: string;
  deleted_at: string;
  created_by_name?: string;
  deleted_by_name?: string;
}

/**
 * GraphNode – Knoten im Wissensgraphen
 */
export interface GraphNode {
  id: string;
  label: string;
  type: 'page' | 'tag';
  workflowStatus?: string;
  color?: string;
}

/**
 * GraphEdge – Kante im Wissensgraphen
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: 'parent' | 'tag';
}

/**
 * GraphData – Vollständige Wissensgraph-Daten
 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Comment – Seitenkommentar
 */
export interface Comment {
  id: number;
  page_id: number;
  user_id: number;
  content: string;
  parent_id: number | null;
  username: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

/**
 * Notification – Benachrichtigung
 */
export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * PageTemplate – Seitenvorlage
 */
export interface PageTemplate {
  id: number;
  name: string;
  description: string;
  content: string;
  content_type: string;
  icon: string;
  category: string;
  is_default: boolean;
  created_at: string;
}

// ===== API-Basispfad =====
const API_BASE = '/api';

/**
 * request – Generische HTTP-Anfragefunktion mit Fehlerbehandlung
 */
async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'NexoraApp',
  };
  const opts: RequestInit = { method, headers, credentials: 'same-origin' };
  if (data) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
    const msg = 'Session expired. Please log in again.';
    const err = new Error(msg) as Error & { status: number; data: unknown };
    err.status = 401;
    err.data = null;
    throw err;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as ApiError)?.error || `Request failed (${res.status})`;
    const err = new Error(msg) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json as T;
}

// ===== Nexora API-Client =====
export const api = {
  // ===== Authentifizierung =====
  login: (username: string, password: string) =>
    request<{ user: User; mustChangePassword?: boolean }>('POST', '/auth/login', { username, password }),
  logout: () => request<{ message: string }>('POST', '/auth/logout'),
  getMe: () => request<User>('GET', '/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('POST', '/auth/change-password', { currentPassword, newPassword }),

  // ===== Organisationen =====
  getOrganizations: () => request<Organization[]>('GET', '/organizations'),
  getOrganization: (id: number) => request<Organization & { team_spaces: TeamSpace[] }>('GET', `/organizations/${id}`),
  createOrganization: (data: { name: string; description?: string }) =>
    request<Organization>('POST', '/organizations', data),
  updateOrganization: (id: number, data: { name: string; description?: string }) =>
    request<Organization>('PUT', `/organizations/${id}`, data),

  // ===== Team-Bereiche =====
  getSpaces: () => request<TeamSpace[]>('GET', '/spaces'),
  getSpace: (id: number) => request<TeamSpace & { folders: Folder[]; pages: WikiPage[] }>('GET', `/spaces/${id}`),
  createSpace: (data: { name: string; description?: string; icon?: string }) =>
    request<TeamSpace>('POST', '/spaces', data),
  updateSpace: (id: number, data: { name: string; description?: string; icon?: string }) =>
    request<TeamSpace>('PUT', `/spaces/${id}`, data),
  archiveSpace: (id: number) =>
    request<{ message: string }>('DELETE', `/spaces/${id}`),

  // ===== Bereichs-Mitglieder =====
  getSpaceMembers: (spaceId: number) => request<SpaceMembership[]>('GET', `/spaces/${spaceId}/members`),
  addSpaceMember: (spaceId: number, userId: number, role: SpaceRole) =>
    request<SpaceMembership[]>('POST', `/spaces/${spaceId}/members`, { userId, role }),
  updateSpaceMember: (spaceId: number, userId: number, role: SpaceRole) =>
    request<SpaceMembership>('PUT', `/spaces/${spaceId}/members/${userId}`, { role }),
  removeSpaceMember: (spaceId: number, userId: number) =>
    request<{ message: string }>('DELETE', `/spaces/${spaceId}/members/${userId}`),

  // ===== Ordner =====
  getFolders: (spaceId: number) => request<Folder[]>('GET', `/spaces/${spaceId}/folders`),
  createFolder: (spaceId: number, data: { name: string; parentFolderId?: number }) =>
    request<Folder>('POST', `/spaces/${spaceId}/folders`, data),
  updateFolder: (id: number, data: { name: string; sortOrder?: number }) =>
    request<Folder>('PUT', `/folders/${id}`, data),
  deleteFolder: (id: number) =>
    request<{ message: string }>('DELETE', `/folders/${id}`),

  // ===== Privater Bereich =====
  getPrivateSpace: () => request<PrivateSpace>('GET', '/private-space'),
  getPrivatePage: (id: number) => request<WikiPage>('GET', `/private-space/pages/${id}`),
  createPrivatePage: (data: { title: string; content: string; contentType?: string; parentId?: number | null }) =>
    request<WikiPage>('POST', '/private-space/pages', data),
  updatePrivatePage: (id: number, data: { title: string; content: string; contentType?: string; parentId?: number | null }) =>
    request<WikiPage>('PUT', `/private-space/pages/${id}`, data),
  deletePrivatePage: (id: number) =>
    request<{ message: string }>('DELETE', `/private-space/pages/${id}`),

  // ===== Veröffentlichungs-Workflow =====
  requestPublish: (data: { pageId: number; targetSpaceId: number; targetFolderId?: number; comment?: string }) =>
    request<PublishRequest>('POST', '/publishing/request', data),
  getPublishRequests: (status?: string) =>
    request<PublishRequest[]>('GET', `/publishing/requests${status ? `?status=${status}` : ''}`),
  getPublishRequest: (id: number) =>
    request<PublishRequest>('GET', `/publishing/requests/${id}`),
  approvePublish: (id: number, comment?: string) =>
    request<{ message: string }>('POST', `/publishing/requests/${id}/approve`, { comment }),
  rejectPublish: (id: number, comment: string) =>
    request<{ message: string }>('POST', `/publishing/requests/${id}/reject`, { comment }),
  requestChanges: (id: number, comment: string) =>
    request<{ message: string }>('POST', `/publishing/requests/${id}/request-changes`, { comment }),
  cancelPublish: (id: number) =>
    request<{ message: string }>('POST', `/publishing/requests/${id}/cancel`),
  archivePage: (id: number) =>
    request<{ message: string }>('POST', `/publishing/pages/${id}/archive`),
  unpublishPage: (id: number) =>
    request<{ message: string }>('POST', `/publishing/pages/${id}/unpublish`),

  // ===== Seiten =====
  getPages: async (params?: { tagId?: number; spaceId?: number; folderId?: number }): Promise<WikiPage[]> => {
    const qp = new URLSearchParams();
    if (params?.tagId) qp.set('tag', String(params.tagId));
    if (params?.spaceId) qp.set('spaceId', String(params.spaceId));
    if (params?.folderId) qp.set('folderId', String(params.folderId));
    const qs = qp.toString();
    const res = await request<{ items: WikiPage[]; total: number } | WikiPage[]>('GET', `/pages${qs ? `?${qs}` : ''}`);
    return Array.isArray(res) ? res : res.items;
  },
  getRecentPages: (limit = 10) => request<WikiPage[]>('GET', `/pages/recent?limit=${limit}`),
  searchPages: (q: string) => request<WikiPage[]>('GET', `/pages/search?q=${encodeURIComponent(q)}`),
  getPage: (id: number | string) => request<WikiPage>('GET', `/pages/${id}`),
  createPage: (data: {
    title: string; content: string; parentId?: number | null;
    contentType?: string; spaceId?: number; folderId?: number; privateSpaceId?: number;
  }) => request<WikiPage>('POST', '/pages', data),
  updatePage: (id: number | string, data: {
    title: string; content: string; parentId?: number | null;
    contentType?: string; folderId?: number;
  }) => request<WikiPage>('PUT', `/pages/${id}`, data),
  deletePage: (id: number | string) =>
    request<{ message: string; page: WikiPage }>('DELETE', `/pages/${id}`),
  exportPage: (id: number | string) => `${API_BASE}/pages/${id}/export`,
  exportAll: () => `${API_BASE}/pages/export-all`,
  getPageVersions: (id: number | string) => request<PageVersion[]>('GET', `/pages/${id}/versions`),
  restorePageVersion: (id: number | string, versionId: number) =>
    request<WikiPage>('POST', `/pages/${id}/restore`, { versionId }),
  setPageWorkflowStatus: (pageId: number | string, status: WorkflowStatus) =>
    request<WikiPage>('PUT', `/pages/${pageId}/visibility`, { visibility: status }),

  // ===== Benutzerverwaltung =====
  getUsers: () => request<UserListItem[]>('GET', '/users'),
  createUser: (data: { username: string; password: string; displayName?: string; email?: string; role: string }) =>
    request<UserListItem>('POST', '/users', data),
  updateUser: (id: number, data: Record<string, unknown>) =>
    request<UserListItem>('PUT', `/users/${id}`, data),
  deleteUser: (id: number) =>
    request<{ message: string }>('DELETE', `/users/${id}`),
  getUsersBasic: () => request<UserBasic[]>('GET', '/users/list'),

  // ===== Audit-Protokoll =====
  getAudit: (limit = 50, offset = 0) =>
    request<AuditResponse>('GET', `/audit?limit=${limit}&offset=${offset}`),

  // ===== Systemstatus =====
  getHealth: () => request<HealthData>('GET', '/health/details'),

  // ===== Tags =====
  getTags: () => request<Tag[]>('GET', '/tags'),
  createTag: (name: string, color?: string) =>
    request<Tag>('POST', '/tags', { name, color }),
  deleteTag: (id: number) =>
    request<{ message: string }>('DELETE', `/tags/${id}`),
  getPageTags: (pageId: number | string) =>
    request<Tag[]>('GET', `/pages/${pageId}/tags`),
  setPageTags: (pageId: number | string, tagIds: number[]) =>
    request<Tag[]>('PUT', `/pages/${pageId}/tags`, { tagIds }),

  // ===== Favoriten =====
  getFavorites: () => request<FavoritePage[]>('GET', '/favorites'),
  toggleFavorite: (pageId: number | string) =>
    request<{ favorited: boolean }>('POST', `/favorites/${pageId}`),
  checkFavorite: (pageId: number | string) =>
    request<{ favorited: boolean }>('GET', `/favorites/${pageId}/check`),

  // ===== Dateianhänge =====
  getAttachments: (pageId: number | string) =>
    request<Attachment[]>('GET', `/pages/${pageId}/attachments`),
  uploadAttachment: async (pageId: number | string, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/pages/${pageId}/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'NexoraApp' },
      credentials: 'same-origin',
      body: formData,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json as ApiError)?.error || `Hochladen fehlgeschlagen (${res.status})`;
      throw new Error(msg);
    }
    return json as Attachment;
  },
  downloadAttachmentUrl: (id: number) => `${API_BASE}/attachments/${id}/download`,
  deleteAttachment: (id: number) =>
    request<{ message: string }>('DELETE', `/attachments/${id}`),

  // ===== Papierkorb =====
  getTrash: () => request<TrashItem[]>('GET', '/trash'),
  restoreFromTrash: (id: number) =>
    request<{ message: string; page: WikiPage }>('POST', `/trash/${id}/restore`),
  permanentDelete: (id: number) =>
    request<{ message: string }>('DELETE', `/trash/${id}`),

  // ===== Einstellungen =====
  getTheme: () => request<{ theme: string }>('GET', '/settings/theme'),
  setTheme: (theme: string) => request<{ theme: string }>('PUT', '/settings/theme', { theme }),

  // ===== Wissensgraph =====
  getGraph: () => request<GraphData>('GET', '/graph'),

  // ===== Kommentare =====
  getComments: (pageId: number | string) =>
    request<Comment[]>('GET', `/pages/${pageId}/comments`),
  createComment: (pageId: number | string, content: string, parentId?: number) =>
    request<Comment>('POST', `/pages/${pageId}/comments`, { content, parentId }),
  updateComment: (id: number, content: string) =>
    request<Comment>('PUT', `/comments/${id}`, { content }),
  deleteComment: (id: number) =>
    request<{ message: string }>('DELETE', `/comments/${id}`),

  // ===== Benachrichtigungen =====
  getNotifications: (limit = 50) =>
    request<{ items: Notification[]; total: number }>('GET', `/notifications?limit=${limit}`),
  getUnreadCount: () =>
    request<{ count: number }>('GET', '/notifications/unread'),
  markNotificationRead: (id: number) =>
    request<{ message: string }>('PUT', `/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    request<{ message: string }>('PUT', '/notifications/read-all'),
  deleteNotification: (id: number) =>
    request<{ message: string }>('DELETE', `/notifications/${id}`),

  // ===== Vorlagen =====
  getTemplates: () => request<PageTemplate[]>('GET', '/templates'),
  getTemplate: (id: number) => request<PageTemplate>('GET', `/templates/${id}`),
  createTemplate: (data: { name: string; description?: string; content?: string; contentType?: string; icon?: string; category?: string }) =>
    request<PageTemplate>('POST', '/templates', data),
  deleteTemplate: (id: number) =>
    request<{ message: string }>('DELETE', `/templates/${id}`),

  // ===== Admin-Dashboard =====
  getDashboardStats: () => request<any>('GET', '/dashboard/stats'),
  getDashboardActivity: () => request<any>('GET', '/dashboard/activity'),
  getDashboardTopPages: () => request<any[]>('GET', '/dashboard/top-pages'),
  getDashboardTopUsers: () => request<any[]>('GET', '/dashboard/top-users'),
};
