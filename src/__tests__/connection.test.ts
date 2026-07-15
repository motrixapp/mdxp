// vscode-jsonrpc v9 split the runtime abstraction layer (RAL) out of the bare
// entry; importing the node entry installs the Node RAL these tests need.
import 'vscode-jsonrpc/node'
import { describe, expect, it } from 'vitest'
import type { Message, MessageReader, MessageWriter } from 'vscode-jsonrpc'
import { createMdxpConnection } from '../connection.js'

// In-memory message pipe for testing.
class InMemoryReader implements MessageReader {
  private listeners: Array<(msg: Message) => void> = []
  push(msg: Message): void {
    for (const l of this.listeners) l(msg)
  }
  listen(cb: (msg: Message) => void) {
    this.listeners.push(cb)
    return { dispose: () => {} }
  }
  onError() {
    return { dispose: () => {} }
  }
  onClose() {
    return { dispose: () => {} }
  }
  onPartialMessage() {
    return { dispose: () => {} }
  }
  dispose() {}
}

class InMemoryWriter implements MessageWriter {
  public written: Message[] = []
  async write(msg: Message): Promise<void> {
    this.written.push(msg)
  }
  onError() {
    return { dispose: () => {} }
  }
  onClose() {
    return { dispose: () => {} }
  }
  end(): void {}
  dispose() {}
}

function makePair(): {
  aToB: { reader: InMemoryReader; writer: InMemoryWriter }
  bToA: { reader: InMemoryReader; writer: InMemoryWriter }
} {
  const aToB = { reader: new InMemoryReader(), writer: new InMemoryWriter() }
  const bToA = { reader: new InMemoryReader(), writer: new InMemoryWriter() }
  // pump A's writes into B's reader (and vice versa)
  const origAWrite = aToB.writer.write.bind(aToB.writer)
  aToB.writer.write = async (m: Message) => {
    await origAWrite(m)
    aToB.reader.push(m)
  }
  const origBWrite = bToA.writer.write.bind(bToA.writer)
  bToA.writer.write = async (m: Message) => {
    await origBWrite(m)
    bToA.reader.push(m)
  }
  return { aToB, bToA }
}

describe('createMdxpConnection', () => {
  it('round-trips a system/ping request', async () => {
    const { aToB, bToA } = makePair()
    const a = createMdxpConnection(bToA.reader, aToB.writer)
    const b = createMdxpConnection(aToB.reader, bToA.writer)

    b.onRequest('system/ping', (params) => ({
      sentAt: params.sentAt,
      recvAt: params.sentAt + 1,
    }))

    a.listen()
    b.listen()

    const result = await a.sendRequest('system/ping', { sentAt: 100 })
    expect(result).toEqual({ sentAt: 100, recvAt: 101 })
  })

  it('round-trips an MDXP notification', async () => {
    const { aToB, bToA } = makePair()
    const a = createMdxpConnection(bToA.reader, aToB.writer)
    const b = createMdxpConnection(aToB.reader, bToA.writer)

    let received: unknown = null
    b.onNotification('$/task/progress', (p) => {
      received = p
    })

    a.listen()
    b.listen()

    a.sendNotification('$/task/progress', {
      taskId: 't1',
      bytesDone: 100,
      bytesTotal: 1000,
      speedBps: 50,
      etaSec: 18,
      phase: 'downloading',
    })

    // notifications are async; give the event loop a tick
    await new Promise((r) => setTimeout(r, 10))

    expect(received).toEqual({
      taskId: 't1',
      bytesDone: 100,
      bytesTotal: 1000,
      speedBps: 50,
      etaSec: 18,
      phase: 'downloading',
    })
  })

  it('handler that throws maps to JSON-RPC InternalError', async () => {
    const { aToB, bToA } = makePair()
    const a = createMdxpConnection(bToA.reader, aToB.writer)
    const b = createMdxpConnection(aToB.reader, bToA.writer)

    b.onRequest('system/ping', () => {
      throw new Error('boom')
    })

    a.listen()
    b.listen()

    await expect(a.sendRequest('system/ping', { sentAt: 0 })).rejects.toThrow()
  })

  it('cancellation token propagates to handler via $/cancelRequest', async () => {
    const { CancellationTokenSource } = await import('vscode-jsonrpc')
    const { aToB, bToA } = makePair()
    const a = createMdxpConnection(bToA.reader, aToB.writer)
    const b = createMdxpConnection(aToB.reader, bToA.writer)

    let observedCancelled = false
    b.onRequest('url/resolve', async (_params, token) => {
      // simulate long-running work that observes the token
      await new Promise((r) => setTimeout(r, 50))
      observedCancelled = token.isCancellationRequested
      return {
        selections: [],
        meta: { title: 'X' },
        extractedBy: { adapterId: 'x', adapterVersion: '1', extractedAt: 0 },
      }
    })

    a.listen()
    b.listen()

    const cts = new CancellationTokenSource()
    const promise = a.sendRequest(
      'url/resolve',
      { url: 'https://example.com' },
      cts.token
    )
    // cancel before the responder finishes
    setTimeout(() => cts.cancel(), 10)
    await promise.catch(() => undefined)

    expect(observedCancelled).toBe(true)
  })
})
