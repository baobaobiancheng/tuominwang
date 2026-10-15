# 架构、静态依赖与发布交付独立复核计划（2026-10-15）

## 固定基线与边界

- 工作树：`complete-porting-20261014`，当前提交 `5cee048`；大量未提交更改是本轮候选，不重置、不清理、不覆盖其他 agent 文件。开始每项复核时重新记录所读文件 SHA256，避免把旧报告的哈希当成当前证据。
- 竞品只使用已取得的 0.5.9 公开发布代码。258 个稳定 ID 的运行状态继续为 R0；不绕过激活，不请求订单、签发或恢复私有服务。C 覆盖 196 ID，另外 62 ID 由 A/B/主审合并。
- 本计划只组织只读审查。子任务不改产品、`ledger.json`、生成台账、发布候选或服务器；不读密钥值，不 SSH、不部署、不启动占端口服务或模型。若发现缺陷，提交精确复现和补丁建议，由主审决定修复与门禁。
- 报告区分公开客户端静态证据、原生系统/私有服务 leaf、我方实际执行、未执行与发布 readback。现有 `source-finite-closure-C-20261015.json` 的 196 行、72 个新/重联节点、835 旧片段零差异，是待独立核验的声明，不自动视为逐项验收。

## 子任务 1：C 的公开有限图与 leaf 独立核验

输入：`source-finite-closure-C-20261015.{json,md}`、`.data/research/lawbot-2026-10-15/iteration037/source-static-C/final-handoff.json`、其引用的 0.5.9 提取文件和旧证据报告。逐行枚举 196 个稳定 ID，重算 `newNodes` 72 个节点的整文件/范围 SHA256，并抽核或完整重算 835 个旧精确片段；明确字节 offset、UTF-16 offset 与 1-based 行范围的差别。逐条检查 `newOrRejoinedNodeIds`、公开 producer→handler→consumer 边和 `remainingPublicUnreadNodes`，不得用 AST 定位代替语义闭合。

重点反例：`IPC-540edc231d28` 等协作链、`IPC-0e93232c5223` 的 consume-open-job 后续消费、关闭前保存与取消、Windows WMI/CIM/registry 机器标识、Mac LAContext、`HTTP-a71a256b3205` 的 updater 与 ASAR 87 文件。公开 `auth_helper` 指令不得归为私有不可得；系统调用实际结果、签发端、外部 AI 宿主和安装运行仍标 leaf。六个退役 learner 不得推断为训练能力。

交付：一张按稳定 ID 的差异表，每条差异给源路径、行/offset、原始 SHA256、复算 SHA256、调用边、缺失节点或 leaf 类型、可复现命令；零差异也记录覆盖计数。S3 只建议确切满足条件的 ID，保留 R0，不能按功能域批量升级。与 A/B/主审的 62 ID 在最终交叉审时按 ID 去重。

## 子任务 2：037 自动补录投递的真实实现对抗审

输入：`apps/api/automatic-runtime-rules.ts`、`packages/adapters/automatic-runtime-rules.ts`、`apps/worker/main.ts`、`packages/adapters/processing-worker.ts`、`packages/adapters/processing.ts`、`packages/adapters/runtime-rules-control.ts`、桥接调用者、`scripts/037.sql` 和 `tests/automatic-runtime-worker.integration.ts`；路径以当前仓库实际文件为准。先固定当前 SHA256 与关键函数行范围，再按 parent event→已认证 API→加密临时投递→同 generation worker drain→实际识别结果跟踪。

对抗矩阵：任务尚未进入 accepting、窗口内同步/异步投递、最终 `FOR UPDATE` 关闭与并发投递、`delivery_seq` 确定排序；旧 generation、租户/项目/用户/文档不符、revision/hash 不符、租约过期与重试；撤权后的窄范围 `SECURITY DEFINER` 清理；成功、失败、取消、worker 中断后的密文和事件回收。验证临时自动名单不落 `runtime_whitelists` 持久表、不冒称重新识别或持久白名单。

交付：每一风险对应代码范围/SHA、数据库条件、请求与响应、任务与事件最终状态；能安全在隔离数据库复现时给实际运行证据，否则明确“静态推断”。目前作者的 1 项真实 worker 集成通过只作为基线，不能替代其余竞争与撤权反例。若需要重跑门禁，由主审统一协调资源和时间。

## 子任务 3：037 发布包、隔离、回滚与旧证据保全审

输入：`.data/deploy/aliyun-20261015/iteration036/{refresh-release.py,prepare-compose.mts,release/deploy-server.sh,release/verify-release.py}`、当前 compose 模板、`scripts/037.sql`、候选 manifest/镜像证明、旧部署快照及 `handoff-visual-runtime-review-B.json`。先记录文件和候选 SHA；旧 B 报告的 036 hash 只用于历史对比，不移植为 037 结论。

核对 release manifest 的 `sourceGitHead`、工作树实际源码 hash、schema 037 与镜像/服务版本闭环；检查运行时只升级本项目 api/web/worker/migrate/admin 和内部 legacy converter。compose 对比必须证明公网绑定、旧网络/卷、WeKnora/Semantica 等邻居容器、CPU/内存上限和模型启动加载未改变。`DATA_KEY` 仅按既定迁移入口使用；converter 无密钥、DB、模型挂载，`init:true` 在完整 compose 与 fragment 一致。核查 worker ready、稳定观察、镜像 ID、restart count、源码/served asset hash、邻居状态及失败路径 readback。

对回滚逐步推演：迁移前备份、worker 停止与队列租约、迁移后失败的兼容性、旧镜像回切、额外 schema 保留、不可逆数据条件和失败退出码。盘点旧 evidence pin 的原字节与 SHA，说明哪些历史截图或产物已丢失，禁止以重生文件声称原证据恢复。

交付：可审计的发布/回滚差异表与精确代码行/SHA、离线验证命令及其结果、上线前缺口清单。线上仍为 023，任何部署或线上 readback 均由主审执行；本任务不使用 SSH 或读取 secret 值。

## 汇合规则

三个子报告统一给出：稳定 ID（涉及竞品时）、源范围与 SHA、静态/实际执行标记、复现步骤、结论与尚缺的证据。主审收到后先交叉审兄弟报告，再决定台账逐项合并、037 后 fresh `pnpm check`/隔离测试/浏览器验收、私库同步、发布和线上验证。未完成这些门禁前，不宣称逆向全完成、功能等价或发布完成。
