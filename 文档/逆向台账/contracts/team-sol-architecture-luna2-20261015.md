# 037 自动运行规则投递独立对抗审查（Luna2）

日期：2026-10-15。范围：当前工作树 commit `5cee048dd637aeac69fc30b5350c5494d9386c00` 加未提交候选；只读静态追踪并核读已有 API/worker 回执。本审查未运行测试、门禁或服务，没有改产品、测试或 ledger；仅创建本报告与配套 JSON。

## 结论

初审发现的终态密文回收缺口已由 038 trigger 与一次性历史 sweep 覆盖。新增实测先构造 037 时期“终态 job 仍有密文”状态，再在事务内执行真实 `scripts/038.sql`；旧终态投递读回 0，active job 投递仍为 1，且能认证 drain。它在隔离 DB 中模拟旧 schema 状态，没有真实 037 数据库快照或 SIGKILL 进程。此前版本字节快照为 `.pre038-sweep.md/.json`，旧文件 SHA 记录在本报告末尾。

其余已检查主链未确认新的缺陷：API 只向匹配的 running/lease-valid/accepting detect job 投递；producer 与 drain 对同一 job 行 `FOR UPDATE`，故窗口内竞争串行；drain 关闭窗口、删除并在事务内按 `delivery_seq` 排序验证；新 claim 增 generation、开新窗、删旧代；受限 SECURITY DEFINER cleanup 只定位当前 user/tenant 自有 job；交付是 AEAD 临时密文，不写持久 `runtime_whitelists`。这些结论是当前候选代码的静态结论，真实证据覆盖范围另列，不能外推为完整压力或崩溃验收。

## 发现

### RUNTIME-037-L2-001 — 037 中的终态密文回收缺口（已由 038 修复）

- **037 结论 / 影响：** `scripts/037.sql:27-30` 当时对撤权和最后一次 lease 过期只更新 attempts/jobs，delivery 清理只在 claim 新 generation 后运行。旧报告的控制流发现有效，但当时仅是静态复现推导。
- **038 修复：** 当前 `scripts/038.sql:3-15` 增加 `SECURITY DEFINER` trigger，固定 `search_path=pg_catalog,public`，对任何非 `queued`/`running` 状态设置 `runtime_rule_accepting=false` 并删除该 job 全代投递；`REVOKE ALL ... FROM PUBLIC`。jobs 状态枚举由 `scripts/001.sql:5` 限制为 queued/running/succeeded/failed/cancelled，trigger 对全部三种终态生效。trigger 与 status update 同事务，rollback 会一起撤销清理。
- **运行证据：** schema 038 实际测试先经 API 写入密文，然后不运行 processing worker/finally；生产 scheduler 覆盖 revoked 与 attempt=3 expired，app-role transaction 覆盖 cancelled/succeeded。四支均读回目标终态、`runtime_rule_accepting=false`、`temporaryDeliveries=0`，持久名单仍为 0。另实际覆盖 producer 先锁、close 先锁：前者 acknowledged=1/drained=1，后者 acknowledged=0/drained=0。
- **进程中断边界：** 这是真实 API、数据库、scheduler/trigger 与 app-role 事务路径；没有真实启动处理线程后 SIGKILL，也没有杀 worker 进程或模拟宿主机断电。测试自行声明 `processingWorkerKilled=false`，因此不能把它描述为真实 kill 验收。

### RUNTIME-038-L2-002 — 038 升级历史终态 sweep（已修复并实测）

