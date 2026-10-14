#!/usr/bin/env python3
"""Append ITER018 research evidence without changing implementation/runtime claims."""
from pathlib import Path
import json,hashlib,collections
R=Path(__file__).resolve().parents[3];P=R/'文档/逆向台账';C=P/'contracts'
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text())
def ref(p,n):return dict(path=p,line=None,column=None,note=n)
def paths(d):
 if isinstance(d,dict):
  if isinstance(d.get('path'),str):yield d['path']
  for v in d.values():yield from paths(v)
 elif isinstance(d,list):
  for v in d:yield from paths(v)
ledger=load(P/'ledger.json')
assert ledger['events'][-1]['id']=='ITER-017','Append once after ITER017'
backup=R/'.data/research/lawbot-2026-10-14/ledger-before-iteration018.json'
assert not backup.exists() or backup.read_bytes()==(P/'ledger.json').read_bytes()
backup.write_bytes((P/'ledger.json').read_bytes())
# Explicitly enumerated author and independent review artifacts; names finalized before execution.
names=['deep-ui-parents-20261014','review-deep-ui-parents-20261014','review-ledger-iteration017-20261014','small-open-dependencies-20261014','review-small-open-dependencies-20261014','export-cancel-invariants-20261014','review-export-cancel-invariants-20261014','remaining-dependencies-20261014','ui-remaining-dependencies-20261014','renderer-policy-dependencies-20261014']
extra_names=['supplement-collaboration-renderer-events-20261014','review-collaboration-renderer-events-20261014','review-renderer-policy-dependencies-20261014','review-ui-remaining-dependencies-20261014','ui-leaf-dependencies-20261014','review-ui-leaf-dependencies-20261014']
names+=extra_names
files=set();reports={}
for name in names:
 p=C/(name+'.json');d=load(p);reports[name]=d
 for f in [p,p.with_suffix('.md')]:assert f.is_file(),f;files.add(str(f.relative_to(R)))
 files.update(s for s in paths(d) if s != '文档/逆向台账/ledger.json' and (R/s).is_file() and (R/s).resolve().is_relative_to(R))
for p in C.iterdir():
 if p.suffix in {'.py','.mjs','.cjs'} and str(p.relative_to(R)) not in ledger['evidence_snapshot']['files']:files.add(str(p.relative_to(R)))
for name in ['build-collab-events.py','build-remaining.py']:
 p=R/'.data/research/lawbot-2026-10-14/rules-supplement'/name;assert p.is_file();files.add(str(p.relative_to(R)))
summary=P/'递归分析与对抗审查-20261014.md'; oldpin=ledger['evidence_snapshot']['files'][str(summary.relative_to(R))]
oldcopy=R/'.data/research/lawbot-2026-10-14/iteration017-general-report.md'
assert oldcopy.is_file() and sha(oldcopy.read_bytes())==oldpin['sha256'],'Preserve previous general report before editing'
files.update([str(summary.relative_to(R)),str(oldcopy.relative_to(R))])
index={x['id']:x for x in ledger['interfaces']}
uiids=reports['deep-ui-parents-20261014']['scope']['stableIds']
for ident in uiids:
 x=index[ident];x.setdefault('dependency_iterations',[]).append(dict(iteration='ITER-018',reports=['文档/逆向台账/contracts/deep-ui-parents-20261014.json','文档/逆向台账/contracts/ui-remaining-dependencies-20261014.json'],meaning='新增父组件/具体依赖语义补证，仍按待办矩阵保留连接与运行边界'))
 for name in ['deep-ui-parents-20261014','ui-remaining-dependencies-20261014','ui-leaf-dependencies-20261014','renderer-policy-dependencies-20261014']:
  x['evidence'].append(ref('文档/逆向台账/contracts/'+name+'.json','ITER-018既有UI路径的追加依赖证据，不表示完整运行闭合'))
for name in ['desensitization:apply','desensitization:cancel','desensitization:cleanup-paths','desensitization:get-apply-result']:
 x=next(x for x in ledger['interfaces'] if x['name']==name)
 x['evidence'].append(ref('文档/逆向台账/contracts/export-cancel-invariants-20261014.json','ITER-018条件化取消/覆盖/回执组合分析；未执行竞品'))
for name in ['desensitization:get-markdown-export-stats','desensitization:save-markdown-draft']:
 x=next(x for x in ledger['interfaces'] if x['name']==name)
 x['evidence'].append(ref('文档/逆向台账/contracts/small-open-dependencies-20261014.json','ITER-018 SD04日志和统计补读'))
mat='文档/逆向台账/contracts/remaining-dependencies-20261014.json'
ledger['reference']['dependency_reconciliation']=dict(iteration='ITER-018',report=mat,meaning='主题级跨报告对账，非接口完成率；旧next_actions保留，其当前证据与缺口见矩阵',static='S2',runtime='R0')
for name in names:ledger['sources'][name.replace('-','_')]='文档/逆向台账/contracts/'+name+'.json'
updates=[];evidence=[];pins=ledger['evidence_snapshot']['files']
for path in sorted(files):
 b=(R/path).read_bytes();new=dict(sha256=sha(b),bytes=len(b));old=pins.get(path)
 if old and old!=new:
  assert path==str(summary.relative_to(R)),'Unexpected pin drift '+path
  updates.append(dict(path=path,previous_sha256=old['sha256'],current_sha256=new['sha256'],previous_bytes=old['bytes'],current_bytes=new['bytes'],previous_snapshot=str(oldcopy.relative_to(R))))
 pins[path]=new;evidence.append(dict(path=path,**new))
ledger['events'].append(dict(id='ITER-018',date='2026-10-14',action='继续读取具体前后端依赖、取消覆盖不变量，并追加独立审查与剩余对账',summary='已有UI父级、五组小依赖及跨格式连接补读；原始待办、S2/R0与我方I状态不变。主题矩阵按具体证据区分已补读、可读未闭合、外部和运行；不宣称全部逆向。',affected_ids=list(uiids)+[x['id'] for x in ledger['interfaces'] if x['name'] in ['desensitization:apply','desensitization:cancel','desensitization:cleanup-paths','desensitization:get-apply-result','desensitization:get-markdown-export-stats','desensitization:save-markdown-draft']],verification='各报告记录范围/hash、独立人工审查范围和修正。maintain生成/check随后执行。无竞品运行、无业务代码或部署变化。',evidence=evidence,evidence_updates=updates))
# Guard historical claims and pending actions, beyond maintain.py's provenance checks.
old=load(backup)
assert ledger['events'][:-1]==old['events']
for a,b in zip(old['interfaces'],ledger['interfaces']):
 for key in ['id','static_depth','runtime_status','runtime_note','implementation_status','implementation_note','implementation_evidence','next_actions','entry_closure','flow_mapping']:assert (key in a)==(key in b) and a.get(key)==b.get(key),(a['id'],key)
assert old['flows']==ledger['flows']
(P/'ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(event='ITER-018',files=len(evidence),pins=len(pins),historicalUpdates=updates,static=dict(collections.Counter(x['static_depth'] for x in ledger['interfaces']))),ensure_ascii=False))
