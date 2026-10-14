from pathlib import Path
from collections import Counter
import json
base=Path(__file__).resolve().parent
updates={}
def add(name,route,sources,frontend,tests,reason,remaining=None,classification='implemented_adapted_static_proven'):
 updates[name]=dict(status=classification,classification=classification,ownLevel='I2-adapted' if classification=='implemented_adapted_static_proven' else 'I1-explicit-gap',phase='ITER024',reference_runtime='R0',route=route,sources=sources,frontend=frontend,tests=tests,reason=reason,remaining=remaining or ['竞品合法许可处理运行仍R0；最终总体验收由主任务记录。'],source_pin_policy='Historical source_sha256 remains archived in previous phase; root final event pins current files.')
obs=['apps/api/processing-observability.ts','packages/core/processing-report.ts','packages/adapters/markdown-export-events.ts','packages/adapters/markdown-outcome.ts','scripts/018.sql'];obst=['tests/processing-observability.integration.ts','.data/evals/current-inventory-api-review.log']
for name,route,reason in [
 ('desensitization:generate-reports','POST /api/projects/:id/processing-reports','逐材料source/content/artifact真实hash与识别快照生成报告，AEAD、owner及原文/映射权限；不是仅生成空报告。'),
 ('desensitization:save-report','GET /api/projects/:id/processing-reports/:report/download?format=json|html|md|csv|zip','已持久化报告按owner/project重新授权、解密及校验后实际下载；浏览器附件替代桌面保存对话框。'),
 ('desensitization:get-markdown-export-stats','GET /api/projects/:id/markdown-export-stats','真实导出/手工稿/失败取消事件表消费；源码480静态统计oracle与实际导出集成覆盖，不把空事件表当闭合。'),
 ('desensitization:get-resource-diagnostics','GET /api/projects/:id/resource-diagnostics','返回真实材料字节、页面、job聚合；源码开发模式native缓存/路径指标不伪造成云端数值。')]:add(name,route,obs,['apps/web/processing-observability.tsx'],obst,reason)
dicts=['apps/api/reference-dictionary.ts','packages/core/reference-dictionary-workbook.ts','packages/adapters/feedback-store.ts']
for name,route,reason in [
 ('dictionary:download-excel-template','GET /api/reference-dictionary/template.xlsx','18源选项、两真实action、inlineStr模板；source whitelist=forceDetect，blacklist=forceSkip。'),
 ('dictionary:record-hint-action','POST /api/review-memory/hint-action','同个人hint revision CAS真实计数；第二次与全局一次提示、迁移archive，非模拟学习。'),
 ('dictionary:export-excel','GET /api/review-memory/export.xlsx','完整导出名单并parse roundtrip验真；自定义raw支持由A最新扩展，原18类保持。'),
 ('dictionary:save-export-file','GET /api/review-memory/export.xlsx','浏览器附件返回真实XLSX bytes，替代桌面选路径写文件；没有声称能返回用户绝对路径。')]:add(name,route,dicts,['apps/web/reference-dictionary.tsx'],['tests/reference-dictionary-workbook.test.ts','tests/processing-observability.integration.ts'],reason)
image=json.loads((base/'image-ocr-batch-workflow-porting-20261014.json').read_text())
for row in image['branches']:
 if row.get('reference'): add(row['reference'],row['ownAPI'],['apps/api/image-utilities.ts','packages/core/image-utilities.ts','apps/api/visual.ts','apps/api/restoration-batch.ts','packages/core/restoration-batch.ts'],['apps/web/image-utilities.tsx','apps/web/restoration-batch.tsx','apps/web/visual-suggestions.tsx'],image.get('evidence',[]),row['implementation'])
