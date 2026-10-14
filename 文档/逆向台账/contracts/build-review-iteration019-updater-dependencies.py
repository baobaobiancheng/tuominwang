# coding: utf-8
from pathlib import Path
import json, hashlib, struct, sys
R=Path(__file__).resolve().parents[3]; C=R/'文档/逆向台账/contracts'
P=C/'iteration019-updater-dependencies.json';d=json.loads(P.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
refs=d['evidence']
for x in refs:
 b=(R/x['path']).read_bytes(); ls=b.splitlines(keepends=True)
 assert sha(b)==x['fileSha256']
 assert sha(b''.join(ls[x['startLine']-1:x['endLine']]))==x['rangeSha256']
ep=R/'.data/research/lawbot-2026-10-14/updater-dependencies/extraction.json'
e=json.loads(ep.read_text());archive=R/e['archive']
with archive.open('rb') as f:
 header=struct.unpack('<4I',f.read(16)); tree=json.loads(f.read(header[3]))
 for x in e['files']:
  q=tree
  for part in x['asarPath'].split('/'):q=q['files'][part]
  assert not q.get('unpacked')
  f.seek(e['payloadOffset']+int(q['offset'])); b=f.read(q['size'])
  assert b==(R/x['path']).read_bytes() and sha(b)==x['sha256']
manual=[]
old='.data/research/lawbot-2026-10-13/'
new='.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/'
groups=[(old+'readable/main.js',[(26140,26282)]),
 (old+'static-updater/node_modules/electron-updater/out/AppUpdater.js',[(435,480),(559,715)]),
 (old+'static-updater/node_modules/electron-updater/out/MacUpdater.js',[(20,148)]),
 (new+'out/electronHttpExecutor.js',[(1,78)]),
 (new+'out/DownloadedUpdateHelper.js',[(1,168)]),
 (new+'out/differentialDownloader/DifferentialDownloader.js',[(1,267)]),
 (new+'node_modules/builder-util-runtime/out/CancellationToken.js',[(1,110)]),
 (new+'node_modules/builder-util-runtime/out/httpExecutor.js',[(92,148),(203,345),(393,499)])]
for path,ranges in groups:
 b=(R/path).read_bytes();ls=b.splitlines(keepends=True)
 for a,z in ranges:manual.append(dict(path=path,startLine=a,endLine=z,fileSha256=sha(b),sliceSha256=sha(b''.join(ls[a-1:z]))))
out=dict(schemaVersion=1,iteration='ITER-019',reviewer='root',author='adversarial_review',
 target=dict(path=str(P.relative_to(R)),sha256=sha(P.read_bytes()),markdownSha256=sha(P.with_suffix('.md').read_bytes())),
 hashVerifiedRanges=len(refs),asarFilesIndependentlyMatched=len(e['files']),
 extraction=dict(path=str(ep.relative_to(R)),sha256=sha(ep.read_bytes())),manualReadRanges=manual,
 scope='通读9节结论，独立重点回读当前Mac下载、executor、缓存、取消和差分主干；未独立全文复读multipart splitter和plan算法，保留作者证据。',
 findings=[],openFindings=[],staticDepth='S2',runtime='R0',executedVendor=False,
 confirmed=['当前darwin配置禁差分，不能把包内差分读码当默认运行链',
 '同进程缓存仅存在检查，跨启动缓存摘要验证与fileName有限检查不同',
 '完整下载Promise取消未接网络abort，API请求取消则有abort',
 'redirectCount++递归旧值不证明可靠次数上限',
 'task.done和blockmap复制在提交try之外，下载/通知/安装不能混同',
 '差分最终摘要校验不代表所有中间range和取消行为正确'],
 limitations=['重点独审非全库独立语义复证','未执行下载或安装，无真实网络/文件故障测试','OS安装、私有服务、密码学和我方实现验收不随此关闭'])
md=f'# ITER-019 更新依赖独立重点审查\n\n通读9节结论，校验{len(refs)}个范围；独立重点复读{len(manual)}个合并范围，并将{len(e["files"])}份提取文件逐字与ASAR比对。当前未发现需要修正的结论。\n\n当前Mac禁用差分；完整下载取消与底层abort、缓存存在与摘要验证、下载完成与安装完成均已分别说明。未独立全文重读multipart/plan，未执行竞品下载或安装。保持S2/R0。\n'
for p,b in [(C/'review-iteration019-updater-dependencies.json',(json.dumps(out,ensure_ascii=False,indent=2)+'\n').encode()),(C/'review-iteration019-updater-dependencies.md',md.encode())]:
 if '--check' in sys.argv:assert p.read_bytes()==b,p
 else:p.write_bytes(b)
print(len(refs),'hash ranges;',len(e['files']),'ASAR files;',len(manual),'manual ranges; 0 findings')
