async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Fastify's JSON body parser rejects an empty body when Content-Type: application/json is set
  // (e.g. every DELETE, and POSTs with no body like room-member promotion), so only send that
  // header when there's actually a body to parse.
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.headers ?? {}) },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiGet = <T,>(path: string) => request<T>(path);

export const apiPost = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });

export const apiPatch = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiPut = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export const apiDelete = <T = void,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined });
