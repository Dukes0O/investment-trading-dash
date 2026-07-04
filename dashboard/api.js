// Backend detection + fetch helpers. The dashboard works in two modes:
// backend mode (REST API over SQLite) and fallback mode (localStorage + demo
// data) when no server is running.

let backendPromise = null;

export function detectBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch('/api/health', { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    })();
  }
  return backendPromise;
}

export async function apiGet(path) {
  const res = await fetch('/api' + path);
  return handle(res);
}

export async function apiSend(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res);
}

async function handle(res) {
  let json = null;
  try {
    json = await res.json();
  } catch { /* non-JSON error body */ }
  if (!res.ok) {
    throw new Error(json?.error || `API error ${res.status}`);
  }
  return json;
}
