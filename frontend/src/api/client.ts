export interface WikiPage {
  id: number;
  title: string;
  content: string;
  content_type?: 'markdown' | 'html';
  parent_id?: number | null;
  children_count?: number;
  created_by?: number;
  created_by_name?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  visibility?: 'draft' | 'published';
  approval_status?: 'none' | 'pending' | 'approved' | 'rejected';
}

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

export interface ApiError {
  error: string;
  errors?: string[];
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  authSource: 'local' | 'ldap';
  lastLogin?: string;
  createdAt: string;
  mustChangePassword?: boolean;
  permissions: string[];
}

export interface UserListItem {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: string;
  authSource: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: number;
  details?: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface AuditResponse {
  items: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageVersion {
  id: number;
  page_id: number;
  title: string;
  content: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  version_number: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  page_count?: number;
  created_by?: number;
  created_at: string;
}

export interface ApprovalRequest {
  id: number;
  page_id: number;
  requested_by: number;
  requested_by_name?: string;
  requested_by_display?: string;
  reviewer_id?: number;
  reviewer_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  page_title?: string;
  page_visibility?: string;
  created_at: string;
  resolved_at?: string;
}

export interface FavoritePage extends WikiPage {
  favorited_at: string;
}

export interface PageShare {
  id: number;
  page_id: number;
  shared_with_user_id: number;
  username: string;
  display_name: string;
  permission: string;
  shared_by_name: string;
  created_at: string;
}

export interface SharedPage {
  id: number;
  title: string;
  content: string;
  content_type?: string;
  updated_at: string;
  permission: string;
  shared_by_name: string;
  shared_at: string;
}

export interface UserBasic {
  id: number;
  username: string;
  displayName: string;
}

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

export interface TrashItem {
  id: number;
  title: string;
  visibility: string;
  deleted_at: string;
  created_by_name?: string;
  deleted_by_name?: string;
}

const API_BASE = '/api';

async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'WikiApp',
  };

  const opts: RequestInit = { method, headers, credentials: 'same-origin' };