for name,reason in [('pseudonym:select-input-docx-batch','浏览器multiple .docx文件输入逐份上传；每份真实DOCX校验/还原与持久化、部分失败报告；未读取任意宿主路径。'),('pseudonym:select-input-markdown-batch','浏览器multiple .md/.txt输入逐份上传；逐份token检查/还原与持久化；没有伪造桌面原路径。'),('pseudonym:restore-progress','每份实际HTTP任务完成更新completed/total/success/failure/zero-match；可从已持久化结果重载，非伪造进度或源Electron事件线兼容。')]:add(name,'POST /api/projects/:id/restoration/batch/file; GET batch/files; POST batch/download',['apps/api/restoration-batch.ts','packages/core/restoration-batch.ts'],['apps/web/restoration-batch.tsx'],['tests/restoration-batch.integration.ts','tests/e2e/restoration-batch.spec.ts'],reason)
rec=['apps/api/workspace-recovery.ts','scripts/019.sql'];rect=['tests/workspace-recovery-network.integration.ts','.data/evals/current-inventory-api-review.log']
for name,route,reason in [
 ('workspace:list-recent','GET /api/workspace/recent','真实个人recent表按当前project访问重新RLS；保存project/document位置，非泄漏其他账号最近材料。'),
 ('workspace:forget-recent','DELETE /api/projects/:id/workspace/recent','只删除当前owner recent引用，原件和项目内容不变。'),
 ('workspace:list-recoveries','GET /api/workspace/recoveries','真实个人加密草稿头及材料名、revision、保存时间，撤权后不可见。'),
 ('workspace:list-recovery-prompts','GET /api/workspace/recoveries; GET /api/documents/:id/recovery','真实dirty草稿存在才提示，expired/outdated单独判定；本产品以逐材料云端草稿替代桌面workspace临时文件。'),
 ('workspace:open-recovery','POST /api/documents/:id/recovery/open','原件/内容hash、材料revision及recovery CAS、owner双权限验证后返未批准草稿；绝不自动生成trusted review/artifact。'),
 ('workspace:save-recovery','PUT /api/documents/:id/recovery','AEAD完整marks/pageReview/映射引用，串行UIautosave加revision CAS；不把自动保存当通过复核。'),
 ('workspace:discard-recovery','DELETE /api/documents/:id/recovery','owner/tenant/project权限与recoveryRevision CAS删除，仅当前恢复草稿。')]:add(name,route,rec,['apps/web/workspace-recovery.tsx'],rect,reason)
for name,route,reason in [('net:get-stats','GET /api/projects/:id/network','实际managedNetworkFetch统计请求/阻断和bytes，按user/project隔离，不虚构全宿主抓包。'),('net:reset-stats','POST /api/projects/:id/network/reset','有manage_models权限的真实CAS清零计数，offline开关保留。'),('net:set-offline','PUT /api/projects/:id/network','真实持久offline与外部HTTP gate，离线请求先阻断；源OS全局网络监控以本工具管理请求适配，未声称拦所有进程。')]:add(name,route,['apps/api/network-policy.ts','packages/adapters/network-policy.ts','scripts/019.sql'],['apps/web/network-policy.tsx'],rect,reason)
add('desensitization:save-markdown-draft','GET/POST /api/documents/:id/markdown-manual-drafts; GET version/download',['packages/core/markdown-manual-draft.ts','apps/api/markdown-manual-draft.ts','scripts/021.sql'],['apps/web/markdown-manual-draft.tsx'],['tests/markdown-manual-draft.integration.ts','.data/evals/raw-review-markdown.log'],'源原MD、真实当前MD artifact或明确literal canonical text为basis，实际编辑/双CAS/不可变版本/owner+view_original+export/hash重新验证；保存始终带人工稿警告，无trusted artifact注册。')
rawsrc=['packages/core/entity-identity.ts','packages/contracts/index.ts','packages/contracts/presets.ts','packages/core/presets.ts','packages/core/user-memory-rules.ts','packages/core/mappings.ts','packages/core/replacement-policies.ts','apps/api/mappings.ts']
for name in ['ruleset:create','ruleset:update','ruleset:import-excel','ruleset:preview-workspace-promotion','desensitization:update-runtime-rules']:
 add(name,'/api/presets/rulesets; /api/projects/:id/runtime-rules',rawsrc+['packages/core/runtime-rule-update.ts','apps/api/runtime-rules.ts'],['apps/web/presets.tsx','apps/web/processing-observability.tsx'],['tests/entity-identity.test.ts','tests/entity-identity.integration.ts','tests/runtime-rule-update.test.ts','tests/processing-observability.integration.ts','.data/evals/raw-unit.log','.data/evals/raw-integration.log'],'任意非空wellformed实体类型保rawEntityType；name_/org_未知标签不再吞并，same-range不同raw保留；forceSkip优先/forceDetect跨profile门，9+source不丢；独立alias namespace、策略、LPM、还原及native工程scope重绑真实API通过。源码runtime掩码按exact input marker判定，非由中文兼容kind反推。')
