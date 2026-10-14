# coding: utf-8
"""Build/check manually reviewed UI-entry dispositions; never executes target JS."""
from pathlib import Path
import json,hashlib,sys
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).with_name('ui-closure-a.json')
def read(p):return json.loads((ROOT/p).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def ev(path,a,b,note):
 p=ROOT/path;raw=p.read_bytes();lines=raw.splitlines(keepends=True)
 return dict(path=path,start_line=a,end_line=b,slice_sha256=sha(b''.join(lines[a-1:b])),file_sha256=sha(raw),note=note)
R='.data/research/lawbot-2026-10-13/readable/renderer.js';P='.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js'
# Each row below was read with its surrounding function, receiver/alias and UI binding.
A={
'license:get-status':('授权页初始化/激活成功回读、App挂载、受许可保护的路由beforeEach、应用菜单授权信息、导出客户名读取','window.ipc.invoke常量通道；五处调用。路由/初始化未激活跳转license；客户名读取1500ms超时回空。',(4160,4180),(28345,28351),(35675,35686),(37559,37581),(37614,37628),(37826,37836)),
'auth:migrate-legacy-password':('认证弹窗“验证并升级”/新密码输入回车','$2验证旧密码及两次新密码；i2=window.anbao；成功emit success/password_set/authToken，失败保留错误并清空旧密码。',(28438,28441),(28525,28536),(28602,28602)),
'software-update:acknowledge-whats-new':('软件更新弹窗“开始使用”','_2→Ru.acknowledgeWhatsNew→anbao.softwareUpdate；更新state，setupCompleted后关窗，否则进入设置。',(4068,4071),(4148,4154),(4158,4158)),
'software-update:download':('软件更新详情“开始下载”','x2→Ru.download，先关弹窗；成功取state，失败重开status，异常标UPDATE_DOWNLOAD_RESULT_UNKNOWN。',(4059,4064),(4137,4139),(4158,4158)),
'window:resolve-close':('标题栏关闭后收到before-close；保存退出/放弃退出/取消/失败','m2将requestId、decision、error传preload；保存或恢复记录清理失败时decision=failed，窗口继续保留。',(3974,4025)),
'auth:verify-password':('认证弹窗确认/回车；verify-or-setup设密码后的授权回填','B2/ F2→i2.auth.verifyPassword；读取authToken；NEED_SET_PASSWORD切设置，其他失败清空输入。',(28438,28439),(28483,28523),(28602,28602)),
'app:write-clipboard-text':('应用菜单的传输副本弹窗“复制传输密码”','he2传y2.value，回读success后显示已复制；失败提示手动复制。navigator.clipboard其他三处并非此IPC。',(28326,28334),(28386,28386)),
'auth:import-recovery-file':('认证恢复步骤“导入恢复文件”/重新导入','z2只在申请已导出且未busy时调用，取消不报错，success后允许设置新密码。',(28553,28565),(28602,28602)),
'app:reset-docx-safe-mode':('DOCX安全预览提示“恢复高保真预览”','Gr2先删localStorage DOCX_PREVIEW_DISABLED，再通过window.ipc??window.anbao的invoke常量调用，吞异常并显示恢复提示；故UI提示不是主进程成功确认。',(7456,7467),(10352,10352)),
'desensitization:open-output-dir':('回填结果、单文件导出结果、批量导出结果打开输出目录','P2=window.anbao的可选链fallback和两处window.anbao直调用。回填优先pseudonym.openOutputFolder，只有outputDir存在时走此接口；导出两处吞异常。',(28610,28620),(28789,28796),(28828,28828),(31945,31948),(37165,37168),(37531,37531)),
'auth:complete-recovery':('认证恢复步骤“重置密码”/回车','K2要求已验证恢复文件、两次密码一致且未busy；传nextPassword，成功清空字段回到密码解锁。',(28571,28585),(28602,28602)),
'auth:save-recovery-request':('认证恢复步骤“导出恢复申请文件”/申请遗失重新导出','L2要求已生成申请，调用无参；用户取消不改变成功状态，成功置exported并显示支持邮箱。',(28538,28551),(28602,28602)),
'window:close':('非Mac自绘标题栏“关闭”','p2→window.ipc.invoke(window:close)；主进程close触发关闭确认协议，不能等同立即退出。',(3935,3945),(3971,3973),(4025,4025)),
'auth:check-password':('应用菜单修改密码“验证当前密码”/旧密码回车','ie2将旧密码传auth.checkPassword，成功才开启新密码输入；KEY_HIERARCHY_AUTH_FAILED和AUTH_NOT_CONFIGURED分别提示。',(28255,28275),(28386,28386)),
'app:open-external':('DOCX预览/文本预览点击http或https链接','fu2捕获a[href]点击，阻止默认导航，仅http(s)调用openExternal；preload使用send，主进程on接收。',(10058,10065),(10352,10352)),
'software-update:get-state':('App已激活挂载或离开license路由时初始化更新store','Ru.initialize幂等，先订阅state再getState；首启设置/whats-new自动展示，失败UPDATE_STATUS_UNKNOWN。',(4027,4051),(4160,4180)),
'auth:request-system-grant':('认证弹窗“使用Touch ID或Mac密码”','O2→i2.auth.requestSystemGrant无参；authToken成功后进入设置或emit success，AUTH_CANCELLED不报错。',(28438,28439),(28470,28481),(28602,28602)),
'app:read-legal-doc':('应用菜单用户协议/产品介绍/隐私政策','watch s2将agreement/intro/privacy映射三个固定md名称；成功显示content，失败清空文案并显示错误。',(28361,28378),(28385,28386)),
'auth:has-password':('workspace打开/保存前密钥状态检查；认证能力读取失败后的fallback','workspace x2→hasPassword返回initialized/hasPassword/unlocked/needsLegacyMigration；AuthDialog i2=anbao 的fallback从结果选password/system-unavailable/set-password。',(3705,3720),(3844,3876),(28438,28439),(28452,28468)),
'software-update:check':('软件更新弹窗“检查更新”','w2→store.check→anbao.softwareUpdate.check；保留更晚available/downloading/ready状态，成功切详情/ready。',(4054,4058),(4129,4135),(4158,4158)),
'desensitization:save-markdown-draft':('单文件/批量导出失败后的“导出待人工处理稿”','两处取得方法别名t3/n3再调用，确认明确残留敏感信息后传outputPath/content；单文件失败保留审查，批量逐项保留失败记录。',(31953,31969),(37175,37198),(37531,37531)),
'app:read-onboarding-sample':('导入页“导入示例文档”','yn2→readOnboardingSample无参；检查success/data和至少1024bytes，转换Uint8Array经Kg2导入替换；失败显示未完整加载。',(31453,31467),(37464,37464)),
'software-update:restart-and-install':('更新准备完成“重启并更新”','k2→Ru.restartAndInstall无参；store更新state，异常提示先检查是否仍运行而非反复安装。',(4065,4067),(4140,4146),(4158,4158)),
'auth:change-password':('应用菜单“修改密码”/确认新密码回车','re2要求已验旧密码且两次新密码一致；传currentPassword/nextPassword；成功清空字段；异常标结果未确认。',(28278,28291),(28386,28386)),
'software-update:state':('主进程更新状态通知→已激活App的更新store','HI.emitState发送至所有存活窗口，preload listener去event后传state并返回取消订阅；Ru在dispose移除监听，非invoke接口。',(4037,4051),(4160,4180)),
 'task-power:get-state':('macOS工作台挂载获取电源状态初始快照','e3=window.anbao?.taskPower别名，darwin条件成立才e3.getState；onState驱动Vn2与恢复保存，unmount注销。',(32807,32819)),
'log:renderer-error':('DOCX预览失败、审查挂载异常、Vue捕获、window error/unhandledrejection；preload异常兜底','renderer七处通过通用invoke可到ipcMain.handle。preload两处send未找到同名on，存在transport mismatch，不把这两条兜底标成有效。',(7447,7454),(7580,7595),(10325,10338),(31970,31978),(37856,37873))
}
N={
'dictionary:export':'renderer主包无dictionary引用；PDF worker中三处exportData属于Font/ErrorFont，不是anbao.dictionary。',
'dictionary:export-excel':'同名exportExcel三处属于rulesets store→anbao.rulesets.exportExcel；没有dictionary接收者。',
'dictionary:download-excel-template':'同名downloadExcelTemplate三处属于rulesets store→anbao.rulesets.downloadExcelTemplate；不是dictionary。',
'mcp-connectors:open':'72个open词法候选逐项接收者核查属于确认弹窗、workspace、PDF/XHR等。mcpConnectors的5处API引用仅getStatus/copySetup/retry/chooseFolder，未取对象别名或open方法。',
'ai-collab:attach-sources':'attachSources/channel零renderer引用；但是服务attachSelectedDocxPaths在ai-collab:authorize处理器中被内部调用（M24440–24447），不能把内部复用写为这个IPC有UI调用。',
'auth:cancel-recovery':'cancelRecovery/channel零引用；恢复弹窗j2仅重置UI字段并emit cancel，不调用主进程cancelRecovery（28568–28570）。',
'learner:update-rules':'updateRules/channel零引用；主进程是常量success/stats:null/rulesetHash空串，不实际学习。',
'learner:rollback-to-previous':'rollbackToPrevious/channel零引用；主进程明确返回自学习回滚已下线。',
'desensitization:process-files':'processFiles/channel零引用；handler虽命名process-files，实际只读源文件字节并建输出目录，不执行脱敏。',
'image-review:clear-ocr-cache':'无专用preload暴露，通道常量在全部renderer资产零引用。注册的handler只删除一个缓存key。',
'license:refresh':'无专用preload方法；全部renderer资产不存在此通道常量，界面刷新使用get-status。',
'license:get-summary':'无专用preload方法；全部renderer资产不存在此通道常量，授权摘要由get-status字段投影。',
'app:get-version':'无专用preload方法；全部renderer资产不存在此通道常量，UI当前版本用编译常量0.5.9/其他状态数据。',
}
E={
'dictionary:export':'读取/映射异常返回success:false,error:message；不写文件。',
'dictionary:export-excel':'无活动窗口或取消返回success:false；保存对话框在try外，写xlsx异常返回error:message。',
'dictionary:download-excel-template':'无窗口/用户取消返回success:false；模板生成或writeFile异常返回error:message。',
'dictionary:add-entry':'addDictionaryEntry异常返回success:false,error:message；成功rulesUpdated:false，未启动规则重建。',
'dictionary:import':'importDictionaryEntries异常返回success:false,error:message；输入逐条写入的事务边界见既有服务证据。',
'dictionary:select-excel-import-file':'无窗口/取消返回success:false；Excel解析失败返回带前缀error，行级错误放errors数组。',
'feedback:get-document-stats':'getAllFeedbacks/filter异常返回success:false,error；文件名严格相等，空结果统计均0。',
'feedback:export-audit-report':'未激活requiresActivation:true；目录/动态加载/报告生成异常返回success:false,error。',
'mcp-connectors:open':'非主窗口拒绝；openConnector异常捕获为success:false/error（不支持客户端、找不到客户端或OS启动失败）。',
'mcp-connectors:update-automation':'非主窗口拒绝；服务异常success:false/error；拒绝分享恢复密码true以及无效/不可写目录。',
'learner:update-rules':'固定success:true,stats:null,rulesetHash空串，没有学习/写文件。',
'learner:rollback-to-previous':'固定success:false，提示功能已下线并转首页黑白名单。',
'pseudonym:select-input-docx':'无活动窗口/用户取消success:false；native dialog拒绝在handler没有catch，Promise拒绝。',
'pseudonym:select-input-markdown':'无活动窗口/用户取消success:false；native dialog拒绝在handler没有catch，Promise拒绝。',
'review:get-feedbacks':'存储读取异常success:false,error；返回全部feedback，没有按UI文档过滤。',
'review:clear-all':'await clear失败success:false,error；成功清共享反馈数据。',
'ai-collab:attach-source':'共享d2检查主窗口及网关；服务失败包装success:false,error,errorCode；JOB_NOT_AVAILABLE/INVALID_STATE/格式和文件读取错误沿服务抛出。',
'ai-collab:attach-sources':'共享d2检查主窗口及网关；JOB_NOT_AVAILABLE/INVALID_STATE/INVALID_ARGUMENTS/UNSUPPORTED_FORMAT/FILE_SETTINGS_OUT_OF_SCOPE和文件错误返回errorCode；多文件创建失败不证明成组回滚。',
'ai-collab:set-review-intent':'共享d2检查主窗口及网关，服务错误包装success:false,error,errorCode；详见serviceEvidence状态检查。'
}
L=read('文档/逆向台账/ledger.json'); census=read('文档/逆向台账/contracts/ui-closure-a-census.json'); ids=census['scopeIds']; selected=sorted((i for i in L['interfaces'] if i['id'] in ids),key=lambda i:i['id']);idx={x['channel']:x for x in read('文档/逆向台账/contracts/ipc-contract-index.json')['channels']};calls={x['channel']:x for x in census['channels']}
manual={}
for name,key in [('manual-system-contracts.json','contracts'),('manual-workflow-contracts.json','contracts'),('manual-collaboration-contracts.json','interfaces')]:
 for x in read('文档/逆向台账/contracts/'+name)[key]:manual[x['channel']]=(name,x)
rows=[]
for i in selected:
 ch=i['name'];name,m=manual[ch];old=i['manual_observation']['confirmedLocalRelations'];index=idx[ch]
 if ch in A:
  d=A[ch];status='reachable_with_transport_mismatch' if ch=='log:renderer-error' else 'reachable_static';trigger=d[0];note=d[1]; evidence=[ev(R,*rng,'人工核读调用、别名、控制分支或UI绑定') for rng in d[2:]]
 else:
  status='no_renderer_reference';trigger='本发布包未引用的暴露/注册端点，不能虚构UI按钮';note=N.get(ch,'全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。');evidence=[]
  if ch=='ai-collab:attach-sources':evidence.append(ev('.data/research/lawbot-2026-10-13/readable/main.js',24440,24447,'authorize的内部服务复用，不是attach-sources通道调用'))
  if ch=='auth:cancel-recovery':evidence.append(ev(R,28568,28570,'关闭恢复UI不调用cancelRecovery'))
  if ch.startswith('dictionary:'):evidence.extend([ev(R,28878,28912,'当前黑白名单UI的rulesets store'),ev(R,29080,29098,'当前黑白名单导入/导出按钮')])
  if ch=='mcp-connectors:open':evidence.append(ev(R,27998,28082,'mcpConnectors全体UI API接收者核读'))
 exposure=index['preloadExposures']; pEvidence=[ev(P,e['evidence']['startLine'],e['evidence']['endLine'],'专用preload转发') for e in exposure]
 if not exposure or ch in ['license:get-status','window:close','app:reset-docx-safe-mode','log:renderer-error']:pEvidence.append(ev(P,307,315,'通用invoke转发；跨任意输入范围另由动态调用审查限定'))
 if ch=='log:renderer-error':pEvidence.append(ev(P,317,338,'send异常兜底与handle不匹配'))
 fields={
  'input':m.get('input',m.get('inputAndFiltering',m.get('input_contract'))),
  'returns':m.get('returns',m.get('outputContract',m.get('success_contract'))),
  'effects':m.get('effects',m.get('persistentAndMemoryEffects',m.get('semantic_observation'))),
  'errors':E.get(ch,m.get('failures',m.get('failureAndCancellation'))),
  'preconditions':m.get('preconditions','共享校验及前置见serviceEvidence和priorManualContract')
 }
 rows.append(dict(id=i['id'],channel=ch,entryResolution=status,entryInvestigationComplete=True,completeBusinessContract=False,runtime='R0',trigger=trigger,semanticReview=note,preloadApiPaths=calls[ch]['apiPaths'],rendererEvidence=evidence,preloadEvidence=pEvidence,handlerEvidence=old['handlerEvidence'],mainOperations=old['handlerOrEventOperations'],serviceEvidence=old.get('manualSourceEvidence',[]),contract=fields,priorManualContract={'path':'文档/逆向台账/contracts/'+name,'id':i['id']},staticCensus={'referenceCandidates':len(calls[ch]['references']),'path':'文档/逆向台账/contracts/ui-closure-a-census.json','channel':ch},remainingUnknown=['竞品许可后运行行为与跨平台实测未验证。','外部服务、原生依赖的实际可用性和所有异常组合未由静态检查证明。']+(['通用invoke可接收任意字符串；无静态前端引用仅限定此发布包资产，不能证明外部注入/未来版本不可调用。'] if status=='no_renderer_reference' else [])+(['preload的send两条兜底在本包只有handle的情况下不会调用该handler。'] if ch=='log:renderer-error' else [])))
report=dict(schemaVersion=1,sourceVersion='0.5.9',analysisDate='2026-10-13',scopeIds=ids,scope='115条UI入口待核按id字典序前58项，固定快照；不执行目标代码',summary={'reviewed':len(rows),'uiOrLifecycleReachable':sum(r['entryResolution']=='reachable_static' for r in rows),'reachableWithTransportMismatch':sum(r['entryResolution']=='reachable_with_transport_mismatch' for r in rows),'noRendererReference':sum(r['entryResolution']=='no_renderer_reference' for r in rows),'entryClassificationUnknown':0,'completeBusinessContracts':0,'runtimeVerified':0},methodology=['AST枚举当前sourceInventory所列全部renderer JS/MJS资产及HTML入口（含补提取的OpenJPEG fallback），保存每个词法候选；逐条核读接收者、别名、调用条件、结果处理和模板绑定。','有词法候选不等于通道调用；例如dictionary与rulesets的同名方法、PDF worker的Font.exportData已人工排除。','没有引用是本发布包静态入口分类结论，不代表API不可被通用invoke动态调用，也不代表产品运行等价。','参数/返回/持久化副作用使用已核读并引用原始handler的逐项人工契约，所有原始范围可校验；未执行任何竞品JS。'],sourceInventory=census['sources'],interfaces=rows)
content=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
md=['# 前端入口核验 A（58 项）','',f"核读 58 项：UI/生命周期可追踪 {report['summary']['uiOrLifecycleReachable']} 项、可追踪但存在传输方式缺陷 1 项、发布包无静态前端引用 {report['summary']['noRendererReference']} 项。入口分类未决 0；竞品运行验证 0；完整业务契约声明 0。",'', '“无静态前端引用”是明确分类，不是伪造UI闭合。通用invoke桥仍允许外部字符串；动态输入边界须结合单独审查。缺少许可证，不能把静态完成写成运行全覆盖。','', '发现：log:renderer-error 的renderer invoke与主进程handle匹配，但preload的两个send兜底不匹配。auth:cancel-recovery未被当前UI调用；恢复UI返回只清空本地状态。','', '| ID / 通道 | 入口分类 | 入口与语义 |','|---|---|---|']
for r in rows:md.append('| '+r['id']+' / `'+r['channel']+'` | '+r['entryResolution']+' | '+r['trigger']+'；'+r['semanticReview'].replace('|','／')+' |')
md+=['','## 逐项证据和契约','', 'JSON中每项保存 renderer/preload 精确行范围、文件和范围 SHA256，主进程原始UTF-16范围、既有服务证据、参数/返回/错误/副作用及未知项。census保存全部候选，不能单独作为语义闭合结论。','', '复核：','```sh','node 文档/逆向台账/contracts/scan-ui-closure-a.mjs --check','python3 文档/逆向台账/contracts/build-ui-closure-a.py --check','```','']
mdtext='\n'.join(md)
if '--check' in sys.argv:
 assert OUT.read_text()==content,'manual report drift'
 assert OUT.with_suffix('.md').read_text()==mdtext,'markdown drift'
 # Validate new line-based evidence and original JS UTF16 ranges.
 for r in rows:
  for e in r['rendererEvidence']+r['preloadEvidence']:
   p=ROOT/e['path'];raw=p.read_bytes();assert sha(raw)==e['file_sha256'];assert sha(b''.join(raw.splitlines(keepends=True)[e['start_line']-1:e['end_line']]))==e['slice_sha256']
  for e in r['handlerEvidence']:
   raw=(ROOT/e['path']).read_text().encode('utf-16-le');part=raw[e['start']*2:e['end']*2].decode('utf-16-le').encode();assert sha(part)==e['sliceSha256'],r['channel']
 print(json.dumps(report['summary'],ensure_ascii=False))
else:OUT.write_text(content);OUT.with_suffix('.md').write_text(mdtext);print(json.dumps(report['summary'],ensure_ascii=False))
