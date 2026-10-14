#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pathlib import Path
import json,hashlib,collections,sys
R=Path(__file__).resolve().parents[3];C=Path(__file__).resolve().parent;H=lambda b:hashlib.sha256(b).hexdigest()
p=C/'remaining-dependencies-iteration019.json';old=C/'remaining-dependencies-20261014.json';builder=R/'.data/research/lawbot-2026-10-14/iteration019/build-remaining.py';d=json.loads(p.read_text());o=json.loads(old.read_text());cache={};joins=0
assert {x['id'] for x in d['items']}=={x['id'] for x in o['items']} and len(d['items'])==47
for e in d['evidence'].values():
 if e['path'] not in cache:cache[e['path']]=(R/e['path']).read_bytes()
 b=cache[e['path']];assert H(b)==e['fileSha256'];assert H(b''.join(b.splitlines(keepends=True)[e['startLine']-1:e['endLine']]))==e['sliceSha256']
for x in d['items']:
 y=next(z for z in o['items'] if z['id']==x['id']);assert x['origins']==y['origins'];assert all(e in x['supportingEvidence'] for e in y['supportingEvidence'])
 assert (x['staticDepth'],x['runtime'],x['completeBusinessContract'])==('S2','R0',False)
 for s in x['supportingEvidence']:
  assert all(i in d['evidence'] for i in s['evidenceIds'])
  if 'iteration019-' not in s['report']:continue
  rd=json.loads((R/s['report']).read_text());sec=next(z for z in rd['sections'] if z['id']==s['section']);pool={v['id']:v for v in rd.get('evidence',[]) if 'id' in v}
  ev=sec.get('evidence') or [pool[i] for i in sec.get('evidenceIds',[])]
  keys={(v['path'],v['startLine'],v['endLine'],v.get('sliceSha256',v.get('rangeSha256'))) for v in ev}
  for i in s['evidenceIds']:
   v=d['evidence'][i];assert (v['path'],v['startLine'],v['endLine'],v['sliceSha256']) in keys
  joins+=1
