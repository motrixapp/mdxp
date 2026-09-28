import { describe, expect, it } from 'vitest'
// Import from the node entry so the Node RAL is installed before a
// MessageConnection is created (fromWebSocket itself is platform-neutral).
import { fromWebSocket, type WebSocketLike } from '../node.js'

type Listener = (event: { data?: unknown }) => void

/** An in-memory WebSocket that delivers each `send` to its peer's listeners. */
class MockSocket implements WebSocketLike {
  readyState = 1
  peer: MockSocket | null = null
  /** When true, frames reach the peer as a Buffer instead of a string. */
  deliverAsBinary = false
  private readonly listeners: Record<string, Set<Listener>> = {
    message: new Set(),
    close: new Set(),
    error: new Set(),
  }

  send(data: string): void {
    const peer = this.peer
    if (!peer) return
    if (peer.readyState !== 1) return
    const payload: unknown = this.deliverAsBinary
      ? Buffer.from(data, 'utf8')
      : data
    // Deliver asynchronously, like a real socket.
    queueMicrotask(() => {
      for (const listener of peer.listeners.message ?? []) {
        listener({ data: payload })
      }
    })
  }

  close(): void {
    this.readyState = 3
    for (const listener of this.listeners.close ?? []) listener({})
  }

  receive(data: unknown): void {
    for (const listener of this.listeners.message ?? []) listener({ data })
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners[type]?.add(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners[type]?.delete(listener)
  }
}

function pair(): [MockSocket, MockSocket] {
  const a = new MockSocket()
  const b = new MockSocket()
  a.peer = b
  b.peer = a
  return [a, b]
}

describe('fromWebSocket', () => {
  it('reports malformed cancellation frames without throwing out of the socket listener', async () => {
    const [serverSocket, clientSocket] = pair()
    const server = fromWebSocket(serverSocket)
    const client = fromWebSocket(clientSocket)
    const errors: unknown[] = []
    server.raw.onError((error) => errors.push(error))
    server.onRequest('system/ping', ({ sentAt }) => ({ sentAt, recvAt: 1 }))
    server.listen()
    client.listen()
    try {
      for (const params of [undefined, null]) {
        expect(() =>
          serverSocket.receive(
            JSON.stringify({
              jsonrpc: '2.0',
              method: '$/cancelRequest',
              params,
            })
          )
        ).not.toThrow()
      }
      expect(errors).toHaveLength(2)
      await expect(
        client.sendRequest('system/ping', { sentAt: 7 })
      ).resolves.toEqual({ sentAt: 7, recvAt: 1 })
    } finally {
      client.dispose()
      server.dispose()
    }
  })

  it('round-trips a request/response across a WebSocket', async () => {
    const [serverSocket, clientSocket] = pair()
    const server = fromWebSocket(serverSocket)
    const client = fromWebSocket(clientSocket)

    server.onRequest('system/ping', (params) => ({
      sentAt: params.sentAt,
      recvAt: 999,
    }))
    server.listen()
    client.listen()

    const result = await client.sendRequest('system/ping', { sentAt: 42 })
    expect(result).toEqual({ sentAt: 42, recvAt: 999 })
  })

  it('delivers a server-to-client notification', async () => {
    const [serverSocket, clientSocket] = pair()
    const server = fromWebSocket(serverSocket)
    const client = fromWebSocket(clientSocket)

    const received: string[] = []
    client.onNotification('$/task/completed', (params) => {
      received.push(params.filePath)
    })
    server.listen()
    client.listen()

    server.sendNotification('$/task/completed', {
      taskId: 't1',
      filePath: '/tmp/out.bin',
      durationMs: 10,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(received).toEqual(['/tmp/out.bin'])
  })

  it('parses binary (ArrayBufferView) frames as JSON', async () => {
    const [serverSocket, clientSocket] = pair()
    // The server delivers its responses to the client as Buffers, exercising
    // the toText() ArrayBufferView path.
    serverSocket.deliverAsBinary = true
    const server = fromWebSocket(serverSocket)
    const client = fromWebSocket(clientSocket)

    server.onRequest('system/ping', (params) => ({
      sentAt: params.sentAt,
      recvAt: 1,
    }))
    server.listen()
    client.listen()

    const result = await client.sendRequest('system/ping', { sentAt: 7 })
    expect(result).toEqual({ sentAt: 7, recvAt: 1 })
  })
})
