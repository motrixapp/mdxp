# @motrix/mdxp

[![npm version](https://img.shields.io/npm/v/@motrix/mdxp.svg)](https://www.npmjs.com/package/@motrix/mdxp)
[![license](https://img.shields.io/npm/l/@motrix/mdxp.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@motrix/mdxp.svg)](./dist/index.d.ts)

**English** | [简体中文](./README.zh-CN.md)

> **MDXP** (Motrix Download eXchange Protocol) — the JSON-RPC 2.0 wire types, Zod
> schemas, and bidirectional connection helper that let a browser, CLI, or AI
> agent hand downloads to a Motrix desktop downloader over any duplex transport.

`@motrix/mdxp` is the single source of truth for the MDXP wire contract. Both
sides of the bridge — the [Motrix](https://github.com/agalwood/Motrix) desktop app
(the **server**, which owns the download engine) and its **clients** (the
browser extension, a CLI, or an agent) — depend on this package so the protocol
shape is defined exactly once.

It ships nothing transport-specific: you bring any
[`vscode-jsonrpc`](https://www.npmjs.com/package/vscode-jsonrpc)
`MessageReader`/`MessageWriter` pair (stdio, a socket, a WebSocket, a
`MessagePort`) and the library builds a fully typed, bidirectional connection on
top of it.

## Highlights

- **Schema-first.** Every wire shape is a [Zod](https://zod.dev) schema; the
  TypeScript types are `z.infer` of those schemas, so validation and types can
  never drift apart.
- **Fully typed connection.** `sendRequest`/`onRequest`/`sendNotification`/
  `onNotification` are generic over the method name — params and result types
  are inferred from that name, with no casts at the call site.
- **Transport-agnostic.** Works over anything that implements
  `MessageReader`/`MessageWriter`.
- **Platform RAL entry points.** `./node` and `./browser` install the matching
  `vscode-jsonrpc` runtime abstraction layer and re-export its transport classes,
  so you import everything — connection helper and reader/writer — from one place.
- **Agent-ready.** A built-in tool registry emits a JSON-Schema tool catalog you
  can feed straight into an LLM function-calling API.
- **Forward-compatible.** Unknown methods and fields are ignored, not rejected.

## Installation

```bash
npm install @motrix/mdxp
# or: pnpm add @motrix/mdxp · yarn add @motrix/mdxp
```

Runtime dependency: [`vscode-jsonrpc`](https://www.npmjs.com/package/vscode-jsonrpc)
`^9`, installed alongside this package. Its transport classes (reader/writer)
and the primitives that surface in this package's API — `MessageReader`,
`MessageConnection`, `CancellationToken`, `CancellationTokenSource`, … — are
re-exported from `@motrix/mdxp` (see [Entry points](#entry-points)), so you
rarely need to import `vscode-jsonrpc` directly. ESM-only; requires
Node.js ≥ 18 or a modern bundler.

### Entry points

| Import | Installs a RAL? | Use it from |
| --- | --- | --- |
| `@motrix/mdxp` | No — platform-agnostic core | Shared code, tests, type-only imports |
| `@motrix/mdxp/node` | Node RAL | A Node host (Electron main, a CLI, a native-messaging host) |
| `@motrix/mdxp/browser` | Browser RAL | A browser host (extension service worker, page) |

`vscode-jsonrpc` v9 requires a runtime abstraction layer (RAL) to be installed
before a connection can be created. Importing `@motrix/mdxp/node` or
`@motrix/mdxp/browser` installs the right one into the **same** `vscode-jsonrpc`
instance this package uses, and re-exports the entire public API **plus that
platform's transport classes** (`StreamMessageReader`/`Writer` for Node,
`BrowserMessageReader`/`Writer` for the browser) — so a host imports everything,
including its reader/writer, from a single place.

## Quick start

### Node host (over stdio)

```ts
import {
  createMdxpConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from '@motrix/mdxp/node'

const conn = createMdxpConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
)

// Register handlers BEFORE listen().
conn.onNotification('$/task/progress', (p) => {
  const pct = p.bytesTotal ? Math.round((p.bytesDone / p.bytesTotal) * 100) : null
  console.log(`[${p.taskId}] ${p.phase} ${pct ?? '?'}% @ ${p.speedBps} B/s`)
})

conn.listen()
```

### Browser host

```ts
// Installs the browser RAL and re-exports the full API + transport classes.
import {
  createMdxpConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
} from '@motrix/mdxp/browser'

// e.g. a MessagePort / Worker; adapt your WebSocket to reader/writer as needed.
const conn = createMdxpConnection(
  new BrowserMessageReader(worker),
  new BrowserMessageWriter(worker),
)
conn.listen()
```

## Core concepts

**Server vs. client.** The Motrix desktop app is the **server** — it owns the
download engine. A **client** is whatever drives it: the browser extension, a
CLI, or an agent. The connection is symmetric, but methods flow in a defined
direction (below).

**The handshake comes first.** `motrix/initialize` MUST be the first message of
every session. It negotiates the protocol version, exchanges identity, and
declares capabilities. Nothing else should be sent until it resolves.

**Message direction.** Most methods are client→server (the client asks the
downloader to do something). Two are server→client — the server asks the client
to inspect a page: `url/probe` and `url/resolve` (see
[`SERVER_INITIATED_METHODS`](#api-reference)). Because the server initiates both,
a client answers them with `onRequest`, while the server side calls them with
`sendRequest`.

## Usage

### Handshake

```ts
const hello = await conn.sendRequest('motrix/initialize', {
  protocolVersion: '1.0',
  client: {
    kind: 'cli',              // or 'extension'
    name: 'my-download-agent',
    version: '1.0.0',
    locale: 'en-US',
  },
  capabilities: { submitDownload: true, progress: true, cancellation: true },
  adapters: [],              // page adapters this client can resolve, if any
})

console.log(hello.server.name, hello.server.version)
console.log(hello.capabilities.selectionKinds) // e.g. ['direct', 'hls', 'mux']
```

### Add a download (client → server)

`download/add` is the public, agent-facing entry point. It accepts a direct
URL list, a magnet link, or a base64 torrent, and returns the created task
snapshot so you can render it without polling.

```ts
// Direct HTTP(S) file
const task = await conn.sendRequest('download/add', {
  kind: 'url',
  saveDir: '/Users/me/Downloads',
  uris: ['https://cdn.example.com/releases/app-1.4.2-arm64.dmg'],
  connections: 8,
})
console.log(task.id, task.status) // "t_01H…", "downloading"

// Magnet link
await conn.sendRequest('download/add', {
  kind: 'magnet',
  saveDir: '/Users/me/Downloads',
  uri: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a',
})
```

> Only `http`, `https`, `ftp`, `ftps`, and `sftp` URLs are accepted — the schema
> rejects `file:`, `data:`, and `javascript:` at the contract boundary, so an
> agent can never be coerced into a local-file read.

### Query and control tasks (client → server)

```ts
const { tasks, total } = await conn.sendRequest('task/list', {
  status: 'downloading',
  limit: 20,
})

await conn.sendRequest('task/pause',  { taskId: task.id })
await conn.sendRequest('task/resume', { taskId: task.id })
await conn.sendRequest('task/remove', { taskId: task.id, deleteFiles: false })
```

### Resolve a page (server → client)

The desktop app asks a client whether it can handle a page (`url/probe`), then
asks it to extract the downloadable resources (`url/resolve`). A client answers
by registering handlers:

```ts
conn.onRequest('url/probe', async ({ url }) => ({
  handled: /videos\.example\.com/.test(url),
  adapterId: 'example-video',
  confidence: 'high',
}))

conn.onRequest('url/resolve', async ({ url, preferences }) => ({
  selections: [
    {
      kind: 'direct',
      primary: {
        url: 'https://cdn.example.com/v/abc123/1080p.mp4',
        headers: {},
        cookies: [],
        refererPolicy: 'strict-origin-when-cross-origin',
      },
      container: 'mp4',
      quality: preferences?.maxQuality ?? '1080p',
      sizeBytes: 734_003_200,
    },
  ],
  meta: { title: 'Sample clip', author: 'example.com', durationSec: 372 },
  extractedBy: {
    adapterId: 'example-video',
    adapterVersion: '1.0.0',
    extractedAt: Date.now(),
  },
}))
```

A `selection` is a discriminated union on `kind`: `direct` (one file), `hls`
(a playlist), or `mux` (separate video + audio streams the server muxes). Each
`Resource` carries the `headers`/`cookies` needed to re-fetch it server-side.

### Progress and lifecycle (server → client)

```ts
conn.onNotification('$/task/progress', (p) => {
  // p.phase: 'queued' | 'downloading' | 'muxing' | 'finalizing'
})
conn.onNotification('$/task/completed', (p) => {
  console.log('done →', p.filePath, `(${p.durationMs} ms)`)
})
conn.onNotification('$/task/error', (p) => {
  console.error(`task ${p.taskId} failed: [${p.code}] ${p.message}`)
})
```

### Cancellation

`sendRequest` accepts an optional `CancellationToken`. Cancelling emits
`$/cancelRequest` on the wire (handled by `vscode-jsonrpc`); a cooperative
handler observes `token.isCancellationRequested`.

```ts
import { CancellationTokenSource } from '@motrix/mdxp'

const cts = new CancellationTokenSource()
const pending = conn.sendRequest('url/resolve', { url }, cts.token)
// …the user navigated away:
cts.cancel()
```

### Runtime validation

Every wire shape has a schema. Validate untrusted input at your boundary with
`safeParse` before acting on it:

```ts
import { DownloadAddParamsSchema } from '@motrix/mdxp'

const parsed = DownloadAddParamsSchema.safeParse(untrusted)
if (!parsed.success) {
  // parsed.error — a ZodError describing exactly what was wrong
  return
}
await conn.sendRequest('download/add', parsed.data)
```

### Error model

Return structured errors from a handler with `makeMdxpError`. The `code` is a
JSON-RPC error code; `data` carries a machine-readable `appCode`, a retry hint,
and free-form context.

```ts
import { ErrorCodes, makeMdxpError } from '@motrix/mdxp'

throw makeMdxpError(
  ErrorCodes.ResourceUnavailable,
  'The requested file is no longer available',
  { appCode: 'http.gone', retryable: false, context: { status: 410 } },
)
```

Classify a received code with `isProtocolError(code)` (JSON-RPC reserved) or
`isMotrixError(code)` (Motrix's `-32001…-32099` range).

### AI-agent tool catalog

The agent-facing methods are exposed as a JSON-Schema tool catalog, ready for an
LLM function-calling / tool-use API:

```ts
import { toAgentToolCatalog } from '@motrix/mdxp'

const tools = toAgentToolCatalog()
// [
//   { name: 'download/add', description, inputSchema: {…JSON Schema}, outputSchema },
//   { name: 'task/list',    … },
//   …
// ]
```

## API reference

### Exports

| Export | Kind | Purpose |
| --- | --- | --- |
| `createMdxpConnection(reader, writer)` | function | Wrap a reader/writer pair in a typed `MdxpConnection`. |
| `MdxpConnection` | type | The connection interface (`sendRequest`, `onRequest`, `sendNotification`, `onNotification`, `dispose`, `raw`). |
| `MdxpRequestMap` / `MdxpNotificationMap` | type | Method/notification name → params/result type maps. |
| `Methods` / `Notifications` | const | Wire-name constants (`Methods.DownloadAdd === 'download/add'`). |
| `ErrorCodes` | const | JSON-RPC + Motrix-defined error codes. |
| `makeMdxpError(code, msg, data?)` | function | Build a structured `MdxpError`. |
| `isProtocolError` / `isMotrixError` | function | Classify an error code. |
| `Tools` | const | Registry of every client→server method → `{ description, paramsSchema, resultSchema, agentFacing }`. |
| `toAgentToolCatalog()` | function | The `agentFacing` subset as JSON-Schema tools. |
| `SERVER_INITIATED_METHODS` | const | Methods the server calls on the client (`url/probe`, `url/resolve`). |
| `*Schema` | Zod schema | Every wire shape, for runtime validation. |
| `MessageReader` · `MessageWriter` · `MessageConnection` · `CancellationToken` · `CancellationTokenSource` · `Disposable` | re-export | `vscode-jsonrpc` primitives used across the API. Platform transport classes (`StreamMessageReader`/`Writer`, `BrowserMessageReader`/`Writer`) are re-exported from `./node` and `./browser`. |

### Methods

| Method | Direction | Agent-facing | Purpose |
| --- | --- | :---: | --- |
| `motrix/initialize` | client → server | | Handshake: version, identity, capabilities. |
| `system/ping` | client → server | | Liveness probe; echoes `sentAt` with `recvAt`. |
| `download/submit` | client → server | | Submit a browser-detected, page-shaped download. |
| `download/cancel` | client → server | | Cancel a submitted download by task id. |
| `download/add` | client → server | ✓ | Add a download by URL(s), magnet, or torrent. |
| `task/list` | client → server | ✓ | List tasks, filterable + paginated. |
| `task/get` | client → server | ✓ | Get one task by id. |
| `task/pause` · `task/resume` | client → server | ✓ | Pause / resume a task. |
| `task/remove` | client → server | ✓ | Remove a task, optionally deleting files. |
| `stats/get` | client → server | ✓ | Aggregate global stats (speeds + counts). |
| `engine/status` | client → server | ✓ | Engine lifecycle state + feature report. |
| `url/probe` | **server → client** | | Can this client's adapters handle a page? |
| `url/resolve` | **server → client** | | Extract downloadable resources from a page. |

### Notifications

| Notification | Direction | Payload |
| --- | --- | --- |
| `motrix/initialized` | client → server | Handshake completion (no payload). |
| `$/task/progress` | server → client | `bytesDone`, `bytesTotal`, `speedBps`, `etaSec`, `phase`. |
| `$/task/completed` | server → client | `filePath`, `durationMs`. |
| `$/task/error` | server → client | `code`, `message`. |
| `$/stats` | server → client | Periodic aggregate stats push. |
| `$/pair/revoked` | server → client | Pairing was revoked (`reason`). |
| `$/cancelRequest` | either | Cancellation — handled by `vscode-jsonrpc`. |

### Error codes

| Code | Value | Range |
| --- | --- | --- |
| `ParseError` | `-32700` | JSON-RPC reserved |
| `InvalidRequest` | `-32600` | JSON-RPC reserved |
| `MethodNotFound` | `-32601` | JSON-RPC reserved |
| `InvalidParams` | `-32602` | JSON-RPC reserved |
| `InternalError` | `-32603` | JSON-RPC reserved |
| `RequestCancelled` | `-32800` | LSP extension |
| `AdapterError` | `-32001` | Motrix |
| `ResourceUnavailable` | `-32002` | Motrix |
| `PermissionDenied` | `-32003` | Motrix |
| `RateLimited` | `-32004` | Motrix |
| `CapabilityNotSupported` | `-32005` | Motrix |
| `PairRevoked` | `-32006` | Motrix |

## Protocol notes

- **Version.** `protocolVersion` is `'1.0'`. This is the wire-compatibility
  version and is independent of this package's npm version.
- **No batching.** JSON-RPC batching is forbidden — one frame, one message.
- **Forward-compatible.** Result and notification payloads are non-strict:
  a newer server may add fields that older clients ignore. An unknown method is
  rejected with `MethodNotFound` rather than crashing the session.

## Design principles

- **Transport-agnostic** — the library never assumes a specific transport; any
  `MessageReader`/`MessageWriter` duplex works.
- **Schema-first** — define the Zod schema, infer the type; never hand-write a
  type that has a corresponding schema.
- **Forward-compatible** — ignore the unknown rather than reject it.

## License

[MIT](./LICENSE) © Dr_rOot
