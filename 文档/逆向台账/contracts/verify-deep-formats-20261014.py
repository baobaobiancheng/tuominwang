#!/usr/bin/env python3
"""Independent evidence/coverage and overclaim guard. No vendor code execution."""
import json,hashlib,copy
from pathlib import Path
R=Path(__file__).resolve().parents[3];P=R/'文档/逆向台账/contracts'
NAMESPACES={'pseudonym':14,'workspace':19,'ruleset':10,'profile':6,'preference':2,'dictionary':12,'feedback':9,'review':9,'learner':7}
SOURCE=json.loads((P/'ipc-contract-index.json').read_text())['channels']
EXPECT={x['id']:x['channel'] for x in SOURCE if x['channel'].split(':')[0] in NAMESPACES}
CONSTANTS={'learner:get-high-confidence-memory-count','learner:get-snapshots','learner:update-rules','learner:rollback','learner:rollback-previous','learner:rollback-to-previous'}
BOUNDARY={c for c in EXPECT.values() if c.split(':')[0] in {'dictionary','feedback','review','ruleset','profile','preference','learner'}}-CONSTANTS
OPEN=set(EXPECT.values())-CONSTANTS-BOUNDARY
assert (len(EXPECT),len(BOUNDARY),len(OPEN))==(88,49,33)
sha=lambda b:hashlib.sha256(b).hexdigest()
def check(d):
 rows=d['interfaces'];assert len(rows)==88 and len({x['id'] for x in rows})==88
 assert {x['id']:x['channel'] for x in rows}==EXPECT
 assert {x['channel'] for x in rows if x['staticClosureCandidate']=='literal-handler-closed'}==CONSTANTS
 assert {x['channel'] for x in rows if x['staticClosureCandidate']=='reviewed-application-boundary-candidate'}==BOUNDARY
 assert {x['channel'] for x in rows if x['staticClosureCandidate']=='deepened-with-open-project-dependencies'}==OPEN
 assert all(x['staticClosureCandidate'] in {'literal-handler-closed','reviewed-application-boundary-candidate','deepened-with-open-project-dependencies'} for x in rows)
 assert d['summary']==dict(interfaces=88,literalHandlerClosedCandidates=6,reviewedApplicationBoundaryCandidates=49,deepenedWithOpenProjectDependencies=33,runtimeVerified=0,completeBusinessContracts=0)
 mods={m['id']:m for m in d['modules']}; refs=[]
 for m in mods.values():refs+=m['implementationEvidence']
 for x in rows:
  assert x['runtimeState']=='R0' and x['completeBusinessContract'] is False
  assert x['input'] is not None and x['output'] is not None and x['effects'] is not None
  assert all(k in mods for k in x['deepModuleRefs'])
  refs+=x['handlerEvidence']
  if x['channel'] not in CONSTANTS:assert x['remainingUnknown']
 for e in refs:
  b=(R/e['path']).read_bytes();assert sha(b)==e['fileSha256']
  if 'start' in e:
   u=b.decode().encode('utf-16-le');z=u[2*e['start']:2*e['end']].decode('utf-16-le').encode();assert sha(z)==e['sliceSha256']
  else:
   lines=b.splitlines(keepends=True);assert 1<=e['startLine']<=e['endLine']<=len(lines);assert sha(b''.join(lines[e['startLine']-1:e['endLine']]))==e['sliceSha256']
 return len(refs)
d=json.loads((P/'deep-formats-20261014.json').read_text());n=check(d)
probes=[]
def reject(name,mutation):
 z=copy.deepcopy(d);mutation(z)
 try:check(z)
 except (AssertionError,KeyError):probes.append(name);return
 raise AssertionError('accepted falsification '+name)
reject('删除接口',lambda z:z['interfaces'].pop())
reject('重复替换另一接口',lambda z:z['interfaces'].__setitem__(0,copy.deepcopy(z['interfaces'][1])))
reject('伪造运行完成',lambda z:z['interfaces'][0].update(runtimeState='R1'))
reject('伪造完整业务',lambda z:z['interfaces'][0].update(completeBusinessContract=True))
reject('把复杂链伪造常量闭合',lambda z:z['interfaces'][0].update(staticClosureCandidate='literal-handler-closed'))
reject('伪造边界候选',lambda z:next(x for x in z['interfaces'] if x['channel'].startswith('workspace:')).update(staticClosureCandidate='reviewed-application-boundary-candidate'))
reject('伪造分类枚举',lambda z:z['interfaces'][0].update(staticClosureCandidate='S3'))
reject('篡改分类汇总',lambda z:z['summary'].update(reviewedApplicationBoundaryCandidates=50))
reject('篡改证据hash',lambda z:z['modules'][0]['implementationEvidence'][0].update(sliceSha256='0'*64))
print(json.dumps({'interfaces':88,'evidenceRefsVerified':n,'negativeProbesRejected':len(probes),'probes':probes},ensure_ascii=False))
