# coding: utf-8
"""Read-only source extraction and in-memory mutation review, never loads native modules."""
from pathlib import Path
import ast,json,hashlib,struct,tarfile,base64
R=Path(__file__).resolve().parents[3]; B=R/'.data/research/lawbot-2026-10-14/native-integrity'; C=R/'文档/逆向台账/contracts'
RES=R/'.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources'
verify_path=B/'verify-native.py'; source=verify_path.read_text();tree=ast.parse(source)
normal=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='normalize')
ns={'struct':struct};exec(compile(ast.Module(body=[normal],type_ignores=[]),str(verify_path),'exec'),ns);normalize=ns['normalize']
sha=lambda b:hashlib.sha256(b).hexdigest()
report=json.loads((B/'native-integrity-comparison.json').read_text());probes=[];baselines=[]
def comparison(up,obs):
 a,an=normalize(up);b,bn=normalize(obs)
 if an['signatureOffset'] is None:
  assert bn['signatureOffset']==(len(up)+15)//16*16,'unsigned signature offset alignment'
  padding=len(b)-len(a)
  assert 0<=padding<16 and not any(b[len(a):]),'unsigned zero padding constraint'
  b=b[:len(a)]
 else:assert an['signatureOffset']==bn['signatureOffset'],'signed offset anchored to upstream'
 assert a==b,'non-signature content mismatch'
 return an,bn

def run_probe(item,name,up,obs,mutate,expect):
 b=bytearray(obs);mutate(b)
 try:comparison(up,bytes(b));result='accepted'
 except Exception as e:result='rejected';error=f'{type(e).__name__}: {str(e)[:160]}'
 probes.append(dict(member=item['member'],name=name,expected=expect,result=result,passed=result==expect,mutated_sha256=sha(b),error=error if result=='rejected' else None))
 assert result==expect,(name,result,expect)

def commands(blob):
 off=32;out=[]
 for _ in range(struct.unpack_from('<I',blob,16)[0]):
  cmd,size=struct.unpack_from('<II',blob,off);out.append((cmd,off,size));off+=size
 return out

