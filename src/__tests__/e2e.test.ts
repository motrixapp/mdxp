// vscode-jsonrpc v9 split the runtime abstraction layer (RAL) out of the bare
// entry; importing the node entry installs the Node RAL these tests need.
import 'vscode-jsonrpc/node'
import { describe, expect, it } from 'vitest'
import type { Message, MessageReader, MessageWriter } from 'vscode-jsonrpc'
import { createMdxpConnection } from '../connection.js'

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
  constructor(private peer: InMemoryReader) {}
  async write(msg: Message): Promise<void> {
    this.peer.push(msg)
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

function makePair() {
  const aRead = new InMemoryReader()
  const bRead = new InMemoryReader()
  return {
    a: { reader: aRead, writer: new InMemoryWriter(bRead) },
    b: { reader: bRead, writer: new InMemoryWriter(aRead) },
  }
}

describe('e2e: full init + resolve + completion flow', () => {
  it('mirrors Appendix B.2 from the spec', async () => {
    const pair = makePair()
    const ext = createMdxpConnection(pair.a.reader, pair.a.writer)
    const motrix = createMdxpConnection(pair.b.reader, pair.b.writer)

    // Motrix handles initialize
    motrix.onRequest('motrix/initialize', (params) => {
      expect(params.protocolVersion).toBe('1.0')
      return {
        protocolVersion: '1.0',
        server: { name: 'motrix', version: '2.0', runtime: 'electron' },
        capabilities: {
          ffmpegAvailable: true,
          selectionKinds: ['direct', 'hls', 'mux'],
          progress: true,
          cancellation: true,
        },
        serverAdapters: [],
        pairToken: 'tok-123',
      }
    })

    // ext handles url/resolve
    ext.onRequest('url/resolve', (params) => {
      expect(params.url).toContain('youtube.com')
      return {
        selections: [
          {
            kind: 'mux',
            video: {
              url: 'https://cdn.example.com/v.mp4',
              headers: {},
              cookies: [],
              refererPolicy: 'strict-origin-when-cross-origin',
            },
            audio: {
              url: 'https://cdn.example.com/a.mp4',
              headers: {},
              cookies: [],
              refererPolicy: 'strict-origin-when-cross-origin',
            },
            container: 'mp4',
            quality: '1080p',
          },
        ],
        meta: { title: 'Test Video' },
        extractedBy: {
          adapterId: 'youtube',
          adapterVersion: '1.0',
          extractedAt: Date.now(),
        },
      }
    })

    let completedTask: { taskId: string; filePath: string } | null = null
    ext.onNotification('$/task/completed', (p) => {
      completedTask = { taskId: p.taskId, filePath: p.filePath }
    })

    ext.listen()
    motrix.listen()

    // ext initiates handshake
    const initResult = await ext.sendRequest('motrix/initialize', {
      protocolVersion: '1.0',
      client: {
        name: 'motrix-extension',
        version: '0.1',
        extensionId: 'ext-id',
        browser: 'chromium',
        browserVersion: '120',
        locale: 'en',
      },
      capabilities: { resolveUrl: true, submitDownload: true },
      adapters: [],
    })
    expect(initResult.pairToken).toBe('tok-123')

    // Motrix → ext: url/resolve
    const resolveResult = await motrix.sendRequest('url/resolve', {
      url: 'https://www.youtube.com/watch?v=abc',
    })
    expect(resolveResult.selections[0]?.kind).toBe('mux')

    // Motrix → ext: task completion notification
    motrix.sendNotification('$/task/completed', {
      taskId: 'task-1',
      filePath: '/tmp/video.mp4',
      durationMs: 5000,
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(completedTask).toEqual({
      taskId: 'task-1',
      filePath: '/tmp/video.mp4',
    })
  })
})
