# coding: utf-8
from pathlib import Path
import json, hashlib, sys
R=Path(__file__).resolve().parents[3]; C=R/'文档/逆向台账/contracts'
P=C/'iteration019-draft-producers.json'; d=json.loads(P.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
refs=d['evidence']
for r in refs:
 b=(R/r['path']).read_bytes(); ls=b.splitlines(keepends=True)
 assert sha(b)==r['fileSha256']
 assert sha(b''.join(ls[r['startLine']-1:r['endLine']]))==r['rangeSha256']
path='.data/research/lawbot-2026-10-13/readable/renderer.js'
b=(R/path).read_bytes();ls=b.splitlines(keepends=True)
ranges=[(31092,31130),(31167,31233),(31349,31393),(33366,33466),(35199,35223),(35331,35419),(35513,35589),(35609,35629),(35688,35731),(36063,36102)]
manual=[dict(path=path,startLine=a,endLine=z,fileSha256=sha(b),sliceSha256=sha(b''.join(ls[a-1:z]))) for a,z in ranges]
assert '成功和失败mg2通知不受该ID门限制' in json.dumps(d,ensure_ascii=False)
out=dict(schemaVersion=1,iteration='ITER-019',reviewer='root',author='adversarial_review',target=dict(path=str(P.relative_to(R)),sha256=sha(P.read_bytes()),markdownSha256=sha(P.with_suffix('.md').read_bytes())),hashVerifiedRanges=len(refs),manualReadRanges=manual,scope='通读8节结论，35范围哈希校验；10个合并范围重点人工复读，不声称独立重新展开全部直属依赖。',findings=[dict(id='DR-REVIEW-01',severity='P3',status='fixed',detail='Hv2身份门仅限制组件完成/失败回调和Mm2；成功与失败mg2通知无条件，已修正并回读。')],openFindings=[],staticDepth='S2',runtime='R0',executedVendor=False,confirmed=['rn2两个await后的当前对象检查，与内部revision检查不同','Ov2异步回执使用当前DOCX子组件、捕获旧材料，条件竞态证据成立','Bv2确认后清草稿并排队，Bd2未await；Hv2无revision门','跨文件补录删除无整体回滚，预统计不等于提交数','PDF新增按几何键去重且不含text，确认草稿不等于完成导出','按ID删除分格式实现，无直接磁盘保存'],limitations=['36赋值定位点不能替代全链语义证明','未执行竞品，条件竞态未运行重现','我方实现与线上验收状态未改变'])
md='# ITER-019 草稿生产者独立重点审查\n\n8节结论已通读，35段源码哈希已校验，10个合并范围重点人工复读。\n\n发现1项P3：Hv2当前材料ID门限制组件回调与Mm2，成功/失败通知不受该门限制；作者已修正，已回读。当前未解决发现0项。\n\n未重新展开全部直属依赖，未运行竞品；S2/R0及我方状态不变。36处赋值定位不代表全产品逆向完成。\n'
for p,data in [(C/'review-iteration019-draft-producers.json',(json.dumps(out,ensure_ascii=False,indent=2)+'\n').encode()),(C/'review-iteration019-draft-producers.md',md.encode())]:
 if '--check' in sys.argv: assert p.read_bytes()==data,p
 else:p.write_bytes(data)
print(f'{len(refs)} hash ranges; {len(manual)} manual ranges; 1 fixed, 0 open')
