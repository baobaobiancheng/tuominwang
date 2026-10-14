#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
targets=[O/'iteration019-system-collab.json',O/'iteration019-system-collab.md',R/'.data/research/lawbot-2026-10-14/iteration019/build-system-collab.py']
d=json.loads(targets[0].read_text());ss={s['id']:s for s in d['sections']}
assert d['staticDepth']=='S2' and d['runtime']=='R0' and not d['executedVendor']
assert d['summary']['newEvidenceRanges']==56
assert '附加MD catch只特判Kn2取消' in ''.join(ss['SC05']['observations'])
assert 'statistics.entityCount!==0' in ''.join(ss['SC06']['observations'])
assert '仅这两个状态先await he2' in ''.join(ss['SC08']['observations'])
for s in d['sections']:
 for e in s['evidence']:
  b=(R/e['path']).read_bytes();assert sha(b)==e['fileSha256'];assert sha(b''.join(b.splitlines(keepends=True)[e['startLine']-1:e['endLine']]))==e['sliceSha256']
assert len(d['systemInventory'])==len(set(x['id'] for x in d['systemInventory']))==53
assert sum(x['inventoryStatus']=='no-published-renderer-caller' for x in d['systemInventory'])==12
ranges=[('r',31530,31570),('r',31614,31624),('r',36239,36385),('r',36546,36629),('r',34122,34141),('m',17008,17046),('m',17934,17949),('r',37031,37164),('m',23378,23546),('r',28606,28797),('r',30932,30964),('m',23322,23335),('m',23734,23777),('r',28438,28601),('r',4027,4067),('r',28089,28140),('r',4255,4269),('r',31394,31413),('r',32799,32819),('r',32859,32876),('r',33364,33373),('r',36746,36792)]
es=[]
for k,a,b in ranges:
 p=R/'.data/research/lawbot-2026-10-13/readable'/('renderer.js' if k=='r' else 'main.js');raw=p.read_bytes();es.append(dict(path=str(p.relative_to(R)),startLine=a,endLine=b,fileSha256=sha(raw),sliceSha256=sha(b''.join(raw.splitlines(keepends=True)[a-1:b]))))
findings=[dict(id='SC-REV01',priority='P2',section='SC05',title='区分主apply与附加Markdown的未知写入分支',status='resolved-readback',source='renderer.js:37065–37094',detail='原文未限定RESULT_UNCONFIRMED停止条件，附加MD的catch(O3)仅特判取消，未知写入转C3并可继续下一件，未置Io2/I3。现作者明确两分支，保留真实竞品静态缺口。'),dict(id='SC-REV02',priority='P3',section='SC06',title='保留假名交付校验的模式与计数条件',status='resolved-readback',source='main.js:23485–23498',detail='原文将lpm/正文token校验写成无条件；实为默认pseudonym且entityCount!==0门，另safeName敏感比较仅trim长度>=2。现已补齐，避免把零实体或非假名任务误判不合法。'),dict(id='SC-REV03',priority='P3',section='SC08',title='限定关闭前失败回执门适用的两个状态',status='resolved-readback',source='renderer.js:30958–30964',detail='pe2无job或不处于waiting_for_restore_approval/restoring时直接关闭；仅这两个状态才await he2并要求restore_failed。现已按实际条件修正。')]
report=dict(schemaVersion=1,date='2026-10-14',iteration='ITER019',kind='independent-defect-first-review',reviewer='ui_closure_a',status='No open findings in reviewed scope',targets=[dict(path=str(p.relative_to(R)),sha256=sha(p.read_bytes())) for p in targets],method='review-agent只读审查作者稿及builder；独立核验全部56条源文件/片段hash和53个唯一ID；人工语义复读下列22个范围。未执行竞品、未修改作者稿/ledger/业务代码。',summary=dict(allEvidenceHashChecks=56,systemStableIds=53,noCallerInventory=12,manualRanges=len(es),resolvedP2=1,resolvedP3=2,openFindings=0),findings=findings,confirmed=[
'密码取消null只退出内层路由预检；secure_review外层仍可进入Rm2排队；Ln2超时不取消底层IPC，已解锁sourceRef不回滚。',
'附加MD失败可同时留主文件和i3候选；先C3 fail再release时failed不在主服务release允许态，失败不等于未写文件。',
'恢复UI发residualTokenCount:0且主完成流程同样赋0；完成确认校验并复制restoreInputPath/slotPath的已批准假名稿，未扫描原文回填输出。',
'主prepare/release各自job锁但整段renderer写入没有一把跨操作锁；releaseBuffer先存building再写交换件，无法声称整体事务。',
'Ru订阅后getState无revision；net在途请求不取消；taskPower wc有revision递增门，初始getState不触发uc2。',
'新增iy2/ry2范围已独立回读：DOCX/Markdown不await child；PDF/image在finally复位jd2后await。'
],manualEvidence=es,boundaries=['14节文案和builder全读；22个选择范围是人工语义抽样，不代表每节每一行独立重审。','56 hash通过不证明语义；53 inventory唯一/状态计数只检查结构，本轮没有重新穷尽发布资产的无引用扫描。','未执行许可流程、模型、Office工具、磁盘故障/重复事件/多窗口交错；作者仍S2/R0，无全产品完成或算法等价结论。'])
md=['# ITER019 系统协作报告独立审查','','**No open findings in reviewed scope.**','',report['method'],'','## 已修正并回读','']
for f in findings:md+=['- ['+f['priority']+'] '+f['title']+' — '+f['section']+'：'+f['detail']]
md+=['','## 支持的关键结论','']+['- '+x for x in report['confirmed']]+['','## 范围与限制','']+['- '+x for x in report['boundaries']]+['','## 作者文件快照','']+['- `'+x['path']+'` SHA256 `'+x['sha256']+'`' for x in report['targets']]+['','精确人工复读范围及hash见同名JSON。','']
outs={O/'review-iteration019-system-collab.json':json.dumps(report,ensure_ascii=False,indent=2)+'\n',O/'review-iteration019-system-collab.md':'\n'.join(md)}
if '--check' in sys.argv:
 for p,t in outs.items():assert p.read_text()==t
else:
 for p,t in outs.items():p.write_text(t)
print(json.dumps(report['summary'],ensure_ascii=False))
