interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta?: Record<string, unknown>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(columnName?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run<T = unknown>(): Promise<D1Result<T>>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

type DurableObjectStub<T = unknown> = T & Fetcher

interface DurableObjectNamespace<T = unknown> {
  getByName(name: string): DurableObjectStub<T>
}

interface DurableObjectState {
  acceptWebSocket(socket: WebSocket): void
  getWebSockets(tag?: string): WebSocket[]
}

interface WebSocket {
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface ResponseInit {
  webSocket?: WebSocket
}

declare module 'cloudflare:workers' {
  export class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState
    protected env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}
