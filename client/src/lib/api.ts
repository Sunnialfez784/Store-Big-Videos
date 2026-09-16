const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  errors?: string[];
}

export class ApiError extends Error {
  status: number;
  errors: string[];
  constructor(status: number, message: string, errors: string[] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function apiUrl(path: string): string {
  return `${BASE}/api${path}`;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: 'include',
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      response.status,
      payload?.message ?? 'Something went wrong. Please try again.',
      payload?.errors ?? [],
    );
  }
  return payload.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/* ----------------------------------------------------------------- types */

export interface VideoItem {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  extension: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  resolution: string | null;
  status: 'uploading' | 'ready' | 'failed';
  playable: boolean;
  hasThumbnail: boolean;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface StorageSnapshot {
  totalBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
  usedPercent: number;
  videoCount: number;
  maxVideoBytes: number;
}

export type SortKey = 'newest' | 'oldest' | 'largest' | 'smallest' | 'name_asc' | 'name_desc';

export const videosApi = {
  list: (params: { page: number; limit: number; search?: string; sort: SortKey }) => {
    const q = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      sort: params.sort,
    });
    if (params.search) q.set('search', params.search);
    return api.get<{ videos: VideoItem[]; pagination: Pagination }>(`/videos?${q.toString()}`);
  },
  recent: () => api.get<{ videos: VideoItem[] }>('/videos/recent'),
  one: (id: string) => api.get<{ video: VideoItem }>(`/videos/${id}`),
  remove: (id: string) => api.del<{ id: string; quota: StorageSnapshot }>(`/videos/${id}`),
  streamUrl: (id: string) => apiUrl(`/videos/${id}/stream`),
  thumbnailUrl: (id: string) => apiUrl(`/videos/${id}/thumbnail`),
  downloadUrl: (id: string) => api.get<{ url: string }>(`/videos/${id}/download?redirect=false`),
};

export const storageApi = {
  snapshot: () => api.get<StorageSnapshot>('/storage'),
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: { id: string; email: string; name: string } }>('/auth/login', { email, password }),
  logout: () => api.post<null>('/auth/logout'),
  me: () => api.get<{ user: { id: string; email: string; name: string } }>('/auth/me'),
};
