from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[3];C=R/'文档/逆向台账/contracts';P=C/'iteration019-state-policy.json';d=json.loads(P.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
refs=[r for x in d['sections'] for r in x['evidence']]
for r in refs:
 b=(R/r['path']).read_bytes();ls=b.splitlines(keepends=True);assert sha(b)==r['fileSha256'];assert sha(b''.join(ls[r['startLine']-1:r['endLine']]))==r['sliceSha256']
manual=[]
base='.data/research/lawbot-2026-10-13/'
for path,ranges in [('readable/renderer.js',[(30502,30563),(33222,33251),(33105,33128),(34353,34401),(34540,34592),(30154,30172),(33269,33323),(34142,34196),(4211,4243),(10422,10480),(10480,10578),(27850,27927),(31009,31026),(35419,35433),(36225,36233),(31005,31008),(5318,5327),(36213,36224)]),('readable/main.js',[(14229,14263),(13199,13245),(18974,19007),(19024,19067),(20108,20188),(22327,22359),(20767,20794),(21559,21600),(20092,20118)]),('runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/restore_pseudonym_docx.py',[(62,110),(154,207),(273,321),(447,491),(525,571),(632,670),(739,828)])]:
 b=(R/base/path).read_bytes();ls=b.splitlines(keepends=True)
 for a,z in ranges:manual.append(dict(path=base+path,startLine=a,endLine=z,fileSha256=sha(b),sliceSha256=sha(b''.join(ls[a-1:z]))))
# Assert author's corrected final prose before marking fixes verified.
alltext=json.dumps(d,ensure_ascii=False)
assert '清除Markdown抑制项' not in alltext
assert '抑制比较候选' in alltext and 'bb最终' in alltext
out=dict(schemaVersion=1,date='2026-10-14',iteration='ITER-019',reviewer='root',author='ui_closure_a',target=dict(path=str(P.relative_to(R)),sha256=sha(P.read_bytes()),markdownSha256=sha(P.with_suffix('.md').read_bytes())),hashVerifiedRanges=len(refs),manualReadRanges=manual,reviewScope='通读作者16节结论；全部范围机械校验；独立人工重点回读列出34段。未独立复读全部897行Python，也未声称所有16节上下游重新证明。',findings=[dict(id='SP-REVIEW-01',severity='P3',status='fixed',detail='SP16把无格式门的np2误限定Markdown；修为Af/Ef/Cf选中覆盖/冲突实体并列DOCX适用。'),dict(id='SP-REVIEW-02',severity='P2',status='fixed',detail='SP15须区分Qy从比较候选排除deleted等与bb返回原数组减suppressed keys；未参与候选的deleted不自动从输出清除。')],openFindings=[],staticDepth='S2',runtime='R0',executedVendor=False,confirmed=['eV/Jm各字段与copy关键行为，未保证coverage/唯一性/日期语义','Ed2缓存完成推断与kd2最终回执缺项目代际门、finally解绑当前listener条件','Nd2同步/await返回与非await续跑区别；Om2实际worker1','jc继承与统一Map恢复不能用容器hash替代业务语义校验','Td全局替换和固定空残留字段；Python零替换copy原件条件','bO已拒绝位置保留；bb候选过滤不等于输出删除','作者新增V3 segment完整性/record-key边界与人工/hidden correction叶规则'],limitations=['重点抽样审查并非整个产品算法独立复证','R0、第三方/私有服务及我方实现验收不因审查通过自动关闭'])
md='# ITER-019 状态恢复与假名策略：独立重点审查\n\n发现：1项P2、1项P3，均已修正；当前无未解决审查发现。\n\n- P2：Qy过滤的是抑制候选，bb输出只删除suppressed keys，不能说自动删除全部deleted。\n- P3：np2不限Markdown，也应用于DOCX等。\n\n通读16节作者结论，校验'+str(len(refs))+'个源码范围；独立人工重点复读'+str(len(manual))+'段，详见JSON。没有独立全文复读897行脚本；没有运行竞品。S2/R0与外部边界保留。\n'
for f,b in [(C/'review-iteration019-state-policy.json',(json.dumps(out,ensure_ascii=False,indent=2)+'\n').encode()),(C/'review-iteration019-state-policy.md',md.encode())]:
 if '--check' in sys.argv:assert f.read_bytes()==b,f
 else:f.write_bytes(b)
print(len(refs),'hash ranges',len(manual),'manual ranges; 2 fixed, 0 open')