for inp in d['inputs']+d['reviewInputs']:assert H((R/inp['path']).read_bytes())==inp['sha256']
assert d['originalRemainingStatements']==o['originalRemainingStatements'] and d['format33InterfaceMatrix']==o['format33InterfaceMatrix']
ix={x['id']:x for x in d['items']};assert '待补' not in ix['DEP18']['dependency'];assert not any(j['origin'].startswith('SC42') for j in d['crossReportJoins']);assert 'Image mi2/Ye2/ro2' not in ix['DEP32']['iteration019Reconciliation']
assert ix['DEP37']['status']=='external/unavailable' and not ix['DEP37']['remainingLocations']
assert {x['section'] for x in ix['DEP37']['supportingEvidence'] if 'iteration019-updater' in x['report']}=={f'UD{i:02}' for i in range(1,10)}
assess={
'DEP18':'eV/Jm所有声明OCR字段差分及Nd2→Ed2/kd2/Om2/Dm2具体分支见SP01–04、13、15、16；原遗留函数有体证据。仅比较指定OCR schema，不宣称全workspace字段等价。',
'DEP20':'聚合33复杂接口，不是33个新算法；DEP13–19/30已有命名helper链接，format33矩阵仍逐行S2/R0/false，不能将该主题改状态当33条全链销项。',
'DEP27':'PA01–03/08/09提供S2/k2/Ao2/xs2上游、删除事件及Af/Ef/Cf/Md/mc/$o2实际体；空ce2与父快照保存分离，未用emit替代存储。',
'DEP28':'LM01–03提供Yi2/mt2/pt2/Li2/vE/al2/il2/tn2明确来源，LH补测宽和精修叶；字体/viewport真值明确外部/R0。',
'DEP29':'LM04–09递归Xr2/ps2/Xu2应用加载/代际/卸载，原剩余To2/_u2/Ir2/lo2/Bb以LH01–05精确连接，Nd应用包装以LH06补读，动态库保持外部。',
'DEP30':'SP05–14覆盖四个jc.set父调用、schema真实缺口、YK.applySnapshot、唯一findTokenConflict与三父调用、Rp/Td以及Python897行本体。存在未验证或缺校验是已知语义，不是虚构存在未知验证器。',
'DEP31':'PA04–09和DR01–08分别覆盖gf2选择、赋值生产者和父保存；36行索引明确只是导航，14指定剩余赋值位置有实际函数报告及独审。',
'DEP32':'LM09–12与LH实际连接同图批量、Ul2/Zs2/_u2和页集合；Image mi2/Ye2与PDF ro2/io2/so2已区分，SP15冲突叶有具体体证据。',
'DEP38':'SC09–14将53稳定入口分41有renderer消费体/12无发布调用；本代理此前已重点独审系统报告，未把静态无引用改成invoke不可达。',
'DEP42':'SC01/02具体Og2密码预检与routeOnly消费者，LM06/07/09/LH06覆盖应用资源包装；sourceRegistry无sender绑定为明确静态事实，多窗口竞态仍R0。',
'DEP47':'SC01–08完整指定调度/准备/主附加输出/交付/还原确认体与SP恢复连接；主输出未知结果停、附加MD不停、失败后release拒绝等已分支化。全时序组合仍R0。'}
prior=[x['id'] for x in o['items'] if x['status']=='project-readable-open'];assert set(prior)==set(assess)
findings=[dict(id='M19-R01',priority='P3',status='resolved-readback',topic='DEP18',description='当前状态已补证但标题/边界仍称待补/open；已将历史文字转prior字段并修当前展示。'),dict(id='M19-R02',priority='P3',status='resolved-readback',topic='crossReportJoins',description='不存在SC42章节；已改DEP42，避免命名关系误导。'),dict(id='M19-R03',priority='P3',status='resolved-readback',topic='DEP32',description='将PDF ro2错误归Image；已分开Image mi2/Ye2与PDF ro2/io2/so2。')]
r=dict(schemaVersion=1,date='2026-10-14',iteration='ITER019',kind='independent-matrix-reconciliation-review',reviewer='ui_closure_a',targets=[dict(path=str(x.relative_to(R)),sha256=H(x.read_bytes())) for x in [p,p.with_suffix('.md'),builder]],summary=dict(topics=47,originalProjectReadableOpen=11,allEvidenceHashes=len(d['evidence']),sourceFiles=len(cache),currentReportSectionJoins=joins,resolvedP3=3,openFindings=0,statusCounts=dict(collections.Counter(x['status'] for x in d['items']))),findings=findings,priorOpenAssessments=[dict(id=i,currentStatus=ix[i]['status'],assessment=assess[i],reportSections=[dict(report=s['report'],section=s['section']) for s in ix[i]['supportingEvidence'] if 'iteration019-' in s['report']]) for i in prior],updaterIncrement=dict(sections=['UD%02d'%i for i in range(1,10)],addedUniqueRanges=30,assessment='已读取UD01–09全部结论及root独审，核对DEP37范围分类/引用；当前Mac禁差分、嵌入blockmap类仅兄弟依赖、crypto/zlib/provider/platform/install与运行保留外部。新增30范围归属与hash独立重算，不冒充第三方函数再次全文复审。'),method='独立读取矩阵JSON/MD/builder和11旧open对应报告的当前结论、原剩余与跨节范围归属；复用已经完成的指定源码独审。全部证据hash和本轮section引用所属另行独立重算。未执行竞品、未改作者稿。',limits=['本代理是state-policy作者；该算法报告由root另行独审。本审查独立性针对矩阵分类与跨报告连接，不将作者自读冒充同一算法第二次独立证明。','657起始范围及后续有限增补的hash一致不等于逐行人工再审；全部11旧open依赖的有限命名边界有支持，不代表全包全部调用图穷尽。','cross-report-evidence不是S3；47项继续S2/R0/completeBusinessContract=false，33接口矩阵及历史原始待办原样保留。','DEP37升级执行器增补由其它代理独立读/审；本审查仅在纳入时核对分类、引用范围和外部边界，不能作为该第三方源码全算法复审。','第三方数值/系统服务/私有服务和合法运行、我方实现与语料等价仍开放。'])
md=['# ITER019 剩余依赖矩阵独立审查','','**No open findings in reviewed scope.**','','三处P3已修正回读；原11个可读待办有实际命名函数报告支持，不能将其解释成全产品闭合。','',json.dumps(r['summary'],ensure_ascii=False),'','## 原11项逐项核对','']+['- '+i+'：'+assess[i] for i in prior]+['','## 已修正','']+['- '+f['topic']+'：'+f['description'] for f in findings]+['','## 范围限制','']+['- '+x for x in r['limits']]+['']
outs={C/'review-iteration019-remaining-dependencies.json':json.dumps(r,ensure_ascii=False,indent=2)+'\n',C/'review-iteration019-remaining-dependencies.md':'\n'.join(md)}
for path,t in outs.items():
 if '--check' in sys.argv:assert path.read_text()==t
 else:path.write_text(t)
print(json.dumps(r['summary'],ensure_ascii=False))
