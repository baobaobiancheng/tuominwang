from pathlib import Path
import json,hashlib,re
base=Path(__file__).resolve().parents[3]
contracts=base/'文档/逆向台账/contracts'
source='.data/research/lawbot-2026-10-13/readable/main.js'
src=(base/source).read_text()
inventory=json.loads((contracts/'full-porting-inventory-20261014.json').read_text())
routes={
'feedback:add':('POST /api/feedback','canonical single record; authenticated actor/time; document revision+exact text binding'),
'feedback:add-batch':('POST /api/feedback/batch','source alias normalization, FP-only mapping, atomic transaction'),
'feedback:query':('GET /api/feedback','case-insensitive exact filename/type and optional scoped project/document'),
'feedback:get-document-stats':('GET /api/feedback/statistics?documentName=','source case-sensitive exact document-name statistics'),
'feedback:get-global-stats':('GET /api/feedback/statistics','only owned and still-authorized project records'),
'feedback:delete-by-document':('POST /api/feedback/delete-by-document','case-sensitive exact name, owner+tenant+project scope, CAS'),
'feedback:delete-by-id':('DELETE /api/feedback/:id','owner+tenant+project scope, CAS'),
'feedback:clear-all':('POST /api/feedback/clear-all','explicit confirmation and CAS; clears records/memories/current hints; preserves archives/history/audits'),
'feedback:export-audit-report':('POST /api/feedback/export kind=audit-report','same date-filtered and first1000 subset for Markdown/count/audit; <=50 detailed entries'),
'review:add-feedback':('POST /api/feedback','authenticated encrypted record; cloud canonical fields differ from IPC camelCase adapter'),
'review:get-feedbacks':('GET /api/feedback','real scoped encrypted records'),
'review:get-blacklist':('GET /api/review-memory blacklist','source legacy blacklist means forceSkip, not new frontend blacklist terminology'),
'review:get-whitelist':('GET /api/review-memory whitelist','source legacy whitelist means forceDetect'),
'review:export-audit-log':('POST /api/feedback/export kind=audit','actual CSV/JSON/JSONL bytes; CSV escape/formula neutralization'),
'review:export-proof-lite':('POST /api/feedback/export kind=proof-lite','actual metadata+feedback+requested memories/audits JSONL; network count explicitly unmeasured, not fabricated zero'),
'review:export-user-memories':('POST /api/feedback/export kind=user-memories','actual all active memories and pattern lists JSON regardless requested format, matching source branch'),
'review:get-statistics':('GET /api/feedback/statistics','actual owned records, no accuracy claim'),
'review:clear-all':('POST /api/feedback/clear-all','same store as source feedback clear'),
'dictionary:get-entries':('GET /api/review-memory','manual entries present; wrapper additionally includes legacy automatic memories for complete audit'),
'dictionary:add-entry':('POST /api/review-memory','exact key/idempotent manual; existing automatic upgraded only by explicit manual add; no feedback learning'),
'dictionary:remove-entry':('DELETE /api/review-memory/:id','manual entries only; CAS'),
'dictionary:import':('POST /api/review-memory/import','new exact keys only; existing automatic not upgraded; CAS'),
'dictionary:export':('POST /api/feedback/export kind=user-memories','cloud JSON contains full preserved memories, not source minimal entries wrapper'),
'dictionary:select-import-file':('FeedbackPanel browser file input','explicit browser upload, no arbitrary host path; native chooser adapted'),
'dictionary:migrate-legacy':('POST /api/review-memory/migrate-ruleset','source migration branch main14346; all entries checked before save, normalized conflict forceSkip wins, source migrated, default inactive, original retained, hint archive once'),
}
learner={
'learner:get-high-confidence-memory-count':('GET /api/learner/high-confidence-count','source constant count0/total0/lastSnapshot0'),
'learner:update-rules':('POST /api/learner/update-rules','source constant success,stats=null,rulesetHash empty; deprecated true, no update'),
'learner:get-snapshots':('GET /api/learner/get-snapshots','source constant empty snapshots, no new snapshots'),
'learner:rollback':('POST /api/learner/rollback','source explicit inactive failure, no mutation'),
'learner:rollback-previous':('POST /api/learner/rollback-previous','source explicit inactive failure, no mutation'),
'learner:rollback-to-previous':('POST /api/learner/rollback-to-previous','source explicit inactive failure, no mutation'),
'learner:get-stats':('GET /api/learner/get-stats','source old history current_ruleset_hash only; zero update/application/rollback stats, no learning call'),
}
support={
'log:renderer-error':('POST /api/support/renderer-error','ignore complete payload; persist only fixed category and server timestamp per user'),
'app:export-crash-log':('GET /api/support/crash-log','real per-user sanitized log bytes; absent404, native save-dialog adapted to download'),
'app:read-legal-doc':('GET /api/support/legal/:name','three exact allowed filenames; own product docs; agreement/privacy explicit unpublished drafts'),
'app:read-onboarding-sample':('GET /api/support/onboarding-sample','actual wholly synthetic own DOCX bytes, not competitor/cust materials'),
}
allroutes={**routes,**learner,**support}
rows=[]
for name,(route,sem) in allroutes.items():
 item=next((i for i in inventory['interfaces'] if i['name']==name),{})
 match=re.search(r'(?:handle|ce)\("'+re.escape(name)+r'"',src)
 line=src.count('\n',0,match.start())+1 if match else (14346 if name=='dictionary:migrate-legacy' else None)
 rows.append({'id':item.get('id','BEHAVIOR-'+name),'sourceName':name,'sourceHandler':{'path':source,'line':line},'ownRoute':route,'semantics':sem,'sourceState':'inactive_return_adapter' if name in learner and name!='learner:get-stats' else 'historical_stats_read_only' if name=='learner:get-stats' else 'active','ownLevel':'I2-adapted','referenceRuntime':'R0','ownEvidence':['tests/feedback.integration.ts','.data/evals/feedback-isolated-20261014.log'] if name not in support else ['tests/support.test.ts','tests/support.integration.ts'],'remaining':['full final Edge browser acceptance by root; reference licensed processing remains R0']})
