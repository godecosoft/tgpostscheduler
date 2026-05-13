async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: 'include',
    headers: init?.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(init?.headers || {}) }
      : init?.headers,
    ...init,
  });
  const isJson = r.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await r.json() : await r.text();
  if (!r.ok) {
    const message = (isJson && (data as any)?.error) || `HTTP ${r.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: any) =>
    request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(p: string, body?: any) =>
    request<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
  upload: <T>(p: string, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request<T>(p, { method: 'POST', body: fd });
  },
};
