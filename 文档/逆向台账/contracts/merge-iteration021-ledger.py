#!/usr/bin/env python3
# coding: utf-8
"""Append release evidence only; never modify previous evidence pins or S/R/I."""
from pathlib import Path
import argparse, copy, hashlib, json
R = Path(__file__).resolve().parents[3]
P = R / '文档/逆向台账/ledger.json'
B = R / '.data/research/lawbot-2026-10-14/ledger-before-iteration021.json'
EXPECTED = '95f85e3bf5bd25a38642314090352c230cbd4adb807410f49f3fddfaa42670b4'
FILES = ['文档/部署记录-20261014.md'] + [
 '.data/deploy/aliyun-20261014/' + n for n in [
 'deploy-release.log', 'public-verification.json', 'final-status.txt', 'release-hashes.json',
 'model-rollback-test-results.json', 'compose-normalization-results.json', 'runtime-smoke.log']]
SELF = Path(__file__).resolve().relative_to(R).as_posix()
def pin(p):
 b = (R/p).read_bytes()
 return {'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b)}
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
 if not B.exists():
  assert not args.check
  assert hashlib.sha256(P.read_bytes()).hexdigest()==EXPECTED
  B.write_bytes(P.read_bytes())
 assert hashlib.sha256(B.read_bytes()).hexdigest()==EXPECTED
 before=json.loads(B.read_text());assert before['events'][-1]['id']=='ITER-020'
 d=copy.deepcopy(before)
 for p,v in before['evidence_snapshot']['files'].items():assert pin(p)==v,('old pin drift; do not repin',p)
 files=FILES+[B.relative_to(R).as_posix(),SELF]
 evidence=[]
 for p in files:
  v=pin(p);old=d['evidence_snapshot']['files'].get(p)
  assert old is None or old==v,('cannot replace old pin',p)
  d['evidence_snapshot']['files'][p]=v;evidence.append({'path':p,**v})
 public=json.loads((R/FILES[2]).read_text())
 assert public['health']['status']=='ok' and all(x['status']==200 for x in public['assets'])
 rollback=json.loads((R/FILES[5]).read_text());assert rollback['tests']==rollback['passed']==37
 normalization=json.loads((R/FILES[6]).read_text());assert normalization['passed']==8 and normalization['failed']==0
 assert 'RELEASE_OK' in (R/FILES[1]).read_text()
 d['sources']['iteration021_deployment_record']=FILES[0]
 d['sources']['iteration021_public_release_verification']=FILES[2]
 d['events'].append({
 'id':'ITER-021','date':'2026-10-14','action':'阿里云发布完成并登记共址恢复与验证边界',
 'summary':'发布aliyun-20261014-iteration021至https://182.92.172.59/tuomin/，API/worker/web更新，模型hash、服务health及实际前端资源hash校验通过；数据库及其他项目配置未修改，未新增CPU/内存限制。部署记录载明启动期间两次OOM、Semantica自动重启，最终WeKnora和Semantica恢复healthy，可用内存约526MiB。用户要求停止启动优化，未部署该优化，本地临时改动已恢复check-runtime发布原版。私有GitHub仓库已创建，源码push由主任务随后执行，本事件不证明push已完成。',
 'affected_ids':[],
 'verification':'发布脚本RELEASE_OK；公网3资源HTTP200与hash、health status=ok；amd64 Node24镜像空白图零候选smoke通过；发布脚本回滚故障注入37/37、配置归一化8/8。公网Word layout接口成功，但合成验收脚本直接查找跨run完整手机号失败，不声明公网完整端到端验收通过；遵用户指示停止后续功能测试/启动优化。最终状态显示Semantica累计restart=3及healthy，不能将该累计数当本次OOM次数。部署不改变258接口S2/R0与我方I评级。',
 'evidence':evidence,
 'boundaries':['仅新增发布证据，旧pin与历史events原样保留。','竞品未运行，不提升静态/运行/实现评级。','短时恢复与health不证明持续负载容量；不继续扩展测试。','私有仓库创建不等于源码推送完成；本地.data证据不进入GitHub。']})
 assert d['interfaces']==before['interfaces'] and d['flows']==before['flows']
 assert d['events'][:-1]==before['events']
 assert all(d['evidence_snapshot']['files'][p]==v for p,v in before['evidence_snapshot']['files'].items())
 current=json.loads(P.read_text())
 if args.check:assert current==d
 else:
  assert current==before or current==d
  P.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'result':'passed','mode':'check' if args.check else 'merge','event':'ITER-021','evidenceAdded':len(files),'pins':len(d['evidence_snapshot']['files']),'interfacesFlowsUnchanged':True,'oldPinsEventsUnchanged':True},ensure_ascii=False))
if __name__=='__main__':main()
