async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (init?.headers) Object.assign(headers, init.headers as Record<string, string>);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const r = await fetch(path, {
      credentials: 'include',
      ...init,
      headers,
      signal: controller.signal,
    });
    const isJson = r.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await r.json() : await r.text();
    if (!r.ok) {
      const message = (isJson && (data as any)?.error) || `HTTP ${r.status}`;
      throw new Error(message);
    }
    return data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı (15s)');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
