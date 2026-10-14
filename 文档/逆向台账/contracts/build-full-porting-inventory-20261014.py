# -*- coding: utf-8 -*-
import json,re,hashlib,collections
from pathlib import Path
root=Path.cwd();contracts=root/'文档/逆向台账/contracts';ledger=json.loads((root/'文档/逆向台账/ledger.json').read_text());hand=(root/'文档/脱敏规则技术交接-20261014.md').read_text();sup=json.loads((contracts/'deep-processing-supplement-rules-20261014.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
families={
'ai-collab':([],[],[], '持久任务/授权/取消/交换槽/回执/失败恢复/续接全部缺少对应协议'),
'local-gateway':([],[],[], '14 个本地网关协议均未实现；需安全票据、消息版本、幂等与状态回执'),
'mcp-connectors':([],[],[], '12 个工具和 6 个接入通道均缺少 MCP 兼容层'),
'workspace':(['apps/api/main.ts','apps/api/reviews.ts'],['apps/web/main.tsx'],['tests/files.integration.ts'], '数据库持久化不等于 .tmm v1/v2 工程迁移、恢复包、transfer 容器或工程导入导出'),
'auth':(['apps/api/access.ts','apps/api/main.ts','apps/api/members.ts'],['apps/web/main.tsx'],['tests/access.integration.ts','tests/e2e/session-sync.spec.ts'],'网站登录/组织权限不等于本地密钥保护、系统生物识别授权、密码恢复文件和旧密码迁移'),
'desensitization':(['apps/api/files.ts','apps/api/recognition.ts','apps/api/reviews.ts','packages/adapters/processing.ts'],['apps/web/main.tsx'],['tests/files.integration.ts','tests/recognition.integration.ts','tests/e2e/files.spec.ts'],'候选识别、任务、快照、导出已有独立实现；目录清单、材料路由、加密解锁、报告统计、单独 DOCX 图片重跑等逐项未闭合'),
'dictionary':(['apps/api/recognition.ts','packages/core/dictionary-workbook.ts'],['apps/web/project-tools.tsx'],['tests/dictionary-workbook.test.ts','tests/recognition.integration.ts'],'项目词表/XLSX 已有；模板、提示反馈、全局名单范围、导入冲突契约需逐项核验'),
'feedback':(['apps/api/members.ts'],['apps/web/management.tsx'],['tests/access.integration.ts'],'审计日志不等于反馈记录 CRUD、文档/全局统计、误报记忆和反馈报告'),
'review':(['apps/api/reviews.ts','apps/api/review-tools.ts','apps/api/members.ts'],['apps/web/review-tools.tsx','apps/web/main.tsx'],['tests/review-tools.integration.ts','tests/e2e/review-tools.spec.ts'],'现有复核、黑白名单和审计与竞品反馈/证明简版/用户记忆导出契约不同'),
'learner':([],[],[],'规则学习器、高置信记忆计数、快照/回滚/规则传播全部没有对应实现'),
'ruleset':([],[],[],'规则集 CRUD、活动版本、Excel 模板/导入导出、workspace 推广预览未实现'),
'profile':([],[],[],'设置模板创建/读取/更新/复制/删除/列表缺少对应 API 和 UI'),
'preference':([],[],[],'默认模板和成功导出偏好记忆未实现'),
'pseudonym':(['apps/api/mappings.ts','packages/core/mappings.ts'],['apps/web/mapping-tools.tsx'],['tests/mappings.integration.ts','tests/e2e/mappings.spec.ts'],'数据库假名与文本还原仅为候选对应；.lpm 检查/保存及 DOCX/Markdown 单件/批量还原未实现'),
'image':(['apps/api/visual.ts','packages/core/visual-detection.ts'],['apps/web/visual-suggestions.tsx'],['tests/visual-detection.test.ts','tests/e2e/visual-detection.spec.ts'],'页内候选和清除区域已有；标注协议、标签导出、自动签名/黑白章未对齐'),
'image-review':(['apps/api/ocr.ts','packages/core/ocr-correction.ts'],['apps/web/ocr-text-editor.tsx'],['tests/ocr.integration.ts','tests/e2e/ocr-correction.spec.ts'],'OCR 全页读取已有独立实现；缓存清理、区域重跑、跨页 batch-search 需要独立 API 对照'),
'ocr':(['packages/core/ocr.ts'],[],['tests/pages.integration.ts'],'OCR 引擎已有，不等于竞品 health-check/诊断收集接口'),
'ui-workflow':(['apps/api/review-tools.ts','apps/api/docx-layout.ts','apps/api/ocr.ts'],['apps/web/main.tsx','apps/web/docx-review.tsx'],['tests/e2e/docx-layout.spec.ts','tests/e2e/ocr-correction.spec.ts'],'6 项 UI 全为部分实现；项目范围实体树/查漏/改字、整体/类型/同值层级策略仍缺'),
'app':([],[],[],'浏览器适配需逐项决策：版号、导览样例、法律文档、崩溃日志、DOCX safe mode、外部/文件路径、剪贴板'),
'window':([],[],[],'6 个桌面窗口通道不能自动标已完成；网页版需明确关闭草稿/任务风险和窗口适配契约'),
'net':([],[],[],'离线开关、请求统计/清零未实现对应接口'),
'license':([],[],[],'竞品许可链禁止绕过；自主产品许可需求单独定义，此项不能计为已移植'),
'web-purchase':([],[],[],'竞品购买/支付/推荐接口属于第三方服务；保留全量条目，不调用/冒充该服务'),
'software-update':([],[],[],'竞品签名更新安装不可移植为我方安全更新；网页版需版本检查、变更说明和刷新适配'),
'get-pdfjs-worker-path':(['packages/core/pdf-reader.ts'],[],['tests/pdf.test.ts'],'PDFium 自主实现不是竞品 PDF.js worker 路径协议'),
'electron':(['apps/api/main.ts'],[],['tests/pdf.test.ts'],'网页导出 PDF 不等于桌面 save-pdf-to-desensitized 通道'),
'debug':([],[],[],'本地路径诊断通道未实现；网页版可定义脱敏诊断包'),
'log':([],[],[],'renderer error 收集协议未实现'),
 'task-power':([],[],[],'桌面电源租约/休眠状态与服务端 worker 的持久任务不同，需明确适配')}
# Source-level endpoint census: concrete literal declarations only, not runtime/protocol equivalence.
routes=[]
for p in sorted((root/'apps/api').glob('*.ts')):
 for n,line in enumerate(p.read_text().splitlines(),1):
  m=re.search(r'app\.(get|post|put|delete|patch)\(\s*(["`])(.+?)\2',line)
  if m:routes.append({'method':m[1].upper(),'path':m[3],'source':str(p.relative_to(root)),'line':n,'source_sha256':sha(p),'dynamic':'${' in m[3]})
# Multiline login declaration is intentionally separately identified, avoiding a silently incomplete census.
p=root/'apps/api/main.ts';lines=p.read_text().splitlines()
for n,line in enumerate(lines,1):
 if '"/api/login"' in line and not any(r['path']=='/api/login' for r in routes):routes.append({'method':'POST','path':'/api/login','source':str(p.relative_to(root)),'line':n,'source_sha256':sha(p),'dynamic':False})
entries=[]
for x in ledger['interfaces']:
 files,ui,tests,gap=families.get(x['namespace'],([],[],[],'未完成独立适配判定'))
 files=[p for p in files if (root/p).exists()];ui=[p for p in ui if(root/p).exists()];tests=[p for p in tests if(root/p).exists()]
 entries.append({'id':x['id'],'kind':x['kind'],'family':x['namespace'],'name':x['name'],'reference_version':x['reference_version'],'reference_evidence':x['evidence'],'reference_static_summary':x['static_summary'],'reference_runtime':x['runtime_status'],'ledger_implementation_status':x['implementation_status'],'ledger_implementation_note':x['implementation_note'],'implementation_assessment':'candidate_only_contract_unverified' if files else 'missing_or_web_adaptation_decision_required','own_candidate_sources':files,'own_candidate_routes':[r for r in routes if r['source'] in files],'frontend_candidate_sources':ui,'frontend_entry_proof':'candidate_source_only_not_per_interface_proof' if ui else 'none_found','existing_related_tests':tests,'missing_or_unverified':gap,'required_verification':['逐字段参数/输出/异常/取消/恢复/权限/持久化/版本契约对应','确认真实前端入口并完成正常/失败流程浏览器验收','竞品运行对照当前 R0，正版许可后才能升格；不绕过授权'],'flow_ids':x.get('flow_ids',[]),'entry_closure':x.get('entry_closure'),'deep_analysis':x.get('deep_analysis'),'next_actions':x['next_actions'],'no_frontend_call_is_not_exclusion':True})
flows=[{'id':x['id'],'name':x['name'],'outline':x['sequence_outline'],'implementation':x['implementation_summary'],'runtime':x['runtime_status'],'evidence':x['evidence'],'interface_ids':[e['id'] for e in entries if x['id'] in e['flow_ids']],'remaining':x['next_actions']} for x in ledger['flows']]
ruleRows=[]
for r in sup['ruleInventory']:
 m=re.search(r'\|\d+ `'+re.escape(r['category'])+r'`\|([^\n]+)',hand)
 own=m.group(1).split('|')[-2] if m else '未核';ruleRows.append({'id':'RULE-'+r['category'],'category':r['category'],'order':r['order'],'contract':r['contract'],'confidence':r['confidence'],'evidence':sup['evidence'][r['evidenceId']],'own_baseline':own,'status':'partial_requires_branch_verification' if '部分对应' in own else 'missing_specialized_branch','required_verification':'全部正反上下文、原始 UTF-16 偏移、重叠顺序、遮盖结果、OCR 与非 OCR 分支；不是一个 happy path'})
configRows=[]
for c in sup['configInventory']:
 for cat in c['categories']:configRows.append({'id':'CONFIG-'+c['file']+'#'+cat['category'],'file':c['file'],'category':cat['category'],'entries':cat['entries'],'applies_as':cat['appliesAs'],'evidence_id':c['evidenceId'],'parsed_evidence_id':c['parsedEvidenceId'],'own_status':'handed_over_not_runtime_port_verified','required_verification':'全量词项 hash/条目数、集合并集/排除集/严格子串/字面 regex 差异、reload 与失败行为'})
semantic=[];sourceReports=[]
for p in sorted(contracts.glob('deep*20261014.json')):
 j=json.loads(p.read_text());sourceReports.append({'path':str(p.relative_to(root)),'sha256':sha(p)})
 for key in ['contracts','sections','modules','findings']:
  value=j.get(key,[])
  if isinstance(value,list):
   for idx,c in enumerate(value):semantic.append({'id':p.stem+'#'+str(c.get('id',idx)), 'source_report':str(p.relative_to(root)),'section':key,'reference_contract':c,'port_status':'requires_independent_mapping_not_assumed_from_namespace','runtime':'R0'})
amountRows=[{'id':'AMOUNT-'+s,'source':'deep-processing-supplement-rules-20261014.json#DPS05','baseline':'missing_dedicated_branch_header_amount_only','required_verification':'币种/单位、上下文排除、括号拆分、重叠、偏移、[金额]替换'} for s in ['labeled','currency','uppercase','standalone','table_summary','labeled_bare','post_yuan','conversation_payment','standalone_yuan','per_share_price','thousand_sep','standalone_uppercase']]
summary={'interfaces':len(entries),'flows':len(flows),'basic_rule_groups':len(ruleRows),'amount_branches':len(amountRows),'yaml_files':len(sup['configInventory']),'yaml_categories':len(configRows),'yaml_array_entries':sum(c['entries'] for c in configRows),'deep_contract_and_finding_entries':len(semantic),'ledger_status_counts':dict(collections.Counter(e['ledger_implementation_status'] for e in entries)),'no_interface_verified_complete':True,'reference_runtime_all_R0':all(e['reference_runtime']=='R0' for e in entries)}
report={'schema':'full-porting-inventory/v1','date':'2026-10-14','snapshot':'iteration021 baseline before this requested porting wave','source_ledger_sha256':sha(root/'文档/逆向台账/ledger.json'),'policy':'All ledger interfaces and flows retained, no selective omission; candidate sources are not contractual mapping; real evaluation and reference runtime remain separate','summary':summary,'source_reports':sourceReports,'family_plan':[{'family':f,'interfaces':sum(e['family']==f for e in entries),'missing_or_unverified':t[3],'implementation_sources':[x for x in t[0] if(root/x).exists()]} for f,t in families.items()],'own_route_census':routes,'interfaces':entries,'flows':flows,'basic_rules':ruleRows,'amount_branches':amountRows,'yaml_categories':configRows,'deep_contracts':semantic,'unresolved':['未取得竞品正版激活处理链运行证据','mac 0.5.9 缺少 seal_detector.py、Windows Office bridge；不能凭名称闭合','专用场景标签/金额/所有 YAML 的运行移植需完整分支覆盖','真实标注商业脱敏文档/签名/黑白章语料缺少授权与完整标签；已知合成评估不可冒充真实']}
(contracts/'full-porting-inventory-20261014.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
md=['# 全量功能与规则移植盘点（独立基线）','','日期：2026-10-14。该快照在本轮实现前冻结。所有候选源码/接口仅为定位线索，没有据此升级台账完成度。','', '## 全量计数','', '| 范围 | 数量 |','|---|---:|']+[f'| {k} | {v} |' for k,v in summary.items()]+['','## 必须覆盖的业务族','', '| 业务族 | 接口数 | 当前缺失/未核验 |','|---|---:|---|']+[f"| {f['family']} | {f['interfaces']} | {f['missing_or_unverified']} |" for f in report['family_plan']]+['','## 258 项逐接口队列','','“候选”不表示移植完成；未见前端调用仍保留在队列。完整输入/输出/副作用证据见同名 JSON。','','| 稳定 ID | 接口 | 基线状态 | 候选实现/必要适配 |','|---|---|---|']+[f"| {e['id']} | {e['name']} | {e['ledger_implementation_status']} | {e['missing_or_unverified']} |" for e in entries]+['','## 37 项处理链','','| ID | 名称 | 当前实现与差距 |','|---|---|']+[f"| {f['id']} | {f['name']} | {f['implementation']} |" for f in flows]+['','## 41 组基础规则','','| ID | 契约 | 基线对应 |','|---|---|']+[f"| {r['id']} | {r['contract']} | {r['own_baseline']} |" for r in ruleRows]+['','## 金额：全部 12 支','','| 分支 | 验证条件 |','|---|---|']+[f"| {a['id']} | {a['required_verification']} |" for a in amountRows]+['','## 全量配置类别','','| ID | 条目数 | 生效集合 |','|---|---:|---|']+[f"| {c['id']} | {c['entries']} | {c['applies_as']} |" for c in configRows]+['','## 深读契约全量索引','','以下全部深读契约/发现保留原文于 JSON，不按标题合并。','','| ID | 原报告 |','|---|---|']+[f"| {s['id']} | {s['source_report']} |" for s in semantic]+['','## 验收门','','1. 每项字段、取消/失败/恢复、权限、版本与持久化逐项对应；同业务域不代表相同接口。','2. 全部正反例与组合上下文、UTF-16 跨窗偏移、格式残留、前端实际流程。','3. 正版竞品运行对照仍 R0；不得把我方测试当作竞品运行。','4. 真实与合成语料分开；漏检率、误检率、偏移匹配、文本残留、像素残留独立统计。','5. 不删无前端调用/桌面/第三方条目：保留必要适配或授权依赖，未移植不能宣称完整。']
(contracts/'full-porting-inventory-20261014.md').write_text('\n'.join(md)+'\n');print(json.dumps(summary,ensure_ascii=False))
