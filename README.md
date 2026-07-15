# @motrix/mdxp

Motrix Download eXchange Protocol (MDXP) v1.0 — JSON-RPC 2.0 wire types, Zod schemas, and bidirectional connection helpers shared between the Motrix desktop app and the Motrix browser extension. Both live under the [motrixapp](https://github.com/motrixapp) organization.

完整协议规范见 `motrix-extension` 仓库的 `docs/01-protocol-mdxp.md`。

## 安装

```bash
pnpm add @motrix/mdxp
```

## 用法

### 创建一个连接

```ts
import { createMdxpConnection } from '@motrix/mdxp'
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

const conn = createMdxpConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout)
)

// 注册 handlers BEFORE listen
conn.onRequest('url/resolve', async (params) => {
  // ... 返回 typed UrlResolveResult
})

conn.onNotification('$/task/progress', (params) => {
  // ...
})

conn.listen()
```

### 发送 request

```ts
const result = await conn.sendRequest('url/resolve', {
  url: 'https://www.youtube.com/watch?v=...',
  preferences: { maxQuality: '1080p' },
})
// result 类型自动推断为 UrlResolveResult
```

### 发送 notification

```ts
conn.sendNotification('$/task/progress', {
  taskId: 't1',
  bytesDone: 1024,
  bytesTotal: 10240,
  speedBps: 512,
  etaSec: 18,
  phase: 'downloading',
})
```

### Schema 运行时校验

```ts
import { UrlResolveParamsSchema } from '@motrix/mdxp'

const validated = UrlResolveParamsSchema.parse(rawData)
// 失败抛 ZodError；用 safeParse() 取 success 字段判断
```

### Error 模型

```ts
import { ErrorCodes, makeMdxpError } from '@motrix/mdxp'

throw makeMdxpError(ErrorCodes.AdapterError, 'YouTube extraction failed', {
  appCode: 'youtube.video_unavailable',
  retryable: false,
  context: { videoId: 'abc' },
})
```

## 公共 API

| Export | 作用 |
|---|---|
| `Methods.*` | 方法名常量 (`motrix/initialize` 等) |
| `Notifications.*` | 通知名常量 (`$/task/progress` 等) |
| `ErrorCodes.*` | JSON-RPC + Motrix-defined error codes |
| `isProtocolError(code)`, `isMotrixError(code)` | error 分类 helpers |
| `makeMdxpError(code, msg, data?)` | error 构造 helper |
| `createMdxpConnection(reader, writer)` | 主入口，返回 `MdxpConnection` |
| `*Schema` | 全部 Zod schemas（运行时校验） |
| `MdxpRequestMap`, `MdxpNotificationMap` | 类型表（method → [params, result]） |

## 设计原则

- **transport-agnostic**：本包不绑死特定 transport；任何符合 `MessageReader`/`MessageWriter` 接口的双工流都可用
- **schema-first**：所有 wire 形态先用 Zod 定义，TypeScript 类型从 schema 推断
- **forward-compat**：未知 method/字段忽略而非 reject

## License

MIT
