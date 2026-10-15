# 第三组架构、静态依赖与发布交付交叉复核（2026-10-15）

## 结论

三个 Luna 均按任务完成第一轮只读复核。C 的 196 个稳定 ID、72 个新/重联节点、835 个旧精确片段和 ASAR updater 87 个文件经独立重算均无 hash 差异；这仅支持公开 0.5.9 客户端有限静态图，竞品运行仍全部 R0。**哈希通过不等于 196 个 ID 可升级 S3**；统一台账当前仍是 258 个 S2。037 自动补录投递发现终态密文回收缺口，主审已在新增 `scripts/038.sql` 中实现终态触发器及一次性历史 sweep。隔离库 3 项测试覆盖生产调度器撤权/重试耗尽、app 角色取消/成功、producer 与最后 drain 的两个锁顺序，以及模拟 037 旧终态密文后的实际 038 SQL 清理。发现者已独立复核；测试没有真的强杀生产 worker，也不是目标持久库升级。

发布脚本和 compose 只有静态候选，当前没有完整 release manifest/包、镜像、目标机迁移、线上 hash/readback 或回滚实演。Luna3 发现旧邻居状态检查只匹配 `weknora-semantica-` 前缀；主审已改用 `neighbor-state.py` 枚举目标 Compose project 以外的全部 Docker 容器，并在 build 前与成功后比较最小状态。目标机 Python 3.6 兼容修正后，helper 已在目标机实际只读运行并观察到 5 个非目标容器；发布前后差异和不受影响结论仍待发布后读回。

## 交叉核验与证据

| 项 | 独立结果 | 仍有限制 |
|---|---|---|
| C 有限静态图 | [Luna1 报告](team-sol-architecture-luna1-20261015.md)：196/196 ID 唯一、72/72 节点 hash、835/835 旧片段、87/87 ASAR offset/hash；公开 auth helper、updater、协作消费与关闭链未见新差异。 | 其余 62 ID 归 A/B/主审；系统/私有服务和合法授权运行是明确 leaf/R0。 |
| 037 临时投递 | [Luna2 报告](team-sol-architecture-luna2-20261015.md)：原 `scripts/037.sql:27-35` 在撤权和 attempt 3 终态缺清理；旧 worker `finally` 无法覆盖进程消失。 | 038 已修并由发现者独立复核；真实 SIGKILL/断电和线上运行未测。 |
| 038 修复与旧数据 sweep | `scripts/038.sql` 当前 SHA256 `ef4e7715466ecc469ee1714385b3b79c8514973b1daa050693ca2c3ff2690f85`：固定 `pg_catalog,public`、SECURITY DEFINER、REVOKE PUBLIC 的终态 trigger；第 17–20 行在迁移事务中关闭既有终态窗口并删除其全部遗留投递，不碰 queued/running。`automatic-runtime-terminal.integration.ts` 当前 SHA256 `d6cb7f5f07664ac78a083c882f19db3ab26622fea98af77c4c644f57f9641b82`；[实际 sweep 回执](../../../.data/research/lawbot-2026-10-15/iteration037/automatic-runtime-migration-sweep-actual.json) 自带运行前 037/038/API/adapter hash。 | 隔离库 3 PASS/6.50s：旧终态删 1，活跃保留 1 且可认证 drain。没有真实独立 037 旧库快照、生产 worker SIGKILL 或目标持久库读回。 |
| 发布与隔离 | [Luna3 报告](team-sol-architecture-luna3-20261015.md)：converter `init:true`、无 DB/host port/模型材料密钥挂载，端口/旧卷/资源上限/模型启动静态未变；旧 B 的三个脚本 pin 已过期。 | Luna3 审查时 release 尚未刷新；部署/rollback/readback 未执行。 |
| 邻居证据修正 | 当前 `release/neighbor-state.py` SHA256 `a2f3db04885f19f8855596ff307b23a5cd8dc83d3bb8c1b0aefaafdf8030462e`；`deploy-server.sh` SHA256 `9cdea68ac77b34a04c98f294ac00d8577929500a8ba5e2a59b06ea526ec625f1`。脚本在 build 前枚举全部非 `tuominwang-aliyun` Docker 容器，成功后重新枚举并比较 ID、restart count、启动时刻、running、health；不读取 env。目标机 Python 3.6 已实际执行 helper 并只读观察到 5 个邻居。 | 发布前后完整清单及差异仍待执行；helper 单次运行不能证明邻居未被部署影响。 |

