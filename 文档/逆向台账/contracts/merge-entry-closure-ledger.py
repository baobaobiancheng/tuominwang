#!/usr/bin/env python3
# coding: utf-8
"""One-shot ITER-015 merge. Existing application/deployment pins are never updated."""
from pathlib import Path
import hashlib, json, re
ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / '文档/逆向台账'
def read(path): return json.loads((BASE / path).read_text())
def digest(data): return hashlib.sha256(data).hexdigest()
ledger_path = BASE / 'ledger.json'
original_bytes = ledger_path.read_bytes()
ledger = json.loads(original_bytes)
assert 'ITER-015' not in {e['id'] for e in ledger['events']}, 'ITER-015 already present; refusing second merge'
previous_events = json.dumps(ledger['events'], ensure_ascii=False, sort_keys=True)
a = read('contracts/ui-closure-a.json')['interfaces']
b = read('contracts/ui-closure-b.json')['contracts']
dynamic = read('contracts/dynamic-closure.json')
rows = {r['id']: (r, 'a') for r in a}
rows.update({r['id']: (r, 'b') for r in b})
assert len(a) == 58 and len(b) == 57 and len(rows) == 115
pending = {r['id'] for r in ledger['interfaces'] if r['flow_mapping'] == '保留局部服务证据，UI入口待核'}
assert pending == rows.keys(), 'Original pending set mismatch'
levels = {r['id']: (r['static_depth'],r['runtime_status'],r['implementation_status']) for r in ledger['interfaces']}
new_paths = set()
def add_evidence(target, path, note, line=None, column=None, **extra):
    item = {'path':path,'line':line,'column':column,'note':note,**extra}
    if item not in target: target.append(item)
    new_paths.add(path)
ui_count = 0
for item in ledger['interfaces']:
    if item['id'] not in rows: continue
    row, group = rows[item['id']]
    positive = row['entryResolution'] != 'no_renderer_reference' if group == 'a' else row['uiLocated']
    ui_count += positive
    report = f'文档/逆向台账/contracts/ui-closure-{group}.json'
    disposition = row['entryResolution'] if group == 'a' else row['entryDisposition']
    item['entry_closure'] = {'iteration':'ITER-015','scope':'0.5.9 published renderer static callset','report':report,'channel':item['name'],'classification':disposition,'renderer_located':positive,'investigation_closed':True,'complete_business_contract':False,'trigger':row['trigger'],'runtime':'R0'}
    item['flow_mapping'] = '已追踪局部关系' if positive else '本发布包无前端调用，局部服务关系已核'
    item['static_summary'] += ' ITER-015入口调查：' + ('已定位前端调用/生命周期订阅。' if positive else '完整发布renderer未见该端点调用；保留注册/暴露，不虚构UI。') + row['trigger']
    observation = item.get('manual_observation')
    if observation:
        observation['priorUiObservation'] = {k:observation[k] for k in ('uiStatus','uiLocated','uiEvidence') if k in observation}
        observation['uiStatus'] = 'published_renderer_entry_traced' if positive else 'no_published_renderer_caller'
        observation['uiLocated'] = positive
        observation['uiEvidence'] = row['rendererEvidence']
        observation['entryClosureRef'] = {'path':report,'id':item['id'],'iteration':'ITER-015'}
    add_evidence(item['evidence'],report,'完整发布renderer入口专项逐项调查；当前快照已分类，S2/R0/I状态不提升')
    add_evidence(item['evidence'],'文档/逆向台账/入口闭合交叉审查-20261013.md','独立集合、调用及同名误匹配交叉审查；7个负向探针')
    for e in row['rendererEvidence']:
        add_evidence(item['evidence'],e['path'],e.get('note','入口专项源码证据'),e.get('start_line',e.get('startLine')),e.get('startColumn'),source_range=e)
    # Only superseded UI-search clauses are removed; algorithm/service/runtime gaps remain.
    actions=[]
    for action in item['next_actions']:
        if action == 'renderer PDF worker加载/跨协议行为未本轮关联': actions.append('PDF worker跨协议加载运行行为待合法许可环境验证'); continue
        if action == 'renderer生命周期调用/完整缓存层一致性未本轮核读': actions.append('完整缓存层一致性与失败恢复仍待验证'); continue
        clauses = re.split('[；;]', action)
        kept = [c for c in clauses if not (any(x in c for x in ('UI','renderer','前端','按钮')) and any(x in c for x in ('未定位','未找到','尚未找到','未确认renderer入口','未本轮核读','未本轮定位')))]
        if kept: actions.append('；'.join(kept))
    actions += row.get('remainingUnknown',row.get('remaining',[]))
    actions.append('入口调查已完成；继续闭合算法/依赖、异常及恢复契约，不以入口分类替代S3或R2')
    item['next_actions'] = list(dict.fromkeys(actions))
