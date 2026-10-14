#!/usr/bin/env python3
# coding: utf-8
from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parents[3];lp=r/'文档/逆向台账/ledger.json';j=json.loads(lp.read_text());event='ITER-031';assert event not in {x['id']for x in j['events']}
loss=json.loads((r/'文档/逆向台账/contracts/screenshot-history-unavailable-20261014.json').read_text()); lost={x['path']:x for x in loss['lostHistoricalSnapshots']}
base=r/'.data/research/lawbot-2026-10-14';phase=base/'iteration031';phase.mkdir(exist_ok=True);before=phase/'ledger-before.json';before.write_bytes(lp.read_bytes());pins=j['evidence_snapshot']['files'];meta=lambda b:{'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
for n,old in list(pins.items()):
 p=r/n;assert p.is_file(),n;new=meta(p.read_bytes())
 if new==old:continue
 candidates=[base/'iteration031/history'/n,base/'iteration030/history'/n,base/'iteration024/pre-edit-code'/n];archive=next((a for a in candidates if a.is_file()and meta(a.read_bytes())==old),None);
 if archive is None:
  assert n in lost and lost[n]['previous']==old and lost[n]['current']==new,'MISSING_HISTORY:'+n
  pins[n]=new
 else:pins[archive.relative_to(r).as_posix()]=old;pins[n]=new
j['evidence_snapshot']['unavailable_historical_screenshots']=loss['lostHistoricalSnapshots']
paths=['文档/逆向台账/contracts/screenshot-history-unavailable-20261014.json','README.md','deploy/aliyun/部署状态.md','文档/完整移植验收-20261014.md','文档/使用指南/脱敏汪最新实操指南.md','文档/使用指南/脱敏汪最新实操指南.html','文档/使用指南/最新指南截图清单.json','文档/使用指南/截图/v3-live-version.jpg','文档/逆向台账/contracts/merge-deployment-ledger-20261014.py',before.relative_to(r).as_posix()]
logs=['deploy-final.log','deploy-compat-final.log','live-version.json','live-health.json','host-after-final.log','host-final-settled.log','startup-incident-final.log','container-identities-before-verified.log','release/manifest.json'];paths+=['.data/deploy/aliyun-20261014/iteration023/'+n for n in logs];e=[]
for n in paths:
 p=r/n;assert p.is_file(),n;pins[n]=meta(p.read_bytes());e.append({'path':n,**pins[n]})
j['events'].append({'id':event,'date':'2026-10-14','action':'发布完整公开移植版本并记录真实共址影响','summary':'aliyun-20261014-iteration023已上线，公网登录与版本回读一致；本工具023迁移及全部网页hash通过。首次Compose参数不兼容回滚后修正成功。启动阶段宿主OOM使Semantica自动重启，现healthy，不能宣称完全无影响；其他4个既有项目容器及本工具DB保持ID/启动/重启计数。未增加资源限制/未改大模型加载。7张旧截图在重跑后被覆盖，原字节不能恢复；旧hash保留、显式标为unavailable，不伪造归档或把新图当旧图。','affected_ids':[x['id']for x in j['interfaces']],'verification':'1747文件manifest校验、实际资源逐hash、Node运行加载bundle、HTTPS admin登录、版本2026.10.14-023、Edge真实页面显示版本；宿主内核OOM日志及恢复健康读回保留。完整本地测试与竞品R0维度保持独立。','evidence':e,'boundaries':['公网未做新的重负载容量验证。','OS/私有依赖/竞品许可证R0和黑白章真实gold边界继续保留。','未把部署或健康检查当作算法等价与零泄露证明。']})
j['evidence_snapshot']['note']+=' ITER-031发布及真实OOM影响补证；README和指南文本旧字节精确保留；7张历史截图原字节缺失明确列出，旧hash保留且不声称历史图全部可验证。';lp.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print('DEPLOYMENT_EVENT_APPENDED')
