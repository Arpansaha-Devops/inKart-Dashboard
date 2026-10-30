import axios, { AxiosHeaders, CanceledError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** false starts a separate network read instead of joining one in flight. */
    readCache?: boolean;
  }
}

// Only simultaneous list/summary reads may share transport. Completed responses
// are never cached. Every subsequent read goes back to the server.
const REUSABLE_PATHS = new Set([
  '/users/all', '/admin/products', '/products', '/admin/categories', '/categories',
  '/admin/coupons', '/admin/orders', '/admin/analytics/dashboard-stats',
  '/admin/analytics/revenue-over-time',
]);

export function createApiReadCache(transport: AxiosAdapter) {
  const pending = new Map<string, Promise<AxiosResponse>>();
  const writes = new Set<Promise<AxiosResponse>>();
  let generation = 0;
  let sequence = 0;
  const requestNamespace = Math.random().toString(36).slice(2);
  let session: string | undefined;

  const clear = () => {
    generation++;
    pending.clear();
  };
  const copy = (response: AxiosResponse, config: AxiosResponse['config']): AxiosResponse => ({
    ...response, config,
    data: typeof response.data === 'object' ? structuredClone(response.data) : response.data,
    headers: new AxiosHeaders(response.headers),
  });
  const freshConfig = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const params = config.params instanceof URLSearchParams
      ? new URLSearchParams(config.params)
      : { ...config.params };
    // Only the actual network request gets a unique URL. Identical reads can
    // still join while pending, without browser/CDN response reuse afterward.
    const nonce = `${Date.now()}-${requestNamespace}-${++sequence}`;
    if (params instanceof URLSearchParams) params.set('_ts', nonce);
    else params._ts = nonce;
    return { ...config, params };
  };

  const adapter: AxiosAdapter = async config => {
    const authorization = String(config.headers.get('Authorization') || '');
    if (authorization !== session) { clear(); session = authorization; }

    if ((config.method || 'get').toLowerCase() !== 'get') {
      clear();
      const write = Promise.resolve().then(() => transport(config));
      writes.add(write);
      try { return await write; }
      finally { writes.delete(write); clear(); }
    }

    const url = new URL(axios.getUri(config), 'http://api.local');
    const pathname = url.pathname.replace(/^\/api(?:\/v1)?(?=\/)/, '');
    url.searchParams.sort();
    const explicitRead = config.readCache === false || url.searchParams.has('_ts');
    url.searchParams.delete('_ts');
    const key = url.href;
    const share = REUSABLE_PATHS.has(pathname) && !config.signal && !config.cancelToken;
    if (explicitRead) clear();

    const read = async (attempt = 0): Promise<AxiosResponse> => {
      // A read requested during a save waits for its outcome before querying.
      while (writes.size) await Promise.allSettled([...writes]);
      if (session !== authorization) throw new CanceledError('Account changed while loading data', config);
      const existing = share ? pending.get(key) : undefined;
      if (existing) return existing;

      const startedGeneration = generation;
      const request = (async () => {
        const response = await transport(freshConfig(config));
        if (session !== authorization) throw new CanceledError('Account changed while loading data', config);
        if (generation !== startedGeneration || writes.size) {
          // Never deliver a response that crossed a write or explicit refresh.
          // Join/start a current read instead. Bound retries under repeated edits.
          if (attempt >= 3) throw new CanceledError('Data changed repeatedly while loading; refresh again', config);
          return read(attempt + 1);
        }
        return response;
      })();
      if (share) pending.set(key, request);
      try { return await request; }
      finally {
        if (pending.get(key) === request) pending.delete(key);
      }
    };
    return copy(await read(), config);
  };

  return { adapter, clear };
}
