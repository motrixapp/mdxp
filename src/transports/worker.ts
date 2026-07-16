import type { MessageReader, MessageWriter } from 'vscode-jsonrpc'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from 'vscode-jsonrpc/browser'
import type { MdxpConnection } from '../connection.js'
import { createMdxpConnection } from '../connection.js'

/**
 * Minimal structural subset of a `MessagePort` / `Worker` /
 * `DedicatedWorkerGlobalScope` — anything the browser RAL's reader/writer
 * accept. Consumers pass their worker or port as-is.
 */
export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void
  ): void
}

// vscode-jsonrpc types the port as `MessagePort | Worker | DedicatedWorkerGlobalScope`,
// which are DOM / WebWorker globals. This package targets `lib: ES2022` (no DOM),
// so re-type the constructors against the structural `WorkerLike` instead of
// pulling the DOM libs into every consumer.
const Reader = BrowserMessageReader as unknown as new (
  port: WorkerLike
) => MessageReader
const Writer = BrowserMessageWriter as unknown as new (
  port: WorkerLike
) => MessageWriter

/**
 * Create an {@link MdxpConnection} over a Worker or `MessagePort` (the browser
 * `postMessage` transport).
 *
 * ```ts
 * const conn = fromWorker(self) // inside a Web Worker
 * conn.onNotification('$/task/progress', (p) => {})
 * conn.listen()
 * ```
 */
export function fromWorker(port: WorkerLike): MdxpConnection {
  return createMdxpConnection(new Reader(port), new Writer(port))
}