- **修复代码：** 当前 `scripts/038.sql:17-20` 先把所有已终态 jobs 设为 `runtime_rule_accepting=false`，再删这些 job 的 deliveries。trigger 已先创建，所以 UPDATE 也会触发同 job 清理；随后 DELETE 作补扫。状态 predicate 只匹配非 queued/running job，不触碰 active job。当前 SQL SHA-256 `ef4e7715466ecc469ee1714385b3b79c8514973b1daa050693ca2c3ff2690f85`。
- **事务与 RLS：** `scripts/migrate.ts:8-34` 在同一事务内执行迁移并记录 schema version，失败会 rollback；集成测试也对真实 038 SQL 显式 BEGIN/COMMIT。历史 sweep 由 `MIGRATION_DATABASE_URL` 执行，属于迁移连接，不代表应用角色可越权全表清理。前一测试另由 scoped 应用连接执行 cancel/success，撤权分支经生产 `claim_job()`，覆盖 terminal trigger 通过其 SECURITY DEFINER 清理路径穿过 delivery RLS。
- **实测：** `tests/automatic-runtime-terminal.integration.ts:85-104` 先通过真实 API 建立 AEAD delivery，再移除隔离 DB 里的 038 trigger/function，并将旧 job 置为 failed，确认旧态 delivery 仍为 1；另建 running job 和 delivery。随后事务执行磁盘上的真实 038 SQL。读回旧 terminal=0、live=1、旧 accepting=false；对 live delivery 用认证 adapter drain，payload 仍有效。它模拟了 037 无 trigger 的历史状态，但没有启动另一套037数据库或读取生产既存数据。
- **范围限制：** worker 没有真实 SIGKILL；测试通过不调用 processing/finally 来建立 missing-finally 边界。迁移 sweep 的规模、锁时间及真实持久库迁移前后行数未测。

## 核验的控制与数据路径

| 环节 | 源范围及当前文件 SHA-256 | 静态核验 |
|---|---|---|
| 已认证 API、输入/源/版本校验 | `apps/api/automatic-runtime-rules.ts:23-39` — `a9652558a81684e736af88332991ecfa1d967b2a8356022b5a829469c99cf015` | `projectScope` 要求 `view_original`、`review`；检查 revision、canonical 内容 hash、source binding、mark span 和 selection。`audit-add` 固定 file scope；spot 不投递。响应声明 active-task-only。 |
| 活跃任务选择与加密入队 | `packages/adapters/automatic-runtime-rules.ts:6-15` — `511c7fa83ea32ab469a6973c3042de9274a0474fd624aee85853001a4a75f45a` | 条件限制 tenant/project/owner/detect/running/有效 lease/accepting/文档 revision/`job_authorized`；scope=file 限文档，project 只发给同项目、同 owner 的活任务。锁 job 行并在同一事务写 AEAD payload；AAD 绑定 tenant、project、user、document、job、generation、revision、source/content hash、delivery ID。 |
| 最后接收窗口、顺序消费 | 同上 `:17-23`；worker bridge `packages/adapters/processing.ts:65-81` — `11a81bb5ddf80e9c2ae6348798b5c76e2a95fad9a93cddc0315c9af44933b759` | drain 对 job 行 `FOR UPDATE`，再关 accepting 并 `DELETE ... RETURNING`；按 identity `delivery_seq` 稳定排序，逐条校验 binding、AEAD、payload hash 和字段形状。producer 查询与 drain 锁同一行，PostgreSQL 行锁使 close/insert 先后串行；静态上最后窗口后不能新入队。父线程把 worker 的 request 与 `eventWrites` 串行，待既有异步事件 callback 结束才读规则。 |
| worker 实际应用结果 | `packages/adapters/processing-worker.ts:200-215` — `964cf0bb9cd3f174c3fcc1902bf5a62f03eb11da82b3a54022f7bbbf79474f03`；`packages/adapters/runtime-rules-control.ts:1-20` — `a78ca8bd179ef64b2a7c1d916a948df01c29875a01e5460cb494b74ffeab4c5b` | 候选识别后读取一次临时规则，以 runtime-whitelist 来源合并成待审 marks；不会自动设为已批准。父桥接只回发当前 worker 请求 ID 的响应，超时失败关闭。 |
| Generation/retry/revoke | `scripts/037.sql:1-55` — `1be899fa1587f71ec29c180b6ed368a36fabe7452c57417fc340c003af6ee566` | claim 新代时 `generation+1`、`accepting=true`、删除旧代。cleanup function 限当前 app user/tenant 与自有 job，旧 generation cleanup 不会关闭新代；函数不返回 payload。问题只在调度器直接终结任务、没有新 claim 的分支。 |
| worker 结束清理 | `apps/worker/main.ts:74-86,149-166` — `17dfd38169070a0d5c61cc1ecf19688d2003eac6edd9e992181a37286318ff74` | 在已加载 doc 后登记 cleanup，检测成功/异常均进入 finally；若 worker 主进程突然消失，JavaScript finally 无法保证执行。异常后任务通常 queued 或 failed，再执行 cleanup；硬中断边界未被正常流程证据覆盖。 |
| 临时名单与持久名单 | `scripts/037.sql:2-20`、`packages/adapters/automatic-runtime-rules.ts:14-25` | 新表仅保存加密 payload/hash 并启用 FORCE RLS；自动队列代码没有调用持久名单 adapter。现有运行回执报告 `runtime_rule_deliveries=0`、`runtime_whitelists=0`。 |
| 终态回收增量与历史 sweep | `scripts/038.sql:1-20` — `ef4e7715466ecc469ee1714385b3b79c8514973b1daa050693ca2c3ff2690f85`；`scripts/migrate.ts:8-34` — `fb30518dda29b345d6184713add14ee65354fbdeceff37532f29c4764c4b93e8` | Trigger 清未来终态，migration sweep 清历史终态；迁移和 schema version 在同一事务。trigger 固定 search_path 且 REVOKE PUBLIC。实测迁移连接执行 SQL 后旧终态清零、active 行保留且可 drain。 |

