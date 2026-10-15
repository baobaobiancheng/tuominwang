# C 组 S3 候选语义复核（Luna1，2026-10-15）

## 结论

对 C 报告中的 16 个 `suggestedStaticDepth=S3` 候选逐项追了 IPC/MCP 入口、handler、公开业务调用、错误处理和副作用。15 项可建议**限定到已读 endpoint/storage/constant-response 合同**的 S3；1 项保留 S2，因 sourceRequest 文件导入进入委托的 Kg2/格式链，端到端副作用尚未合并。所有竞品运行仍为 R0。

| 稳定 ID | 方法 | 建议 | 语义判定 |
|---|---|---|---|
| IPC-0e93232c5223 | ai-collab:consume-open-job | 保留 S2 | 一次性 slot 与 renderer `le2` 消费已读，但 sourceRequest 文件导入进入委托的 Kg2/格式链，端到端副作用尚未合并。 |
| IPC-8018ac372ad7 | learner:get-high-confidence-memory-count | 限定 S3 | 固定返回全零；renderer 只计算 `max(0,count-lastSnapshotMemoryCount)`，并吞掉异常；无训练副作用。 |
| IPC-ca4c19558c55 | learner:get-snapshots | 限定 S3 | 固定返回空数组；preload 暴露、无 renderer 调用点。 |
| IPC-caef950fe9a5 | learner:rollback | 限定 S3 | 固定返回退役提示；无回滚副作用。 |
| IPC-7fb83198252b | learner:rollback-previous | 限定 S3 | main 注册固定拒绝；preload 未映射该 channel，也没有 renderer caller，记录为不可达兼容 handler。 |
| IPC-43e13058e656 | learner:rollback-to-previous | 限定 S3 | 固定返回退役提示；preload 暴露、无 renderer 调用点；响应形状不同于 `rollback`。 |
| IPC-2c55a1969fb8 | learner:update-rules | 限定 S3 | 固定返回 `{success:true,stats:null,rulesetHash:""}`；无规则更新副作用。`get-stats` 是独立 handler。 |
| IPC-7b3025225249 | preference:record-successful-export | 限定 S3 | 仅校验 `state.kind===kind` 并持久化 caller state；不校验文件收据或 kind 白名单。三个格式的导出路径会调用，记录失败被吞掉。 |
| IPC-3d307eb4bc00 | preference:set-default-profile | 限定 S3 | renderer 调用未定位；专用 preload `profiles.setDefault` 与 handler/store/JSON 写入合同闭合。115项 UI 盘点和39处动态桥分析表明无调用未与14个动态字面通道冲突，记为本发布包未定位 renderer 入口的有限 endpoint。 |
| IPC-0b6b223f384f | profile:create | 限定 S3 | ProfileManager 新建按钮调用。store 校验名称/配置，生成 ID 和时间，写 profile 后写 index；两次文件写之间可能部分失败。 |
| IPC-7e8602707608 | profile:delete | 限定 S3 | ProfileManager 删除确认调用。区分用户 profile 删除与系统 profile 隐藏；默认项会重置，system-default 不允许删。 |
| IPC-271b4728636e | profile:duplicate | 限定 S3 | renderer 调用未定位；专用 preload `profiles.duplicate` 与 handler/store、重名后委托 create 的合同闭合。115项 UI 盘点和39处动态桥分析表明无调用未与14个动态字面通道冲突，记为本发布包未定位 renderer 入口的有限 endpoint。 |
| IPC-ddc5ff507c75 | profile:get | 限定 S3 | ProfileManager 选择/初始化及协作设置路径调用。读取可能执行兼容迁移并重写文件，随后返回深拷贝。 |
| IPC-92e8c95a136b | profile:list | 限定 S3 | ProfileManager refresh 调用。无效 user profile 会被略过并修正 index；返回摘要列表与 preference 副本。 |
| IPC-59456f319530 | profile:update | 限定 S3 | ProfileManager 保存调用。只允许用户 profile，保留 createdAt、更新时间、迁移/校验配置并原子写文件。 |
| MCP-8fb696cd0f36 | get_lawbot_capabilities | 限定 S3 | 空参数、read-only tool，返回固定能力对象，不发 gateway RPC；MCP server 封装 response/error。它不是实时授权或安装能力探测。 |

