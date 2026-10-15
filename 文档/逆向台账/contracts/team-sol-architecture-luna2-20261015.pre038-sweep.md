# 037 自动运行规则投递独立对抗审查（Luna2）

日期：2026-10-15。范围：当前工作树 commit `5cee048dd637aeac69fc30b5350c5494d9386c00` 加未提交候选；只读静态追踪并核读已有 API/worker 回执。本审查未运行测试、门禁或服务，没有改产品、测试或 ledger；仅创建本报告与配套 JSON。

## 结论

初审发现的终态密文回收缺口已由独立增量迁移 `scripts/038.sql` 覆盖：`jobs` 状态改为任何终态时，BEFORE UPDATE trigger 关闭 accepting 并删除该 job 所有 generation 的临时投递。现有 schema 038 实际集成证据覆盖 API 密文投递后不执行 worker/finally，再经生产 `claim_job()` 撤权和 attempt=3 lease 耗尽，以及 app-role 直接 cancel/success，均读回 delivery=0、accepting=false。测试明确 `processingWorkerKilled=false`：它验证“没有 finally 时数据库终态回收”，不等于真实 SIGKILL/宿主机断电试验。producer-first 与 close-first 两种持锁顺序也各有真实事务实测。另有升级衔接待办：038 没有清理由 037 可能已遗留的历史终态投递；若旧表中存在此类行，新 trigger 不会追溯触发。应查实迁移前/当前遗留行并补一次有界清理或新迁移 sweep。

其余已检查主链未确认新的缺陷：API 只向匹配的 running/lease-valid/accepting detect job 投递；producer 与 drain 对同一 job 行 `FOR UPDATE`，故窗口内竞争串行；drain 关闭窗口、删除并在事务内按 `delivery_seq` 排序验证；新 claim 增 generation、开新窗、删旧代；受限 SECURITY DEFINER cleanup 只定位当前 user/tenant 自有 job；交付是 AEAD 临时密文，不写持久 `runtime_whitelists`。这些结论是当前候选代码的静态结论，真实证据覆盖范围另列，不能外推为完整压力或崩溃验收。

## 发现

### RUNTIME-037-L2-001 — 037 中的终态密文回收缺口（已由 038 修复）

- **037 结论 / 影响：** `scripts/037.sql:27-30` 当时对撤权和最后一次 lease 过期只更新 attempts/jobs，delivery 清理只在 claim 新 generation 后运行。旧报告的控制流发现有效，但当时仅是静态复现推导。
- **038 修复：** 当前 `scripts/038.sql:3-15` 增加 `SECURITY DEFINER` trigger，固定 `search_path=pg_catalog,public`，对任何非 `queued`/`running` 状态设置 `runtime_rule_accepting=false` 并删除该 job 全代投递；`REVOKE ALL ... FROM PUBLIC`。jobs 状态枚举由 `scripts/001.sql:5` 限制为 queued/running/succeeded/failed/cancelled，trigger 对全部三种终态生效。trigger 与 status update 同事务，rollback 会一起撤销清理。
- **运行证据：** schema 038 实际测试先经 API 写入密文，然后不运行 processing worker/finally；生产 scheduler 覆盖 revoked 与 attempt=3 expired，app-role transaction 覆盖 cancelled/succeeded。四支均读回目标终态、`runtime_rule_accepting=false`、`temporaryDeliveries=0`，持久名单仍为 0。另实际覆盖 producer 先锁、close 先锁：前者 acknowledged=1/drained=1，后者 acknowledged=0/drained=0。
- **进程中断边界：** 这是真实 API、数据库、scheduler/trigger 与 app-role 事务路径；没有真实启动处理线程后 SIGKILL，也没有杀 worker 进程或模拟宿主机断电。测试自行声明 `processingWorkerKilled=false`，因此不能把它描述为真实 kill 验收。

### RUNTIME-038-L2-002 — 038 未扫除升级前已终态的残留投递

