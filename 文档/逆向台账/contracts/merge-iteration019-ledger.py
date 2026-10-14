#!/usr/bin/env python3
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
ledger=load(P/'ledger.json');assert ledger['events'][-1]['id']=='ITER-018'
backup=R/'.data/research/lawbot-2026-10-14/ledger-before-iteration019.json'
assert not backup.exists() or backup.read_bytes()==(P/'ledger.json').read_bytes()
backup.write_bytes((P/'ledger.json').read_bytes())
names=['review-ledger-iteration018-20261014','iteration019-projection-audit','iteration019-state-policy','iteration019-system-collab','iteration019-layout-manual','review-iteration019-projection-audit','review-iteration019-state-policy','review-iteration019-system-collab','review-iteration019-layout-manual','remaining-dependencies-iteration019','iteration019-layout-helpers','review-iteration019-layout-helpers','iteration019-draft-producers','review-iteration019-draft-producers']
names += ['iteration019-updater-dependencies','review-iteration019-updater-dependencies','review-iteration019-remaining-dependencies']
files=set();reports={}
for name in names:
 p=C/(name+'.json');d=load(p);reports[name]=d
 for f in [p,p.with_suffix('.md')]:assert f.is_file(),f;files.add(str(f.relative_to(R)))
 files.update(s for s in paths(d) if s!='文档/逆向台账/ledger.json' and (R/s).is_file() and (R/s).resolve().is_relative_to(R))
# Only this iteration's explicit builders, never glob arbitrary unpublished drafts.
for f in C.glob('build-iteration019-*.py'):files.add(str(f.relative_to(R)))
for f in C.glob('build-review-iteration019-*.py'):files.add(str(f.relative_to(R)))
files.add(str(Path(__file__).resolve().relative_to(R)))
for f in C.glob('iteration019/*.py'):files.add(str(f.relative_to(R)))
for f in (R/'.data/research/lawbot-2026-10-14/iteration019').glob('*.py'):files.add(str(f.relative_to(R)))
summary=P/'递归分析与对抗审查-20261014.md';oldcopy=R/'.data/research/lawbot-2026-10-14/iteration018-general-report.md'
assert sha(oldcopy.read_bytes())==ledger['evidence_snapshot']['files'][str(summary.relative_to(R))]['sha256']
files.update([str(summary.relative_to(R)),str(oldcopy.relative_to(R))])
index={x['id']:x for x in ledger['interfaces']};affected=[]
for x in ledger['interfaces']:
 if x['id'].startswith('UI-'):
  affected.append(x['id'])
  for name in ['iteration019-projection-audit','iteration019-state-policy','iteration019-layout-manual']:
   x['evidence'].append(ref('文档/逆向台账/contracts/'+name+'.json','ITER-019具体静态主体/上游消费补读；S2/R0与我方I状态不变'))
  x.setdefault('dependency_iterations',[]).append(dict(iteration='ITER-019',reports=['文档/逆向台账/contracts/remaining-dependencies-iteration019.json'],meaning='历史待办保留，当前逐主题具体证据见新对账，不以定位索引作为语义完成'))
for name in names:ledger['sources'][name.replace('-','_')]='文档/逆向台账/contracts/'+name+'.json'
ledger['reference']['dependency_reconciliation']=dict(iteration='ITER-019',report='文档/逆向台账/contracts/remaining-dependencies-iteration019.json',meaning='沿用47主题并追加准确的本轮证据；主题覆盖不是全产品完成率',static='S2',runtime='R0')
updates=[];evidence=[];pins=ledger['evidence_snapshot']['files']
for path in sorted(files):
 b=(R/path).read_bytes();new=dict(sha256=sha(b),bytes=len(b));old=pins.get(path)
 if old and old!=new:
  assert path==str(summary.relative_to(R)),'Unexpected pin drift '+path
  updates.append(dict(path=path,previous_sha256=old['sha256'],current_sha256=new['sha256'],previous_bytes=old['bytes'],current_bytes=new['bytes'],previous_snapshot=str(oldcopy.relative_to(R))))
 pins[path]=new;evidence.append(dict(path=path,**new))
ledger['events'].append(dict(id='ITER-019',date='2026-10-14',action='继续状态恢复、投影审计、布局人工框选、系统协作末端补读并交叉审查',summary='保留原待办与I/R状态；补具体调用者、消费者和已知失败语义，新增主题对账。修复ITER018摘要未限定trim后非空查询的P3。无全逆向完成或我方等价声明。',affected_ids=affected,verification='作者范围/hash与独立重点人工审查分别记录；maintain生成和check随后执行。未执行竞品处理、未改业务代码、未部署。',evidence=evidence,evidence_updates=updates))
old=load(backup);assert ledger['events'][:-1]==old['events'];assert old['flows']==ledger['flows']
for a,b in zip(old['interfaces'],ledger['interfaces']):
 for key in ['id','static_depth','runtime_status','runtime_note','implementation_status','implementation_note','implementation_evidence','next_actions','entry_closure','flow_mapping']:assert (key in a)==(key in b) and a.get(key)==b.get(key),(a['id'],key)
(P/'ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(event='ITER-019',files=len(evidence),pins=len(pins),historicalUpdates=updates),ensure_ascii=False))
