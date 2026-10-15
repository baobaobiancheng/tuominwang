#!/usr/bin/env python3
"""Preserve old pinned bytes before appending this ongoing-work checkpoint."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3]
PHASE=ROOT/'.data/research/lawbot-2026-10-15/iteration032'
LP=ROOT/'文档/逆向台账/ledger.json'
ledger=json.loads(LP.read_text());event='ITER-032-CHECKPOINT'
assert event not in {e['id'] for e in ledger['events']}
history=PHASE/'checkpoint-history';history.mkdir(exist_ok=False)
shutil.copyfile(LP,history/'ledger-before.json')
def meta(path):
    b=path.read_bytes();return {'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
pins=ledger['evidence_snapshot']['files'];changes=[]
for name,old in list(pins.items()):
    p=ROOT/name;assert p.is_file(),name
    current=meta(p)
    if current==old:continue
    candidates=[PHASE/'pinned-before'/name,PHASE/'pre-full-gates/code'/name,PHASE/'pre-full-gates/evidence'/name]
    old_path=next((a for a in candidates if a.is_file() and meta(a)==old),None)
    assert old_path is not None,'MISSING_HISTORY:'+name
    pins[old_path.relative_to(ROOT).as_posix()]=old
    # Also preserve checkpoint bytes before later integration edits resume.
    current_path=history/name;current_path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,current_path)
    assert meta(current_path)==current
    pins[current_path.relative_to(ROOT).as_posix()]=current;pins[name]=current
    changes.append({'path':name,'previous':old,'current':current,'previousArchive':old_path.relative_to(ROOT).as_posix(),'checkpointArchive':current_path.relative_to(ROOT).as_posix()})
frozen=history/'current-work-input.json';shutil.copyfile(ROOT/'文档/逆向台账/contracts/inventory-closure-input-20261015.json',frozen)
work=json.loads(frozen.read_text());work_rows={r['id']:r for r in work['rows']};assert len(work_rows)==258
for item in ledger['interfaces']:
    item['iteration032_work']=work_rows[item['id']]['iteration032']
    item['iteration032_work']['checkpoint']='Ongoing; final integration and per-ID acceptance pending. Source R0 and static S2 unchanged.'
    item['implementation_evidence'].append({'path':frozen.relative_to(ROOT).as_posix(),'note':'进行中的逐ID补证输入；不覆盖历史I状态、不作为已完成或已部署证明。'})
    assert item['runtime_status']=='R0'
report=history/'checkpoint.json';report.write_text(json.dumps({'event':event,'ongoing':True,'historicalBytesRetained':True,'pinChanges':changes,'interfaceCount':258,'referenceRuntime':'R0','releaseDeployedThisIteration':False,'gates':{'edgeNewFlowAttempt3':'2/2 PASS before legacy integration and clipboard follow-up','fullApi':'stopped at resources.integration 50MiB timeout 180s under concurrent model evaluation; earlier files passed; retry quiet required','unitBuildEarlier':'86 files 588 tests pass before later integration; not final proof'},'remaining':['DOC/WPS full lifecycle integration and strict conversion validation','stamp candidate full data evaluation and quality gap','remaining public static chain gaps and native/private boundaries','final quiet full gates and adversarial review','documentation/private Git sync/deployment/current-browser verification']},ensure_ascii=False,indent=2)+'\n')
new=[report,frozen,history/'ledger-before.json',ROOT/'文档/待办与完成状态-20261015.md']
for p in new:pins[p.relative_to(ROOT).as_posix()]=meta(p)
ledger['events'].append({'id':event,'date':'2026-10-15','action':'并行补齐公开分支及真实边界检查点','summary':'记录258稳定ID的进行中补证；新Edge两条链路实际通过。查出DOC/WPS生命周期缺口与印章786图F1仅20.21%，继续实现和调优。所有旧证据漂移字节均精确归档；不从总测试升级接口状态。','affected_ids':[x['id'] for x in ledger['interfaces']],'verification':'本检查点非最终门禁或发布。全量API在50MiB测试180秒超时处停止，保留失败；并行模型评估暂停后重跑。新转换链、模型候选、剪贴板及最终全量验收仍待完成。','evidence':[{'path':p.relative_to(ROOT).as_posix(),**meta(p)}for p in new],'boundaries':['竞品未获许可证，全部R0；S2静态状态不变。','没有部署本轮改动。','现存旧证据已归档，不表示早已丢失的历史截图被恢复。']})
LP.write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'event':event,'changedPins':len(changes),'totalPins':len(pins)}))
