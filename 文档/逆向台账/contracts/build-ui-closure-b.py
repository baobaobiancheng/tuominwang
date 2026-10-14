# coding: utf-8
"""Rebuild reviewed frontend-entry dispositions; never execute competitor JS."""
import json, pathlib, hashlib, sys, collections
ROOT=pathlib.Path.cwd(); HERE=ROOT/'文档/逆向台账/contracts'; R='.data/research/lawbot-2026-10-13/readable/renderer.js'
load=lambda p:json.loads((ROOT/p).read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
scan=load('文档/逆向台账/contracts/ui-closure-b-scan.json'); index={x['id']:x for x in load('文档/逆向台账/contracts/ipc-contract-index.json')['channels']}
manual={}
for fn in ['manual-system-contracts.json','manual-workflow-contracts.json','manual-collaboration-contracts.json']:
 p=load('文档/逆向台账/contracts/'+fn)
 for c in p.get('contracts',p.get('interfaces')):manual[c['id']]=(fn,c,p)
# Explicitly reviewed sources and UI event/program triggers. These are NOT inferred from names.
ui={
'auth:restore-session-token':('RestorePseudonymPanel mounted→ee2；自动回填ie2和用户重试前再次ee2。P2=window.anbao。成功保存authToken并设置已认证；失败清token、进入认证弹窗。',[(28661,28685),(28709,28716),(28798,28803)]),
'auth:create-recovery-request':('AuthDialog mounted且initialPhase=recovery：创建/恢复密码恢复申请；success后按exported恢复导入步骤，失败映射code展示且不重置申请。',[(28439,28445),(28587,28599),(31891,31899)]),
'app:open-path':('OS open-file/second-instance→主进程app:open-path→appRuntime.onOpenPath→Dashboard mounted订阅→Od2(path)→workspace store.openRecent→恢复审查；打开失败刷新最近列表并显示错误。',[(32859,32876),(33364,33373)]),
'app:get-env':('case store.fetchEnvironment由AppHeader mounted触发，更新environment；LicenseView mounted另走window.ipc.invoke读取版本/mode，后读取授权状态。异常保留默认显示。',[(3574,3578),(4163,4170),(37618,37626)]),
'license:get-machine-id':('LicenseView b2读授权状态失败且不是LEGACY_UPGRADE_NEEDED时的降级分支；机器码成功不代表授权成功。mounted调用b2。',[(37559,37580),(37618,37626)]),
'software-update:set-preferences':('SoftwareUpdateDialog保存按钮b2→Ru store.savePreferences→anbao.softwareUpdate.setPreferences，提交完整四个布尔偏好；success关闭弹窗，失败显示未确认。',[(4051,4054),(4119,4128),(4149,4158)]),
'get-pdfjs-worker-path':('PDFReview加载与Dashboard PDF文本预处理两处：workerSrc空时经window.electron.ipcRenderer.invoke取得fileUrl并传PDF.js；失败workerSrc置空，后续加载异常按预览流程处理。',[(25823,25853),(34691,34704)]),
'window:toggle-maximize':('AppWindowControls非macOS最大化/还原按钮onClick h2→通用invoke→随后c2查询is-maximized。异常吞掉但仍回查。',[(3945,3948),(3964,3969),(4026,4027)]),
'app:consume-open-path':('Dashboard mounted从appRuntime一次消费冷启动.tmm路径，非空交Od2→store.openRecent；reject吞掉，后续仍订阅热启动onOpenPath。',[(32859,32876),(33369,33373)]),
'auth:get-capabilities':('三处：菜单ve2检查是否配置密码；AuthDialog mounted R2选择系统/密码/设置/迁移阶段；Dashboard qa2在受保护操作前要求initialized/unlocked否则打开认证弹窗。',[(28353,28359),(28452,28468),(28587,28588),(31900,31924)]),
'window:before-close':('OS窗口关闭→主进程阻止默认关闭并发requestId→AppWindowControls mounted onBeforeClose→等待workspace:prepare-close→无dirty则resolve allow，有dirty展示保存/不保存/取消；失败resolve failed；卸载取消订阅。',[(3970,4005),(4008,4027)]),
 'task-power:state':('macOS powerMonitor suspend/resume实际状态变更→广播→Dashboard mounted taskPower.onState→Vn2.update→uc2恢复快照/保存；卸载取消订阅。',[(32807,32819)]),
'license:activate':('LicenseView激活按钮/Enter触发x2，trim输入授权串后invoke；success重新b2确认并清输入，旧版升级进入对应状态，其余显示错误。仅静态阅读，未激活/绕过。',[(37591,37608),(37636,37639)]),
'window:minimize':('AppWindowControls非macOS最小化按钮onClick d2→window.ipc.invoke；异常忽略。',[(3945,3948),(3958,3963),(4026,4027)]),
'window:is-maximized':('四处真实调用：AppWindowControls mounted和切换后c2；DOCX/PDF/图片审查组件窗口resize后Dn2/B2/Wa2，布尔用于布局；异常false。',[(3951,3957),(3964,3969),(4008,4009),(6641,6650),(22408,22417),(27063,27072)]),
'net:get-stats':('Dashboard sn2→net.getStats读取计数/offline，更新在线状态；un2立即及每2秒轮询，visibilitychange隐藏时停轮询；失败保留前值。',[(31394,31413)]),
'auth:set-password':('AuthDialog设置并继续按钮/Enter→F2：先校验最少4位及两次一致→i2.auth.setPassword；verify-or-setup再verifyPassword取得token；设置成功但授权失败不会报告全部成功。',[(28495,28523),(28602,28602)])}
notes={
'workspace:save-as':'renderer中saveAs属于vu工作区store。实际M2调用selectSavePath再N2/workspace.save；不是该旧save-as通道。',
'workspace:create-transfer':'preload保留createTransfer；当前renderer没有createTransfer成员或该通道字面量，不能用页面传输文案推断此调用。',
'feedback:add':'renderer实际使用feedback.addBatch；没有feedback.add。普通Set.add/Array等同名方法已排除。',
'feedback:query':'query为路由/DOM/三方对象字段，未归属于anbao.feedback。',
'auth:lock':'auth.lock无调用；其他lock命中来自流/ZIP等三方对象，不能作为认证锁定入口。',
'app:get-docx-safe-mode':'renderer没有docxSafeMode命名空间；profiles.get/rulesets.get和Map.get等同名方法已排除。',
'app:set-docx-safe-mode':'renderer没有docxSafeMode命名空间；Map.set等同名方法已排除。',
'desensitization:read-file':'唯一readFile成员属于process.getBuiltinModule("fs").promises，系PDF.js Node加载分支，不是anbao.desensitization.readFile。',
'learner:rollback-previous':'没有专用preload，handler固定返回自学习回滚功能已下线；无renderer通道字面调用。',
'learner:rollback':'专用preload仍暴露snapshotId参数，handler忽略并固定返回已下线。',
'learner:get-snapshots':'preload仍暴露，但handler固定success:true,snapshots:[]；无renderer入口。',
'pseudonym:select-input-markdown-batch':'当前恢复面板使用统一selectInputFiles，专用Markdown多选方法保留但无renderer引用。',
'pseudonym:select-input-docx-batch':'当前恢复面板使用统一selectInputFiles，专用Word多选方法保留但无renderer引用。'}
def range_(p,a,b,note=''):
 lines=(ROOT/p).read_text().splitlines(keepends=True);assert 1<=a<=b<=len(lines)
 return {'path':p,'start_line':a,'end_line':b,'slice_sha256':sha(''.join(lines[a-1:b]).encode()),'note':note}
contracts=[]
for id in scan['scopeIds']:
 c=index[id]; ch=c['channel']; fn,m,p=manual[id]; paths={'window.anbao.'+x['apiPath'] for x in c['preloadExposures']}
 actual=[x for x in scan['observations'] if x['id']==id and (x['type']=='channel-literal' or x.get('resolved') in paths)]
 assert bool(actual)==(ch in ui),ch
 evidence=m.get('evidence',m.get('manual_handler_service_evidence',[]))
 if not evidence and m.get('evidenceIds'):evidence=[p['evidence'][key] for key in m['evidenceIds'] if key in p['evidence']]
 input_=m.get('input',m.get('inputAndFiltering',m.get('input_contract')))
 result=m.get('returns',m.get('outputContract',m.get('success_contract')))
 effects=m.get('effects',m.get('persistentAndMemoryEffects',m.get('semantic_observation')))
 errors=m.get('failures',m.get('failureAndCancellation'))
 family=p.get('families',{}).get(m.get('family_ref'),{})
 if not errors:errors=family.get('errors','以逐项原始handler返回/throw及family错误契约为准；未推断全依赖错误全集。')
 if family:effects+='；共享存储：'+family.get('store','见family服务证据')
 disposition='renderer_entry_traced' if actual else 'no_published_renderer_caller'
 if ch in ['app:open-path','window:before-close','task-power:state']:disposition='main_event_renderer_subscription_traced'
 if ch.startswith('learner:') and not actual:disposition='disabled_or_constant_compatibility_handler'
 raw=[]
 for h in c['handlers']:
  e=h['evidence'];t=(ROOT/e['path']).read_text().encode('utf-16-le');raw.append({'evidence':e,'source':t[e['start']*2:e['end']*2].decode('utf-16-le')})
 contracts.append({'id':id,'channel':ch,'entryDisposition':disposition,'knownSnapshotEntryAuditClosed':True,'uiLocated':bool(actual),'trigger':ui[ch][0] if actual else notes.get(ch,'发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。'), 'input':input_,'return':result,'error':errors,'effects':effects,'preload':c['preloadExposures'],'mainOperations':c['operations'],'rawHandlersReviewed':raw,'eventEmissions':c['eventEmissions'],'rendererObservations':actual,'rendererEvidence':[range_(R,a,b,'人工核读触发/调用/返回处理') for a,b in ui.get(ch,('',[]))[1]],'priorManualRef':{'path':'文档/逆向台账/contracts/'+fn,'id':id},'mainServiceEvidence':evidence,'absenceAudit':None if actual else {'scanRef':'文档/逆向台账/contracts/ui-closure-b-scan.json','exactChannelLiteralAndResolvedBridgeMembers':0,'sameLeafCandidateCount':sum(x['id']==id for x in scan['observations']),'interpretation':'仅对该发布包renderer的静态已知调用集合无引用。通用invoke暴露任意字符串能力仍存在，不等于处理器全局不可达。'},'remaining':['竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。','未宣称全产品完整业务契约或我方同名功能均已对齐。'],'staticDepth':'S2','runtime':'R0','completeBusinessContract':False})
assert len(contracts)==57
files={x['path'] for x in scan['files']}|{R,'文档/逆向台账/contracts/ipc-contract-index.json','文档/逆向台账/contracts/ui-closure-b-scan.json'}
def refs(x):
 if isinstance(x,dict):
  if 'path'in x and (ROOT/x['path']).is_file():files.add(x['path'])
  for v in x.values():refs(v)
 elif isinstance(x,list):
  for v in x:refs(v)
refs(contracts)
report={'schemaVersion':1,'date':'2026-10-13','scope':'原115项待核按ID字典排序索引58..114，固定57项；仅公开发布包静态分析。','summary':{'reviewed':57,'rendererLocated':sum(x['uiLocated'] for x in contracts),'noPublishedRendererCaller':sum(not x['uiLocated'] for x in contracts),'dispositions':dict(collections.Counter(x['entryDisposition'] for x in contracts)),'remainingUnclassifiedKnownSnapshotEntries':0,'completeBusinessContracts':0,'runtimeVerified':0},'method':['对5个发布renderer文件做TypeScript AST解析；遍历全部成员访问/字面通道，并按词法声明展开window.anbao别名。','逐项阅读57个原始handler/事件、17项renderer函数体和触发/返回处理；现有人工service契约仅作服务层来源，未冒充本轮全依赖重审。','无调用的40项按发布包无引用归类，避免将preload暴露或同名本地store方法推断成真实UI。通用invoke的能力边界由动态桥专项记录。'],'scanRef':'文档/逆向台账/contracts/ui-closure-b-scan.json','sourceFiles':[{'path':p,'bytes':(ROOT/p).stat().st_size,'sha256':sha((ROOT/p).read_bytes())}for p in sorted(files)],'contracts':contracts}
text=json.dumps(report,ensure_ascii=False,indent=2)+'\n';md=['# 前端入口核验 B：57 项','',f"本组57项已逐项归类：17项renderer调用或通知订阅，40项发布renderer无对应调用（其中3项是停用/常量兼容处理器）。这不是57个可运行功能，也不是全业务契约完成。运行仍为R0。",'','复核：`node 文档/逆向台账/contracts/scan-ui-closure-b.mjs --check`；`python3 文档/逆向台账/contracts/build-ui-closure-b.py --check`。','', '源文件全集、SHA-256、UTF-16字符偏移和源码行范围保存在JSON；同名候选排除记录在scan.json。', '']
for c in contracts:
 md+=['## '+c['id']+' '+c['channel'],'','- 分类：'+c['entryDisposition'],'- 触发/无引用依据：'+c['trigger'],'- 输入：'+str(c['input']),'- 返回：'+str(c['return']),'- 错误：'+str(c['error']),'- 副作用：'+str(c['effects']),'- preload：'+(', '.join(x['apiPath'] for x in c['preload']) or '没有专用暴露；检查通用invoke/通知。'),'- 前端范围：'+('; '.join(f"{x['path']}:{x['start_line']}-{x['end_line']}"for x in c['rendererEvidence']) or '全5个发布renderer文件AST无对应已知调用，见缺席审计。'),'- 主进程范围：'+('; '.join(f"{x['evidence']['path']} [{x['evidence']['start']},{x['evidence']['end']})" for x in c['mainOperations'] if x['side']=='main')),'- 剩余边界：'+' '.join(c['remaining']),'']
md='\n'.join(md)+'\n'
for fn,t in [('ui-closure-b.json',text),('ui-closure-b.md',md)]:
 path=HERE/fn
 if '--check'in sys.argv:assert path.read_text()==t,fn+' output drift'
 else:path.write_text(t)
print(json.dumps(report['summary'],ensure_ascii=False))
