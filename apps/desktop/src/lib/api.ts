let sidecarPort = 11434;
let sidecarReady = false;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Set up Tauri event listener only when running inside Tauri
if (isTauri()) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen<number>('sidecar-ready', (event) => {
      sidecarPort = event.payload;
      sidecarReady = true;
    });
  });
}

export async function initApi(): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      sidecarReady = await invoke<boolean>('is_sidecar_ready');
      if (sidecarReady) {
        sidecarPort = await invoke<number>('get_sidecar_port');
      }
    } catch {
      sidecarReady = true;
    }
  } else {
    // Browser dev mode — assume sidecar is running on default port
    sidecarReady = true;
  }
}

export function isSidecarReady(): boolean {
  return sidecarReady;
}

function getBaseUrl(): string {
  return `http://127.0.0.1:${sidecarPort}/api`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}