- **结论 / 条件：** 038 trigger 只对迁移后发生的 `UPDATE OF status` 生效。迁移脚本没有 `DELETE`/backfill 清理已经终态 jobs 的 delivery。若 037 时期曾发生 worker 硬中断，随后 037 的 `claim_job()` 已将 job 置为 cancelled/failed 并留下密文，单独应用 038 后该行不会再触发 trigger，也不会被 claim 为新 generation；除手动 owner cleanup 或父记录级联外，无自动回收。
- **代码证据：** `scripts/038.sql:1-15`，SHA-256 `38c9e75776a4cca8a0e96f863b273eb459ca0bc2eaa91c4366b06d8a3e7e907a`；migration runner 顺序/事务为 `scripts/migrate.ts:8-34`，SHA-256 `fb30518dda29b345d6184713add14ee65354fbdeceff37532f29c4764c4b93e8`。这是对脚本内容的静态确认；本轮未查询实际数据库中的遗留行，故是否已有受影响数据仍未知。
- **复现条件：** 在 schema 037 的实例中预置/形成一个 status 已终态而 delivery 仍在的行；迁移至 038 后，不再修改该 job 的 status；读表确认 delivery 仍存在。若要验证线上/现存数据，需由主审在授权的隔离/目标 DB readback；本轮未连接任何服务数据库。
- **建议方向（未实施）：** 038 同一事务中清理 `runtime_rule_deliveries` 对应已终态 jobs 的行，或新增后续幂等清理迁移；同时在迁移前后记录计数与回读。避免 broad unbounded delete 时可按 job 批次分块，但当前表通常很小。

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
| 终态回收增量 | `scripts/038.sql:1-15` — `38c9e75776a4cca8a0e96f863b273eb459ca0bc2eaa91c4366b06d8a3e7e907a`；`scripts/migrate.ts:8-34` — `fb30518dda29b345d6184713add14ee65354fbdeceff37532f29c4764c4b93e8` | 已读代码并核对实测。BEFORE UPDATE trigger 以 SECURITY DEFINER 清当前 job 所有代，并关窗；038 被追加在已应用的 037 之后，migration 与 schema_migrations 记录在一个 BEGIN/COMMIT 中。function 固定 search_path、REVOKE PUBLIC；`scripts/001.sql:18-22` 创建 FORCE RLS 的 jobs scoped policy（SHA `22a4a41b032a909494bb4d888311d817aa25003253f61113872d582fd53431ff`）。实测 app scoped connection 的 cancel/success 及 revoked `claim_job` 都能通过 trigger 清理，撤权路径覆盖函数 definer 对 RLS 的实际清理效果。尚未读取生产/迁移前实例检查历史 terminal delivery 是否有存量。 |

## 已有真实 API / worker 证据

以下是本轮实际读取并重算的 **证据文件自身 hash**，不是运行时源文件 hash。日志和 JSON 不含执行时完整工作树 SHA/commit，因此它们与当前候选代码的绑定只能由相同测试路径及报告作关联，不能称为密码学构建证明。

