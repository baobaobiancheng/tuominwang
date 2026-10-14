#!/usr/bin/env python3
"""Merge reviewed research evidence; never execute vendor code or change I/R status."""
from pathlib import Path
import json,hashlib,collections
R=Path(__file__).resolve().parents[3];P=R/'文档/逆向台账';C=P/'contracts'
sha=lambda b:hashlib.sha256(b).hexdigest()
reports=['deep-system-20261014','deep-formats-20261014','deep-collaboration-20261014','deep-processing-20261014','deep-ui-20261014']
supplement_names=['deep-processing-pdf-20261014','deep-processing-supplement-formats-20261014','deep-processing-supplement-rules-20261014']
review_names=['review-deep-system-20261014','review-deep-formats-20261014','review-deep-processing-ui-20261014','review-native-20261014']
CONSTANTS={'learner:get-high-confidence-memory-count','learner:get-snapshots','learner:update-rules','learner:rollback','learner:rollback-previous','learner:rollback-to-previous'}
def load(p):return json.loads(p.read_text())
def reference(path,note):return dict(path=path,line=None,column=None,note=note)
def dedup(v):return list(dict.fromkeys(v))
def pathrefs(value):
    if isinstance(value,dict):
        if isinstance(value.get('path'),str):yield value['path']
        for v in value.values():yield from pathrefs(v)
    elif isinstance(value,list):
        for v in value:yield from pathrefs(v)
def stringlist(v):
    if isinstance(v,str):return [v]
    if isinstance(v,list):return [x for x in v if isinstance(x,str)]
    return []

ledger=load(P/'ledger.json');assert not any(e['id']=='ITER-017' for e in ledger['events']),'Already merged; append a new event instead'
backup=R/'.data/research/lawbot-2026-10-14/ledger-before-deep-analysis.json'
assert not backup.exists() or backup.read_bytes()==(P/'ledger.json').read_bytes()
backup.write_bytes((P/'ledger.json').read_bytes())
indexed={};files=set();reportdata={}
for name in reports:
    path=C/(name+'.json');d=load(path);reportdata[name]=d
    rows=d.get('interfaces',d.get('contracts'));assert isinstance(rows,list),name
    for x in rows:
        assert x['id'] not in indexed,'Overlapping scope '+x['id']
        indexed[x['id']]=(name,d,x)
    files.update([str(path.relative_to(R)),str(path.with_suffix('.md').relative_to(R))]);files.update(pathrefs(d))
assert set(indexed)=={x['id'] for x in ledger['interfaces']},'Deep report scope must exactly equal 258 stable entries'
for name in review_names:
    for ext in ['.json','.md']:
        p=C/(name+ext);assert p.is_file(),p;files.add(str(p.relative_to(R)))
    files.update(pathrefs(load(C/(name+'.json'))))
collabreviews=list(C.glob('review-deep-collaboration*-20261014.json'))
assert collabreviews,'Missing independent collaboration review'
for p in collabreviews:
    files.update([str(p.relative_to(R)),str(p.with_suffix('.md').relative_to(R))]);files.update(pathrefs(load(p)))

supplements={};associations=collections.defaultdict(list)
for name in supplement_names:
    p=C/(name+'.json');d=load(p);supplements[name]=d
    files.update([str(p.relative_to(R)),str(p.with_suffix('.md').relative_to(R))]);files.update(pathrefs(d))
    for q in d.get('interfaces',[]):
        assert q['id'] in indexed,q['id']
        associations[q['id']].append({'report':str(p.relative_to(R)),'section_ids':q.get('sectionIds',[]),'meaning':'关联补读章节，不表示端点所有上下游完整闭合'})
# Explicit associations only; no fabricated total endpoint coverage for a helper report.
psf='文档/逆向台账/contracts/deep-processing-supplement-formats-20261014.json'
for ident,secs in {
    'IPC-5a998529649c':['PSF01','PSF02','PSF03','PSF04','PSF06','PSF07','PSF08','PSF09','PSF10','PSF11'],
    'IPC-7d7d2d58da91':['PSF05'],
    'IPC-629ace0aecd1':['PSF08'],
}.items():
    assert ident in indexed
    associations[ident].append({'report':psf,'section_ids':secs,'meaning':'按核心主报告DP15/16/18/19及parser关联；不代表全端点新读'})