assert ui_count == 44
for item in ledger['interfaces']:
    if item['name'] in {c['channel'] for c in dynamic['channels']} and item['kind']=='IPC':
        add_evidence(item['evidence'],'文档/逆向台账/contracts/dynamic-closure.json','两处通用invoke当前发布调用集39处/14通道；桥本身无白名单')
        item['dynamic_bridge_ref'] = {'path':'文档/逆向台账/contracts/dynamic-closure.json','channel':item['name'],'snapshot_callset_closed':True,'runtime_input_bounded':False}
for flow in ledger['flows']:
    members=[i for i in ledger['interfaces'] if flow['id'] in i['flow_ids'] and i['id'] in rows]
    if not members: continue
    flow['entry_closure']={'iteration':'ITER-015','reviewed':len(members),'renderer_located':sum(i['entry_closure']['renderer_located'] for i in members),'no_published_renderer_caller':sum(not i['entry_closure']['renderer_located'] for i in members),'unclassified':0}
    add_evidence(flow['evidence'],'文档/逆向台账/contracts/entry-closure-cross-review.json','115项入口闭合集合与分类独立核验，完整业务契约仍未闭合')
    flow['next_actions'] = [a.replace('按条目保留UI入口未定位、外部依赖/异常/恢复待核；人工覆盖数不代表完整契约','当前发布入口调查已闭合；继续核验外部依赖/算法/异常/恢复，入口分类不代表完整契约') for a in flow['next_actions']]
reference=ledger['reference']
reference['unresolved_dynamic_ipc']=0
reference['runtime_unbounded_dynamic_ipc']=2
reference['entry_closure']={'iteration':'ITER-015','reviewed':115,'renderer_located':44,'no_published_renderer_caller':71,'unclassified':0,'previous_renderer_located':102,'known_ipc_total':217,'current_renderer_located_total':146,'complete_business_contracts':0,'runtime_verified':0}
reference['dynamic_ipc_closure']={'report':'文档/逆向台账/contracts/dynamic-closure.json','published_call_count':39,'literal_channel_count':14,'preload_bridges':2,'snapshot_unresolved_calls':0,'runtime_unbounded_bridges':2,'scope':'仅0.5.9当前发布包静态调用集合；任意运行时输入没有白名单'}
reference['manual_coverage_note']='217个已知IPC已人工核读（业务63、协作/配置101、系统53）；原102项已有renderer局部关系，另115项入口调查现已闭合：44项有前端调用/生命周期入口，71项本发布包无前端调用，0项待分类。当前合计146项已定位入口/订阅、71项无发布renderer调用；不把保留端点虚构成UI。12 MCP与14网关有工具/服务调用边。完整业务契约仍0，258项保持S2/R0，我方I状态不变。'
reference['coverage_note']='历史214字面IPC保留；展开22个主进程动态注册wrapper调用后已知217通道（209处理器、8通知）。两处preload通用invoke在完整0.5.9发布包的39处调用、14个字面通道已闭合，静态未解析调用0；桥本身仍无白名单，运行时任意channel/args输入无界2处。内部网关及HTTP模板分层统计，当前分母只是已知入口，不是完整产品全集。 '+reference['manual_coverage_note']+' 原人工契约范围/哈希与新增115入口交叉审查、7个拒绝负向探针通过，不能替代所有算法契约、真实运行或我方等价验收。'
source_map={
'ui_entry_closure_a':'contracts/ui-closure-a.json','ui_entry_closure_b':'contracts/ui-closure-b.json','ui_entry_closure_a_notes':'contracts/ui-closure-a.md','ui_entry_closure_b_notes':'contracts/ui-closure-b.md','dynamic_entry_closure':'contracts/dynamic-closure.json','dynamic_entry_closure_notes':'contracts/dynamic-closure.md','entry_closure_cross_review':'contracts/entry-closure-cross-review.json','entry_closure_cross_review_notes':'入口闭合交叉审查-20261013.md','entry_closure_review_baseline':'contracts/entry-closure-review-baseline.json','entry_closure_cross_verifier':'contracts/cross-review-entry-closure.mjs','ui_closure_a_scanner':'contracts/scan-ui-closure-a.mjs','ui_closure_a_builder':'contracts/build-ui-closure-a.py','ui_closure_a_census':'contracts/ui-closure-a-census.json','ui_closure_b_scanner':'contracts/scan-ui-closure-b.mjs','ui_closure_b_builder':'contracts/build-ui-closure-b.py','ui_closure_b_scan':'contracts/ui-closure-b-scan.json','ui_closure_b_verifier':'contracts/verify-ui-closure-b.mjs','dynamic_closure_verifier':'contracts/verify-dynamic-closure.mjs','dynamic_ui_cross_verifier':'contracts/verify-dynamic-ui-cross-check.py','entry_closure_ledger_merge':'contracts/merge-entry-closure-ledger.py','ledger_maintainer':'maintain.py'}
for key,rel in source_map.items():
    full='文档/逆向台账/'+rel;ledger['sources'][key]=full;new_paths.add(full)
