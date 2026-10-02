# 下载交接 v1

本文定义本次新增、需要显式协商的协议。SDK 提供 schema、强类型 RPC 方法和载荷规范编码，不实现持久账本、浏览器控制器或下载引擎。服务端必须实现并验证以下持久化和故障要求后才能宣告支持。已有 `download/submit` 行为保持不变。

## 协商与范围

已认证扩展只有在 initialize 返回以下能力时才能调用：

```json
{
  "capabilities": {
    "downloadHandoff": {
      "version": 1,
      "instanceId": "c2b6a2d2-430c-4bc1-bdb0-c10f35004c90",
      "maxPreparedTtlMs": 30000
    }
  }
}
```

缺省表示不支持。四个处理器及持久激活路径都就绪后才能宣告能力。这些方法仅供扩展使用，不进入 agent 工具目录，不通过 unary HTTP 暴露。`agentFacing: false` 不构成鉴权；传输层须独立认证主体，不能信任 initialize 中自报的身份字段。下载前询问由扩展负责，prepare 前冻结用户选择，Motrix 不重复询问。

v1 仅支持直接 HTTP(S) GET。POST、请求体、blob URL、媒体解析、HLS、DASH、mux 和 magnet 不在交接范围。嵌套请求 schema 严格拒绝未知选项，不能悄悄把请求降级为 GET。合法 URL 不代表有访问权限，仍须遵守宿主策略。浏览器已打开的响应无法转交引擎；交给 Motrix 后仍需另一次请求，不能保证一次性链接可重放。

## 身份与载荷

每次请求包含 `{ instanceId, operationId }`，两者均为 UUID。操作按**持久账本实例 + 已认证主体 + operationId** 区分，不按 URL、连接、标签页或自报扩展 ID 区分。同 URL 的两次点击使用不同 ID；重连和重试沿用原 ID 及冻结的载荷。发送变更前先持久化操作标识、已认证后端绑定和确认状态。不得把未决操作迁移到另一个后端或凭据身份。

`instanceId` 标识一代持久账本，普通重启保持不变；账本丢失、重置或恢复到旧快照时必须更换。所有方法在产生任何作用前核对它，不匹配时返回 `HandoffInstanceChanged`（-32007）。客户端必须将旧操作保持为未决状态；新实例不能证明旧引擎从未启动任务，不得自动新建替代操作。

prepare 的 `download` 复用 submit 的来源、元数据、可选 `saveDir`，仅允许 direct selection，不包含第二个幂等键。`canonicalDownloadHandoffPayload()` 先校验并补齐 schema 默认值，递归按 UTF-16 编码单元排序对象键，保持数组顺序，再按 JSON 字符串／数字规则编码。对结果的 UTF-8 字节计算 SHA-256，得到小写 64 字符 `payloadHash`。这是 MDXP 专用编码，不宣称是通用 JSON 规范化；不能另行归一化 URL 查询、请求头名称或 Cookie 顺序。重试时连同时间戳一起冻结。

服务端自行计算摘要，与预留任务 ID 一起保存。同 ID 内容不同则返回 `HandoffPayloadConflict`（-32008）。客户端核对回复中的操作标识及摘要，commit 必须携带同一摘要。载荷可能含 Cookie、认证头或签名 URL，不得记录到日志。摘要是关联值，不是秘密或鉴权凭证。

## 方法与结果

| 方法 | 参数 | 可能的结果状态 |
| --- | --- | --- |
| `download/handoff.prepare` | 操作标识 + `download` | prepared、committed、aborted、expired |
| `download/handoff.commit` | 操作标识 + `payloadHash` | committed、aborted、expired、not-found |
| `download/handoff.status` | 操作标识 | prepared、committed、aborted、expired、not-found |
| `download/handoff.abort` | 操作标识 | aborted、committed、expired |

所有结果回传操作标识。prepared 额外包含预留 `taskId`、`payloadHash` 和服务端 Unix 毫秒时间 `expiresAt`；committed 包含相同任务 ID 和摘要；其他结果只包含标识和状态。committed 表示持久接管和激活意图，不能解读为下载完成；之后的任务失败由 Motrix 处理，不能触发浏览器重放。任务删除或失败也不能让交接记录消失或被复用。

prepare 只做本地校验并持久化未激活记录，不得探测或请求下载源、调用 URL 解析适配器、启动引擎或排入可执行任务。省略目录时，将当前默认目录解析为具体允许路径，独立于原载荷摘要冻结在记录中；默认目录之后改变不能改写目的地。commit 前再次检查权限和冻结路径，拒绝时保持未激活，不能静默替换目录。服务端选择的有效期不超过当前时间加 `maxPreparedTtlMs`；重复 prepare 不延长有效期、不更换任务 ID。

同一操作上的所有方法和到期处理必须在同一个持久事务范围内串行化。达到 `now >= expiresAt` 时，未提交记录变为 expired，不可再提交。不能只在 RPC 接收时检查时间，必须在事务串行化边界内再次检查；崩溃恢复不能赋予过期记录新的有效期。

