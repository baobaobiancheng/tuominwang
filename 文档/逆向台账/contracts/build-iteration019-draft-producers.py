#!/usr/bin/env python3
# coding: utf-8
"""Read fixed renderer bytes; never execute vendor code."""
from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[3];C=Path(__file__).parent
source='.data/research/lawbot-2026-10-13/readable/renderer.js';expected='4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc'
sha=lambda b:hashlib.sha256(b).hexdigest()
b=(R/source).read_bytes();assert sha(b)==expected;ls=b.splitlines(keepends=True)
ranges={'hidden-state':(4270,4286),'rejected-detection':(27856,27927),'visual-table-box':(30417,30434),'types-rules':(31092,31130),'incremental-helpers':(31167,31233),'restore-types':(31281,31299),'batch-incremental':(31349,31393),'source-reference':(31567,31579),'review-status':(32124,32157),'unified-disable':(33374,33403),'mapping-sync':(33413,33423),'mapping-draft':(33437,33464),'export-confirm-fingerprint':(33487,33495),'image-shape-projection':(33700,33713),'profile-mode':(33714,33732),'mode-mapping':(33754,33765),'queue-selector':(33985,33997),'buffer-read':(34071,34081),'queue-runner':(34353,34400),'audit-boxes':(34591,34678),'audit-count-docx-md':(35150,35198),'docx-image-insert':(35199,35223),'audit-count-visual':(35224,35271),'project-insert-visual':(35272,35327),'project-add':(35331,35385),'project-delete':(35386,35418),'export-mode-refresh':(35448,35450),'docx-ocr-merge':(35489,35503),'docx-image-recognize':(35530,35552),'batch-route-reset':(35553,35557),'rotation-helpers':(35558,35589),'rotation-redetect':(35609,35629),'review-confirm':(35688,35698),'pdf-add-delete':(35699,35731),'reject-by-id':(36063,36102)}
ev=[dict(id=k,path=source,startLine=a,endLine=z,fileSha256=expected,rangeSha256=sha(b''.join(ls[a-1:z])))for k,(a,z)in ranges.items()]
S=[]
def add(id,title,lines,claims,risks,refs):
 assert all(any(ranges[k][0]<=n<=ranges[k][1]for k in refs)for n in lines)
 S.append(dict(id=id,title=title,assignmentLines=lines,staticDepth='S2',runtime='R0',completeBusinessContract=False,observations=claims,conditionalRisks=risks,evidenceIds=refs))