`限定 S3` 仅覆盖表述中列明的公开方法/持久化/固定返回合同，不代表格式处理完整、实现等价或运行通过。全部 16 项逐 ID 的源范围、原 hash 与复算 hash、节点和 leaf 在 [JSON 明细](team-sol-architecture-s3-candidates-20261015.json) 中。

## 共享源码依据

| 语义范围 | 源路径与行范围 | Range SHA256 |
|---|---|---|
| learner handlers，含独立 get-stats 边界 | `.data/research/lawbot-2026-10-13/readable/main.js` 18179–18186 | `380f20eedfdcdff48eab7ddcc0d6c1f3a09e3d48e60fb6583f3aac828ae92d87` |
| learner preload 映射 | `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js` 214–222 | `eae112420820521cf9e493c89d55e3c76a00cf0f2d36b1f812a342897f760cf8` |
| 唯一 learner 常量消费者 | `.data/research/lawbot-2026-10-13/readable/renderer.js` 8769–8778 | `e774d8c5e1a49c938c551d11794cb9f749ec8a8e7b7223096af911d45a54ceae` |
| profile schema validation | `.data/research/lawbot-2026-10-13/readable/main.js` 18927–18973 | `90967fe3a9060b8a5a5dee4cfc2c55b7c1df1cc6b027f327477f44cfcb104fac` |
| profile store、迁移、CRUD 与 preference 写入 | `.data/research/lawbot-2026-10-13/readable/main.js` 25930–26078 | `80b9be2b0567316b2399fe72074357278d22c325a3791b7d5176dd12390dc70e` |
| profile/preference IPC 与 DI error mapping | `.data/research/lawbot-2026-10-13/readable/main.js` 26881–26931 | `103b20b91ac168990b0e4ea0835ec164a4d4a2352bcca658e5390cfc1df70a09` |
| profile preload bridge | `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js` 103–112 | 见 JSON `sharedEvidence.profilePreload` |
| renderer profile store callers | `.data/research/lawbot-2026-10-13/readable/renderer.js` 29192–29245 | `4ae033fe5e7518ffef35e4cc499b7a6596f5c78bd5c4323931cc30671f727e96` |
| capability tool declaration / fixed return | `.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/tools.js` 172–175、203–218 | `bd234849cca2cad2e7e40361348d433de941442bab0cfa5921a4d5c788ff3944` / `f4a2656b034f9b06722d72f9e14701ae535f833e93a9097307fba65843766abc` |
| MCP server call/error wrapper | `.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/server.js` 51–61 | `59bf8d5b8c4e274614a02ce6d1ee614acd027f7b481a18d51f0be3f79d43d220` |

完整协作路径的精确 hash 继续引用 `C037-COLLAB-PRODUCER`、`C037-COLLAB-LE2`、`C037-COLLAB-DEFER`、`C037-RESTORE-QUEUE`；逐项路径/range/hash 在 JSON `sharedEvidence` 和候选原始引用中列明。各原始引用 hash 均按其坐标单位复算通过。

## 需要保留的边界

- `consume-open-job` 的 IPC handler 只取回并清空一次性 job slot。`le2` 的忙碌延期、授权与 profile/ruleset 应用、恢复队列、终态清理、sourceRequest 导入注册都已读；文档 import/recognition/export 的格式链在 A/B/root 图。合图前不对端到端调用闭合升级。
- learner handler 常量只能说明这些接口当前返回值和无副作用，不能反推增量训练、快照写入或回滚能力。`get-stats` 有单独读取旧 chunk 的实现，不能并入这六项。
- `recordSuccessfulExport` 名称强于其校验：main 只匹配 state 内 kind 并保存该对象。renderer 在 DOCX/PDF/image finalize 路径发起 best-effort 调用，但 API 不证明目标文件存在或内容成功写出。
- profile S3 仅说明本地配置 store 与 IPC 的闭合合同。配置随后影响的 DOCX/PDF/image/batch 处理链是下游，不因此获得执行或等价结论。
- `get_lawbot_capabilities` 返回硬编码连接器说明。字段列出的格式/模式并不是在线探测结果；外部 AI host 与其文件系统仍为执行边界。
