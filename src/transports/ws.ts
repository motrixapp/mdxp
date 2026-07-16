import type {
  DataCallback,
  Disposable,
  Message,
  MessageReader,
  MessageWriter,
  PartialMessageInfo,
} from 'vscode-jsonrpc'
import { Emitter } from 'vscode-jsonrpc'
import type { MdxpConnection } from '../connection.js'
import { createMdxpConnection } from '../connection.js'

/** `WebSocket.readyState` value for an open socket (browser and `ws` agree). */
const OPEN = 1

/**
 * Minimal structural subset of a WebSocket shared by the browser `WebSocket`
 * and the Node [`ws`](https://www.npmjs.com/package/ws) package. Consumers pass
 * their socket as-is — no wrapping required.
 */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: 'message' | 'close' | 'error',
    listener: (event: { readonly data?: unknown }) => void
  ): void
  removeEventListener(
    type: 'message' | 'close' | 'error',
    listener: (event: { readonly data?: unknown }) => void
  ): void
}

function toText(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  // A typed array / DataView / Node Buffer. TS 6's generic `ArrayBufferView`
  // typing is stricter than `TextDecoder.decode`'s runtime contract (which
  // accepts any view), so widen to satisfy the compiler.
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data as unknown as Uint8Array)
  }
  throw new Error('unsupported WebSocket message data type')
}

class WebSocketMessageReader implements MessageReader {
  private readonly errorEmitter = new Emitter<Error>()
  private readonly closeEmitter = new Emitter<void>()
  private readonly partialEmitter = new Emitter<PartialMessageInfo>()
  private callback: DataCallback | null = null
  private attached = false

  constructor(private readonly ws: WebSocketLike) {}

  get onError() {
    return this.errorEmitter.event
  }

  get onClose() {
    return this.closeEmitter.event
  }

  get onPartialMessage() {
    return this.partialEmitter.event
  }

  private readonly onMessage = (event: { readonly data?: unknown }): void => {
    if (!this.callback) return
    let message: Message
    try {
      message = JSON.parse(toText(event.data)) as Message
    } catch (error) {
      this.errorEmitter.fire(
        error instanceof Error ? error : new Error(String(error))
      )
      return
    }
    this.callback(message)
  }

  private readonly onCloseEvent = (): void => {
    this.closeEmitter.fire(undefined)
  }

  private readonly onErrorEvent = (): void => {
    this.errorEmitter.fire(new Error('WebSocket error'))
  }

  listen(callback: DataCallback): Disposable {
    if (this.attached) {
      throw new Error('WebSocketMessageReader is already listening')
    }
    this.callback = callback
    this.ws.addEventListener('message', this.onMessage)
    this.ws.addEventListener('close', this.onCloseEvent)
    this.ws.addEventListener('error', this.onErrorEvent)
    this.attached = true
    return { dispose: () => this.dispose() }
  }

  dispose(): void {
    if (!this.attached) return
    this.ws.removeEventListener('message', this.onMessage)
    this.ws.removeEventListener('close', this.onCloseEvent)
    this.ws.removeEventListener('error', this.onErrorEvent)
    this.attached = false
    this.callback = null
    this.errorEmitter.dispose()
    this.closeEmitter.dispose()
    this.partialEmitter.dispose()
  }
}

class WebSocketMessageWriter implements MessageWriter {
  private readonly errorEmitter = new Emitter<
    [Error, Message | undefined, number | undefined]
  >()
  private readonly closeEmitter = new Emitter<void>()
  private attached = false

  private readonly onCloseEvent = (): void => {
    this.closeEmitter.fire(undefined)
  }

  constructor(private readonly ws: WebSocketLike) {
    this.ws.addEventListener('close', this.onCloseEvent)
    this.attached = true
  }

  get onError() {
    return this.errorEmitter.event
  }

  get onClose() {
    return this.closeEmitter.event
  }

  async write(message: Message): Promise<void> {
    if (this.ws.readyState !== OPEN) {
      throw new Error(
        `WebSocket is not open (readyState=${this.ws.readyState})`
      )
    }
    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.errorEmitter.fire([err, message, undefined])
      throw err
    }
  }

  end(): void {
    if (this.ws.readyState === OPEN) this.ws.close()
  }

  dispose(): void {
    if (!this.attached) return
    this.ws.removeEventListener('close', this.onCloseEvent)
    this.attached = false
    this.errorEmitter.dispose()
    this.closeEmitter.dispose()
  }
}

/**
 * Create an {@link MdxpConnection} over a WebSocket.
 *
 * Each WebSocket message carries exactly one complete JSON-RPC 2.0 message —
 * the WebSocket protocol already frames messages, so there is no Content-Length
 * framing. Works with the browser `WebSocket` and the Node `ws` package alike
 * (both satisfy {@link WebSocketLike}).
 *
 * Register handlers first, then call `listen()`:
 *
 * ```ts
 * const conn = fromWebSocket(ws)
 * conn.onNotification('$/task/progress', (p) => {})
 * conn.listen()
 * ```
 */
export function fromWebSocket(ws: WebSocketLike): MdxpConnection {
  return createMdxpConnection(
    new WebSocketMessageReader(ws),
    new WebSocketMessageWriter(ws)
  )
}