## 逐 ID 静态深度边界

[本组独立 196 ID 语义合并](team-sol-architecture-C196-independent-join-20261015.md)与同名 JSON 将每一行按稳定 ID 分为：**162 个有界公开链闭合、0 个可命名的未读公开节点、19 个原生/外部执行叶、15 个私有服务叶**。162 项只建议限定公开 endpoint、store、producer→handler→consumer、显式异常和已声明叶范围的 S3，统一台账仍为 258 个 S2，最终采纳由主审决定；所有源运行仍 R0。

162 项由 90 条 merge-only、15 条原候选、56 条协作和 `IPC-0e93232c5223 ai-collab:consume-open-job` 组成。90 项的入口、方法、返回、失败与副作用由 [Luna1 逐 ID 合并](team-sol-architecture-merge90-20261015.json)复核；15 项的限定范围由[候选报告](team-sol-architecture-s3-candidates-20261015.json)复核。两个缺 renderer caller 的 endpoint 经 115 项 UI 入口盘点、39 个 generic invoke、14 个 literal channel、preload/main 注册交叉核对，仅作为本版 endpoint 合同；不捏造调用者。退役 learner 常量不是隐藏学习，MCP capability 固定描述不是实时许可。

56 条协作经本组再次查 `deep-collaboration-source-index.json`：所列 129 个不同 `qw`/`cx` 等 public 方法均有方法体范围与 SHA-256，MCP tools、Gateway 分派、DSH 工作区交稿链也已读到具体生产者、消费者和 throw。此前 `selected findings` 非穷尽、25 条通用格式标签都不是逐 ID 的具体未读公开子节点；本轮没有发现可命名的遗漏。`consume-open-job` 原泛格式 pending 已与 [规则 35](team-sol-rules-static35-join-20261015.json)中的 `register-source`/`release-sources` 和[视觉 21](team-sol-visual-static21-join-20261015.json)的格式/OCR 图相接。导入失败清理和源注册/释放的部分失败仍按精确合同记录，不把静态闭合解释成执行正确或格式全等价。

19 个 native/updater/窗口/本地 HTTP 与 15 个激活、恢复、支付私有服务行保留完整语义 S2。公开 `auth_helper` 已读，不能误称私有；私有 issuer、OS、第三方库和合法授权运行仍是叶。其余 62 行由规则组 35、视觉组 21、主审 UI 6 的逐 ID 图负责，本组只引用证据指针。C 的 72 新/重联节点、835 旧片段和 ASAR 87 项 hash 核验只证明证据身份，不能单独推出语义闭合。

## 修复后的迁移边界

038 现在同时覆盖未来终态更新与升级时已终态的旧投递。Luna2 复核的隔离测试先以真实 API 写 AEAD 密文，再暂时撤掉触发器造出旧终态，显式执行实际 038 SQL：旧行从 1 到 0，活跃行保持 1 且仍可认证。该回执限定在隔离数据库；目标持久库升级前后存量读回、全表 sweep 锁时间、真实进程强杀与回滚仍待主审验证。最初缺口、修复前报告与原字节快照均保留，不能覆盖历史证据。

## 最终门禁给主审

1. 冻结当前源码与 schema 037/038 文件 hash，执行 fresh `pnpm check`、隔离 API/worker 和 Edge 全量门禁。产品 UI 新 CSS 的 Edge 截图由视觉组与主审核对。
2. 冻结后生成完整 release，校验 manifest 全文件 hash、schema 038、镜像内容/源码/版本闭环和候选 compose；旧 `sourceGitHead=5cee048` 不能单独证明当前未提交文件。
3. 由主审按既有授权执行发布，逐项读回 API/web/worker/迁移、模型和全部邻居容器状态；检查旧字节 pin 保留并按真实结果记录回滚。线上 023 或候选 036 标签均不得冒充本轮已上线。

本组没有改产品、台账、服务或服务器；只新增计划和复核报告。稳定 ID 合并、台账维护与最终验收由主审在全部门禁完成后逐项处理。