rules='文档/逆向台账/contracts/deep-processing-supplement-rules-20261014.json'
for ident,secs in {
    'IPC-7d7d2d58da91':['DPS01','DPS02','DPS03','DPS04','DPS05','DPS06','DPS07','DPS09','DPS11','DPS12','DPS30','DPS31','DPS32','DPS33'],
    'IPC-c1cec3199992':['DPS01','DPS02','DPS03','DPS04','DPS05','DPS06','DPS07','DPS09','DPS11','DPS12','DPS13','DPS14','DPS18','DPS19','DPS30','DPS31','DPS32','DPS33'],
    'IPC-27dd16394cd6':['DPS01','DPS02','DPS03','DPS04','DPS05','DPS06','DPS07','DPS09','DPS11','DPS12','DPS13','DPS14'],
    'IPC-85f474cad97a':['DPS10'],
    'IPC-9577d3a9d6d0':['DPS10'],
}.items():
    assert ident in indexed
    associations[ident].append({'report':rules,'section_ids':secs,'meaning':'核心处理调用的规则/模型/报告helper补读关联；非完整端点新审'})
for p in C.glob('review*20261014.json'):
    if p.name=='review-ledger-iteration017-20261014.json':continue
    files.update([str(p.relative_to(R)),str(p.with_suffix('.md').relative_to(R))]);files.update(pathrefs(load(p)))

for x in ledger['interfaces']:
    name,d,q=indexed[x['id']];report='文档/逆向台账/contracts/'+name+'.json'
    findings=stringlist(q.get('deepFindings'))+stringlist(q.get('new_observations'))+stringlist(q.get('branchesAndOutputs'))
    gaps=stringlist(q.get('remainingStaticGaps'))+stringlist(q.get('remaining_unknown'))+stringlist(q.get('remainingUnknown'))+stringlist(q.get('unresolvedRendererDependencies'))
    modulekeys=q.get('deepModuleRefs',q.get('moduleRefs',[]));modules=d.get('modules',[])
    for m in modules:
        if m.get('id') in modulekeys:
            findings+=stringlist(m.get('inputOutputAndBranches'))
            gaps+=stringlist(m.get('remainingUnknown'))
    for section in d.get('contracts',[]):
        if section.get('id') in q.get('sectionIds',[]):
            findings+=stringlist(section.get('branchesAndOutputs'))+stringlist(section.get('logic'))+stringlist(section.get('findings'))+stringlist(section.get('algorithm'))+stringlist(section.get('failureCancellationRecovery'))
    for a in associations[x['id']]:
        findings+=['新增补读见'+a['report']+'（'+','.join(a['section_ids'])+'）']
    # Keep all substantive details in the linked report; this is a compact entry summary.
    findings=dedup(findings);gaps=dedup(gaps)
    if not findings:
        findings=['保留既有逐项契约，本轮无关联新章节；具体输入/失败与待办见'+report] if name=='deep-processing-20261014' and not q.get('sectionIds') else ['本轮分组契约及所关联分析见'+report+'；并非每条端点全链新读']
    if not gaps:gaps=['深层算法/renderer消费/外部依赖的具体边界见本轮专项，未作全链闭合声明。']
    previous=x['static_summary']
    x['deep_analysis']={'iteration':'ITER-017','report':report,'review_status':'分组报告经范围/hash核验与重点语义交叉审查；非每端点全链独立重审','previous_static_summary':previous,'findings':findings,'remaining_boundaries':gaps,'previous_static_depth':x['static_depth'],'previous_next_actions':list(x['next_actions']),'supplements':associations[x['id']]}
    if x['name'] in CONSTANTS:
        assert name=='deep-formats-20261014' and q['staticClosureCandidate']=='literal-handler-closed'
        x['deep_analysis']['literal_handler_reviewed']=True
        x['deep_analysis']['no_s3_reason']='常量本体已读，但Om注册生命周期及renderer消费/触发未完整汇合，不支持完整静态链S3。'
    x['static_depth']='S2'
    x['static_summary']='ITER-017分组契约与关联补证：'+'；'.join(findings[:3])+'。其余分支及未闭合边界见'+report+'；S2/R0，不代表完整业务逆向。'
    assert x['runtime_status']=='R0'
    x['evidence'].append(reference(report,'ITER-017逐项递归契约/算法/异常与剩余边界，非运行证据'))
    for a in associations[x['id']]:x['evidence'].append(reference(a['report'],'ITER-017关联章节'+','.join(a['section_ids'])+'；局部补读非完整业务'))
    x['next_actions']=dedup(x['deep_analysis']['previous_next_actions']+gaps+['旧待办保留用于逐项对账；本轮补读及范围见deep_analysis.supplements，不以挂接报告自动清空旧项。','逐项核对我方实现/差异及对应验证证据；竞品入口是否有renderer调用不决定我方是否实现。','需合法激活后的逐项端到端对照；未完成时保持R0，不以我方测试代替。'])

