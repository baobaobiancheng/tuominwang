#!/usr/bin/env python3
"""Append an exact evidence checkpoint, retaining every historical pinned byte."""
from pathlib import Path
import json,hashlib,subprocess
root=Path(__file__).resolve().parents[3];base=root/'.data/research/lawbot-2026-10-14';lp=root/'文档/逆向台账/ledger.json'
ledger=json.loads(lp.read_text());event='ITER-030';assert event not in {x['id']for x in ledger['events']}
handoff=json.loads((root/'文档/逆向台账/contracts/current-interface-handoff-20261014.json').read_text());rows={x['id']:x for x in handoff['rows']};assert len(rows)==258
assert all(x.get('suggested_ledger_status') in ['I1','I2','I3','I4'] for x in rows.values())
assert not any('fatal_open' in x.get('implementation_status','')for x in rows.values()),'OPEN_RUNTIME_FATAL'
phase=base/'iteration030';phase.mkdir(exist_ok=True);(phase/'ledger-before.json').write_bytes(lp.read_bytes())
meta=lambda b:{'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
pins=ledger['evidence_snapshot']['files'];changes=[]
archives=[base/'iteration030/history',base/'iteration024/pre-edit-code',base/'iteration022/checkpoint022-code',base/'iteration023/pre-next-edit-code',base/'iteration022/baseline-code',base/'iteration023/runtime-activation-old']
for name,old in list(pins.items()):
 p=root/name;assert p.is_file(),name
 current=meta(p.read_bytes())
 if current==old:continue
 candidates=[a/name for a in archives]+[a/p.name for a in archives]
 archived=next((a for a in candidates if a.is_file() and meta(a.read_bytes())==old),None)
 assert archived is not None,'MISSING_HISTORY:'+name
 key=archived.relative_to(root).as_posix();pins[key]=old;pins[name]=current;changes.append({'path':name,'previous':old,'current':current,'archive':key})
for item in ledger['interfaces']:
 r=rows[item['id']];old=item['implementation_status'];item['implementation_status']=r['suggested_ledger_status'];item['current_porting_category']=r['current_category'];item['current_porting_reason']=r['reason'];item['current_native_equivalence']=False
 item['implementation_evidence']=[{'path':'文档/逆向台账/contracts/current-interface-handoff-20261014.json','note':'逐稳定ID '+item['id']+' 的实际代码、测试、静态及剩余边界；历史状态 '+old+' → '+item['implementation_status']}]
 item['next_actions']=r['remaining_boundaries'] or ['保持版本与证据可追溯；未知版本和私有链不视为已穷尽。']
 assert item['runtime_status']=='R0'
for flow in ledger['flows']:
 flow['evidence'].append({'path':'文档/逆向台账/contracts/current-interface-handoff-20261014.json','note':'当前逐成员实际证据；不升级竞品原生完整链路'})
report=root/'文档/逆向台账/contracts/final-porting-pin-changes-20261014.json';report.write_text(json.dumps({'event':event,'changes':changes,'historicalBytesRetained':True},ensure_ascii=False,indent=2)+'\n')
paths=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0'))
for name in paths:
 p=root/name
 if p.is_file() and name!='文档/逆向台账/ledger.json' and (name.startswith(('apps/','packages/','scripts/','tests/','vendor/','licenses/','文档/逆向台账/contracts/','文档/评估/','文档/使用指南/'))or name in ['Dockerfile','README.md','vitest.config.ts','package.json','pnpm-lock.yaml','文档/脱敏规则完整技术交接-迭代023.md']):pins[name]=meta(p.read_bytes())
logs=['check-final-sixth.log','integration-final-third.log','edge-final-fourth.log','edge-word-busy-current.log','word-busy-retry-units.log','prepublish-secret-scan.json']
evidence=[]
for name in ['文档/逆向台账/contracts/current-interface-handoff-20261014.json','文档/逆向台账/contracts/public-face-validation-20261014.json','文档/脱敏规则完整技术交接-迭代023.md',report.relative_to(root).as_posix(),(phase/'ledger-before.json').relative_to(root).as_posix()]+[(base/'iteration023'/n).relative_to(root).as_posix()for n in logs]:
 p=root/name;assert p.is_file(),name;pins[name]=meta(p.read_bytes());evidence.append({'path':name,**pins[name]})
ledger['events'].append({'id':event,'date':'2026-10-14','action':'全量公开规则移植、逐接口补证与三方交叉审查','summary':'258稳定ID、37链路、170深契约保留；逐条旧状态转为current handoff建议状态，不因总测试通过全体提升。41基础组、12金额族/17分支、108类别3012项、全文档与图像规则和还原链补齐；修复跨格式及合法10万长别名边界。竞品R0、OS安全域及私有依赖差异保留。','affected_ids':[x['id']for x in ledger['interfaces']]+[x['id']for x in ledger['flows']],'verification':'最终构建/证明/单元、39隔离API文件和50真实Edge流程证据逐文件保留；签名完整35/37真实集、NER全语料及5749人脸框真实评估不外推商业合同；具体计数和失败历史见最终验收记录。云部署另追加事件，不由本地通过推定。','evidence':evidence,'boundaries':['竞品许可证处理链未经运行，全部R0。','完整列出所获源码不证明未知版本、服务端或现实场景规则全部穷尽。','黑白印章无专门真实金标，Microsoft Word原生排版与OS/外部客户端域不同。']})
ledger['evidence_snapshot']['note']+=' ITER-030显式逐ID更新，所有漂移旧字节保留并精确验hash；竞品运行R0保持不变。'
lp.write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n');print('FINAL_LEDGER_APPENDED',len(changes),len(pins))
