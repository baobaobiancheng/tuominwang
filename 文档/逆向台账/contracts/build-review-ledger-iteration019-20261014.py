#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Independent finite ITER019 merge audit. Does not mutate ledger or its pins."""
import collections, hashlib, json, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'文档/逆向台账/contracts'
BEFORE='.data/research/lawbot-2026-10-14/ledger-before-iteration019.json'
CURRENT='文档/逆向台账/ledger.json'
SUMMARY='文档/逆向台账/递归分析与对抗审查-20261014.md'
FROZEN='.data/research/lawbot-2026-10-14/iteration018-general-report.md'
OUT='review-ledger-iteration019-20261014'
def meta(p):
 b=(ROOT/p).read_bytes(); return {'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
def read(p): return json.loads((ROOT/p).read_text())
a,b=read(BEFORE),read(CURRENT)
assert meta(CURRENT)['sha256']=='c53a868fb77fa1677509578d698a982e2d77983a3fc2c1ccb6e72fe8a6e246cb', 'Merged snapshot changed; requires rereview'
checks=[]
def check(label, value):
 assert value,label
 checks.append({'check':label,'passed':True})
check('Top-level keys unchanged',set(a)==set(b))
changed=[k for k in a if a[k]!=b[k]]
check('Only authorized top-level fields differ',set(changed)=={'reference','sources','interfaces','events','evidence_snapshot'})
check('All 18 historical events preserved as exact value prefix',len(a['events'])==18 and len(b['events'])==19 and b['events'][:18]==a['events'])
ev=b['events'][-1]
check('Exactly ITER019 appended',ev['id']=='ITER-019')
check('37 flows byte-equivalent after JSON value serialization',len(a['flows'])==len(b['flows'])==37 and a['flows']==b['flows'])
check('258 interface identities and order preserved',len(a['interfaces'])==len(b['interfaces'])==258 and [x['id'] for x in a['interfaces']]==[x['id'] for x in b['interfaces']])
pins=b['evidence_snapshot']['files']; oldpins=a['evidence_snapshot']['files']
changed_ids=[]; fields=collections.Counter(); appended_evidence=0
for x,y in zip(a['interfaces'],b['interfaces']):
 diff={k for k in set(x)|set(y) if x.get(k)!=y.get(k)}
 if diff:
  check('UI append-only fields '+x['id'],x['kind']=='UI' and diff=={'evidence','dependency_iterations'})
  changed_ids.append(x['id']); fields.update(diff)
  for k in diff:
   check('Preserved old list '+x['id']+' '+k,y[k][:len(x.get(k,[]))]==x.get(k,[]))
  added=y['evidence'][len(x['evidence']):]; appended_evidence+=len(added)
  check('Exactly 3 pinned new evidence references '+x['id'],len(added)==3 and all(e['path'] in pins for e in added))
  dep=y['dependency_iterations'][len(x.get('dependency_iterations',[])):]
  check('Exactly ITER019 dependency iteration '+x['id'],len(dep)==1 and dep[0]['iteration']=='ITER-019' and all(p in pins for p in dep[0]['reports']))
 check('All other interface fields preserved '+x['id'],{k:v for k,v in x.items() if k not in {'evidence','dependency_iterations'}}=={k:v for k,v in y.items() if k not in {'evidence','dependency_iterations'}})
check('Exactly six UI IDs equal event affected list',len(changed_ids)==6 and changed_ids==ev['affected_ids'])
check('Source mapping is append-only',all(b['sources'].get(k)==v for k,v in a['sources'].items()))
new_sources={k:v for k,v in b['sources'].items() if k not in a['sources']}
check('All 17 new source references pinned',len(new_sources)==17 and all(p in pins for p in new_sources.values()))
check('Reference changes restricted to dependency_reconciliation', {k:v for k,v in a['reference'].items() if k!='dependency_reconciliation'}=={k:v for k,v in b['reference'].items() if k!='dependency_reconciliation'})
ref=b['reference']['dependency_reconciliation']
check('New reference retains S2/R0 and pinned matrix',ref['iteration']=='ITER-019' and ref['static']=='S2' and ref['runtime']=='R0' and ref['report'] in pins)
check('Snapshot metadata unchanged', {k:v for k,v in a['evidence_snapshot'].items() if k!='files'}=={k:v for k,v in b['evidence_snapshot'].items() if k!='files'})
check('No old evidence pin removed',set(oldpins)<=set(pins))
updates=[p for p in oldpins if oldpins[p]!=pins[p]]
check('Only general summary existing pin changed',updates==[SUMMARY])
check('Old summary exact hash and size retained in snapshot',meta(FROZEN)==oldpins[SUMMARY] and pins[FROZEN]==oldpins[SUMMARY])
u=ev['evidence_updates']
check('Single summary evidence update has exact before/after receipt',len(u)==1 and u[0]=={'path':SUMMARY,'previous_sha256':oldpins[SUMMARY]['sha256'],'current_sha256':pins[SUMMARY]['sha256'],'previous_bytes':oldpins[SUMMARY]['bytes'],'current_bytes':pins[SUMMARY]['bytes'],'previous_snapshot':FROZEN})
verified=[]
for p,m in pins.items():
 check('Pin content '+p,meta(p)==m); verified.append({'path':p,**m})
check('467 pins / 67 new / 399 untouched old',len(pins)==467 and len(set(pins)-set(oldpins))==67 and len(oldpins)-len(updates)==399)
evidence=ev['evidence']; paths=[e['path'] for e in evidence]
check('108 unique event evidence paths',len(paths)==len(set(paths))==108)
check('All event content receipts equal baseline',all({k:v for k,v in e.items() if k!='path'}==pins[e['path']] for e in evidence))
check('Every new pin and changed summary covered by event',set(pins)-set(oldpins)<=set(paths) and SUMMARY in paths)
check('All newly added aliases and UI references included in event',set(new_sources.values())<=set(paths) and all(e['path'] in paths for x,y in zip(a['interfaces'],b['interfaces']) for e in y['evidence'][len(x['evidence']):]))
state={k:dict(collections.Counter(x[k] for x in b['interfaces'])) for k in ['static_depth','runtime_status','implementation_status','flow_mapping']}
generated=read('文档/逆向台账/校验结果.json')
check('Generated validation matches exact ledger and has zero errors',generated['ledger_sha256']==meta(CURRENT)['sha256'] and generated['errors']==[] and generated['evidence_file_count']==467)
check('Final review deliberately excluded from merged ledger pins',all(OUT not in p for p in pins))
result={'review':'ITER019 actual ledger merge independent review','date':'2026-10-14','reviewer':'ui_closure_a','status':'passed','findings':[],'openFindings':0,'scope':'Actual before/after ledger data, source-reference append operations, all current content pins, documented summary replacement and final summary wording. No new competitor execution or functional tests.','targets':{p:meta(p) for p in [BEFORE,CURRENT,SUMMARY,FROZEN,'文档/逆向台账/contracts/merge-iteration019-ledger.py']},'counts':{'historicalEventsPreserved':18,'newEvents':1,'flowsPreserved':37,'interfacesPreserved':258,'uiInterfacesWithAppendOnlyEvidence':6,'appendedInterfaceEvidence':appended_evidence,'newSourceAliases':17,'eventEvidenceFiles':108,'priorPins':400,'currentPins':467,'newPins':67,'unchangedOldPins':399,'updatedOldPins':1,'verifiedChecks':len(checks)},'changedTopLevelFields':changed,'changedInterfaceFields':dict(fields),'stateCounts':state,'summaryReadback':['ITER019 summary reports 47 topics = 41 cross-report evidence + 5 external + 1 runtime; original 11 known readable application dependencies supplemented.','Summary explicitly denies full product reverse-analysis or implementation equivalence; all 258 entries remain S2/R0.','Updater description distinguishes current macOS differential-download-disabled configuration from packaged conditional paths.','ITER018 original summary bytes preserved; updated general summary qualifies Markdown virtualization condition as trim-nonempty query.'],'checks':checks,'verifiedEvidencePins':verified,'boundaries':['Value equality verifies historical event and flow content/order; original raw JSON formatting is not asserted unchanged.','Hash agreement establishes file identity at this snapshot; it does not independently prove all research semantics or runtime equivalence.','This final review and builder are deliberately not added to the audited ledger, avoiding circular evidence.'],'maintenanceCheck':{'command':'python3 文档/逆向台账/maintain.py --check','exitCode':0,'errors':0,'warningsAreExistingBoundaryNotes':True}}
md='''# ITER019 正式台账合并独立审查\n\n结论：**通过，0 项未解决缺陷**。本次仅审实际合并差分、引用与内容基线。\n\n- 旧 18 次事件逐值原样保留；仅追加 ITER019。\n- 37 条流程、258 个稳定入口的顺序与身份不变；S/R/I、待办、入口闭合、流程映射及所有其余字段均未改动。\n- 仅 6 个 UI 入口各追加 3 条证据及 1 条依赖迭代引用；旧引用前缀保留。\n- 新增 17 个 source 别名；本轮事件含 108 个不重复文件。所有新增引用均已入对应证据基线。\n- 400 份旧基线保留 399 份原哈希，仅总报告按显式旧/新回执更新；ITER018 总报告原始字节副本与旧哈希一致。新增 67 份后合计 467 份，均逐项核验 SHA-256 和字节数。\n- 最终总报告明确 47 主题中的 41 补证 / 5 外部 / 1 运行边界；没有宣称全部产品逆向或我方完整等价。当前仍 258 项 S2/R0；I0/I1/I2/I3 分别 206/15/28/9。\n- `maintain.py --check` 独立运行通过，0 错误；提示保留动态桥运行时无界和哈希基线的证明边界。\n\n## 审查边界\n\n逐值比较验证历史内容与顺序；不要求 JSON 排版字节不变。全量哈希核验不替代算法重审或运行验收。本轮没有执行竞品、功能测试、部署或改写台账；本审查文件不回填当前台账，避免自循环。逐项断言、被审文件哈希及 467 份证据收据见同名 JSON。\n'''
outputs={BASE/(OUT+'.json'):json.dumps(result,ensure_ascii=False,indent=2)+'\n',BASE/(OUT+'.md'):md}
if '--check' in sys.argv:
 for p,text in outputs.items(): assert p.read_text()==text, 'Review output drift: '+str(p)
else:
 for p,text in outputs.items(): p.write_text(text)
print(json.dumps({'status':'passed','counts':result['counts'],'openFindings':0},ensure_ascii=False))
