/** Minimal build-time declarations for the Cloudflare bindings used by the
 * Worker entrypoint. The deployed runtime supplies the concrete objects. */
declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; [key: string]: unknown };
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<T>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec?(sql: string): Promise<unknown>;
}