| 当前状态 | prepare（相同载荷） | commit（相同摘要） | abort | status |
| --- | --- | --- | --- | --- |
| 不存在 | 持久化 prepared | not-found，无作用 | 持久化 aborted 终止记录 | not-found，无作用 |
| prepared，未到期 | 原 prepared | 持久化 committed 和激活意图 | 持久化 aborted | prepared |
| prepared，已到期 | 持久化 expired | 持久化 expired | 持久化 expired | 持久化 expired |
| committed | committed | committed | committed | committed |
| aborted | aborted | aborted | aborted | aborted |
| expired | expired | expired | expired | expired |

只要记录已有摘要，载荷／摘要冲突必须在修改前被拒绝，终态也不例外。在 prepare 之前创建的终止记录没有载荷；后来任何 prepare 都返回 aborted，不能再绑定或启动任务。abort 对不存在的操作也必须建立此持久记录。status 的 not-found 只是当时的观察，仍可能有延迟到达的 prepare 或 commit，不能作为重放许可。

commit 必须在回复前原子持久化账本变更、任务和激活 outbox／意图。可恢复的引擎调度器在崩溃后重试激活前，必须通过稳定的任务／引擎身份核对状态。内存 Promise 缓存，或只覆盖账本的数据库事务，都不满足要求。这不等于网络传输“恰好一次”：浏览器取消、引擎与下载源仍是不同的边界。

终态可压缩为标识、状态及适用的任务 ID／摘要，但在该实例的整个生命周期内必须继续去重，不能因 URL TTL 或缓存压力而驱逐。回收整代账本时，先阻止旧会话继续写入再轮换实例；历史任务仍可能存在，客户端不得重放旧操作。容量不足必须明确拒绝新的 prepare／abort 修改，不能在终止记录尚未持久化时回复成功。

## 浏览器归属与恢复

1. 扩展等待用户确认时，由浏览器适配器控制原请求。“用浏览器”继续原响应，明确取消则停止它。适配器失去挂起控制权时草稿同步失效；UI 有效期不能被当成浏览器能一直挂起的保证。
2. 冻结选项并保存操作绑定，然后 prepare，校验准备回复。不能仅因为已发出请求或传输返回就取消原浏览器下载。
3. 停止原浏览器传输，核实适配器结果，将证据持久化后再 commit。停止失败或结果不明时不得 commit，应尝试 abort，不能通过重发浏览器 GET 掩盖不确定性。
4. 一旦 commit 可能已经发出，超时、EOF、无效回复均属于未知结果。只向同实例、同主体重连并查询原操作。abort 返回 aborted／expired 才构成持久阻断；committed 归 Motrix。abort 回复丢失也仍属未知；not-found 本身不足以阻断迟到消息。
5. 恢复草稿不能新建操作，也不能假装重新获得已丢失的 blocking Promise 控制权。配置／后端切换使当前 UI 操作失效；恢复时可查询或撤销原认证后端的操作，但不得向新选中的后端发送旧 commit。

`$/cancelRequest` 仅取消 RPC 等待或协作执行，不建立 abort 终止记录，也不能回滚已提交任务。普通任务取消是另一个动作。包括 InternalError 在内的错误本身不能证明修改是否已提交，必须按原操作恢复。可能已经发送交接修改后，不得降级调用旧 `download/submit`。

## 服务端宣告能力前的验收要求

以下是模拟器和真实服务端必须满足的集成要求。本包的 schema 和内存 RPC 测试不能证明持久化保证。两者应使用相同场景及命名屏障，独立观察账本、引擎激活和源站 HTTP 请求。

| 故障／场景 | 必须观察到的结果 |
| --- | --- |
| prepare、重复 prepare | 一个未激活记录／任务 ID，无源站请求和引擎操作，不续期 |
| 不同载荷或 commit 摘要 | 冲突，无新增激活；已提交后仍如此 |
| 相同 URL，不同操作 ID | 独立记录 |
| 不同认证主体 | 无法访问另一主体的记录 |
| abort 先于延迟 prepare／commit 到达 | 持久终止记录阻止迟到消息激活 |
| commit 在与 abort 的竞争中先完成 | abort 返回同一已提交任务，只有一个激活意图 |
| commit 事务完成后回复丢失 | 查询／重试返回同一任务和摘要，不重放浏览器下载 |
| 引擎已接受激活但确认前崩溃 | 根据稳定身份恢复，无第二个任务 |
| prepare 在途而 status 为 not-found | 不自动回退；abort 阻断迟到 prepare |
| commit 时刚好到期、到期后重启 | expired 终态，无激活、不续期 |
| 重置／恢复导致账本丢失 | 更换实例、拒绝旧请求，旧客户端结果保持未决 |
| 磁盘满／事务回滚 | 记录、outbox、终止记录未持久化就不得回复成功 |
| 浏览器原请求取消失败或不明 | 不 commit，不发替代 GET |
| 配置／后端变化、扩展重启 | 旧 UI 不得提交，不能跨实例重放 |

服务端和浏览器集成通过上述检查前，保持能力字段缺省。安装本协议包本身不启用也不认证应用支持。