def set32(b,o,v):struct.pack_into('<I',b,o,v)
def set64(b,o,v):struct.pack_into('<Q',b,o,v)
for item in report['items']:
 key=item['package'].replace('/','-').replace('@','');tarpath=B/(key+'.tgz');meta=json.loads((B/(key+'.metadata.json')).read_text());algorithm,digest=meta['dist']['integrity'].split('-',1)
 assert base64.b64encode(hashlib.new(algorithm,tarpath.read_bytes()).digest()).decode()==digest
 rel=item['member'][len('node_modules/'+item['package']+'/'):]
 with tarfile.open(tarpath) as tar:up=tar.extractfile('package/'+rel).read()
 observedpath=RES/'app.asar.unpacked'/item['member'];obs=observedpath.read_bytes();assert sha(obs)==item['observedSha256'];assert sha(up)==item['declaredAsarSha256']==item['upstreamSha256']
 an,bn=comparison(up,obs);cmds=commands(obs);sigcmd=next(o for c,o,z in cmds if c==0x1d);linkcmd=next(o for c,o,z in cmds if c==0x19 and obs[o+8:o+24].split(b'\0')[0]==b'__LINKEDIT');so,sl=struct.unpack_from('<II',obs,sigcmd+8);cpu=struct.unpack_from('<I',obs,4)[0];page=16384 if cpu==0x100000c else 4096
 baselines.append(dict(member=item['member'],upstream_sha256=sha(up),observed_sha256=sha(obs),normalization_matches=True,signatureOffset=so,signatureLength=sl,alignmentPaddingBytes=item['alignmentPaddingBytes']))
 def flip(b,o):b[o]^=1
 code_offset=max(4096,32+struct.unpack_from('<I',obs,20)[0]+32)
 run_probe(item,'flip_non_signature_code_byte',up,obs,lambda b:flip(b,code_offset),'rejected')
 run_probe(item,'flip_last_non_signature_byte',up,obs,lambda b:flip(b,so-1),'rejected')
 run_probe(item,'wrong_ncmds',up,obs,lambda b:set32(b,16,struct.unpack_from('<I',b,16)[0]+1),'rejected')
 run_probe(item,'signature_command_not_last_declared_LC',up,obs,lambda b:set32(b,20,struct.unpack_from('<I',b,20)[0]+16),'rejected')
 run_probe(item,'append_unaccounted_eof_byte',up,obs,lambda b:b.extend(b'X'),'rejected')
 run_probe(item,'signature_length_off_by_one',up,obs,lambda b:set32(b,sigcmd+12,sl-1),'rejected')
 run_probe(item,'signature_shift_into_content',up,obs,lambda b:(set32(b,sigcmd+8,so-16),set32(b,sigcmd+12,sl+16)),'rejected')
 run_probe(item,'linkedit_filesize_off_by_one',up,obs,lambda b:set64(b,linkcmd+48,struct.unpack_from('<Q',b,linkcmd+48)[0]+1),'rejected')
 run_probe(item,'linkedit_vmsize_unaligned',up,obs,lambda b:set64(b,linkcmd+32,struct.unpack_from('<Q',b,linkcmd+32)[0]+1),'rejected')
 run_probe(item,'linkedit_fileoff_tamper',up,obs,lambda b:(set64(b,linkcmd+40,struct.unpack_from('<Q',b,linkcmd+40)[0]+1),set64(b,linkcmd+48,struct.unpack_from('<Q',b,linkcmd+48)[0]-1)),'rejected')
 # Signature blob is explicitly opaque to normalization: expected accept, NOT valid signature.
 run_probe(item,'signature_blob_magic_flip_opaque',up,obs,lambda b:flip(b,so),'accepted')
 def enlarge(b):
  b.extend(b'NOT_A_SIGNATURE_BLOB'*2);newsize=len(b)-struct.unpack_from('<Q',b,linkcmd+40)[0];set32(b,sigcmd+12,len(b)-so);set64(b,linkcmd+48,newsize);set64(b,linkcmd+32,(newsize+page-1)//page*page)
 run_probe(item,'opaque_signature_trailing_data_with_consistent_sizes',up,obs,enlarge,'accepted')
 def empty(b):
  del b[so:];newsize=len(b)-struct.unpack_from('<Q',b,linkcmd+40)[0];set32(b,sigcmd+12,0);set64(b,linkcmd+48,newsize);set64(b,linkcmd+32,(newsize+page-1)//page*page)
 run_probe(item,'zero_length_signature_with_consistent_sizes',up,obs,empty,'accepted')
 if item['alignmentPaddingBytes']:
  run_probe(item,'nonzero_added_alignment_padding',up,obs,lambda b:flip(b,len(up)),'rejected')
  def excessive(b):
   b[so:so]=bytes(16);newsize=len(b)-struct.unpack_from('<Q',b,linkcmd+40)[0];set32(b,sigcmd+8,so+16);set64(b,linkcmd+48,newsize);set64(b,linkcmd+32,(newsize+page-1)//page*page)
  run_probe(item,'extra_16_byte_padding_rejected',up,obs,excessive,'rejected')
 assert sha(observedpath.read_bytes())==sha(obs),'Original modified'
# Verify gates semantically from source: only own review script text, no execution of module body.
assert 'assert verify.returncode==0' in source.replace(' ','') or any(isinstance(n,ast.Assert) and 'verify.returncode' in ast.unparse(n.test) and '== 0' in ast.unparse(n.test) for n in ast.walk(tree)), 'Missing codesign gate'
assert report.get('allCodesignVerified') is True
assert all(x['codesignVerifyExit']==0 and x['codesignDisplayExit']==0 for x in report['items'])
result=dict(schema_version=1,date='2026-10-14',mode='all native mutations in memory; no execution/no original writes; only normalize function AST loaded from our verification helper',reviewed_sources=[dict(path=str(p.relative_to(R)),sha256=sha(p.read_bytes())) for p in [verify_path,B/'native-integrity-comparison.json']],summary=dict(baselines=len(baselines),probes=len(probes),rejected=sum(x['result']=='rejected' for x in probes),accepted_opaque_signature_probes=sum(x['result']=='accepted' for x in probes),unexpected_results=0,original_files_unchanged=True),baselines=baselines,probes=probes,conclusions=['7份现存发布原件与已验证npm制品的非签名前缀比对成立，ASAR原始SHA256不一致仍保留。','代码字节/签名前最后字节、LC计数/末尾范围、签名起点、EOF、LINKEDIT大小/任意vmsize修改均被拒绝；8字节补齐样本非零补齐与多16字节补齐均拒绝。','x64允许4KiB或16KiB精确上取整，仅对LINKEDIT.vmsize字段放宽；任意其他值失败，该有限例外不掩盖代码字节。','签名blob不透明：损坏magic、尾部附加任意数据以及零长度blob可通过normalize。该函数仅定位差异，不证明签名有效。','父线程已增加codesign verify/display非零拒绝产报告与allCodesignVerified；当前7原件记录均为0。未为内存变异调用codesign，不把其预期失败冒称实测。'],residual_limits=['normalize未独立核Mach-O所有load-command结构（例如唯一LINKEDIT/最终遍历offset、完整签名SuperBlob结构）；固定可信上游逐字节比较与系统验签共同约束当前7对，不是通用恶意Mach-O验证器。','codesign证明磁盘签名有效，不证明第三方算法正确、软件运行安全、签名历史流程或ASAR重打包步骤。'],verdict='pass-for-current-seven-byte-difference-closure-with-separate-codesign-gate; not algorithm/runtime closure')
(C/'review-native-20261014.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
md=['# 原生文件完整性对抗审查 · 2026-10-14','','## 结果','',f"7份原件基线通过，{len(probes)}个纯内存变异：{result['summary']['rejected']}个非允许修改被拒绝，21个签名区不透明变异按预期只通过normalize。原包未修改，未运行原生模块。",'']
md+=['- '+x for x in result['conclusions']]
md+=['','## 边界','']+['- '+x for x in result['residual_limits']]
md+=['','## 可重跑','', '`python3 文档/逆向台账/contracts/review-native-probes.py`','', '此脚本只从己方verify-native.py提取normalize函数AST，在内存解析原文件副本；不执行被分析二进制、不改原包。7份签名状态引用并核验父线程当前结果SHA256，变异数据未写磁盘也未送codesign。','']
(C/'review-native-20261014.md').write_text('\n'.join(md));print(json.dumps(result['summary']))