for flow in ledger['flows']:
    members=[x for x in ledger['interfaces'] if flow['id'] in x['flow_ids']]
    paths=dedup([x['deep_analysis']['report'] for x in members]+[s['report'] for x in members for s in x['deep_analysis']['supplements']])
    flow['evidence'] += [reference(p,'ITER-017该链路成员的递归分析和具体边界') for p in paths]
    flow['deep_analysis']={'iteration':'ITER-017','inventory_entries_associated':len(members),'constant_endpoint_s3':sum(x['static_depth']=='S3' for x in members),'reports':paths,'business_flow_complete':False,'previous_next_actions':list(flow['next_actions'])}
    flow['next_actions']=dedup(flow['deep_analysis']['previous_next_actions']+[g for x in members for g in x['deep_analysis']['remaining_boundaries']]+['继续我方逐项能力映射与合法竞品运行对照；不能用已读入口数代表完整业务验收。'])

ledger['reference']['analysis_date']='2026-10-14'
ledger['reference']['integrity_note']='7处ASAR unpacked原始哈希差异仍存在，但已证实ASAR声明等于npm同版本上游文件；发布文件只在Mach-O签名/相应结构长度及对齐处不同，其余字节完全相同，7项codesign严格验签通过。无未解释非签名字节；不推断厂商历史构建步骤或算法正确性。'
ledger['reference']['deep_analysis']={'iteration':'ITER-017','inventory_entries_reconciled':258,'reports':reports,'supplements':supplement_names,'review_scope':'分组清单无重无漏、引用校验和重点语义审查；不是258全链独立审计','runtime_verified':0,'constant_handlers_reviewed':6,'constant_endpoint_static_closed':0,'complete_business_contracts':0,'source_integrity_explained':7}
ledger['reference']['coverage_note']='已知258个稳定入口（217 IPC、12 MCP、14 GATEWAY、7 HTTP、2 LOCAL_HTTP、6 UI）全部纳入五份分组契约，三份增补继续追踪内部依赖；清单无漏重不表示每端点完整新读/独立全链审计。原115项renderer调查结果仍为44有调用、71无发布renderer引用；总计146/217已定位renderer关系。当前发布包动态invoke未解析0，通用桥运行时无界2。6个旧learner常量本体已读，但注册/renderer链仍未全汇合，不升S3；258项均S2/R0，我方I状态不自动升级。已知入口分母不等于完整产品全集。私有服务实现、部分renderer/格式/模型依赖及合法运行仍有具体未闭合项，不能宣称全部逆向或我方完整等价。'
ledger['reference']['manual_coverage_note']='ITER-017五组契约覆盖全部258已知ID，继续追踪六组核心可读依赖；具体补读边界见增补报告。逐项关联不等于每条完整新读。6个停用/常量本体闭合不代表完整静态链或可用业务；S3为0、完整业务契约0、运行R2为0。'
ledger['reference']['core_dependency_followup']=[
    {'previous_area':'策略/规则全量','report':rules,'completed_reading_scope':'基础规则41组、YAML集合、策略/金额/后处理及oi/Ei表格语义应用代码','remaining':'规则准确性、上游renderer配置生命周期与运行对照；不等价于所有模型/词典效果证明'},
    {'previous_area':'PDF/OCR中段与表格几何','report':'文档/逆向台账/contracts/deep-processing-pdf-20261014.json','completed_reading_scope':'OCR计划/重试、bbox、visual table及vectorTableCell原生文本生成/消费的应用代码','remaining':'PDF.js/字体/canvas数值、renderer回传坐标和授权样本'},
    {'previous_area':'DOCX OOXML保真与notes','report':psf,'completed_reading_scope':'接受修订、包部件、脚注尾注、图片移除helpers','remaining':'python-docx/lxml/Office实际兼容、前端生产状态与故障样本'},
    {'previous_area':'Markdown解析/多页导出','report':psf,'completed_reading_scope':'应用AST扫描/源码写入/锚点/降级/worker控制与MarkItDown bridge','remaining':'第三方解析与转换器内部、renderer审查状态及运行样本'},
    {'previous_area':'印章/人脸','report':rules,'completed_reading_scope':'颜色/像素、模型输入输出/NMS、模型资源hash及平台资产缺失','remaining':'模型数值、缺失Windows脚本和精度样本'},
    {'previous_area':'report/legacy/atomic source helpers','report':rules,'completed_reading_scope':'报告模板、旧overlay与遮盖、source生命周期/目录/保存及19辅助端点','remaining':'各格式前端生产链、缺失平台Office脚本及实际文件故障'},
]

