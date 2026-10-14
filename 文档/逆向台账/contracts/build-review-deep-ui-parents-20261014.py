#!/usr/bin/env python3
"""Independent review snapshot; hashes prove provenance, not semantic completeness."""
import json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
D=ROOT/'文档/逆向台账/contracts'
T='deep-ui-parents-20261014'
EXPECTED={'json':'b4a9529e9740c06116e36da34934d29dfc89a675d5b5fca4e9dee72b4a130bd0','md':'2b76ae6070b049e4102d67b42b38e9358ccfd284bf180a0f69faa899f30f8d58'}
FIXED=['UI-2c1712d35460','UI-3f01047e6b59','UI-339d8e53408d','UI-ad41d13c4a2d','UI-67e30cf66ad0','UI-32ce2fb60c5f']
def sha(b):return hashlib.sha256(b).hexdigest()
x=json.loads((D/(T+'.json')).read_text())
for ext,h in EXPECTED.items():assert sha((D/(T+'.'+ext)).read_bytes())==h, 'target changed: '+ext
assert sorted(c['id'] for c in x['contracts'])==sorted(FIXED)
assert len(x['evidence'])==59
for e in x['evidence']:
 b=(ROOT/e['path']).read_bytes(); ls=b.splitlines(keepends=True)
 assert sha(b)==e['file_sha256'],e['id']
 assert sha(b''.join(ls[e['start_line']-1:e['end_line']]))==e['slice_sha256'],e['id']
source='.data/research/lawbot-2026-10-13/readable/renderer.js'
b=(ROOT/source).read_bytes();ls=b.splitlines(keepends=True)
ranges=[(34400,34528),(34928,35035),(26335,26380),(26648,26669),(26265,26283),(34828,34928),(32675,32743),(3888,3924),(30029,30061),(23725,23794),(23702,23725),(32342,32375),(22718,22833),(24735,24778),(26520,26588),(8779,8818),(35047,35147),(8620,8720),(35310,35420)]
evidence=[dict(path=source,start_line=a,end_line=z,file_sha256=sha(b),slice_sha256=sha(b''.join(ls[a-1:z]))) for a,z in ranges]
findings=[{'id':'UIP-REV-01','priority':'P3','status':'resolved-readback','claim':'Qo2 ready/partial 门禁须限于批量 mo2 分支；单文档直接调用 child.setPreviewMode。','sourceRange':[32363,32372],'resolution':'作者已限定批量分支并明确单文档分支；当前快照回读一致。'}, {'id':'UIP-REV-02','priority':'P3','status':'resolved-readback','claim':'Rs2 的30秒是每页循环开始的已耗时检查，不是打断 await Es2 的总超时。','sourceRange':[23751,23781],'resolution':'作者已改为循环开始检查且不打断await；独立额外读 Es2 23702–23725，内部3秒Promise.race也不证明底层工作已取消。'}]
confirmed=[
 {'id':'UI-2c1712d35460','conclusion':'groupCountByKey 全文仅声明和读取，三个侧栏callsite未传；Image U2为空async。Co2先登记去重key再await反馈，catch为空，失败不自动回退key。','boundary':'不据此判定所有删除入口、投影、持久化反馈均闭合。'},
 {'id':'UI-3f01047e6b59','conclusion':'Image Ee2及watcher无请求序号/查询身份校验，旧响应可能覆盖新结果；PDF Vn2有序号/query复核。PDF码点数组与UTF16 indexOf索引并用，存在特定Unicode输入坐标风险。','boundary':'静态可达风险，未运行竞品验证；不宣称所有Unicode输入失败。'},
 {'id':'UI-339d8e53408d','conclusion':'jm2失败重排dirty并保存错误，dispose不取消正在运行Promise；Vm2逐份草稿写入后调用child，缺跨文件事务回滚；saveRecovery串行队列及缺源补登记重试一次有源码支持。','boundary':'renderer回执不证明主进程原子保存、加密、重开恢复与卸载取消已完成。'},
 {'id':'UI-ad41d13c4a2d','conclusion':'已读project entry生成优先级与重置分支支持报告；store mutation后异步统一同步失败无整体回滚。','boundary':'没有把预览优先级外推为全部导出/LPM消费者优先级；jc/UK仍待递归。'},
 {'id':'UI-67e30cf66ad0','conclusion':'Pf2 image success:false/非数组不加skipped；PDF deleted-page过滤checkedPageNumbers但不同时过滤results。av2先Vf2删除再Wf2，后者可因缺Markdown映射返回false，旧实体无恢复分支。','boundary':'未复核所有候选几何和draft版本门；部分修改可达性不等于竞品运行复现。'},
 {'id':'UI-32ce2fb60c5f','conclusion':'Df2键缺sourceAnchor、材料集合、revision；Wd2只有初始化/读取/赋值/成功尾部清空四处，不随草稿修改主动失效。manual当前框先插入、后project apply。Rs2有循环取消、时间预算、覆盖检查，提交前再验序号。','boundary':'父控制流不证明旋转、裁切、坐标转换正确；Es2额外只审等待控制，不宣称全部geometry闭合。'}]
