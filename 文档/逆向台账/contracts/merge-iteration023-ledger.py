#!/usr/bin/env python3
"""Explicit progress checkpoint; retain every previously pinned historical byte."""
import json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];lp=ROOT/'文档/逆向台账/ledger.json';ledger=json.loads(lp.read_text());assert not any(e['id']=='ITER-023' for e in ledger['events'])
base=ROOT/'.data/research/lawbot-2026-10-14';before=base/'iteration023/ledger-before.json';before.write_bytes(lp.read_bytes())
meta=lambda b:{'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
pins=ledger['evidence_snapshot']['files'];changes=[]
archives=[base/'iteration022/checkpoint022-code',base/'iteration023/pre-next-edit-code',base/'iteration022/baseline-code',base/'iteration023/runtime-activation-old']
for name,old in list(pins.items()):
 p=ROOT/name
 if not p.is_file():continue
 current=meta(p.read_bytes())
 if current==old:continue
 candidates=[a/name for a in archives]+[a/p.name for a in archives]
 archive=next((a for a in candidates if a.is_file() and meta(a.read_bytes())==old),None)
 if archive is None:raise SystemExit('MISSING_HISTORY:'+name)
 archived=archive.relative_to(ROOT).as_posix();pins[archived]=old;pins[name]=current
 changes.append({'path':name,'previous':old,'current':current,'archived':archived})
report=ROOT/'文档/逆向台账/contracts/iteration023-pin-changes.json';report.write_text(json.dumps({'event':'ITER-023','changes':changes,'note':'Explicit unfinished progress checkpoint, not final acceptance or deployment'},ensure_ascii=False,indent=2)+'\n')
paths=[before.relative_to(ROOT).as_posix(),report.relative_to(ROOT).as_posix(),'文档/逆向台账/contracts/merge-iteration023-ledger.py',
 '.data/research/lawbot-2026-10-14/iteration023/check-context-first.log','.data/research/lawbot-2026-10-14/iteration023/unlock-api-first.log',
 '.data/research/lawbot-2026-10-14/iteration023/default-profile-api-second.log','.data/research/lawbot-2026-10-14/iteration023/recovery-network-api-first.log',
 '.data/research/lawbot-2026-10-14/iteration023/edge-full-first.log','.data/research/lawbot-2026-10-14/iteration023/edge-regressions-second.log',
 '文档/脱敏规则完整技术交接-迭代023.md']
paths += [p.relative_to(ROOT).as_posix() for p in (ROOT/'文档/逆向台账/contracts').glob('*20261014*') if p.is_file()]
evidence=[]
for name in sorted(set(paths)):
 p=ROOT/name
 if p.is_file():record=meta(p.read_bytes());pins[name]=record;evidence.append({'path':name,**record})
# Archive the current matching code for the next explicit phase instead of erasing history.
for name,record in list(pins.items()):
 if name.startswith(('apps/','packages/','scripts/','tests/','文档/逆向台账/contracts/')) and (ROOT/name).is_file():
  data=(ROOT/name).read_bytes()
  if meta(data)==record:
   target=base/'iteration024/pre-edit-code'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
ledger['events'].append({'id':'ITER-023','date':'2026-10-14','action':'完成第一批完整规则接线与逐接口缺口复核，启动下一批实现',
 'summary':'41基础组、12金额族/17分支与全量108类别/3012项保存；新增真实表格/几何/兼容策略/默认computed遮罩、Word VML多帧媒体、已知密码合法解锁、备份及MCP；逐接口分类发现进一步缺口，反馈、规则库消费、自动恢复、OCR/批量还原仍在新阶段接线。全部竞品R0不升级；不宣称整体移植已完成。',
 'affected_ids':[i['id'] for i in ledger['interfaces']],
 'verification':'本阶段早期pnpm check通过11法则/13变异/TS/288单元/build；真实PDF/Word/Excel解锁识别复核导出通过；默认方案自动候选通过；草稿恢复/网络门实际2API测试通过。全Edge43项首次31通过12失败；已定位旧默认期望、标签可访问命名、模拟fixture缺新真实请求，第二轮旧fixture仍1/8，待修后重跑。历史日志完整保留，不将早期测试冒充新阶段最终验收。',
 'evidence':evidence,
 'boundaries':['竞品正版处理链未运行，全部R0。','OpenCV Windows彩色脚本已静态获取，数值移植和真实视觉gold仍在执行。','源码主动下线的learner不能被错误描述成缺少活跃学习算法。','真实中文NER严格F1=70.806%，英文跨领域F1=0.07561%，不外推业务或视觉准确率。','当前工作分支未发布/未部署新版，云端仍iteration021；SSH已读回既有服务状态。']})
ledger['evidence_snapshot']['note']+=' ITER-023仅显式进度检查点，28项原pin旧字节归档；有失败日志和新阶段未完成事项，未整体升格。'
lp.write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n');print('ITER-023_ADDED',len(changes),'historical pin changes',len(evidence),'evidence files')
