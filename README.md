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
- **One-call constructors.** `fromWebSocket`, `fromStdio`, and `fromWorker` build
  a connection over a common transport in a single call; `createMdxpConnection`
  stays the generic escape hatch.
- **Agent-ready.** A built-in tool registry emits a JSON-Schema tool catalog you
  can feed straight into an LLM function-calling API.
- **Capability negotiation.** Optional features require host support; strict request schemas reject unknown fields, and unknown requests receive `MethodNotFound`.

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

For development, keep `@types/node` on the Node.js 24 LTS major and update
within that major. The newest Node.js Current release is not the type baseline.

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
import { fromStdio } from '@motrix/mdxp/node'

// Over process.stdin / process.stdout (the native-messaging / CLI case).
const conn = fromStdio()

// Register handlers BEFORE listen().
conn.onNotification('$/task/progress', (p) => {
  const pct = p.bytesTotal ? Math.round((p.bytesDone / p.bytesTotal) * 100) : null
  console.log(`[${p.taskId}] ${p.phase} ${pct ?? '?'}% @ ${p.speedBps} B/s`)
})

conn.listen()
```

### Browser host (over WebSocket)

```ts
import { fromWebSocket } from '@motrix/mdxp/browser'

const conn = fromWebSocket(new WebSocket('ws://127.0.0.1:16650/v1'))
conn.onNotification('$/task/progress', (p) => {})
conn.listen()
```

### Convenience constructors

`createMdxpConnection(reader, writer)` is the generic entry point — bring any
`vscode-jsonrpc` reader/writer. For the common transports, skip the boilerplate:

| Constructor | Entry | Transport |
| --- | --- | --- |
| `fromWebSocket(ws)` | `./node` · `./browser` | A browser `WebSocket` or a Node `ws` socket |
| `fromStdio(opts?)` | `./node` | `process.stdin` / `process.stdout`, or given streams |
| `fromWorker(port)` | `./browser` | A `Worker` or `MessagePort` |

Each returns a ready `MdxpConnection` — you still register handlers and call
`listen()`. For any other transport, build the reader/writer and call
`createMdxpConnection` directly.

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
const canRevealTask = hello.capabilities.taskReveal ?? false
```

`capabilities.taskReveal` is optional on the wire so existing protocol 1.0
servers remain valid. `InitializeResultSchema` normalizes an absent value to
`false`; clients that do not parse the result should use `?? false` and hide or
disable reveal actions.

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

// Invoke only from an explicit user gesture after capability negotiation.
if (hello.capabilities.taskReveal ?? false) {
  await conn.sendRequest('task/reveal', { taskId: task.id })
}
```

`task/reveal` asks the desktop host to reveal the task's output in the platform
file manager. Its strict payload accepts only `taskId`, never an arbitrary local
path. It is registered in `Tools` for schema discovery but intentionally omitted
from `toAgentToolCatalog()` because opening a file-manager window is a UI side
effect and must be initiated by the user.

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
| `fromWebSocket` · `fromStdio` · `fromWorker` | function | One-call constructors over a WebSocket / stdio / Worker (from `./node` · `./browser`). |
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
| `MessageReader` · `MessageWriter` · `MessageConnection` · `CancellationToken` · `CancellationTokenSource` · `ResponseError` · `Disposable` | re-export | `vscode-jsonrpc` primitives used across the API. Platform transport classes (`StreamMessageReader`/`Writer`, `BrowserMessageReader`/`Writer`) are re-exported from `./node` and `./browser`. |

Throw `ResponseError` imported from `@motrix/mdxp` when an RPC handler needs
to preserve an error code and data. Importing that class from another installed
copy of `vscode-jsonrpc` can cause it to be serialized as an internal error.

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
| `task/reveal` | client → server | | Reveal a task's output in the platform file manager; user gesture only. |
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

## Safari support and trust boundaries (since 0.8.0)

Extension initialization accepts `client.browser: 'safari'` alongside `chromium`
and `firefox`. The wire protocol remains `1.0`; extension clients without `kind`
retain the legacy default. The exported browser union is wider, so TypeScript
consumers with exhaustive browser switches must handle Safari. Hosts using older
schemas must upgrade before accepting Safari clients.

The connection helpers provide TypeScript signatures, not automatic runtime
schema validation or authentication. Validate untrusted params and results with
the exported schemas at the host/client boundary. Browser names, extension IDs,
and other caller-supplied identity fields do not prove origin, signing identity,
or authorization. The host must authenticate the transport/session and enforce
permissions independently. Likewise, `agentFacing: false` filters the tool
catalog; it is not an access-control mechanism.

Keep message size/rate limits, allowed download locations and URL policies in
the host. A schema-valid URL or path does not establish permission to access it.
Malformed WebSocket delivery errors are reported through `connection.raw.onError`
instead of escaping the socket listener; this does not replace host input limits.

## Design principles

- **Transport-agnostic** — the library never assumes a specific transport; any
  `MessageReader`/`MessageWriter` duplex works.
- **Schema-first** — define the Zod schema, infer the type; never hand-write a
  type that has a corresponding schema.
- **Forward-compatible** — extend optional fields while preserving explicit request validation and capability negotiation.

## Download directories (since 0.7.0)

An authenticated extension may call `download/directories` with `{}` when
`motrix/initialize.capabilities.downloadDirectories === true`. The response is
`{ defaultSaveDir: string | null, favorites: string[], recent: string[] }`.
Paths belong to the target Motrix host (container paths for Docker). Favorites
are bounded to 20 entries and recent directories to 10; paths are at most 4096
characters and cannot contain NUL. An unavailable default is reported as null.
This method is not agent-facing and must not be exposed on unary HTTP.

That same capability enables optional `download/submit.saveDir`. Only paths
returned by the host are selectable. The host revalidates against its current
settings and filesystem policy before accepting a task, including Server allowed
roots and symlink resolution. An invalid/stale choice must be rejected, never
silently replaced with the default. This API does not browse arbitrary paths or
create folders. Omitting `saveDir` retains the current default-directory behavior.

Clients must not send `saveDir` to older hosts: older schemas may silently strip
unknown fields. Bind a selection to its backend and authenticated instance, retain
that binding when restoring drafts, and use a new idempotency key after changing
the destination. Retrying the same key with a different explicit destination is
an invalid request. A pre-dispatch directory rejection uses `InvalidParams` with
`data.appCode: "download-directory-unavailable"`; filesystem details are not
included. Filesystem checks are not an OS sandbox: a local process that can
replace directories concurrently is outside this guarantee.

## Download handoff (unreleased contract)

The optional `downloadHandoff` capability defines prepare/commit/status/abort for extension-owned confirmation. This package adds wire schemas, typed methods and shared payload fingerprint encoding; it does not enable application support. See the [handoff v1 contract](docs/download-handoff.md) for durable ledger, cancellation and recovery requirements. Hosts must keep the capability absent until those integration requirements pass.

## License

[MIT](./LICENSE) © Dr_rOot