out={'schemaVersion':1,'date':'2026-10-14','kind':'independent-static-review','reviewer':'ui_closure_a','target':str((D/(T+'.json')).relative_to(ROOT)),'reviewedArtifactHashes':EXPECTED,'summary':{'stableIds':6,'targetEvidenceHashesChecked':59,'independentlyReadRangeRecords':len(evidence),'resolvedP3':2,'openP1P2':0,'openFindings':0,'runtimeExecuted':False,'s3Recommended':False},'method':['59范围逐条复算来源全文件与切片SHA；固定6项ID独立常量校验。','六项结论及剩余边界已读；对关键并发/失败/缓存/持久化/删除分支做独立源码复核，以下19条可重叠范围记录不是全部59范围的重新语义证明。','全文词法核对groupCountByKey与Wd2引用数量，仅用于辅助直接分支阅读，不单独证明业务闭合。','不运行竞品代码，不请求其私有接口，不绕过许可证；没有改原作者报告或ledger。'],'findings':findings,'confirmed':confirmed,'evidence':evidence,'remainingByStableId':{c['id']:c['stillUnreadOrUnverified'] for c in x['contracts']},'excluded':['协作 open/consume 的 renderer le2 生产消费未在本轮展开。','各格式 saveDraft/close 的全部生命周期，以及preload→主进程保存→重开恢复尚未全链闭合。','legacy snapshot review schema 子验证器不是本轮范围。'],'verdict':'所审关键静态结论与来源一致，两项措辞问题已修正。六项仍维持S2/R0，不据此升级全链或全产品完成。'}
js=json.dumps(out,ensure_ascii=False,indent=2)+'\n'
md='# 前端父调用链独立对抗审查（2026-10-14）\n\n'+out['verdict']+'\n\n## 范围\n\n'
md+='固定6项ID；59条来源hash全部通过；19条可重叠范围记录独立语义复核。没有重新证明全部59范围的全部分支。未执行竞品，0项S3建议。\n\n'
md+='## 已解决问题\n\n'+'\n'.join('- **'+f['priority']+' / '+f['id']+'**：'+f['claim']+' '+f['resolution'] for f in findings)+'\n\n## 关键结论\n\n'
for c in confirmed:md+='### '+c['id']+'\n\n'+c['conclusion']+'\n\n边界：'+c['boundary']+'\n\n'
md+='## 精确剩余\n\n'
for id,items in out['remainingByStableId'].items():md+='### '+id+'\n\n'+'\n'.join('- '+v for v in items)+'\n\n'
md+='## 未纳入本轮\n\n'+'\n'.join('- '+v for v in out['excluded'])+'\n\n## 校验\n\n`python3 文档/逆向台账/contracts/build-review-deep-ui-parents-20261014.py --check`\n\n目标快照：\n\n'+'\n'.join('- '+k+' SHA-256: `'+v+'`' for k,v in EXPECTED.items())+'\n\n精确独立读码范围及切片hash见同名JSON的evidence。\n'
base=D/'review-deep-ui-parents-20261014'
for ext,body in [('json',js),('md',md)]:
 p=base.with_suffix('.'+ext)
 if '--check' in sys.argv:assert p.read_text()==body,'review drift '+ext
 else:p.write_text(body)
print('PASS independent UI parents review: 6 fixed IDs / 59 source hashes / 19 review ranges / 2 resolved P3 / 0 open')
