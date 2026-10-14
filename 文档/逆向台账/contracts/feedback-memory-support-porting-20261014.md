# ITER024 反馈、个人名单与支持接口逐项对齐

源码0.5.9静态核验，竞品处理链仍R0。I2-adapted表示我方可运行适配，不表示Electron IPC线协议原样兼容。

## 当前证据

- 反馈数据库完整路径通过；11个纯函数单元通过。
- 个人名单保存不自动启用。显式迁入规则库后，须在项目选择并重新识别。
- 6个自学习接口本身已停用；另1个只读旧history统计。不创建源码调用链中不存在的训练、快照或回滚。
- 审核证据的网络字段明确未测量；不把固定0当流量证明。
- 支持接口的真实DB验收已通过实际020隔离DB验收；法律资料为自有未发布草稿。

| 稳定ID | 源入口 | 实际入口 | 语义／边界 |
|---|---|---|---|
| IPC-d874c25112ba | feedback:add | POST /api/feedback | canonical single record; authenticated actor/time; document revision+exact text binding |
| IPC-6ff537a49940 | feedback:add-batch | POST /api/feedback/batch | source alias normalization, FP-only mapping, atomic transaction |
| IPC-feab6613b5ed | feedback:query | GET /api/feedback | case-insensitive exact filename/type and optional scoped project/document |
| IPC-14a3820628e8 | feedback:get-document-stats | GET /api/feedback/statistics?documentName= | source case-sensitive exact document-name statistics |
| IPC-9bb6c463b31f | feedback:get-global-stats | GET /api/feedback/statistics | only owned and still-authorized project records |
| IPC-b2c075e4afde | feedback:delete-by-document | POST /api/feedback/delete-by-document | case-sensitive exact name, owner+tenant+project scope, CAS |
| IPC-efc77b9d6c1d | feedback:delete-by-id | DELETE /api/feedback/:id | owner+tenant+project scope, CAS |
| IPC-b828b79da058 | feedback:clear-all | POST /api/feedback/clear-all | explicit confirmation and CAS; clears records/memories/current hints; preserves archives/history/audits |
| IPC-196efa6b695b | feedback:export-audit-report | POST /api/feedback/export kind=audit-report | same date-filtered and first1000 subset for Markdown/count/audit; <=50 detailed entries |
| IPC-a05e3b6af8e1 | review:add-feedback | POST /api/feedback | authenticated encrypted record; cloud canonical fields differ from IPC camelCase adapter |
| IPC-72093dfff7bf | review:get-feedbacks | GET /api/feedback | real scoped encrypted records |
| IPC-9dbd84b9715b | review:get-blacklist | GET /api/review-memory blacklist | source legacy blacklist means forceSkip, not new frontend blacklist terminology |
| IPC-9a7ac510f8c7 | review:get-whitelist | GET /api/review-memory whitelist | source legacy whitelist means forceDetect |
| IPC-e024a8242875 | review:export-audit-log | POST /api/feedback/export kind=audit | actual CSV/JSON/JSONL bytes; CSV escape/formula neutralization |
| IPC-bb6001e11068 | review:export-proof-lite | POST /api/feedback/export kind=proof-lite | actual metadata+feedback+requested memories/audits JSONL; network count explicitly unmeasured, not fabricated zero |
| IPC-d3e5e1de12d2 | review:export-user-memories | POST /api/feedback/export kind=user-memories | actual all active memories and pattern lists JSON regardless requested format, matching source branch |
| IPC-b199b300f630 | review:get-statistics | GET /api/feedback/statistics | actual owned records, no accuracy claim |
| IPC-7d7beed074d0 | review:clear-all | POST /api/feedback/clear-all | same store as source feedback clear |
| IPC-acbca2a96370 | dictionary:get-entries | GET /api/review-memory | manual entries present; wrapper additionally includes legacy automatic memories for complete audit |
| IPC-25271d44841c | dictionary:add-entry | POST /api/review-memory | exact key/idempotent manual; existing automatic upgraded only by explicit manual add; no feedback learning |
| IPC-80e954e3a669 | dictionary:remove-entry | DELETE /api/review-memory/:id | manual entries only; CAS |
| IPC-50d02c91469e | dictionary:import | POST /api/review-memory/import | new exact keys only; existing automatic not upgraded; CAS |
| IPC-0f2d4d6b6262 | dictionary:export | POST /api/feedback/export kind=user-memories | cloud JSON contains full preserved memories, not source minimal entries wrapper |
| IPC-d0b393b9e93d | dictionary:select-import-file | FeedbackPanel browser file input | explicit browser upload, no arbitrary host path; native chooser adapted |
| BEHAVIOR-dictionary:migrate-legacy | dictionary:migrate-legacy | POST /api/review-memory/migrate-ruleset | source migration branch main14346; all entries checked before save, normalized conflict forceSkip wins, source migrated, default inactive, original retained, hint archive once |
| IPC-8018ac372ad7 | learner:get-high-confidence-memory-count | GET /api/learner/high-confidence-count | source constant count0/total0/lastSnapshot0 |
| IPC-2c55a1969fb8 | learner:update-rules | POST /api/learner/update-rules | source constant success,stats=null,rulesetHash empty; deprecated true, no update |
| IPC-ca4c19558c55 | learner:get-snapshots | GET /api/learner/get-snapshots | source constant empty snapshots, no new snapshots |
| IPC-caef950fe9a5 | learner:rollback | POST /api/learner/rollback | source explicit inactive failure, no mutation |
| IPC-7fb83198252b | learner:rollback-previous | POST /api/learner/rollback-previous | source explicit inactive failure, no mutation |
| IPC-43e13058e656 | learner:rollback-to-previous | POST /api/learner/rollback-to-previous | source explicit inactive failure, no mutation |
| IPC-5457cc5660c4 | learner:get-stats | GET /api/learner/get-stats | source old history current_ruleset_hash only; zero update/application/rollback stats, no learning call |
| IPC-7c61ecffef61 | log:renderer-error | POST /api/support/renderer-error | ignore complete payload; persist only fixed category and server timestamp per user |
| IPC-7f4cfe68e159 | app:export-crash-log | GET /api/support/crash-log | real per-user sanitized log bytes; absent404, native save-dialog adapted to download |
| IPC-5d7065a40d45 | app:read-legal-doc | GET /api/support/legal/:name | three exact allowed filenames; own product docs; agreement/privacy explicit unpublished drafts |
| IPC-65f32fe31f76 | app:read-onboarding-sample | GET /api/support/onboarding-sample | actual wholly synthetic own DOCX bytes, not competitor/cust materials |

## Final actual verification

Feedback 2 real DB/worker tests passed; support 1 real DB test passed;11 unit tests passed. Source runtime R0, final Edge acceptance separate.


## 明确保留的真实契约缺口

源码允许任意非空 entityType，并在运行时产生该原始类型候选（main.js 14282、9296、9439）。当前规则库有限枚举与运行规则未知类型拒绝存在差距；个人记录完整保留未知类型，但不能无损迁入规则库。该项不能以已支持常见类型代替，须扩展原始类型贯穿处理后才能关闭。另8个已有来源加规则库trace产生第9个来源的预算冲突已实证，待主任务共享schema修复。
