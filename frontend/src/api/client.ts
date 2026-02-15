export interface WikiPage {
  id: number;
  title: string;
  content: string;
  created_by_name?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface HealthData {
  status: string;
  database: string;
  ldap?: string;
  rbac?: string;
  roles?: string[];
  timestamp: string;
  nodeVersion: string;
  environment: string;
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
    request<{ user: User }>('POST', '/auth/login', { username, password }),
  logout: () => request<{ message: string }>('POST', '/auth/logout'),
  getMe: () => request<User>('GET', '/auth/me'),

  // Pages
  getPages: () => request<WikiPage[]>('GET', '/pages'),
  getPage: (id: number | string) => request<WikiPage>('GET', `/pages/${id}`),
  createPage: (data: { title: string; content: string }) =>
    request<WikiPage>('POST', '/pages', data),
  updatePage: (id: number | string, data: { title: string; content: string }) =>
    request<WikiPage>('PUT', `/pages/${id}`, data),
  deletePage: (id: number | string) =>
    request<{ message: string; page: WikiPage }>('DELETE', `/pages/${id}`),

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
  getHealth: () => request<HealthData>('GET', '/health'),
};