add('DR01','rn2补充类型识别与恢复',[31370,31379],[
'rn2仅batch当前ready材料；Vt2限定已知UI类型，Zt2按xc隐藏类型计算恢复集合，余类型才Jt2 detectOnly。Am2读取原件前后与识别回执后各有wh2.value===捕获对象及mo2检查，避免在这两个await边界换当前材料后合并。',
'en2只对hiddenByType/对应note条目调用Sc，恢复为pending或原user-added；并非把全部rejected恢复。Jt2传sourceRef、rules、route、纠正/规则快照，成功后仅保留所请求类型且非aO。',
'PDF en2→Gt2→bb，已有draft才回填entities；DOCX/Markdown Wt2按type/start/end/text去重并保留相同键rejected阻止重插，再Zh2/apply；图片恢复隐藏框并sp2拆分候选bbox。最后更新类型勾选和展示计数。',
'Gt2先bO按规范type/page/text及几何或span与旧rejected匹配抑制，再qt2精确bbox键去重。Ht2清原文端部空白并调position，OU将视觉表格框裁到tableCellBBox并同步meta/top-level bbox。'
],['rn2检查当前对象不等于锁定该对象内部revision；局部catch提示保留修改但没有回滚已经完成的同步mutation。此函数没有直接调用saveRecovery。'],['types-rules','incremental-helpers','hidden-state','restore-types','batch-incremental','rejected-detection','visual-table-box','buffer-read','source-reference','image-shape-projection'])
add('DR02','统一假名关闭与Zd2草稿重建',[33376,33450,33463],[
'Bd2首先Ne2.reset、关闭面板；ready文件恢复dp2默认导出mode，有draft时仅覆盖enablePseudonymization=false和pseudonymEntries=[]。只直接apply当前DOCX或Markdown子组件；PDF/Image未在该函数直接apply。',
'Fd2关闭统一模式如有合并/拆分设置先确认，开启则Mm2保留exportMode、注册ready文件、seedCustomTokens、iy2策略后Um2。Bd2/Vm2等映射状态变更不能当作恢复文件保存。',
'Zd2要求ready且统一模式；当前Image读子框，当前DOCX/Markdown采集子draft，经op2注册并重建假名。DOCX把旧draft中Qi2 rejected条目按tp2键补回，重建entities；hasVisitedPreview=true与enablePseudonymization=true可由该同步函数设置，不代表人已经查看预览。',
'Yd2在非jd2时提升ks2并可调用Zd2；profile cp2受jc.enabled、格式默认和统一模式影响，draft/exportMode不是单一字段。'
],['Bd2 exportMode可能仍为pseudonym profile默认，而draft启用位被关闭，需按后续vp2/组件apply路径解释，不能单凭exportMode展示认定已启用。'],['unified-disable','mapping-sync','mapping-draft','image-shape-projection','profile-mode','mode-mapping','review-status'])
add('DR03','项目跨材料补录Sv2与计数/插入',[35381],[
'Sv2要求统一模式及非空text，先Mm2；非panel来源先顺序统计ready文件可新增数，>1才确认；panel来源跳过这个预统计/确认。随后再次遍历ready文件，当前PDF/Image调用子组件addProjectTextEntity并读回，非当前PDF先wv2文本后kv2 OCR，Image走kv2。',
'DOCX正文用tv+ev，Markdown必须Qf映射成功；按有效同type/text及Jf span去重。DOCX另mv2枚举图片OCR行/occurrence，新offset按documentText.length+1+序号合成，默认confirmed/score1/user-added。mv2图片判重按规范文字、path、行、occurrence，不要求已有实体type相同。',
'新draft经np2去覆盖项，当前组件apply并DOCX刷新；逐文件完成后register ready实体并Um2统一映射。wv2捕获文本读取失败并false；kv2和yv2 batch-search success=false返回false/0，invoke reject会外抛。',
'视觉判重主要同type/text且同页（PDF）交面积/较小面积>0.4；文字/OCR计数用临时数组去重，预统计不是实际提交数量或保存回执。'
],['跨文件循环没有统一事务：较后文件异常可保留较早文件更改且跳过尾部Um2。两次遍历之间没有项目revision检查；对当前子组件的await后读回也不捕获其实例身份。'],['project-add','audit-count-docx-md','docx-image-insert','audit-count-visual','project-insert-visual','audit-boxes'])
add('DR04','项目跨文件删除Cv2',[35413],[
'Cv2合并显式keys及规范type:去空白全半角括号text键；Mm2后按op2有效实体统计确认。确认后重新遍历所有ready文件，Image物理过滤detectedBBoxes，其他格式原地er2设deleted与user rejected后写Zh2草稿。',
'当前DOCX/Markdown可apply；PDF没有该处显式detectedEntities整体替换，实际以被选draft/检测数组引用及随后Um2为准。最后register ready实体并Um2；无局部saveRecovery。'
],['确认前的计数不是锁定ID集合；确认后用当前ready集合重算命中。异常无整体回滚；不据此断言全部PDF删除路径都丢失，因为数组可能共享。'],['project-delete','review-status','image-shape-projection'])
add('DR05','DOCX图片辅助识别回执',[35546],[
'Ov2仅当前Wh2材料；如running则请求zn2取消并立即本地canceled，否则Mm2、生成requestId、设置scan running。In2后调用recognizeDocxImages，传原session或request、sourceRef、route/rules/corrections和tempDocxPath。',
'canceled回执直接标canceled；失败抛后catch标error。成功可更新documentText，Iv2/Ht2/Kt2规范候选并给id；Pv2按type/original-or-text/scan-or-position-or-offset/region键仅追加，已有重复项（包括rejected）先占键。',
'成功直接zo2.value.appendDetectedEntities/getReviewDraft，再把草稿与捕获材料e3的检测结果合并；更新OCR/结构数据及scan状态。await Yt后Du2()&&lc2()仅安排恢复保存；finally只在pa2===request时清pa2。'
],['成功回执写入前无wh2===e3、scan.requestId===request或go2代际门。若await期间当前DOCX实例变化，可向新子组件append并把其草稿带回捕获旧材料；这是源码条件，未验证UI是否允许这一时序。取消回执也依赖main返回canceled，局部未以已改scan状态拒绝迟到success。'],['docx-image-recognize','docx-ocr-merge','incremental-helpers','source-reference'])
add('DR06','切路由重识别与旋转页回执',[35556,35621],[
'Bv2确认后捕获t3的route改变并清documentText/entities/boxes/scan/draft和图像尺寸，queued后Om2(go2)。统一模式先调用Bd2但没有await它；不单独在此等待保存或取消当前材料任务。',
'Om2已有yo2或xo2时返回；队列只在go2匹配且未stop时取queued/可续接项，实际Dm2与取消分类复用state-policy报告；finally重新判断队列、收尾并可Du2/lc2。Bv2是启动边界，不把queued当detectOnly成功。',
'Hv2对指定PDF页调用detectOnly；Fv2规范与过滤候选，jv2保留其他页及指定页Qi2 rejected，按qt2排除与rejected相同键的新候选，再bb。更新捕获材料entities；已有draft才替换entities，无draft仍null。',
'旋转回执仅以fo2===捕获id限制当前组件markRotationRedetectComplete/markRotationRedetectFailed及Mm2；成功和失败mg2通知不受该ID门限制；捕获对象写入没有requestId/revision门。$v2只接正整数页和finite角度，四舍五入90度并只保留90/180/270。'
],['局部多个同材料旋转请求若并发，晚回执可覆写前回执；材料卸载后仍能写捕获对象。没有合法运行证明竞态可被UI触发。路由reset是已确认的破坏性审查重置，不是保留旧草稿重检测。'],['batch-route-reset','unified-disable','queue-selector','queue-runner','rotation-helpers','rotation-redetect','incremental-helpers','review-status'])
add('DR07','PDF/Image确认与PDF增删',[35690,35697,35724],[
'qv2生成PDF导出key映射，bb实体、复制approvedConflicts operationIds及规范deleted页，再以新对象替换reviewDraft（预览/假名/mask/删除页字段）；Gv2浅拷贝Image框并构造新draft。均更新exportMode/count，经Ev2并gh2打开导出选择。',
'gh2仅取ready文件ID，为每份vh2 JSON.stringify状态指纹，So2=true。没有执行导出或saveRecovery；draft对象被替换也不代表其他独立材料字段已全部删除。',
'Jv2的Yv2键由page/type/框列表组成，默认不含source且不含text；同键active则跳过，同键rejected则tr2恢复，否则加confirmed user-added实体，再bb、已有draft回填、Zd2和Yd2。',
'相邻Qv2用zf changedIndices执行删除，typeHidden时_c标隐藏，然后draft回填、Zd2/count/Yd2；此赋值也作为邻接证据记录，未伪称其在原14点清单。'
],['同type同几何但不同text可被Jv2视同一键；确认调用只是配置导出选择，不能称最终文件已导出或已持久化。'],['review-confirm','pdf-add-delete','export-confirm-fingerprint','export-mode-refresh','review-status','hidden-state'])
add('DR08','ng2按实体ID删除',[36082],[
'ng2将输入ID转String Set。batch Image物理删除并setReviewBBoxes；PDF map经Zi2→er2写detectedEntities/count后返回，未在该分支直接改reviewDraft；DOCX/Markdown优先当前子draft、再Gh2/default，map拒绝匹配ID、清被删selectedEntityId、复制pseudonymEntries并Zh2/apply。',
'非batch分支对ih2及Lr2命中且尚非Qi2条目Object.assign er2，再浅拷贝数组触发响应；无直接磁盘写入。reviewDraft仅是此路径一部分状态，后续Mm2/快照绑定按PA/UIremaining继续承担。'
],['不同格式删除不是统一操作：Image移除、PDF保留rejected记录、DOCX/Markdown重建draft。该函数本体没有更新统一映射或await保存，不能把删除返回当持久化完成。'],['reject-by-id','review-status'])
targets=[31370,31379,33376,33450,33463,35381,35413,35546,35556,35621,35690,35697,35724,36082]
assert sorted(n for s in S for n in s['assignmentLines'])==targets
assert all('reviewDraft ='in ls[n-1].decode()for n in targets)
D=dict(schemaVersion=1,date='2026-10-14',iteration='ITER-019',scope=['DEP27','DEP31','DEP29','DEP32'],staticDepth='S2',runtime='R0',executedVendor=False,completeBusinessContracts=0,candidateS3=0,assignmentCoverage=dict(requestedCount=14,requestedLines=targets,meaning='补14个指定reviewDraft赋值点所在函数与直接helpers；原36点仍只是定位索引，不在本报告声称全部36逐条业务闭合。',adjacentAssignments=[35730]),sections=S,evidence=ev,evidenceCount=len(ev),crossReportDependencies=[dict(report='iteration019-projection-audit.json',sections=['PA03','PA04','PA05','PA06','PA07','PA08','PA09'],role='Gh2/Zh2/Mm2/Um2/np2及持久化出口；作者本轮已独立审对应报告。'),dict(report='iteration019-state-policy.json',sections=['SP15'],role='bb/Qy/wb等几何抑制已有独立range；bO/OU本报告另实读。'),dict(report='ui-remaining-dependencies-20261014.json',role='sourceRef、Nu2、save-close与vf2既有静态依赖；不是runtime证明。')],remaining=[dict(kind='cross-report',detail='Dm2完整识别队列/失败分类、Ne2统一映射store、ev/nv/Qf文本匹配、子组件addProjectTextEntity与zf删除规则使用既有PA/SP/parents证据；本稿没有无限重复展开或提升为全链。'),dict(kind='runtime-external',detail='OCR/NER IPC真实输出、取消/切换竞态、DOCX渲染器对象生命周期、磁盘保存重开和最终导出，仍需合法竞品运行。')],authorCorrections=[dict(id='DR-REVIEW-01',priority=3,sourceRange=[35623,35625],reason='root独审纠正comma表达式条件：只有组件markComplete/markFailed与Mm2受active ID门，mg2成功/失败通知无条件。',status='resolved')],verificationMeaning='生成/hash及14定位覆盖检查仅结构验证，独立语义审查另附。')
md=['# ITER019 草稿生产者补读','','8节、'+str(len(ev))+'范围；补充14个指定赋值位置及相邻Qv2。S2/R0，未执行竞品。','']
for s in S:
 md+=['## '+s['id']+' '+s['title'],'','指定赋值行：'+str(s['assignmentLines'])+'。','']+['- '+x for x in s['observations']]+['','条件风险：']+['- '+x for x in s['conditionalRisks']]+['','证据：']+[f'- renderer.js:{ranges[k][0]}–{ranges[k][1]} `{k}` SHA256 `{next(x["rangeSha256"]for x in ev if x["id"]==k)}`。'for k in s['evidenceIds']]+['']
md+=['## 剩余与复用边界','']+['- '+x['kind']+'：'+x['detail']for x in D['remaining']]+['','14点切片覆盖不等于原36点全业务调用链闭合；结构check不替代独立审查。','']
out={C/'iteration019-draft-producers.json':json.dumps(D,ensure_ascii=False,indent=2)+'\n',C/'iteration019-draft-producers.md':'\n'.join(md)}
for p,t in out.items():
 if '--check'in sys.argv:assert p.read_text()==t,p
 else:p.write_text(t)
print(json.dumps(dict(result='passed'if'--check'in sys.argv else'written',sections=len(S),ranges=len(ev),assignments=len(targets),mode='structure-hash-only')))
