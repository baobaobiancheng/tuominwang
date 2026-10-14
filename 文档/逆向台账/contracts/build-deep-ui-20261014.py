# coding: utf-8
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3];D=R/'文档/逆向台账/contracts';P='.data/research/lawbot-2026-10-13/readable/renderer.js';data=(R/P).read_bytes();lines=data.splitlines(keepends=True)
def refs(r):return [dict(path=P,start_line=a,end_line=b,file_sha256=hashlib.sha256(data).hexdigest(),slice_sha256=hashlib.sha256(b''.join(lines[a-1:b])).hexdigest()) for a,b in r]
rows=[]
def add(id,name,trigger,inputs,logic,effects,errors,unresolved,ranges):rows.append(dict(id=id,name=name,staticDepth='S2',runtime='R0',completeBusinessContract=False,trigger=trigger,input=inputs,branchesAndOutputs=logic,effects=effects,errorsAndRecovery=errors,unresolvedRendererDependencies=unresolved,evidence=refs(ranges)))
add('UI-2c1712d35460','entity-group-review','EntityTreeSidebar类型/同值行勾选、定位、右键删除、批量删除、全文检查','entities、selectedId、groupCountByKey、defaultExpandTypes及文档结构/图片OCR能力props',[
'排除deleted；image_ocr单独类型，其他经cc归类；按trim后text分组，组key=type||text；实例按startOffset（双方都是number时）否则id排序。显示count=max实际实例数,外部groupCountByKey；组按count降序再text，类型按count降序且image_ocr在末尾。',
'展开长原文Se2同时调用Ce2，定位/emit select的是该组第一个ID；不是展开每个实例子树。批量实际ID由已勾选group映射后Set去重，可能小于显示count。',
've2删除需await确认；取消不emit delete。type隐藏说明不同于同值误报删除，返回事件{level,ids,typeKey,text}；确认store新弹窗取消上个Promise，resolve后清active。'],
['组件仅修改本地Set与emit；父容器决定实际实体删除/草稿；删除确认不等于落盘。'],['无实体/无ID直接返回；组更新过滤失效勾选；外部点击/ESC关菜单，卸载清监听。'],['父级各格式onDelete与onSelect不同实现及反馈/草稿写入须逐一连接；本报告未把emit视为持久化成功。','groupCountByKey来源及跨页懒加载全集是否一致，仍需连接父组件。'],[(5041,5100),(5176,5261),(5270,5311),(3632,3652)])
add('UI-3f01047e6b59','full-text-search-scopes','文档工具栏输入搜索及全部/高亮内/高亮外、上一个/下一个','当前渲染容器DOM、query、实体高亮dataset；DOCX预览另有ocrImageInfos',[
'Sr2将query trim+toLocaleLowerCase；$r2先拆除旧search mark并normalize DOM，然后TreeWalker拼接文本节点，indexOf非重叠搜索，倒序splitText并插入mark。搜索的是当前渲染DOM，不自动证明所有格式全文源字节覆盖。',
'Er2要求一次命中每段拥有相同非空Ar2标识（entityId+occurrence/render offsets）才全部标为in-entity；hr2要求命中所有段均in。跨实体/部分覆盖命中归out，不能简单理解任意重叠即in。',
'in/out数组按命中索引过滤；切范围选择>=当前索引的首项否则首项；next/previous循环；范围为空回退all。',
'DOCX预览图片通过尺寸±2匹配未用DOM图，OCRquery额外移除空白/零宽字符等；创建overlay并合并文本命中。'],['临时DOM mark/overlay与索引计数变动，不持久写材料。'],['空query清索引；容器缺失直接返回；OCR图未匹配/尺寸无效跳过，不能当OCR全文零遗漏。'],['DocxReviewContainer的cr2滚动定位、Pr2/Or2/Br2几何与图像overlay去重仍未逐分支闭合。','PDF、Markdown、Image各自搜索实现不由这段DOCX搜索证明；需分别追踪。','DOM文本与源offset之间locale lowercase长度变化/跨run映射未实测，R0。'],[(7204,7278),(7280,7341),(7342,7422)])
add('UI-339d8e53408d','review-preview-mode','工作台“脱敏设置并预览/返回审查”按钮Qo2','单文档/批量mo2、fileKind、detectStatus、各子组件ref及getReviewDraft/getReviewState',[
'Yo2批量只允许当前ready/partial；Jo2按docx/markdown/pdf/image读取子组件或已有draft的isPreviewMode。',
'Qo2取目标=!当前；批量检查ready/partial，进入预览先暂收项目面板，统一模式await Um2，再按格式调用setPreviewMode。严格要求返回值===目标，否则恢复面板并info提示“文档仍在加载”。',
'成功批量Mm2收集草稿；退出恢复之前面板；Yd2({syncUnifiedMapping:false})增加revision。DOCX el2进入关编辑/搜索状态、重建预览；退出Zo2恢复原文字/高亮。'],['内存草稿与视图状态变更；本按钮不直接导出或保存tmm。'],['子组件不存在或未返回目标值会提示未完成；Um2拒绝此函数未catch；已执行步骤无总事务回滚。'],['Um2→Hm2→统一假名异步协调器、Vm2→各格式applyReviewDraft仍需完整展开并与格式报告保存链连接。','PDF Zu2、Markdown setPreviewMode、Image F2的像素/文本呈现不由DOCX分支证明。','Mm2→Cm2/Sm2/Zh2持久化草稿格式与断点恢复未逐段合并。'],[(32331,32375),(9172,9174),(33418,33424),(34026,34050),(34463,34505),(37517,37517)])
add('UI-ad41d13c4a2d','preview-policy-hierarchy','PreviewRulesPanel整体模式与PseudonymPolicyList类型/同值动作、假名编辑','entries{key,entityType,normalized,currentValue,autoValue,occurrences,action}、selective、allowMask、modelValue',[
'整体四模式partial-star/full-star/custom-pseudo/selective-pseudo；文本panel allowMask=false。类型顺序固定，类型内次数降序；uniformAction只有全组相同才有值。',
'非selective有效动作恒pseudonym；allowMask=false时mask也回退pseudonym。qp mask→null、partial_star→wd、full_star按Unicode码点数至少1个星、pseudonym用currentValue/autoValue或原文。',
'仅pseudonym可编辑；input maxlength30是UI约束；blur将trim后非空且改变值emit{currentValue,locked:true}；Enter blur提交，Escape先清编辑状态再blur取消。',
'类型动作emit update:type-action(type,action)，单项m2先确认key存在再emit update:entry(key,{action})；全部重置只emit reset-all。'],['组件不自持久化映射；父组件决定整体→类型→同值的合并与多文档更新。'],['空白/未改值不更新；未知type排到末位；无entries显示空。'],['全局/类型/单项优先级最终解析与父onUpdate:typeAction/onUpdate:entry/resetAll尚未逐个格式核对，不能据三个控件直接认定最终导出优先级。','wd的类型别名集gd/yd/bd与完整分支应和主进程star规则对照；目前renderer分支阅读不证明主进程等价。','统一canonicalKey合并、token碰撞约束、保存LPM及导出消费需连接formats/processing报告。'],[(5320,5402),(4793,4858),(32378,32384)])
add('UI-67e30cf66ad0','known-entity-audit','同值“全文档检查”→Kf2；弹窗单项/全部冲突替换与全部遗漏补录','目标text/type，co2项目材料，reviewDraft/detectedEntities/detectedBBoxes，OCR缓存',[
'Kf2仅统一模式；trim text非空才打开loading对话框。Rf2先Mm2同步当前草稿，再逐文件只处理ready，其他列skipped。Pf2返回命中按covering.kind=same/other/无覆盖分桶，并按fileId汇总。',
'iv2/sv2用Ud2防重复提交；av2逐命中找ready材料；replaceOther先Vf2删/标删除旧覆盖，然后按docx/markdown→Wf2，pdf→qf2，image→Gf2补实体；非同类重复过滤，OCR几何部分用overlap>0.4。',
'Wf2 Markdown需Qf源坐标映射，否则拒补；DOCX图片以imagePath/line/occurrence或人工bbox去重；text实体有前后24字符context。',
'有新增或replaceOther时重新registerFileEntities，await Um2；随后Uf2重新扫描。状态表并不包括skipped文件的零遗漏保证。'],['直接改多个材料内存实体/draft并刷新子组件；需要后续保存工程才持久化。'],['busy禁止关闭；finally清busy。av2无跨文件回滚，Vf2成功而补录失败可留下原覆盖已删的部分状态；Um2/Rf2异常上抛，loading可能停留。'],['Pf2→DOCX文本、图片OCR、PDF文本层/OCR、Markdown源的完整命中生成及skip错误路径尚未全部展开。','Vf2/Wf2/qf2/Gf2调用的gf2/Zh2/np2/Qf/ff2/pf2/xv2等规范化与几何函数待逐段闭合。','并发材料变更时旧扫描结果与当前draft版本一致性、统一映射协调失败补偿待查；未宣称存在可靠事务。'],[(34904,34928),(35036,35148),(37518,37530)])
add('UI-32ce2fb60c5f','manual-correction-scope','OcrTextCorrectionDialog手工添加/OCR改字：occurrence/document/project，区域多页','mode、recognizedText/correctedText、targetType、directRegion、scope、allowProject、loading/recognizing、summary、region页范围',[
'普通范围occurrence/document，allowProject才project。manual seal或other+directRegion进入区域模式，无需文字，不提供项目文本补录。',
'B2由M2与loading/recognizing门控；occurrence emit apply，其余preview。manual按钮emit submitScope；DOCX vo2/PDF Kl2/Image nt2据scope与directRegion分别调用apply或preview。不是所有按钮都立即落地。',
'preview生成summary后展示affectedCount，确认emit apply；取消有summary时emit back，否则close。输入框Enter走B2；手工模式可在OCR识别中输入并提交。',
'PDF手工scope切换增加ds2并清识别pending、summary/plan；Image切类型为seal或directRegion增加dn2清OCR结果，避免部分旧识别写回。'],['对话框只emit props更新及操作事件；各格式父函数更新实体/框/草稿；区域batch复制的最终几何由父容器负责。'],['loading禁按钮；show/hide停止拖动、复位offset/dropdown；卸载移除pointer/resize/scroll监听；对话框本身不保证父apply的事务。'],['M2完整有效性表达式、DOCX Xs2/Qs2，PDF zl2/Vl2/Rs2，Image tt2/st2，以及project jf2计划复用/失效尚需进一步逐分支展开。','项目OCR纠错仅部分格式：jf2/Of2排除markdown实体；不可从allowProject标签概括所有文件都支持。','regionStart/end边界校验、同一相对区域跨页坐标变换与apply异常回滚仍需父容器深追。'],[(5403,5407),(5444,5472),(8756,8770),(24778,24788),(26554,26566),(34928,34979)])
assert len(rows)==6
expected={r['id'] for r in json.loads((R/'文档/逆向台账/ledger.json').read_text())['interfaces'] if r['kind']=='UI'};assert {r['id'] for r in rows}==expected
res=dict(schemaVersion=1,date='2026-10-14',sourceVersion='0.5.9',scope='台账已有6个UI工作流；不是全产品页面全集。',method='逐段只读renderer实现与调用事件；未启动竞品，未复制前端代码到应用，未提升状态。',summary=dict(entries=6,staticS2=6,runtimeR0=6,completeBusinessContracts=0),contracts=rows)
p=D/'deep-ui-20261014.json';p.write_text(json.dumps(res,ensure_ascii=False,indent=2)+'\n')
out=['# 六项UI工作流补证（2026-10-14）','','六项全部S2/R0。本轮展开组件输入、事件、主要父函数和失败路径；每项仍有具体renderer依赖未闭合。6项只是台账已登记工作流，不能当全产品页面分母。','']
for r in rows:
 out+=['## '+r['name']+' / '+r['id'],'','触发：'+r['trigger'],'','输入：'+r['input'],'',*['- '+a for a in r['branchesAndOutputs']],'','副作用：'+'；'.join(r['effects']),'','错误/恢复：'+'；'.join(r['errorsAndRecovery']),'','### 明确未闭合依赖','',*['- '+a for a in r['unresolvedRendererDependencies']],'','证据：'+ '；'.join(P+':'+str(a['start_line'])+'–'+str(a['end_line']) for a in r['evidence']),'']
p.with_suffix('.md').write_text('\n'.join(out)+'\n');print(res['summary'])