files=['packages/contracts/feedback.ts','packages/core/feedback.ts','packages/core/user-memory-rules.ts','packages/adapters/feedback-store.ts','apps/api/feedback.ts','apps/web/feedback.tsx','scripts/017.sql','packages/core/support.ts','apps/api/support.ts','apps/web/support.tsx','scripts/020.sql','tests/feedback.test.ts','tests/user-memory-rules.test.ts','tests/feedback.integration.ts','tests/support.test.ts','tests/support.integration.ts']
report={'phase':'ITER024','date':'2026-10-14','reference':'0.5.9 static source, never licensed processing execution','rows':rows,'sourcePins':{p:hashlib.sha256((base/p).read_bytes()).hexdigest() for p in files},'sourceBranchPins':{'main.js':hashlib.sha256((base/source).read_bytes()).hexdigest()},'tests':{'units':'11 pass feedback/user-memory-rules/support; .data/evals/feedback-support-units-20261014.log','feedbackIntegration':'.data/evals/feedback-isolated-20261014.log:2 actual DB/worker tests passed1.83s+0.478s','supportIntegration':'.data/evals/support-isolated-20261014.log:1 actual DB test passed0.313s'},'adversarialFindings':[{'reviewer':'A','priority':'P2','finding':'Chinese memory kind fell back to custom on migration','fix':'memoryEntityKind full Chinese markSchema + English canonical/legacy aliases','regression':'actual Chinese name_cn and org_name migrated fields asserted'},{'reviewer':'B','priority':'P2','finding':'report receipt counted all rows instead of filtered subset','fix':'selectedAuditRecords reused for report content and count/audit','regression':'0/partial/all/cap1000 unit'}],'scope':['No automatic feedback learning. Source inactive learner methods not implemented as imaginary algorithms.','Legacy personal lists preserved and migrate to explicitly selected ruleset, default inactive.','applyActiveRulesetCandidates applied to fresh automatic marks, not manual review marks; skip exact kind/value, detect nonoverlap with marker bypassing disabled type, object anchor bounds.','No fake network or accuracy evidence in proof-lite.','Original material immutable; no external provider/private data invoked.']}
(contracts/'feedback-memory-support-porting-20261014.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
md=['# ITER024 反馈、个人名单与支持接口逐项对齐','','源码0.5.9静态核验，竞品处理链仍R0。I2-adapted表示我方可运行适配，不表示Electron IPC线协议原样兼容。','','## 当前证据','','- 反馈数据库完整路径通过；11个纯函数单元通过。','- 个人名单保存不自动启用。显式迁入规则库后，须在项目选择并重新识别。','- 6个自学习接口本身已停用；另1个只读旧history统计。不创建源码调用链中不存在的训练、快照或回滚。','- 审核证据的网络字段明确未测量；不把固定0当流量证明。','- 支持接口的真实DB验收待020迁移；法律资料为自有未发布草稿。','','| 稳定ID | 源入口 | 实际入口 | 语义／边界 |','|---|---|---|---|']
for r in rows:md.append('| '+ ' | '.join(str(r[k]).replace('|','\\|')for k in ['id','sourceName','ownRoute','semantics'])+' |')
md=[x.replace('待020迁移','已通过实际020隔离DB验收') for x in md];md+=['','## Final actual verification','','Feedback 2 real DB/worker tests passed; support 1 real DB test passed;11 unit tests passed. Source runtime R0, final Edge acceptance separate.'];(contracts/'feedback-memory-support-porting-20261014.md').write_text('\n'.join(md)+'\n')
