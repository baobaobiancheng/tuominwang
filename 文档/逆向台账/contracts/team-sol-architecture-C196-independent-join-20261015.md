# C 组 196 稳定 ID 独立语义合并（2026-10-15）

范围是公开 0.5.9 发布包的有限静态合同。逐 ID 机器可查结论、源范围和 SHA-256 在同名 JSON。未执行竞品；258 项源运行一律 R0，统一台账仍为 S2，本报告不写台账。

| 分类 | 数量 | 结论 |
| --- | ---: | --- |
| 有界公开链闭合 | 162 | 90 个 merge-only、15 个原候选、56 个协作接口、1 个 `ai-collab:consume-open-job`；逐 ID 建议限定范围 S3，待根采纳。 |
| 具体未读公开节点 | 0 | 本轮没有找到能命名为 `caller → child` 的遗漏；不能把旧报告的通用“格式待核”当作 25 个具体缺口。 |
| 原生或外部执行叶 | 19 | Electron 窗口、电源、updater、下载/本地 HTTP 的公开控制代码已读；OS、updater 执行及网络服务保持叶，完整语义保守 S2。 |
| 私有服务叶 | 15 | 激活、恢复、支付的公开客户端和请求/响应已读；私有 issuer/service 不可见，完整语义保守 S2。公开 `auth_helper` 不归入私有代码。 |

## 合并依据

- **90 个 merge-only：** 逐 ID 复查了 [merge90](team-sol-architecture-merge90-20261015.json) 的入口、handler、消费者、输入、返回、失败与副作用，接入原 `deep-system`、`deep-processing`、UI 等精确 ID 图。`app:consume-open-path` 是一次取空的 `.tmm` 冷启动槽；`auth:set-password` 接到本地密码/CMK 写入；`net:*` 只覆盖 Electron `defaultSession` 拦截，不能推断全进程网络计数。S3 只表示各自有界合同，不含外部叶的实际结果。
- **15 个原候选：** [逐 ID 候选报告](team-sol-architecture-s3-candidates-20261015.json) 的 15 个有界结论保留。六个 learner 接口限于已注册返回/常量/废弃行为；`rollback-previous` 未暴露 preload；`preference:record-successful-export` 是偏好状态记录，不是导出完成证明；MCP capability 是固定描述，不是许可运行证明。`preference:set-default-profile`、`profile:duplicate` 已穷尽当前发布版 renderer/preload/main 和通用桥静态调用，不凭空要求 UI 调用者。
- **56 个协作 ID：** [逐 ID 协作图](team-sol-architecture-remaining-ids-20261015.json) 的本地入口，与 `deep-collaboration-source-index.json` 的 **129 个不同 `qw`/`cx` 等 public 方法体**逐键相连；129/129 有范围及 hash。`main.js:24381–24458` 注册/主窗口限制，`main.js:24135–24168` Gateway 分派和错误映射，`main.js:23151–23795` 作业、槽、提交、恢复状态，`main.js:23979–24120` 本地索引/持久化及异常，MCP `tools.js:203–330` 和 DSH `bridge.js:40–170` 的生产者/消费者均已核。逐 ID 记录输入、成功投影、方法链、显式 throw 与文件/外部叶。旧 `selected findings` 非穷尽是审查过程说明，不能单独构成逐 ID 公开缺口。
- **`IPC-0e93232c5223` 消费作业：** `main.js:24436–24439` 一次取空 → `renderer.js:30810–30945` 的 `le2` → `renderer.js:36387–36455` 的 `Kg2` → `renderer.js:31552–31567` 的 `Nn2`。成功的路径须取得 sourceRef，失败通过 `aiCollab.fail(IMPORT_FAILED)`；部分导入失败尝试释放本次新建 sourceRef。注册/释放的 handler、preload、UI 与异常边由 [规则 35 逐 ID 合并](team-sol-rules-static35-join-20261015.json) 的 `IPC-8f1caa190dda`、`IPC-d9b14aa97589` 接上；PDF、图片、OCR、格式相关公开边由 [视觉 21 逐 ID 合并](team-sol-visual-static21-join-20261015.json) 接上。这使原候选的泛格式 pending 不再是具体未读公开节点；源格式执行、OS 文件和许可运行仍是叶。

## 重要边界

`register-source` 的 sourceRef 不是永久内容寻址：源路径恢复可重新复制并清空旧 hash；登记中途 I/O 异常的孤立临时文件清理未证。`release-sources` 先移除 registry，`provider.close` 抛错可中断后续清理；UI catch 返回 0 不代表回滚。这些是已读失败合同，不以“闭合”宣称它们正确或与浏览器实现等价。MCP/DSH 宿主 `ctx.fs`、外部工具、网络和私有服务为明确叶，不能假装已读其内部。

原 C 的 72 个新/重联节点与 835 个旧精确 slice hash 核验说明**证据身份**；本结论另逐 ID 合并生产者、handler、消费者、异常和叶。没有绕过激活，也没有将任何源运行升级到 R1。
