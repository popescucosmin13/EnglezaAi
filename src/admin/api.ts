import { apiError, apiFetch } from '../api/backend';

export async function adminRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await apiFetch('admin', { method: 'POST', body: JSON.stringify({ ...payload, action }) });
  if (!response.ok) throw await apiError(response, 'Admin Center', true);
  return response.json();
}