## 已有真实 API / worker 证据

以下是本轮实际读取并重算的 **证据文件自身 hash**，不是运行时源文件 hash。日志和 JSON 不含执行时完整工作树 SHA/commit，因此它们与当前候选代码的绑定只能由相同测试路径及报告作关联，不能称为密码学构建证明。

| 回执 | SHA-256 | 覆盖 | 未覆盖 |
|---|---|---|---|
| `.data/research/lawbot-2026-10-15/iteration037/automatic-runtime-api-actual-A.json` | `2bda4b600965c461d10949decdd0ae1907da813a45ca5dc8e725391bd79a98a6` | file/project 活任务数量、closed job 不投递、audit file、spot noop、span/revision 拒绝、密文、按序追加、worker 收到未知类型待审标记、无持久名单、revision 不变。 | 并发 producer 与 close 的实际锁竞争；硬中断之后的清理。 |
| `.data/research/lawbot-2026-10-15/iteration037/automatic-runtime-retry-revoke-actual-A.json` | `c51c5ac190d1fda616f59d71bf98f6b8c305cf1255042ca5fe00c70a1ca8cf13` | 真实 `claim_job` retry generation、旧密文被新代 claim 清理、旧 cleanup 不关闭新代、外国 owner 不可清、撤权后 API/读取拒绝、自有 owner cleanup 可删。 | 被撤权任务在 worker 没有执行 cleanup 时由 claim 直接置 cancelled 的回收；attempt=3 lease 过期终态回收。 |
| 两份 `automatic-runtime-worker-actual-B-*.json` | 两份内容相同，SHA-256 均为 `45a643931cf88573271d40f3dcc3813eae3f740d9ee29341a622666568c29106` | API 建立的合成 TXT、真实 scheduler claim、真实 detect worker/thread；事件 callback 中异步 API producer 提交后 drain；两次规则命中均为 pending；迟到投递=0、临时/持久名单=0、原件/复核/字典不变。 | cancellation、forced process death、数据库断连、任意高并发竞争；不是发布/批准的 review snapshot。两个副本不能计为两次独立覆盖。 |
| `automatic-runtime-api-complete.log` | `125854e19c5fbbe4debcca3e81b592863a37c14021876b71b962f4934e8e99e0` | 已存日志记载 3 PASS / 0 fail，含撤权与 retry 测试。 | 没有硬终止/最终失败密文残留测试。 |
| `automatic-runtime-worker-B.log` | `b14ba636602e74e77c14f98b8b6cb34f5eb852ecb385c317999de8a32a62ef38` | 已存日志记载真实 worker bridge 1 PASS / 0 fail。 | 单一事件时序，不是锁竞争压力或崩溃验收。 |
| `automatic-runtime-terminal-schema038-sweep.log` | `19cdc6fa56c941376e6b52c4c1e27cb9ee8d3286c39dbd133c419e6a9904dfc7` | 已存日志记载 3 PASS / 0 fail，6.504 秒；增加旧终态历史 sweep 与 active 行 readback。 | 无真实 SIGKILL；全表 sweep 规模/锁时长未测。 |
| `automatic-runtime-migration-sweep-actual.json` | `eece12013f0d9f8008966a211340791c938badc5ed2f3e7cd9aa5223c3469f91` | 内嵌源文件 hash；旧终态 delivery 删除 1，live delivery 保留 1、旧窗关闭、live payload 仍可认证。 | 在测试库新造旧状态，不是持久环境的迁移 readback。 |
| `automatic-runtime-terminal-actual.json` | `b40b5dbb7741cd05896b9ced6da8eb4b7718cfd8a93ebf51f729dc6028e6da5f` | evidence 内嵌本次 `scripts/037.sql`、`scripts/038.sql`、自动 API 与 adapter 的 SHA，四种终态读回 0 temporary deliveries。 | 明确 `processingWorkerKilled=false`，属于不运行 worker/finally 后验证数据库恢复边界。 |
| `automatic-runtime-lock-orders-actual.json` | `481db6f3329cb0069e2df02b980209e3252a3f05860fc4c54f3f8662c8246906` | evidence 内嵌相关源文件 SHA；producer-first 与 close-first 均由真实事务锁竞争，返回与 drain 数匹配。 | 两个受控顺序样例，不是压力测试或终态与producer/drain三方竞争测试。 |
| `automatic-runtime-terminal-schema038.log` / `automatic-runtime-terminal-actual.json` | 前版 hash 保留在 `.pre038-sweep` 快照 | 初始 trigger 四分支及两种锁顺序 2 PASS。 | 后续 sweep 回执扩为 3 PASS；没有执行真实 SIGKILL。 |