new_paths.update(f['path'] for f in dynamic['sourceFiles'])
updates=[];added=[]
for p in sorted(new_paths):
    data=(ROOT/p).read_bytes();fresh={'sha256':digest(data),'bytes':len(data)}
    previous=ledger['evidence_snapshot']['files'].get(p)
    if previous and (previous['sha256'] != fresh['sha256'] or previous['bytes'] != fresh['bytes']):
        assert p.startswith('文档/逆向台账/'), 'Refusing non-ledger existing pin update: '+p
        updates.append({'path':p,'previous_sha256':previous['sha256'],'current_sha256':fresh['sha256'],'previous_bytes':previous['bytes'],'current_bytes':fresh['bytes']})
    elif not previous: added.append(p)
    ledger['evidence_snapshot']['files'][p]=fresh
ledger['evidence_snapshot']['note'] += ' ITER-015仅补115项UI入口、两处动态桥调用集合、交叉审查/核验脚本及新增OpenJPEG发布证据；保留此前应用和部署文件的哈希，正在进行的前端修复漂移由后续迭代单独复核。'
ledger['events'].append({'id':'ITER-015','date':'2026-10-13','action':'闭合115项发布前端入口调查及两处动态桥调用集合','summary':'原115待核入口完成固定范围调查：44有调用/生命周期入口、71本发布包无前端调用；两处通用桥共39调用/14通道，当前快照未解析0，桥设计本身仍运行时无界2。完整ASAR dist16文件、其余8563依赖脚本词法筛查、5处桥别名及22个动态注册调用已核。发现preload两条log send无on接收，renderer七条invoke有handle；没有把该差异混淆。算法、外部依赖与运行缺口保留，S2/R0/I不变。','affected_ids':sorted(rows),'verification':'A/B扫描及单组范围校验、dynamic --check、115入口独立交叉审查与7个负向探针通过；71无引用与14动态通道交集0。maintain.py生成/--check用于汇总一致性与既有pin漂移检查；如有本轮之外应用文件漂移，保留失败交由后续显式迭代更新，不自动接受。','source_ledger_sha256':digest(original_bytes),'evidence_added':added,'evidence_updates':updates,'evidence':[{'path':ledger['sources'][k],'sha256':ledger['evidence_snapshot']['files'][ledger['sources'][k]]['sha256']} for k in ('ui_entry_closure_a','ui_entry_closure_b','dynamic_entry_closure','entry_closure_cross_review','entry_closure_cross_review_notes')]})
assert json.dumps(ledger['events'][:-1],ensure_ascii=False,sort_keys=True)==previous_events
assert levels == {r['id']:(r['static_depth'],r['runtime_status'],r['implementation_status']) for r in ledger['interfaces']}
ledger_path.write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'merged','interfaces':len(rows),'located':ui_count,'absent':len(rows)-ui_count,'newPins':len(added),'updatedPins':updates,'preservedStatusLevels':len(levels)},ensure_ascii=False))