# Each native-only row receives an explicit decision. These are not promoted by same-family web functionality.
os={
'app:consume-open-path':'浏览器无法接Electron启动argv/open-file系统事件；原工程需显式上传到portable/import，未伪造冷启动路径消费。',
'app:get-docx-safe-mode':'源本地DOCX native safe-mode设置未在web提供同名状态；当前独立Word预览/导出gate存在，不等于该OS开关。',
'app:set-docx-safe-mode':'未暴露本地DOCX渲染引擎safe-mode写入接口；云端受控预览不冒充源开关已保存。',
'app:reset-docx-safe-mode':'未实现源OS偏好重置；不得用已有Word导出能力升格。',
'app:get-env':'浏览器与worker只公开真实健康诊断；不提供Electron平台/userData环境对象。',
'app:get-version':'当前构建版本可发布时单独注入，尚无与源desktop version同契约GET；保留明确平台差异。',
'app:open-external':'现有浏览器a链接使用用户选择打开；没有可调用的任意宿主shell.openExternal，属于OS能力未提供。',
'app:open-path':'云服务不能直接打开用户绝对磁盘路径；显式上传与授权下载作为实际能力。',
'app:write-clipboard-text':'MCP安装配置使用navigator.clipboard.writeText由用户触发；不是Electron任意路径/宿主clipboard协议兼容。',
'auth:cancel-recovery':'源码桌面加密master-password恢复请求取消不等同云账号logout；未伪造桌面recovery状态。',
'auth:change-password':'源码本地加密master-password/keywrap变更尚无等价web包装；云用户密码认证与其不是同一安全域。',
'auth:check-password':'云POST /api/login真实核验账号密码，但源本地master-password检查域不同，未声称wire兼容。',
'auth:complete-recovery':'源本机恢复文件/密钥包装解封依赖未移植云账号域；明确不能导入其private key恢复本机状态。',
'auth:create-recovery-request':'源本机密钥恢复请求容器未提供；云账号管理员流程不假装为该格式。',
'auth:get-capabilities':'源biometric/keychain能力在云server不代表用户设备；不返回假available。',
'auth:has-password':'源master-password是否设置与云账号是否注册不同；没有同域状态。',
'auth:import-recovery-file':'源密钥恢复文件验证/本机keychain依赖未移植；上传材料/portable文件不能充当此能力。',
'auth:lock':'云logout删除当前session实际可用，但不等于源销毁本机解密master-key的锁定。',
'auth:migrate-legacy-password':'源旧本机密码包装迁移不适用于云已有账号，未实现其密码密钥迁移。',
'auth:request-system-grant':'macOS biometric/keychain系统授权不可由云worker替用户确认；明确未提供。',
'auth:restore-session-token':'源keychain会话token恢复未提供；云HttpOnly cookie当前session校验独立真实存在。',
'auth:save-recovery-request':'源恢复文件需浏览器下载容器及真正keywrap实现，当前未提供该keywrap，不能以下载空文件代替。',
'auth:set-password':'源设置本机加密master-password尚无web keywrap状态；云organization新增账号只证明账号密码创建。',
'auth:verify-password':'源master-password/系统授予校验与云login安全域不同，不混为一个接口完成。',
'debug:get-paths':'不泄露server绝对数据/日志目录；已有受权限OCR诊断导出，源debug路径对象未暴露。',
'desensitization:create-folder-output':'浏览器下载primary/sidecar或ZIP替代创建用户宿主目录；不返回假本地folder路径。',
'desensitization:get-default-output-dir':'浏览器下载位置由用户浏览器管理，服务端不知道用户默认目录。',
'desensitization:open-output-dir':'浏览器不能调用用户shell打开目录；真实输出列表提供下载，源OS动作不可等价。',
'desensitization:resolve-folder-output-path':'文件名安全去重与ZIP内部路径真实实现；不解析用户磁盘输出绝对路径。',
'desensitization:select-output-dir':'输出在浏览器下载，尚未接FileSystemAccess目录授权；不返回用户未授权的磁盘目录。',
'desensitization:select-save-path':'浏览器附件下载选择位置，不把server路径当用户路径。',
'dictionary:select-export-path':'真实XLSX浏览器附件下载由浏览器选择位置；不调用用户OS保存对话框IPC。',
'electron:save-pdf-to-desensitized':'当前page/PDF真实artifact导出与下载有gate；Electron print/save-to-native-dir专用链不宣称兼容。',
'get-pdfjs-worker-path':'我方PDFium受控worker解析，不需要也不伪造Electron内置pdfjs worker绝对路径。',
'pseudonym:open-output-folder':'批量还原已验证结果真实列表+ZIP下载；用户OS文件夹打开动作不提供。',
'software-update:acknowledge-whats-new':'云版本更新由服务器发布；原desktop whats-new确认偏好未创建。',
'software-update:check':'云发布状态不是Electron官方安装更新feed；未伪造发现可安装桌面更新。',
'software-update:download':'不下载或安装竞品更新包；本工具前端由当前server部署，未提供desktop updater。',
'software-update:get-state':'没有desktop installer下载/安装状态；不能用cloud health替代。',
'software-update:restart-and-install':'云浏览器不能重启用户native app/install；server部署由已授权运维流程单独完成。',
'software-update:set-preferences':'源desktop updater偏好不适用本web包；未存空配置假装自动升级。',
'software-update:state':'没有native更新器事件发射，真实Web作业状态不冒充desktop install进度。',
 'task-power:get-state':'源powerSaveBlocker/防休眠属于用户OS；web后台作业独立worker无需控制用户休眠，未伪造系统电源状态。',
 'task-power:state':'无用户OS电源事件；worker任务状态真实保留但不是powerSaveBlocker event。',
'window:close':'关闭当前浏览器标签由浏览器控制，不调用宿主所有窗口；产品未伪造返回native成功。',
'window:is-maximized':'浏览器viewport只代表页面大小，不推断用户OS窗口maximize状态。',
'window:minimize':'浏览器权限无法最小化用户OS窗口，未以CSS隐藏页面假装成功。',
'window:toggle-maximize':'浏览器全屏/缩放不等于OS窗口maximize，未用别的动作伪装。',
'workspace:reveal':'工程内容通过云项目与portable下载查看；不调用用户shell reveal原绝对路径。',
'workspace:select-save-path':'原.tmm保存对话框由浏览器下载替代；原容器格式兼容另有明确缺口。',
'expected GET http://127.0.0.1:{port}/':'源临时native transfer listener首页不是云公开静态目录；我方认证portable传输使用项目作用域HTTP，未开放任意本机端口。',
'expected GET http://127.0.0.1:{port}/{128hex}.zip':'源一次性本机zip令牌传输/TTL事件未完整实现；云portable导出是受权限下载，不能据此声称原128hex临时server闭合。'
}
for fn,key in [('full-porting-inventory-20261014.json','interfaces'),('individual-interface-closure-20261014.json','rows')]:
 p=base/fn;data=json.loads(p.read_text())
 for row in data[key]:
  if row['name'] in updates:row['current_phase_024']=updates[row['name']]
  old=row.get('current_phase_024',row.get('current_phase_023',{}))
  if old.get('classification')=='electron_os_web_adaptation_not_equivalent':
   if row['name'] not in os:raise ValueError('Missing explicit OS decision '+row['name'])
   row['current_phase_024']={**old,'phase':'ITER024','classification':'electron_os_web_adaptation_not_equivalent','status':'native_platform_contract_explicit_boundary','ownLevel':'I1-explicit-platform-boundary','reason':os[row['name']],'source_body_evidence':row.get('reference_static_summary'),'remaining':['源native契约不声称等价；仅明确记录浏览器替代或平台不适用；许可运行仍R0。'],'platform_decision':'Per-ID native dependency / actual browser adaptation recorded; no family blanket promotion.'}
 counts=Counter(r.get('current_phase_024',r.get('current_phase_023',{})).get('classification','unclassified')for r in data[key])
 if key=='rows':data['current_categories']=dict(counts);data['latest_phase']='ITER024 exact per-ID implementation and 52 platform decisions'
 else:
  data['current_phase_024'].update(updated_interface_count=sum('current_phase_024'in r for r in data[key]),latest_mixed_stage_counts=dict(counts),all_porting_complete=False,source_contract_gaps=[])
  data['current_phase_024']['remaining']=[{'id':r['id'],'name':r['name'],'status':r.get('current_phase_024',r.get('current_phase_023',{})).get('classification'),'remaining':r.get('current_phase_024',r.get('current_phase_023',{})).get('remaining',[])}for r in data[key]]
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
# Publish a concise latest view; old bodies remain explicitly historical.
ind=json.loads((base/'individual-interface-closure-20261014.json').read_text())
lines=['# 当前逐接口矩阵（ITER024）','','每项分别核对源入口、真实实现及验证。S/R/I互不替代，竞品许可运行R0。旧阶段仍保存在JSON，不覆盖旧源码指纹。','','| ID | 源入口 | 当前分类 | 证明/差异 |','|---|---|---|---|']
for r in ind['rows']:
 c=r.get('current_phase_024',r.get('current_phase_023',{}));lines.append('| '+' | '.join(str(v).replace('|','\\|').replace('\n',' ')for v in [r['id'],r['name'],c.get('classification'),c.get('reason')])+' |')