| 回执 | SHA-256 | 覆盖 | 未覆盖 |
|---|---|---|---|
| `.data/research/lawbot-2026-10-15/iteration037/automatic-runtime-api-actual-A.json` | `2bda4b600965c461d10949decdd0ae1907da813a45ca5dc8e725391bd79a98a6` | file/project 活任务数量、closed job 不投递、audit file、spot noop、span/revision 拒绝、密文、按序追加、worker 收到未知类型待审标记、无持久名单、revision 不变。 | 并发 producer 与 close 的实际锁竞争；硬中断之后的清理。 |
| `.data/research/lawbot-2026-10-15/iteration037/automatic-runtime-retry-revoke-actual-A.json` | `c51c5ac190d1fda616f59d71bf98f6b8c305cf1255042ca5fe00c70a1ca8cf13` | 真实 `claim_job` retry generation、旧密文被新代 claim 清理、旧 cleanup 不关闭新代、外国 owner 不可清、撤权后 API/读取拒绝、自有 owner cleanup 可删。 | 被撤权任务在 worker 没有执行 cleanup 时由 claim 直接置 cancelled 的回收；attempt=3 lease 过期终态回收。 |
| 两份 `automatic-runtime-worker-actual-B-*.json` | 两份内容相同，SHA-256 均为 `45a643931cf88573271d40f3dcc3813eae3f740d9ee29341a622666568c29106` | API 建立的合成 TXT、真实 scheduler claim、真实 detect worker/thread；事件 callback 中异步 API producer 提交后 drain；两次规则命中均为 pending；迟到投递=0、临时/持久名单=0、原件/复核/字典不变。 | cancellation、forced process death、数据库断连、任意高并发竞争；不是发布/批准的 review snapshot。两个副本不能计为两次独立覆盖。 |
| `automatic-runtime-api-complete.log` | `125854e19c5fbbe4debcca3e81b592863a37c14021876b71b962f4934e8e99e0` | 已存日志记载 3 PASS / 0 fail，含撤权与 retry 测试。 | 没有硬终止/最终失败密文残留测试。 |
| `automatic-runtime-worker-B.log` | `b14ba636602e74e77c14f98b8b6cb34f5eb852ecb385c317999de8a32a62ef38` | 已存日志记载真实 worker bridge 1 PASS / 0 fail。 | 单一事件时序，不是锁竞争压力或崩溃验收。 |
| `automatic-runtime-terminal-schema038.log` | `841f8ea49e7dd78dd880e80397d490747b0fd2d07cc53bb78bfcb9e0d10a75a7` | 已存日志记载 2 PASS / 0 fail：四种终态回收与两种锁顺序。 | 该测试没有执行 SIGKILL，且数据库为空新建测试项目；不证明迁移前无历史残留。 |
| `automatic-runtime-terminal-actual.json` | `8e1406fe78e4c1f27a7629f2d42d7e79ae7d81116bd750435cc018c5f08afa35` | evidence 内嵌本次 `scripts/037.sql`、`scripts/038.sql`、自动 API 与 adapter 的 SHA，且四种终态读回 0 temporary deliveries。 | 明确 `processingWorkerKilled=false`，属于不运行 worker/finally 后验证数据库恢复边界。 |
| `automatic-runtime-lock-orders-actual.json` | `f95d65a49960e9c716d95bc1a247876c92c18b31afd684d450ff8d04f68d94b6` | evidence 内嵌相关源文件 SHA；producer-first 与 close-first 均由真实事务锁竞争，返回与 drain 数匹配。 | 两个受控顺序样例，不是并发压力测试，也没有测试终态 trigger 与 producer/drain 三方竞争。 |

## 尚待验证

1. 用真实 processing worker 启动后实际 `SIGKILL`，在无 finally 条件下验证 038 触发器清理；当前集成测试在 DB 边界模拟 no-finally，没有真实杀进程。
2. 测试终态 status trigger 与 producer/drain 同时竞争的三方顺序，并将 producer-first/close-first 受控两例扩为多连接压力/重复采样；现有两例已验证指定的两个锁顺序。
3. 对终态切换事务在 trigger 执行后主动 rollback，验证状态与 delivery 删除原子回滚；对 DB 断连/cleanup 异常做恢复 readback。
4. 检查 037→038 升级时是否已有 terminal jobs 的遗留 delivery，并为非零存量补一次清扫/readback；当前回执只覆盖新 fixture。
5. 038 回执已绑定 `scripts/037.sql`、`scripts/038.sql`、自动 API 与 adapter 的运行前 hash；尚未绑定迁移 runner 和 integration test 自身哈希。当前复核独立取得的 runner/test hash 列在 JSON。

## 基线与边界

- 初始审查时 git HEAD 为 `5cee048dd637aeac69fc30b5350c5494d9386c00`。038 源文件与测试是未提交候选。038 运行证据中嵌入的 migration/API/adapter hashes 与当前值一致；另记录 `scripts/migrate.ts` 当前 SHA `fb30518dda29b345d6184713add14ee65354fbdeceff37532f29c4764c4b93e8`、`tests/automatic-runtime-terminal.integration.ts` 当前 SHA `b58a752a500e09eda24f787034c49091c9755e43b9211dab81fc02b12506b966`。
- 本轮只读 `AGENTS.md` 与计划文件后检查 API、adapter、worker、bridge、SQL、集成测试及现有回执；没有 SSH、密钥值读取、服务启动或重型门禁。
- 竞品运行状态仍为 R0；本审查只评我方 runtime rule 候选。