extra=[P/'71项无前端调用说明-20261014.md',P/'原生文件签名差异核验-20261014.md',P/'递归分析与对抗审查-20261014.md',P/'maintain.py',P/'维护规则.md',Path(__file__)]
extra+=list(C.glob('*20261014*.py'))+list(C.glob('*20261014*.mjs'))+list(C.glob('*20261014*.cjs'))
extra += [C/'review-native-probes.py']
extra+=[C/'build-deep-collaboration.py',C/'deep-collaboration-index.mjs',C/'deep-collaboration-source-index.json']
native=R/'.data/research/lawbot-2026-10-14/native-integrity'
extra += [native/'fetch-upstream.py',native/'verify-native.py',native/'native-integrity-comparison.json',native/'upstream-manifest.json']+list(native.glob('*.metadata.json'))
extra += [R/'.data/research/lawbot-2026-10-14/deep-system/build.py']
extra += [R/'.data/research/lawbot-2026-10-14/maintain-before-iter017.py']
extra += [p for p in (R/'.data/research/lawbot-2026-10-14/rules-supplement').iterdir() if p.is_file() and p.suffix in {'.py','.json','.yaml'}]
for p in extra:
    assert p.is_file(),p;files.add(str(p.relative_to(R)))
for name in reports+supplement_names:ledger['sources'][name.replace('-','_')]='文档/逆向台账/contracts/'+name+'.json'
ledger['sources']['deep_iteration_report']='文档/逆向台账/递归分析与对抗审查-20261014.md'
ledger['sources']['native_integrity_comparison']='.data/research/lawbot-2026-10-14/native-integrity/native-integrity-comparison.json'
ledger['sources']['no_renderer_71_explanation']='文档/逆向台账/71项无前端调用说明-20261014.md'
updates=[];pins=ledger['evidence_snapshot']['files'];event_evidence=[]
for path in sorted(files):
    p=(R/path).resolve()
    if not p.is_file():continue
    assert p.is_relative_to(R),path
    path=str(p.relative_to(R));b=p.read_bytes();new={'sha256':sha(b),'bytes':len(b)};old=pins.get(path)
    if old and old!=new:
        assert path in {'文档/逆向台账/maintain.py','文档/逆向台账/维护规则.md'},'Unexpected historical evidence drift: '+path
        updates.append({'path':path,'previous_sha256':old['sha256'],'current_sha256':new['sha256'],'previous_bytes':old['bytes'],'current_bytes':new['bytes']})
    pins[path]=new;event_evidence.append({'path':path,**new})
ledger['evidence_snapshot']['note']+=' ITER-017新增分组/增补契约、交叉审查及npm原生签名差异证据；仅maintain新增71解释及维护规则旧动态数量文案的历史hash显式更新。未纳入凭据、未改竞品文件或应用。下载tarball及原生比较的逐项SHA保存在专项报告，不自动扩大成算法可信声明。'
ledger['events'].append({'id':'ITER-017','date':'2026-10-14','action':'解释71项分类、258已知入口分组补证及重点对抗审查、闭合7处签名差异','summary':'五组清单集合覆盖258已知ID，不代表每条全链新读；系统22个S3候选退回，格式49个应用边界与6个常量候选未提级；258项均S2/R0。所有旧待办保留用于逐项对账。修正语义/证据遗漏；7处原生hash差异以npm源包及Mach-O逐字节比较解释，7项系统验签通过。用户产品全等价/完整业务仍未完成。','affected_ids':[x['id'] for x in ledger['interfaces']]+[x['id'] for x in ledger['flows']],'verification':'独立重点语义审查与范围/hash/集合负向校验见审查报告；native只读脚本7/7，上游SHA512及ASAR声明SHA256匹配。maintain生成/check随后执行；无竞品处理运行、无应用代码变化，因此不将旧应用测试或线上部署作为本轮逆向证明。','evidence':event_evidence,'evidence_updates':updates})
(P/'ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'entries':len(indexed),'static':dict(collections.Counter(x['static_depth'] for x in ledger['interfaces'])),'newEvidenceFiles':len(files),'historicalUpdates':updates},ensure_ascii=False))
