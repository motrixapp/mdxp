# @motrix/mdxp

[![npm version](https://img.shields.io/npm/v/@motrix/mdxp.svg)](https://www.npmjs.com/package/@motrix/mdxp)
[![license](https://img.shields.io/npm/l/@motrix/mdxp.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@motrix/mdxp.svg)](./dist/index.d.ts)

[English](./README.md) | **简体中文**

> **MDXP**（Motrix Download eXchange Protocol）—— 一套 JSON-RPC 2.0 wire 类型、
> Zod schema 与双向连接封装，让浏览器、CLI 或 AI agent 通过任意双工 transport，
> 把下载任务移交给 Motrix 桌面下载器。

`@motrix/mdxp` 是 MDXP wire 契约的唯一真源。bridge 的两端 —— 作为 **server** 的
[Motrix](https://github.com/agalwood/Motrix) 桌面端（持有下载引擎），与各类 **client**
（浏览器扩展、CLI、agent）—— 都依赖本包，从而让协议形态只需定义一次。

本包不含任何 transport 相关实现：你提供一对
[`vscode-jsonrpc`](https://www.npmjs.com/package/vscode-jsonrpc) 的
`MessageReader`/`MessageWriter`（stdio、socket、WebSocket、`MessagePort` 皆可），
本库便在其上构建出一个完全类型化的双向连接。

## 特性

- **Schema-first**：每个 wire 形态都是一个 [Zod](https://zod.dev) schema，
  TypeScript 类型再由 schema `z.infer` 推导而来 —— 校验与类型因此永远不会脱节。
- **完全类型化的连接**：`sendRequest`/`onRequest`/`sendNotification`/
  `onNotification` 均以 method 名为泛型参数，params 与 result 类型据此自动推断，
  调用处无需任何 cast。
- **transport-agnostic**：只要实现了 `MessageReader`/`MessageWriter`，任何双工流都能用。
- **平台 RAL 入口**：`./node` 与 `./browser` 会替你装好对应的 `vscode-jsonrpc`
  runtime abstraction layer，并 re-export 它的 transport class —— 连接封装与
  reader/writer 都从同一处 import。
- **一步构造**：`fromWebSocket`、`fromStdio`、`fromWorker` 一行即可在常见 transport
  上建好连接；`createMdxpConnection` 仍是通用的底层入口。
- **面向 agent**：内置的 tool registry 可产出一份 JSON-Schema tool catalog，
  能直接对接 LLM 的 function-calling API。
- **能力协商**：可选功能需要主机明确支持；严格请求 schema 拒绝未知字段，未知请求返回 `MethodNotFound`。

## 安装

```bash
npm install @motrix/mdxp
# 或：pnpm add @motrix/mdxp · yarn add @motrix/mdxp
```

运行时依赖：[`vscode-jsonrpc`](https://www.npmjs.com/package/vscode-jsonrpc)
`^9`，随本包一并装上。它的 transport class（reader/writer），以及在本包 API 中出现的
那些 primitive —— `MessageReader`、`MessageConnection`、`CancellationToken`、
`CancellationTokenSource` 等 —— 都已从 `@motrix/mdxp` re-export（见
[入口点](#入口点)），因此你几乎无需直接 import `vscode-jsonrpc`。仅 ESM；需要
Node.js ≥ 18 或现代 bundler。

开发时，`@types/node` 保持在 Node.js 24 LTS 主版本内升级，不跟随最新的
Node.js Current 主版本。

### 入口点

| import | 是否装 RAL | 使用场景 |
| --- | --- | --- |
| `@motrix/mdxp` | 否 —— 平台无关的核心 | 共享代码、测试、仅类型 import |
| `@motrix/mdxp/node` | Node RAL | Node host（Electron main、CLI、native-messaging host） |
| `@motrix/mdxp/browser` | Browser RAL | 浏览器 host（扩展 service worker、页面） |

`vscode-jsonrpc` v9 要求先装好一层 runtime abstraction layer（RAL），才能创建连接。
import `@motrix/mdxp/node` 或 `@motrix/mdxp/browser` 会把对应的 RAL 装进本包所用的
**同一个** `vscode-jsonrpc` 实例，并 re-export 完整的公开 API，**外加该平台的
transport class**（Node 的 `StreamMessageReader`/`Writer`、浏览器的
`BrowserMessageReader`/`Writer`）—— 于是 host 连同 reader/writer 都只需从一个入口 import。

## 快速开始

### Node host（走 stdio）

```ts
import { fromStdio } from '@motrix/mdxp/node'

// 走 process.stdin / process.stdout（native-messaging / CLI 场景）。
const conn = fromStdio()

// 务必在 listen() 之前注册 handler。
conn.onNotification('$/task/progress', (p) => {
  const pct = p.bytesTotal ? Math.round((p.bytesDone / p.bytesTotal) * 100) : null
  console.log(`[${p.taskId}] ${p.phase} ${pct ?? '?'}% @ ${p.speedBps} B/s`)
})

conn.listen()
```

### 浏览器 host（走 WebSocket）

```ts
import { fromWebSocket } from '@motrix/mdxp/browser'

const conn = fromWebSocket(new WebSocket('ws://127.0.0.1:16650/v1'))
conn.onNotification('$/task/progress', (p) => {})
conn.listen()
```

### 便捷构造器

`createMdxpConnection(reader, writer)` 是通用入口 —— 传入任意 `vscode-jsonrpc` 的
reader/writer。常见 transport 则可直接省去样板：

| 构造器 | 入口 | Transport |
| --- | --- | --- |
| `fromWebSocket(ws)` | `./node` · `./browser` | 浏览器 `WebSocket` 或 Node 的 `ws` socket |
| `fromStdio(opts?)` | `./node` | `process.stdin` / `process.stdout`，或指定的流 |
| `fromWorker(port)` | `./browser` | 一个 `Worker` 或 `MessagePort` |

每个都返回开箱即用的 `MdxpConnection` —— 你仍需注册 handler 并调用 `listen()`。
其它 transport 则自行构造 reader/writer，再直接调用 `createMdxpConnection`。

## 核心概念

**server 与 client**：Motrix 桌面端是 **server** —— 下载引擎由它持有。**client**
则是驱动它的一方：浏览器扩展、CLI 或 agent。连接本身是对称的，但每个 method 都有
既定的调用方向（见下）。

**握手先行**：`motrix/initialize` **必须**是每个 session 的第一条消息 —— 它负责协商
protocol version、交换身份、声明 capabilities。在它 resolve 之前，不应发送任何其它消息。

**消息方向**：绝大多数 method 是 client→server（由 client 请求下载器做事）。只有两个是
server→client —— server 请求 client 去检视某个页面：`url/probe` 与 `url/resolve`
（见 [`SERVER_INITIATED_METHODS`](#api-参考)）。既然这两个都由 server 发起，client
一侧就用 `onRequest` 应答，server 一侧则用 `sendRequest` 调用。

## 用法

### 握手

```ts
const hello = await conn.sendRequest('motrix/initialize', {
  protocolVersion: '1.0',
  client: {
    kind: 'cli',              // 或 'extension'
    name: 'my-download-agent',
    version: '1.0.0',
    locale: 'zh-CN',
  },
  capabilities: { submitDownload: true, progress: true, cancellation: true },
  adapters: [],              // 该 client 能解析的页面 adapter（如有）
})

console.log(hello.server.name, hello.server.version)
console.log(hello.capabilities.selectionKinds) // 例如 ['direct', 'hls', 'mux']
const canRevealTask = hello.capabilities.taskReveal ?? false
```

`capabilities.taskReveal` 在 wire 上是可选字段，以便既有的 protocol 1.0 server 继续有效。
`InitializeResultSchema` 会把缺失值归一为 `false`；未解析 result 的 client 应使用
`?? false`，并隐藏或禁用“在文件管理器中显示”操作。

### 添加下载（client → server）

`download/add` 是面向 agent 的公开入口，接受直连 URL 列表、magnet 链接或 base64
torrent，并直接返回新建的 task 快照 —— 调用方无需轮询即可渲染。

```ts
// 直连 HTTP(S) 文件
const task = await conn.sendRequest('download/add', {
  kind: 'url',
  saveDir: '/Users/me/Downloads',
  uris: ['https://cdn.example.com/releases/app-1.4.2-arm64.dmg'],
  connections: 8,
})
console.log(task.id, task.status) // "t_01H…", "downloading"

// magnet 链接
await conn.sendRequest('download/add', {
  kind: 'magnet',
  saveDir: '/Users/me/Downloads',
  uri: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a',
})
```

> 只接受 `http`、`https`、`ftp`、`ftps`、`sftp` 协议的 URL —— schema 会在契约边界
> 直接 reject 掉 `file:`、`data:`、`javascript:`，因此 agent 绝无可能被诱导去读取
> 本地文件。

### 查询与控制 task（client → server）

```ts
const { tasks, total } = await conn.sendRequest('task/list', {
  status: 'downloading',
  limit: 20,
})

await conn.sendRequest('task/pause',  { taskId: task.id })
await conn.sendRequest('task/resume', { taskId: task.id })
await conn.sendRequest('task/remove', { taskId: task.id, deleteFiles: false })

// 仅在能力协商通过后，由明确的用户手势触发。
if (hello.capabilities.taskReveal ?? false) {
  await conn.sendRequest('task/reveal', { taskId: task.id })
}
```

`task/reveal` 请求桌面端在系统文件管理器中显示该 task 的输出。其严格载荷只接受
`taskId`，绝不接受任意本地路径。它会注册在 `Tools` 中以便发现 schema，但不会进入
`toAgentToolCatalog()`；打开文件管理器属于 UI 副作用，必须由用户发起。

### 解析页面（server → client）

桌面端会先问某个 client 能否处理这个页面（`url/probe`），再请它抽取出可下载的资源
（`url/resolve`）。client 通过注册 handler 来应答：

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

一个 `selection` 是按 `kind` 区分的 discriminated union：`direct`（单个文件）、
`hls`（一份 playlist），或 `mux`（分离的 video 与 audio 流，由 server 端合流）。
每个 `Resource` 都带有 server 端重新抓取时所需的 `headers`/`cookies`。

### 进度与生命周期（server → client）

```ts
conn.onNotification('$/task/progress', (p) => {
  // p.phase: 'queued' | 'downloading' | 'muxing' | 'finalizing'
})
conn.onNotification('$/task/completed', (p) => {
  console.log('完成 →', p.filePath, `(${p.durationMs} ms)`)
})
conn.onNotification('$/task/error', (p) => {
  console.error(`task ${p.taskId} 失败：[${p.code}] ${p.message}`)
})
```

### 取消

`sendRequest` 可接受一个可选的 `CancellationToken`。取消时会在 wire 上发出
`$/cancelRequest`（由 `vscode-jsonrpc` 处理）；采用协作式取消的 handler 只需观察
`token.isCancellationRequested` 即可响应。

```ts
import { CancellationTokenSource } from '@motrix/mdxp'

const cts = new CancellationTokenSource()
const pending = conn.sendRequest('url/resolve', { url }, cts.token)
// …用户离开了页面：
cts.cancel()
```

### 运行时校验

每个 wire 形态都配有 schema。在边界处先用 `safeParse` 校验不可信输入，通过后再执行：

```ts
import { DownloadAddParamsSchema } from '@motrix/mdxp'

const parsed = DownloadAddParamsSchema.safeParse(untrusted)
if (!parsed.success) {
  // parsed.error —— 一个精确指出问题所在的 ZodError
  return
}
await conn.sendRequest('download/add', parsed.data)
```

### Error 模型

在 handler 里用 `makeMdxpError` 返回结构化的错误。`code` 是 JSON-RPC error code；
`data` 则携带机器可读的 `appCode`、重试提示，以及任意自定义上下文。

```ts
import { ErrorCodes, makeMdxpError } from '@motrix/mdxp'

throw makeMdxpError(
  ErrorCodes.ResourceUnavailable,
  'The requested file is no longer available',
  { appCode: 'http.gone', retryable: false, context: { status: 410 } },
)
```

收到 code 后，可用 `isProtocolError(code)`（JSON-RPC 保留段）或 `isMotrixError(code)`
（Motrix 的 `-32001…-32099` 段）为它归类。

### AI-agent tool catalog

面向 agent 的那些 method 会被导出成一份 JSON-Schema tool catalog，可直接对接 LLM 的
function-calling / tool-use API：

```ts
import { toAgentToolCatalog } from '@motrix/mdxp'

const tools = toAgentToolCatalog()
// [
//   { name: 'download/add', description, inputSchema: {…JSON Schema}, outputSchema },
//   { name: 'task/list',    … },
//   …
// ]
```

## API 参考

### 导出

| 导出 | 类型 | 作用 |
| --- | --- | --- |
| `createMdxpConnection(reader, writer)` | function | 把一对 reader/writer 封装成类型化的 `MdxpConnection`。 |
| `fromWebSocket` · `fromStdio` · `fromWorker` | function | 在 WebSocket / stdio / Worker 上的一步构造器（来自 `./node` · `./browser`）。 |
| `MdxpConnection` | type | 连接接口（`sendRequest`、`onRequest`、`sendNotification`、`onNotification`、`dispose`、`raw`）。 |
| `MdxpRequestMap` / `MdxpNotificationMap` | type | method / notification 名 → params/result 类型的映射表。 |
| `Methods` / `Notifications` | const | wire 名常量（`Methods.DownloadAdd === 'download/add'`）。 |
| `ErrorCodes` | const | JSON-RPC 与 Motrix 自定义的 error code。 |
| `makeMdxpError(code, msg, data?)` | function | 构造结构化的 `MdxpError`。 |
| `isProtocolError` / `isMotrixError` | function | 为 error code 归类。 |
| `Tools` | const | 每个 client→server method 的注册表 → `{ description, paramsSchema, resultSchema, agentFacing }`。 |
| `toAgentToolCatalog()` | function | 取 `agentFacing` 子集，转成 JSON-Schema tools。 |
| `SERVER_INITIATED_METHODS` | const | 由 server 向 client 发起的 method（`url/probe`、`url/resolve`）。 |
| `*Schema` | Zod schema | 全部 wire 形态，供运行时校验。 |
| `MessageReader` · `MessageWriter` · `MessageConnection` · `CancellationToken` · `CancellationTokenSource` · `ResponseError` · `Disposable` | re-export | 本包 API 中用到的 `vscode-jsonrpc` primitive。平台 transport class（`StreamMessageReader`/`Writer`、`BrowserMessageReader`/`Writer`）从 `./node` 与 `./browser` re-export。 |

RPC handler 需要保留错误码和 data 时，应抛出从 `@motrix/mdxp` 导入的
`ResponseError`。从另一份 `vscode-jsonrpc` 实例导入该类，可能导致错误被序列化
为内部错误。

### Methods

| Method | 方向 | agent-facing | 作用 |
| --- | --- | :---: | --- |
| `motrix/initialize` | client → server | | 握手：协商 version、身份、capabilities。 |
| `system/ping` | client → server | | 存活探测；回显 `sentAt` 与 `recvAt`。 |
| `download/submit` | client → server | | 提交浏览器侦测到的 page 形态下载。 |
| `download/cancel` | client → server | | 按 task id 取消已提交的下载。 |
| `download/add` | client → server | ✓ | 按 URL / magnet / torrent 添加下载。 |
| `task/list` | client → server | ✓ | 列出 task，可过滤、可分页。 |
| `task/get` | client → server | ✓ | 按 id 取单个 task。 |
| `task/pause` · `task/resume` | client → server | ✓ | 暂停 / 恢复 task。 |
| `task/remove` | client → server | ✓ | 移除 task，可选一并删除文件。 |
| `task/reveal` | client → server | | 在系统文件管理器中显示 task 输出；仅限用户手势。 |
| `stats/get` | client → server | ✓ | 取聚合的全局统计（速度 + 计数）。 |
| `engine/status` | client → server | ✓ | 取下载引擎的生命周期状态与 feature report。 |
| `url/probe` | **server → client** | | 该 client 的 adapter 能否处理某页面？ |
| `url/resolve` | **server → client** | | 从页面中抽取可下载资源。 |

### Notifications

| Notification | 方向 | 载荷 |
| --- | --- | --- |
| `motrix/initialized` | client → server | 握手完成（无载荷）。 |
| `$/task/progress` | server → client | `bytesDone`、`bytesTotal`、`speedBps`、`etaSec`、`phase`。 |
| `$/task/completed` | server → client | `filePath`、`durationMs`。 |
| `$/task/error` | server → client | `code`、`message`。 |
| `$/stats` | server → client | 周期性推送的聚合统计。 |
| `$/pair/revoked` | server → client | 配对被撤销（`reason`）。 |
| `$/cancelRequest` | 双向 | 取消 —— 由 `vscode-jsonrpc` 处理。 |

### Error codes

| Code | 值 | 所属段 |
| --- | --- | --- |
| `ParseError` | `-32700` | JSON-RPC 保留 |
| `InvalidRequest` | `-32600` | JSON-RPC 保留 |
| `MethodNotFound` | `-32601` | JSON-RPC 保留 |
| `InvalidParams` | `-32602` | JSON-RPC 保留 |
| `InternalError` | `-32603` | JSON-RPC 保留 |
| `RequestCancelled` | `-32800` | LSP 扩展 |
| `AdapterError` | `-32001` | Motrix |
| `ResourceUnavailable` | `-32002` | Motrix |
| `PermissionDenied` | `-32003` | Motrix |
| `RateLimited` | `-32004` | Motrix |
| `CapabilityNotSupported` | `-32005` | Motrix |
| `PairRevoked` | `-32006` | Motrix |

## 协议说明

- **版本**：`protocolVersion` 为 `'1.0'`。这是 wire 的兼容性版本，与本包的 npm
  version 相互独立。
- **不支持 batching**：JSON-RPC batching 被明确禁止 —— 一帧一消息。
- **forward-compatible**：result 与 notification 的载荷都是 non-strict 的 ——
  较新的 server 可以新增字段，较旧的 client 忽略即可；未知的 method 会以
  `MethodNotFound` 被拒绝，而不会拖垮整个 session。

## Safari 支持与信任边界（自 0.8.0 起）

扩展初始化的 `client.browser` 在 `chromium`、`firefox` 之外接受 `safari`。
线协议仍为 `1.0`；未传 `kind` 的扩展仍使用原有默认值。公开的 browser
联合类型扩大，使用 TypeScript 穷尽分支的消费者需处理 Safari。使用旧 schema
的主机必须升级后才能接受 Safari 客户端。

连接辅助函数提供 TypeScript 类型约束，不会自动执行运行时 schema 校验或认证。
主机和客户端需使用导出的 schema 校验不可信参数与结果。浏览器名称、扩展 ID
及其他调用者声明的身份字段，不能证明 Origin、签名身份或权限；主机必须独立
认证传输/会话并执行权限检查。`agentFacing: false` 只过滤工具目录，不是访问控制。

消息大小、速率、允许下载目录和 URL 策略由主机限制。URL 或路径通过 schema
校验不意味着获准访问该资源。异常 WebSocket 消息投递通过
`connection.raw.onError` 报告，不再向 socket 监听器外抛出；这不能代替主机输入限制。

## 设计原则

- **transport-agnostic** —— 本库不假定任何特定 transport；任何 `MessageReader`/
  `MessageWriter` 双工流都能承载它。
- **schema-first** —— 先定义 Zod schema，再推断类型；绝不手写已有对应 schema 的类型。
- **forward-compatible** —— 扩展可选字段，同时保留明确的请求校验和能力协商。

## 下载目录（自 0.7.0 起）

已认证的扩展在 `motrix/initialize.capabilities.downloadDirectories === true`
时，可以使用空参数 `{}` 调用 `download/directories`。响应为
`{ defaultSaveDir: string | null, favorites: string[], recent: string[] }`。
路径属于目标 Motrix 主机；Docker 中为容器内路径。收藏最多 20 项，最近目录
最多 10 项，路径最长 4096 个字符且不能包含 NUL。不可用的默认目录返回 null。
该方法不是 agent-facing 接口，不得通过 unary HTTP 暴露。

此能力同时启用可选的 `download/submit.saveDir`。只能选择目标返回的目录；
任务受理前，目标必须依据当前设置、目录状态及文件系统策略重新校验。Server
继续执行允许目录范围和符号链接校验。失效目录必须拒绝，不得静默改存默认目录。
接口不支持任意目录浏览或新建目录；省略 `saveDir` 保留原有默认目录行为。

旧版可能静默丢弃未知字段，因此未协商该能力时不得发送 `saveDir`。客户端需将
目录选择绑定到后端配置和已认证实例，恢复草稿时保留绑定；修改目录后应生成新的
幂等键。同一幂等键更换显式目录属于无效请求。受理前的目录拒绝使用
`InvalidParams`，并携带 `data.appCode: "download-directory-unavailable"`，
不返回底层文件系统错误细节。目录校验不是操作系统沙箱，不能防御有权限并发替换
目录的本地进程。

## 下载交接（尚未发布的契约）

可选 `downloadHandoff` 能力定义扩展端确认使用的 prepare／commit／status／abort。本包新增传输 schema、强类型方法及共享载荷摘要编码，不直接启用应用支持。持久账本、取消与恢复要求见[交接 v1 契约](docs/download-handoff.zh-CN.md)；服务端通过对应集成验收前必须保持该能力缺省。

## License

[MIT](./LICENSE) © Dr_rOot