## 尚待验证

1. 用真实 processing worker 启动后实际 `SIGKILL`，在无 finally 条件下验证 038 触发器清理；当前集成测试在 DB 边界模拟 no-finally，没有真实杀进程。
2. 测试终态 status trigger 与 producer/drain 同时竞争的三方顺序，并将 producer-first/close-first 受控两例扩为多连接压力/重复采样；现有两例已验证指定的两个锁顺序。
3. 对终态切换事务在 trigger 执行后主动 rollback，验证状态与 delivery 删除原子回滚；对 DB 断连/cleanup 异常做恢复 readback。
4. 迁移回执构造的是隔离数据库旧状态，不是实际持久环境；任何目标 DB 升级前后残留计数仍需单独 readback。
5. 全表历史 sweep 的执行规模和锁时长未测。
6. 回执绑定 037、038、API 与 adapter 的运行前 hash；未绑定 migration runner 和 integration test 自身哈希。

## 基线与边界

- 本次 sweep 复核前版报告字节快照：`.pre038-sweep.md` SHA-256 `167522aaf76366a616af7d8d65889c58284903cc6270771c661aaa5b853ae545`；`.pre038-sweep.json` SHA-256 `d73fb4253e55fe9bcb641e63651eabaf825490f31afc96d99e068bd4be6ea370`。初始审查 git HEAD 为 `5cee048dd637aeac69fc30b5350c5494d9386c00`；038 源文件与测试是未提交候选。当前 sweep 回执中的 037/038/API/adapter hashes 与工作树一致；runner/test 当前 SHA 分别为 `fb30518dda29b345d6184713add14ee65354fbdeceff37532f29c4764c4b93e8`、`d6cb7f5f07664ac78a083c882f19db3ab26622fea98af77c4c644f57f9641b82`。
- 本轮只读 `AGENTS.md` 与计划文件后检查 API、adapter、worker、bridge、SQL、集成测试及现有回执；没有 SSH、密钥值读取、服务启动或重型门禁。
- 竞品运行状态仍为 R0；本审查只评我方 runtime rule 候选。
