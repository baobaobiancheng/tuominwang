#!/usr/bin/env python3
"""Record manual review assertions plus read-only hash/model verification; no vendor modules execute."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3];P=R/'文档/逆向台账/contracts';name='deep-processing-supplement-rules-20261014';d=json.loads((P/(name+'.json')).read_text());core=json.loads((P/'deep-processing-20261014.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
expected={r['id'] for r in core['interfaces'] if not r['sectionIds']};assert expected=={r['id'] for r in d['interfaces']} and len(expected)==19
for k,e in d['evidence'].items():
 b=(R/e['path']).read_bytes();assert sha(b)==e['fileSha256'],k
 if 'startLine'in e:assert sha(b''.join(b.splitlines(keepends=True)[e['startLine']-1:e['endLine']]))==e['sliceSha256'],k
assert [r['order'] for r in d['ruleInventory']]==list(range(1,42))
assert len(d['modelIntegrity'])==1;m=d['modelIntegrity'][0];mb=(R/m['path']).read_bytes();meta=json.loads((R/m['path']).with_name('model_metadata.json').read_text())['models']['face_yunet.onnx'];assert len(mb)==meta['fileSizeBytes']==m['size'];assert sha(mb)==meta['sha256']==m['sha256']
M='.data/research/lawbot-2026-10-13/readable/main.js'
def ev(a,b):
 data=(R/M).read_bytes();return {'path':M,'startLine':a,'endLine':b,'fileSha256':sha(data),'sliceSha256':sha(b''.join(data.splitlines(keepends=True)[a-1:b]))}
f=[]
def fix(id,pri,title,before,after,a,b):f.append({'id':id,'priority':pri,'title':title,'status':'resolved-readback','before':before,'after':after,'evidence':ev(a,b)})
fix('RS-A01','P2','人脸元数据精确键与非空校验','DPS12写models.face；生成器同样使用错误键，modelIntegrity为空数组。','已改models["face_yunet.onnx"].fileSizeBytes，并固定要求1条。独立直接读取模型文件及metadata，232589字节与8f2383e4…2552fa4一致；这仅完整性，不是模型精度。',8277,8303)
fix('RS-A02','P2','前文提示160不是所有锚点回退的硬窗口','DPS32将前文提示简写160，容易误认为后续定位也受该范围限制。','限定lastIndexOf近游标分支；随后indexOf提示→original回退无160距离限制。',5611,5629)
fix('RS-A03','P3','ci不存在全局回退','DPS33称顺序/全局锚。','ci仅indexOf(cellText,cursor)，失败continue；与oi或xi其他定位函数区分。',5656,5677)
fix('RS-A04','P3','Ei按包含标点过滤','DPS33称纯标点过滤。','/[，。；：！？]/对任一这些中文标点命中即删除候选，不要求整个字符串纯标点。',5808,5827)
fix('RS-A05','P3','buffer与path注册的哈希时序不同','DPS15 hash延后未明确适用分支。','path分支懒算hash；无path的buffer分支注册时立即算SHA256。',15759,15789)
fix('RS-A06','P3','表格NER并发范围与分片阈值','两个并发predict与420上限容易推广全部预测。','420阈值遇单大cell不截断；两个并发只主contexts，跨行地址预测后续串行。',5136,5240)
checks=[('DPS13','旧su图像遮盖alpha.95，异常返回原buffer；跨类型相同框可在第二遍互相包含删除；不能泛化到Sc当前导出。',10161,10211),('DPS12','BGR CHW float32 0–255；三stride、sqrt分数、反letterbox与IoU严格小于阈值；无推理中取消。',8320,8411),('DPS15','旧path注册复用、ENOENT恢复不校原hash、resolve沿用hash、release先移map后await close均成立。',15759,15908),('DPS10','zero_upload_guarantee字面true及部分meta缺省0/unknown，没有实际隐私保障测量。',12728,12742),('DPS31/32','NER实体须落单cell span，严格释义可独立保留；无通用置信阈值；锚点最终可全文首命中。',5100,5655),('DPS33','关系图启发式而非连线模型；同框同文可保留bbox-only，冲突框无可靠文本锚才整体删。',5690,5827)]
review={'schemaVersion':1,'date':'2026-10-14','reviewer':'ui_closure_a','target':name,'reviewedArtifactHashes':{name+ext:sha((P/(name+ext)).read_bytes()) for ext in ['.json','.md']},'scope':{'semantic':'Read all 24 section statements; independently reread all 19 auxiliary handlers and selected key helper chains: DPS10/12/13/15/31/32/33, selected DPS30 and overlaps with PDF/canonical. Not a second exhaustive traversal of all 41 regex groups or entire legacy platform conversion.','integrity':'All 114 file/slice references checked; 19 IDs match core unassociated helper set; 41 rule inventory orders contiguous; one actual face model compared with on-disk metadata.','excluded':'No vendor execution, license flow, model inference, own-product change or full UI producer lifecycle review.'},'findings':f,'confirmed':[{'section':s,'conclusion':c,'evidence':ev(a,b)} for s,c,a,b in checks],'summary':{'openP1':0,'openP2':0,'resolvedAccuracyIssues':len(f),'integrityReferences':len(d['evidence']),'auxiliaryHandlersIndependentlyRead':19,'auxiliarySetMatches':True,'faceModelIntegrityVerified':True,'runtimeExecutions':0,'supportsS3Promotion':False},'remaining':['Third-party PDF/Office/ONNX/Sharp runtime semantics and missing Windows/seal Python assets remain explicit boundaries.','All renderer lifecycle and lawful end-to-end behavior remain R0; successful hash checks do not establish semantic completeness.','41 regex inventory counted and ordered; this review does not claim independently retesting or semantically proving every regex branch.']}
(P/'review-processing-supplement-rules-20261014.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
md=['# 规则与辅助接口增补独立对抗审查','','当前快照无未解决 P1/P2。6 处准确性问题已由报告作者修正并独立回读；继续维持 S2/R0，不支持全链 S3 提级。','','## 实际审查范围','','- 阅读 24 节结论，逐读 19 个辅助 handler；重点复读人脸、旧图像遮盖、source registry、报告声明、表格 NER/融合/关系图。','- 114 个全文/切片哈希匹配；19 项恰好等于核心报告未关联新算法章节的辅助集合；41 基础规则序号连续。','- 独立比对实际 face_yunet.onnx 与磁盘 metadata：232589 字节，SHA256 `'+sha(mb)+'` 一致。','- 没有执行竞品、推理或受许可流程；未改业务代码或台账。','','## 已解决问题','']
for x in f:md += ['### '+x['id']+' · '+x['priority']+' · '+x['title'],'',x['before'],x['after'],'证据：`'+M+':'+str(x['evidence']['startLine'])+'–'+str(x['evidence']['endLine'])+'`','']
md+=['## 已确认关键结论','']
for s,c,a,b in checks:md+=['- **'+s+'**：'+c+'（main '+str(a)+'–'+str(b)+'）']
md+=['','## 审查边界','','本轮不声称二次穷举 41 组正则及所有 legacy 平台链；19 个 handler 与已列 helper 的静态复读不等于 UI 生命周期完成。第三方数值行为、缺失跨平台资产、完整 renderer 和合法运行结果仍未闭合。目标快照哈希、精确源码范围与切片哈希见同名 JSON。']
(P/'review-processing-supplement-rules-20261014.md').write_text('\n'.join(md)+'\n')
print(review['summary'])