(base/'individual-interface-closure-20261014.md').write_text('\n'.join(lines)+'\n')
fullp=base/'full-porting-inventory-20261014.md';body=fullp.read_text();marker='<!-- ITER024-LATEST-INDIVIDUAL -->';end='<!-- /ITER024-LATEST-INDIVIDUAL -->'
if marker in body:body=body.split(end,1)[1].lstrip()
intro=[marker,'# ITER024 当前逐项结果','','本节优先于后方所有历史快照，包括旧“缺印章/金额/规则分支”叙述。当前功能逐项证据详见[最新182接口分类](individual-interface-closure-20261014.md)；原41组/金额12家族17支路/35场景/108类别实际消费见[规则激活矩阵](rule-runtime-activation-20261014.md)。','','- 自定义raw类型已补完整识别、规则、复核、策略、映射、LPM、还原和native备份；8层证据叠加第9来源不再失败。','- 处理报告、Markdown统计、诊断、图像OCR与标签、批量还原、网络真实gate、recent/recovery和独立Markdown人工稿均有逐入口实现。','- 52项OS/桌面能力逐ID记录真实browser替代或不适用依赖，未用同family已有能力升级成源wire兼容。','- private/许可依赖和原.tmm容器互通边界仍明确未完成；不宣称竞品全部运行或完全等价。',end,'','## 历史阶段（以下过时状态只作对账）','']
fullp.write_text('\n'.join(intro)+body)
print(json.dumps({'updated_names':len(updates),'OS_individual_decisions':len(os),'current_counts':ind['current_categories']},ensure_ascii=False))
