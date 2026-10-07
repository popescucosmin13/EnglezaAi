/** Called after reauthentication, before deleting Firebase identity on any platform. */
export async function forgetAccountAcquisition(apiBase: string, token: string, journeyId?: string) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${apiBase}/api/acquisition`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'forget', ...(journeyId ? { journeyId } : {}) }),
    });
    if (!response.ok) throw new Error('Nu am putut elimina datele parcursului. Încearcă din nou ștergerea contului.');
  } finally { clearTimeout(timeout); }
}