  if (data) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }

  const res = await fetch(`${API_BASE}${path}`, opts);

  // Handle 401 globally — redirect to login
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

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ user: User; mustChangePassword?: boolean }>('POST', '/auth/login', { username, password }),
  logout: () => request<{ message: string }>('POST', '/auth/logout'),
  getMe: () => request<User>('GET', '/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('POST', '/auth/change-password', { currentPassword, newPassword }),

  // Pages
  getPages: () => request<WikiPage[]>('GET', '/pages'),
  getRecentPages: (limit = 10) => request<WikiPage[]>('GET', `/pages/recent?limit=${limit}`),
  searchPages: (q: string) => request<WikiPage[]>('GET', `/pages/search?q=${encodeURIComponent(q)}`),
  getPage: (id: number | string) => request<WikiPage>('GET', `/pages/${id}`),
  createPage: (data: { title: string; content: string; parentId?: number | null; contentType?: string }) =>
    request<WikiPage>('POST', '/pages', data),
  updatePage: (id: number | string, data: { title: string; content: string; parentId?: number | null; contentType?: string }) =>
    request<WikiPage>('PUT', `/pages/${id}`, data),
  deletePage: (id: number | string) =>
    request<{ message: string; page: WikiPage }>('DELETE', `/pages/${id}`),
  exportPage: (id: number | string) => `${API_BASE}/pages/${id}/export`,
  exportAll: () => `${API_BASE}/pages/export-all`,
  getPageVersions: (id: number | string) => request<PageVersion[]>('GET', `/pages/${id}/versions`),
  restorePageVersion: (id: number | string, versionId: number) =>
    request<WikiPage>('POST', `/pages/${id}/restore`, { versionId }),

  // Users (admin)
  getUsers: () => request<UserListItem[]>('GET', '/users'),
  createUser: (data: { username: string; password: string; displayName?: string; email?: string; role: string }) =>
    request<UserListItem>('POST', '/users', data),
  updateUser: (id: number, data: Record<string, unknown>) =>
    request<UserListItem>('PUT', `/users/${id}`, data),
  deleteUser: (id: number) =>
    request<{ message: string }>('DELETE', `/users/${id}`),

  // Audit (admin)
  getAudit: (limit = 50, offset = 0) =>
    request<AuditResponse>('GET', `/audit?limit=${limit}&offset=${offset}`),

  // Health
  getHealth: () => request<HealthData>('GET', '/health/details'),

  // Tags
  getTags: () => request<Tag[]>('GET', '/tags'),
  createTag: (name: string, color?: string) =>
    request<Tag>('POST', '/tags', { name, color }),
  deleteTag: (id: number) =>
    request<{ message: string }>('DELETE', `/tags/${id}`),
  getPageTags: (pageId: number | string) =>
    request<Tag[]>('GET', `/pages/${pageId}/tags`),
  setPageTags: (pageId: number | string, tagIds: number[]) =>
    request<Tag[]>('PUT', `/pages/${pageId}/tags`, { tagIds }),

  // Favorites
  getFavorites: () => request<FavoritePage[]>('GET', '/favorites'),
  toggleFavorite: (pageId: number | string) =>
    request<{ favorited: boolean }>('POST', `/favorites/${pageId}`),
  checkFavorite: (pageId: number | string) =>
    request<{ favorited: boolean }>('GET', `/favorites/${pageId}/check`),

  // Sharing
  getUsersBasic: () => request<UserBasic[]>('GET', '/users/list'),
  getPageShares: (pageId: number | string) =>
    request<PageShare[]>('GET', `/pages/${pageId}/shares`),
  sharePage: (pageId: number | string, userId: number, permission: string) =>
    request<PageShare[]>('POST', `/pages/${pageId}/shares`, { userId, permission }),
  unsharePage: (pageId: number | string, userId: number) =>
    request<PageShare[]>('DELETE', `/pages/${pageId}/shares/${userId}`),
  getSharedWithMe: () => request<SharedPage[]>('GET', '/shared'),

  // Visibility
  setPageVisibility: (pageId: number | string, visibility: 'draft' | 'published') =>
    request<WikiPage>('PUT', `/pages/${pageId}/visibility`, { visibility }),

  // Approvals
  requestApproval: (pageId: number | string) =>
    request<ApprovalRequest>('POST', `/pages/${pageId}/request-approval`),
  cancelApproval: (pageId: number | string) =>
    request<{ message: string }>('POST', `/pages/${pageId}/cancel-approval`),
  getApprovals: (status = 'pending') =>
    request<ApprovalRequest[]>('GET', `/approvals?status=${status}`),
  getApprovalCount: () =>
    request<{ count: number }>('GET', '/approvals/count'),
  approveRequest: (id: number, comment?: string) =>
    request<{ message: string }>('POST', `/approvals/${id}/approve`, { comment }),
  rejectRequest: (id: number, comment?: string) =>
    request<{ message: string }>('POST', `/approvals/${id}/reject`, { comment }),
  getPageApprovalStatus: (pageId: number | string) =>
    request<ApprovalRequest | null>('GET', `/pages/${pageId}/approval-status`),

  // Attachments
  getAttachments: (pageId: number | string) =>
    request<Attachment[]>('GET', `/pages/${pageId}/attachments`),
  uploadAttachment: async (pageId: number | string, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/pages/${pageId}/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'WikiApp' },
      credentials: 'same-origin',
      body: formData,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json as ApiError)?.error || `Upload failed (${res.status})`;
      throw new Error(msg);
    }
    return json as Attachment;
  },
  downloadAttachmentUrl: (id: number) => `${API_BASE}/attachments/${id}/download`,
  deleteAttachment: (id: number) =>
    request<{ message: string }>('DELETE', `/attachments/${id}`),

  // Trash
  getTrash: () => request<TrashItem[]>('GET', '/trash'),
  restoreFromTrash: (id: number) =>
    request<{ message: string; page: WikiPage }>('POST', `/trash/${id}/restore`),
  permanentDelete: (id: number) =>
    request<{ message: string }>('DELETE', `/trash/${id}`),
};
