# 媒体格式契约（MDXP 0.9.0）

`media/formats` 为 Motrix PR #2365 的画质选择器提供视频高度选项，以及可选的 MP3
提取选项。它不提交任务、不构成下载授权，也不改变配对。协议包提供 schema 与类型化
RPC 注册；下面的授权和抽取器要求由应用实现。

## 协商与传输

- 保持 `protocolVersion` 为 `1.0`，保留既有配对和提交行为。
- 目标只有在注册 lister 且实现本契约后，才能声明 `capabilities.mediaFormats: true`。
  能力缺失或为 false 时，客户端不得发送此请求，也不得试探调用。
- 方法只对已认证、已就绪的扩展会话开放。`Tools` 将其标为 `agentFacing: false`，
  不进入 `toAgentToolCatalog()`，也不得通过 unary `POST /mdxp` 暴露。注册标记和
  调用方自报的 `client.kind` 都不是认证，应使用传输层验证的主体。
- 能力协商只表示支持情况，不授予读取或披露页面 URL、Cookie 的权限。

## 客户端读取与发送前的授权

1. 请求必须由用户明确要求查看当前页面或选中嵌入播放器画质的操作发起。加载页面、
   观察到视频、轮询、重连都不得自动触发披露。
2. 从浏览器当前的标签页、文档、frame 身份取得目标。任意同源路径不能视为经过验证
   的 frame URL；画质标签或格式列表不得覆盖既有构建版本、站点排除策略。
3. 对远程目标，在发送 URL 前检查所选 authority 与已认证 instance 的既有数据授权；
   在读取、发送 Cookie 前另行检查凭据授权。扩展中的对应字段是
   `remoteDataBoundaryAcceptedAt` 和 `allowRequestCredentials`，配对不能替代它们。
4. 捕获端点代次、已认证实例、文档身份及相关授权，在异步操作后和即将发送前重新验证。
   授权撤销、端点编辑或切换、文档变化均使操作失效，不得转发或重放到另一个目标。
5. 只读取适用于该准确文档及其当前 Cookie store／partition 的 Cookie，保留作用域
   字段；不得读取全部浏览器 Cookie，也不得回退到其他浏览器配置。
6. 使用 `MediaFormatsParamsSchema` 解析，并发送解析后的值，而不是原始对象。
   通用连接辅助函数不执行这些由应用负责的检查，也不会自动校验载荷。

本地配对也不授权后台读取 Cookie。本地目标同样遵守明确操作与当前文档要求。

## 请求与 Cookie 作用域

严格请求形状为 `{ url, cookies? }`。URL 仅允许 HTTP(S)，最多 8,192 个字符，不能
包含用户信息或原始控制字符；继续支持 IP 和本地主机名。合法 scheme 不会绕过目标的 URL 策略。
不提供原始请求头、抽取器参数、格式 selector 或本地路径字段。

`MediaFormatCookie` 保留现有 `Resource.Cookie` 表示：`name`、`value`、`domain`、
`path`、`secure`、`httpOnly`、`sameSite`，以及可选的 `expiresAt`。过期时间是
**Unix 毫秒**，缺失表示会话 Cookie。无前导点的 domain 为 host-only；有前导点的
domain 按常规 Cookie 策略匹配域名。默认值与 `CookieSchema` 相同。

新方法限制字段大小，并拒绝非法名称、控制字符、值中的 Cookie 分隔符、非法 domain
与 path。请求 schema 拒绝 domain／path／Secure 范围不覆盖目标 URL 的 Cookie。
目标还必须在实际调用时丢弃过期 Cookie，并执行包含域名限制在内的标准 Cookie
策略。schema 无法证明 Cookie 来源，也不能替代浏览器端授权。

抽取器必须在**每个** HTTP 请求、重定向及子请求上保留 domain、host-only、path、
Secure 和有效期限制。浏览器端 SameSite 与 partition 限制应在读取时已经执行。
不得把 Cookie 平铺为全局 `Cookie:` 请求头：一次抽取可以访问多个主机和路径。
不得继承其他浏览器配置或抽取器环境中的凭据／配置。适配器无法满足这些限制时，应
返回不可用（例如 `credentials-unsupported`），不能扩大作用域或换一种方式静默导出。

Cookie 值只属于当前请求的生命周期，不得进入持久存储、进程参数、日志、结果、结果
缓存键或共享缓存。使用请求级内存／受保护的进程 I/O；撤销授权时取消待执行工作，
请求结束后释放秘密。带凭据的查询不得与其他主体或后续请求共享。无凭据结果可缓存，
但每次复用前仍需检查当前功能、站点策略，并限制缓存容量与寿命。

## 结果与上限

结果只能是以下两种之一：

```ts
{ available: true, title?: string, durationSec?: number, entries: MediaFormatEntry[] }
{ available: false, reason: string, entries: [] }
```

