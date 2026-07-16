import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import type { MdxpConnection } from '../connection.js'
import { createMdxpConnection } from '../connection.js'

/** Streams for {@link fromStdio}; defaults to the process's stdio. */
export interface StdioOptions {
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
}

/**
 * Create an {@link MdxpConnection} over Node streams — `process.stdin` /
 * `process.stdout` by default. This is the native-messaging-host / CLI case:
 * the parent process pipes JSON-RPC over the child's stdio.
 *
 * ```ts
 * const conn = fromStdio()
 * conn.onRequest('url/resolve', async (params) => {})
 * conn.listen()
 * ```
 */
export function fromStdio(options: StdioOptions = {}): MdxpConnection {
  return createMdxpConnection(
    new StreamMessageReader(options.input ?? process.stdin),
    new StreamMessageWriter(options.output ?? process.stdout)
  )
}
