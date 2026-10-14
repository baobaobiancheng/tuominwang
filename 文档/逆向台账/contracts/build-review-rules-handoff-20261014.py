#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pathlib,json,hashlib,re,sys
root=pathlib.Path(__file__).resolve().parents[3];target='文档/脱敏规则技术交接-20261014.md'; raw=(root/target).read_bytes();text=raw.decode();sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(raw)=='3e87441692c2a0e9ccb01bc24af579ffec9e65bbd083b6c4661c92fcf0c1e696','Target changed; requires rereview'
receipts=[];counts={}
for name,start,end in [('ownFullFiles','### 11.1','### 11.2'),('vendorFullFiles','### 11.2','### 11.3'),('vendorRanges','### 11.3','## 12.')]:
 section=text.split(start,1)[1].split(end,1)[0];n=0
 for line in section.splitlines():
  cols=re.findall(r'`([^`]+)`',line)
  if len(cols)<2 or not re.fullmatch('[0-9a-f]{64}',cols[-1]):continue
  ref=cols[-2];m=re.match(r'(.+):(\d+)–(\d+)$',ref);p=m[1] if m else ref;data=(root/p).read_bytes()
  if name=='vendorRanges':assert m;data=b''.join(data.splitlines(keepends=True)[int(m[2])-1:int(m[3])])
  assert sha(data)==cols[-1],ref;n+=1;receipts.append({'category':name,'reference':ref,'sha256':cols[-1],'verified':True})
 counts[name]=n
assert counts=={'ownFullFiles':24,'vendorFullFiles':13,'vendorRanges':96}
findings=[{'id':'RH01','priority':'P3','line':320,'before':'任何结果包含完整原文会被拒绝','correction':'明确type/缺省直接返回不走局部includes；alias/mask/custom局部检查，最终verify另行残留拒绝。','evidence':'packages/core/redaction.ts:149–191'}, {'id':'RH02','priority':'P2','line':392,'before':'换模型/策略后不能继续签发旧结果','correction':'明确snapshot只比文档已存状态，不读取当前部署模型/RULES_VERSION；仅更换runtime不自动使旧复核失效，需实际变更revision/state/recognition流程。','evidence':'packages/core/export-gate.ts:82–96; apps/api/recognition.ts:46–76'}, {'id':'RH03','priority':'P3','line':381,'before':'删除页去重','correction':'删除页重复索引直接拒绝，不自动去重。','evidence':'packages/core/page-redaction.ts:12–22'}, {'id':'RH04','priority':'P3','line':333,'before':'同值不同类型/替换策略一律conflict','correction':'完整单侧marked/retained覆盖优先；seed ambiguous只阻止未覆盖位置补录，不强制改写已完整单侧覆盖状态。','evidence':'packages/core/review-tools.ts:12–71'}]
for f in findings:f['status']='resolved-readback'
assert all(s in text for s in ['type/缺省直接返回类型占位','此处不读取当前部署模型或RULES_VERSION','重复直接拒绝，不自动去重','不会强制改写已完整单侧覆盖的状态'])
manual=[{'path':'packages/core/redaction.ts','range':'34–191','scope':'规则目录、字段/表头/词表、合并来源、替换与残留'}, {'path':'packages/core/mappings.ts','range':'1–28','scope':'映射匹配/还原'}, {'path':'apps/api/mappings.ts','range':'11–90','scope':'proposal、创建、持久化、restore gate'}, {'path':'packages/core/export-gate.ts','range':'1–96','scope':'coverage与snapshot条件'}, {'path':'apps/api/recognition.ts','range':'46–76','scope':'词表更新/显式重识别版本失效'}, {'path':'packages/core/ner.ts','range':'1–70','scope':'字符token/窗口/输出/候选'}, {'path':'packages/core/ocr.ts','range':'1–38','scope':'本地锁定/输出字框'}, {'path':'packages/core/ai-candidates.ts','range':'1–25','scope':'唯一quote/样本与候选schema'}, {'path':'packages/core/review-tools.ts','range':'12–71','scope':'漏标优先级与预算'}, {'path':'packages/core/files.ts','range':'1–94','scope':'CSV/MD解析导出验证'}, {'path':'packages/core/office.ts','range':'86–127;205–268','scope':'DOCX跨run及导出清理/残留重点；不是此文件全部独立语义重审'}, {'path':'packages/core/page-redaction.ts','range':'12–89','scope':'页面schema/框与像素/PDF写器重点'}, {'path':'packages/adapters/page-export.ts','range':'1–62','scope':'重读/OCR残留/PDF校验'}, {'path':'packages/adapters/processing-worker.ts','range':'76–129','scope':'detect NER/AI及最终gate/verify消费'}]
report={'review':'脱敏规则技术交接有限范围独立审查','reviewer':'ui_closure_a','date':'2026-10-14','target':{'path':target,'sha256':sha(raw),'bytes':len(raw)},'conclusion':'通过；4项表述问题修正并回读，0open。','openFindings':0,'findings':findings,'manualScope':manual,'documentScope':'前6节重点语义复核；第7–10、12节仅检查竞品/我方/移植建议与未执行边界；第11节全量文件/片段hash独立复算。','hashVerificationCounts':counts,'verifiedHashReceipts':receipts,'boundaries':['没有独立重新证明全部41竞品规则或全部108配置类别运行语义。','源码存在不等于服务启用/真实识别/线上验收；AI主detect未接入、自动人脸/印章与文件还原缺项仍明确。','34个合成样例及26既有测试执行由root另行记录；本审查未运行测试、不借用测试结果作自己的新实测。','未改作者正文、业务代码或ledger；未执行竞品、未部署。']}
md='''# 脱敏规则技术交接：有限范围独立审查

**通过，0 项未解决缺陷。** 被审对象为《脱敏规则技术交接-20261014.md》，SHA-256 `'''+sha(raw)+'''`。

## 已修正并回读

|问题|级别|最终语义|
|---|---|---|
|类型占位符与残留门混写|P3|type跳过局部includes，最终verify另行拒绝残留|
|换模型自动使旧结果失效的过度声明|P2|gate只比存储snapshot，runtime切换不自动失效；需实际版本/状态流程|
|删除页“去重”|P3|重复索引拒绝，不自动去重|
|漏标歧义分类优先级|P3|完整单侧覆盖优先；歧义阻止未覆盖补录|

## 审查范围

重点读取前6节与当前我方规则、替换、映射、候选模型、导出门及格式关键实现。14组人工源码范围见JSON；Office等为指定重点，未声称全部应用独立审计。新增第7–10及12节区分竞品S2/R0、我方实现、移植设计与待执行测试，未见把主流程AI或自动人脸/印章误标已实现。

第11节独立复算 **24份我方文件、13份竞品/报告文件、96个竞品证据范围**，全部匹配。哈希通过不是算法语义证明；没有把41规则或108配置类别全部重新独立运行/语义重审。26项既有测试与34条新增样例由root另记，本审查没有运行测试、竞品或部署，也没有修改作者稿和业务代码。
'''
base=root/'文档/逆向台账/contracts'; outputs={base/'review-rules-handoff-20261014.json':json.dumps(report,ensure_ascii=False,indent=2)+'\n',base/'review-rules-handoff-20261014.md':md}
if '--check' in sys.argv:
 for p,t in outputs.items():assert p.read_text()==t,p
else:
 for p,t in outputs.items():p.write_text(t)
print(json.dumps({'result':'passed','open':0,'resolved':4,'hashCounts':counts},ensure_ascii=False))
