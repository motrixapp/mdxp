# 媒体格式 v1

本文档定义本次变更引入的 `media/formats` 契约。本包只提供 wire schema、类型化的 RPC
条目与工具注册表条目，不实现媒体站点策略、抽取器、选择器 UI 或缓存。目标在实现并
验证下文要求之前，不得声明支持该能力。既有 `download/submit` 行为保持不变。

## 协商与范围

已认证的扩展仅在 initialize 返回 `capabilities.mediaFormats === true` 时才可调用
`media/formats`。能力缺失即表示不支持；没有注册 lister 的目标不得声明该能力。

该方法列出页面可下载的清晰度，供选择器在用户提交前展示真实选项。它不传输下载，
也不构成下载授权：随后的 `download/submit`（包括其 `meta.qualityLabel`）仍会独立
校验。列出格式是由**目标端**抓取：目标对调用方给出的 URL 运行自己的抽取器。

`media/formats` 仅供扩展使用。它注册在 `Tools` 中以便发现 schema，并标记
`agentFacing: false`，不得出现在 agent tool catalog 中，也不得通过 unary HTTP
transport 访问。`agentFacing: false` 不是授权机制：transport 必须在派发前把调用方
认证为已配对扩展会话，且不依赖调用方自报的 initialize 字段。

## 数据共享

- 只接受 `http:`/`https:` URL。`file:`、`data:`、`javascript:` 在契约边界即被拒绝。
  合法 URL 不等于访问许可 —— 目标常规的媒体站点、权限、体积与限流策略仍然生效；
  提交路径会拒绝的 URL，此处也必须拒绝，避免选择器承诺一个提交时会被拒的清晰度。
- 浏览器会话 cookie 为可选项，且仅对该 URL 的这一次抽取披露。它们绝不持久化、
  不在结果中回传、也不会写入日志。只有拼装 `Cookie:` 头所需的 `{ name, value }`
  会跨进程传输；domain、过期时间等浏览器数据保留在浏览器内。列表上限 256 组，
  每组名称与值亦各有上限，因此 client 无法制造无界的头增长。
- 结果只包含标题、时长与选项列表；不得携带抽取器 stderr、文件系统路径或任何未被
  请求的目标端细节。

## 方法与结果

参数为严格模式：未知键会被拒绝，而不是静默忽略。

```ts
{ url: string /* http(s) */, cookies?: { name: string; value: string }[] }
```

结果为非严格模式，便于更新的目标添加字段而旧 client 忽略：

```ts
{
  available: boolean
  reason?: string   // 机器可读、不透明、集合不保证穷尽
  title?: string
  durationSec?: number
  entries: Array<{
    key: string // /^(\d{3,4}p|mp3)$/
    kind: 'video' | 'audio'
    label: string
    height?: number
    fps?: number
    ext?: string
    sizeBytes?: number
  }>
}
```

`key` 是 client 原样回填到 `download/submit.meta.qualityLabel` 的清晰度令牌，绝不是
原始抽取器 selector，因此 client 无法借此把任意格式语法夹带进下载请求。`available`
为 false 时 `entries` 为空数组。

## 失败语义

无法列出格式时应返回**成功**结果：`available: false`、机器可读的 `reason`
（`disabled`、`not-allowed`、`binary-missing`、`unsupported`、`failed` 等）以及空
`entries`。`reason` 不透明且取值集合不保证穷尽：client 不得依赖穷尽枚举来分支，也
必须把不可用渲染成“不可用”而不是错误。传输与协议错误（例如早于本方法的旧目标返回
`MethodNotFound`）是唯一的失败形式；client 收到这类错误时，应视为目标“已连接但不
支持”，而不是目标不存在。

## 兼容与发布顺序

任何一方都不得要求另一方同步安装。保持 `protocolVersion` 为 `1.0`，并保持既有
initialize、submit、task 与 pairing 契约不变。

| 扩展 | Motrix | 结果 |
| --- | --- | --- |
| 旧 | 旧 | 不调用；行为不变 |
| 新 | 旧（无能力、无方法） | `MethodNotFound`；保留旧的 picker/静默路径 |
| 旧 | 新 | 该能力未被使用 |
| 新 | 新且能力为 `true` | 正常列出格式 |

在同时落实上文 URL scheme 限制与 cookie 上限之前，目标必须保持能力缺失 —— 声明该
能力意味着“本文档中的约束已被强制执行”，而不仅仅是 lister 存在。

## 声明支持前必须满足

1. lister 仅对已认证、已配对的扩展会话注册，且不通过 unary HTTP transport 或 agent
   catalog 暴露。
2. 使用导出的 schema 校验参数：非 http(s) URL 或超长的 cookie 列表在派发任何进程
   之前即被拒绝。
3. 各类拒绝（功能关闭、站点不在允许列表、抽取器缺失、抽取器报错）一律返回
   `available: false` 与 reason，绝不崩溃、绝不抛协议错误，也绝不返回提交时会被拒的
   部分选项列表。
4. cookie 仅用于那一次抽取调用，不被持久化，也不写入日志。

## License

[MIT](../LICENSE)
