const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface FetchOpts {
  timeoutMs?: number;
  retries?: number;
}

/** GET JSON com timeout e retries com backoff exponencial. */
export async function getJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = 10_000, retries = 2 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', 'user-agent': 'storm-risk-map/0.1' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} de ${new URL(url).host}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