可用结果包含 1–64 个 key 唯一的选项。视频 key 为 `100p` 到 `4320p` 的十进制高度；
若提供 `height`，必须与 key 一致。视频选项可带 `fps`、`ext` 和 `sizeBytes`。
音频选项是 `{ kind: 'audio', key: 'mp3', label: 'MP3' }`，可带 `ext`／`sizeBytes`；
目标确实能够提取 MP3 时才能提供它。label 是显示文字，不是 selector。客户端可将
key 回填为 `download/submit.meta.qualityLabel`，但提交路径仍独立检查 URL、权限和
选项本身。

`sizeBytes` 是该选项需要下载的总字节数的可选估计，不保证最终编码文件的大小。
未知时省略；不能只报告双流下载中的视频部分，也不能把源音频字节数标成最终 MP3
文件大小。

不可用结果必须有机器可读 reason 和空 entries。reason 是不穷尽的小写连字符词元，
例如 `disabled`、`not-allowed`、`binary-missing`、`unsupported`、`failed` 或
`credentials-unsupported`；不得放入 stderr、凭据、本地路径或堆栈。未知结果字段
会被剥离，便于未来新增字段与旧客户端兼容。

协议导出 `MEDIA_FORMATS_LIMITS` 供消费者使用：

| 项目 | 上限 |
| --- | --- |
| 解析后参数的 UTF-8 JSON | 64 KiB |
| 解析后结果的 UTF-8 JSON | 64 KiB |
| Cookie 数量 | 256，同时受总字节数限制 |
| Cookie 名称／值／domain／path | 256／4096／254／2048 个字符 |
| 选项数量／label／title | 64／128／500 个字符 |

发送方必须序列化 schema 解析后的值，在写入连接前执行总字节数检查。这些上限为
JSON-RPC 封装预留空间，低于现有 MBP1 的 1 MiB 明文上限；传输层限制仍然有效。
JSON Schema 只能表达结构限制，无法完整表达 Zod refinement（UTF-8 预算、作用域
匹配、key 唯一性）。消费者必须使用运行时 schema 或等效一致性检查，不能只依赖
JSON Schema。目标必须限制并发抽取数量与执行时间，并响应既有取消令牌。抽取器无
支持或没有选项时，应返回不可用，不能返回可用的空列表。

## 失败与兼容

功能关闭、站点被排除、缺少可执行程序、不支持媒体或一般抽取失败，都返回不可用
结果。认证或权限拒绝沿用 `PermissionDenied`／`PairRevoked`；非法输入使用
`InvalidParams`，限流使用 `RateLimited`，取消使用 `RequestCancelled`。这些结果
都不授权切换端点重试或修改配对。

在仍然有效、已授权的连接上收到 `MethodNotFound`／`CapabilityNotSupported` 时，
可以隐藏选择器并保留既有 UI。真正的连接丢失、超时／恢复耗尽、授权撤销，仍由连接
状态机处理，不能把断线改标为已连接。

| 客户端／目标组合 | 必需行为 |
| --- | --- |
| 旧客户端／新目标 | 不使用可选能力，旧方法照常工作 |
| 新客户端／旧目标，能力缺失或为 false | 不发送格式查询，保留旧 UI |
| 新客户端／目标声明支持且授权有效 | 明确操作可发起查询 |
| 声明支持但没有注册方法 | 在仍有效连接上处理方法不匹配 |
| 声明支持但授权缺失／撤销或文档变化 | 不读取、不发送，使待执行工作失效 |
| 连接丢失或配对撤销 | 沿用连接／撤销处理 |

## 消费者验收与发布顺序

先发布审查通过的协议，再更新应用依赖；不能发布 `file:`、`link:`、本地 module
augmentation 或镜像 wire schema。声明／调用能力前，消费者必须验证：

- 能力缺失／false 或远程数据授权缺失时不发送请求；无凭据授权时不读取、发送 Cookie。
- 页面加载／轮询不自动查询；拒绝过期 frame，以及端点切换、实例变化、页面导航、
  授权撤销后的请求。
- 重定向中执行 Cookie 作用域／有效期；argv、日志、持久化数据和缓存不含凭据。
  使用合成秘密测试。
- 未认证、非扩展、unary HTTP 调用均在抽取前被拒绝；非法或超大载荷也被拒绝。
- 功能关闭、程序缺失、不支持、不可用结果、取消和新旧版本组合遵守上面的规则。
- 既有配对、提交授权和构建版本／站点排除策略保持不变。

Motrix PR #2365 应替换本地 schema，按注册的 handler 声明能力，以带作用域的记录
传递 Cookie，移除全局 Cookie 头和原文 Cookie 缓存键，并在返回前解析结果；目前
可用空列表的情况应改为不可用。先规范化抽取器元数据：过滤 100–4320 之外的高度，
限制标题长度，省略不合法的 fps／ext／size。旧 lister 会接受低于 100 的高度，而
既有提交解析器本来就不能选择这些 key。只有存在可下载音轨且支持转换时才添加 MP3，
不能只检查是否安装 FFmpeg。新方法除了认证，还必须检查 `isReady()`，并测试尚未
收到 `motrix/initialized` 时的拒绝；无需顺带修改其他方法。
扩展 PR #56 应使用发布类型，并按明确操作、能力、
当前授权控制查询，保留独立的站点排除与浏览器验证的 frame 身份。

[MIT](../LICENSE)
