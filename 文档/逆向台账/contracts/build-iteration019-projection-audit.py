from pathlib import Path
import json,hashlib,sys,re
R=Path(__file__).resolve().parents[3]; C=R/'文档/逆向台账/contracts'; p='.data/research/lawbot-2026-10-13/readable/renderer.js'; b=(R/p).read_bytes();ls=b.splitlines(keepends=True)
rows=[
('PA01','实体上游、正文与侧栏投影',['DEP27'],[(6103,6142),(6194,6194),(8481,8567),(8796,8832),(10153,10178)],[
'S2来自de2经_2过滤：deleted、v2无效实体、Markdown非If实体排除；manual_input且具imagePath/imageBbox的实体豁免v2中的Mf与_2中的Af/Ef集合排除，普通实体才必须不在Af/Ef集合。k2仅接受meta.renderState resolved/conflict-only。',
'Ms2优先非空有效initialReviewDraft，否则规范化detectedEntities；已有id/startOffset对象可以原样复用。As2按al2去重，重复时非deleted替代deleted；DOCX再$o2重定位、Xl2清理。识别watch同buffer用Md→mc合并保留既有审查，换buffer重新Ms2。',
'Ao2排除image_ocr，Markdown非exact仅table例外；按start排序，只同最后已选实体比较重叠，Ol2优先级2，否则1，同优先级保留end更长者。仅检查负起点、超文长、end<=start，不能据此推断已作整数/finite完整验证。',
'Eo2的DOCX侧栏使用S2.filter(k2)，Markdown用To2；类型精确相等，搜索lowercase+trim，score乘100四舍五入后区间筛选。侧栏数量因此不是所有原检测数量。'],
['Af/Ef/Md/mc/$o2在PA08本轮继续实读；实际DOM匹配及完整来回恢复仍R0。']),
('PA02','长DOCX分块可见集',['DEP27','DEP29'],[(6041,6041),(8810,8819),(8931,8936),(10309,10341)],[
'zy常量5000，Lo2按UTF16字符串每5000个code units切段。长度>=50000且xs2非空时To2仅保留完整包含在某一可见字符段的实体；跨段实体不会因两段同时可见而被合并接纳。xs2为空则返回Ao2全量。',
'挂载500ms后全局查询.document-text p/div，以floor(DOM序号/10)设置chunk-id，而非按实际累计字符位置。IntersectionObserver根为视口、margin200px、threshold0.01。DOM十元素分组与5000字符分段不是同一计算，不能由代码推出对应关系。',
'卸载disconnect并置空ks2，但该500ms timer未保存/清除；延迟回调仍可设置匹配DOM的属性，ks2?.observe因空值不执行。此为静态条件，不是已复现跨文档故障。'],['真实DOCX DOM结构和滚动显示需要合法运行；第三方docx渲染器另列外部边界。']),
('PA03','正文删除、树删除和发出的状态事件',['DEP27'],[(9602,9702),(6192,6193)],[
'Xl2实际从de2物理移除被Af/Ef/Cf归为覆盖的实体并清selection；Ql2单处删除按同规范化type/text且span重叠扩大ID集，标deleted/rejected，累加FP并发feedback。',
'eu2树删除会对d2人工条目直接移除；其他条目复制并标deleted，typeHidden走_c且不记FP/feedback。FP增量扣除直接移除人工条目、FN相应减少；反馈按类型+规范化文字聚合。',
'tu2 group通过type/text索引再按region限制；右键au2批量则使用严格type/text相等，不加region条件。它们不是完全相同的批量集合。',
'Ql2/eu2均发review-entities-deleted和review-state-change。此组件ce2是空async函数，调用本身不写服务器。父组件持久化必须经既有父级报告所列事件/快照/恢复路径。'],['父级保存证据见deep-ui-parents、ui-remaining；本节没有把事件发出当保存成功。']),
('PA04','gf2草稿选择与四格式子组件同步',['DEP31'],[(34744,34749),(33617,33630),(33663,33689),(34008,34070),(34466,34526)],[
'gf2直接选Image detectedBBoxes、PDF detectedEntities；DOCX/Markdown优先Gh2合法reviewDraft.entities。Gh2对DOCX优先比detectRequestId，任一非空即要求两者非空相等；否则比sessionId。DOCX已检测非空但草稿空或全Mf时回退；其他格式不作该request/session门。',
'Mm2从当前子组件收集草稿：Markdown直接Cm2；Image优先draft.activeBBoxes及reviewState；PDF可skipPdfEntities，写rotations/deletedPageNumbers及投影；DOCX经Zh2标记当前request/session。Sm2用JSON.stringify相等判断，无深拷贝保证。',
'Um2仅flush统一假名同步。Vm2按ready文件及dirty集合重建pseudonymEntries，更新reviewDraft，当前子组件apply；finally清busy。这个函数没有调用磁盘保存。其await成功不等于恢复文件已保存。'],['全部reviewDraft赋值位置另附机械索引；索引本身不提升各分支语义深度。快照与保存路径跨报告复用，运行保存结果仍R0。']),
('PA05','审计命中来源与覆盖判断',['DEP31'],[(34744,34926)],[
'Tf2文本要求有效实体、规范化识别文字含查询、span相交；同type/text还须覆盖完整hit，异类允许相交。DOCX图片要求imagePath及OCR行/occurrence相等，手工框改以交集/较小面积>0.4。PDF/Image先按同页几何匹配，按面积排序；无几何候选时按occurrence索引回退同类/异类，最后优先same。',
'Pf2 DOCX正文ev和图片nv/uf2分别生成hit；Markdown直接搜source；PDF文字通过vf2，scanned/hybrid加batch-search；hybrid即ocrOnly也读文字层。PDF OCR checked pages只用于缺页提示，结果追加处没有据pdfDeletedPageNumbers排除命中。',
'图片batch-search若返回success=false且不throw，没有该分支的失败提示；PDF相同失败有提示。PDF OCR与文字层交集>0.4则删OCR重复，最终按source/file/span/page/四舍五入首框坐标/图片行occurrence键去重。',
'Rf2先Mm2，仅ready文件参与，顺序await各文件，统计same/other/uncovered/skipped；本函数无请求代际检查。'],['vf2真实PDF字体/几何及OCR缓存内容须运行；此前报告已有nonBMP索引单位不一致条件，不据此断言每次都错。']),
('PA06','OCR修正、补录与删除后添加',['DEP31'],[(34928,35148)],[
'jf2缓存key含规范化recognizedText、trim correctedText、type、source、文件名/entityID，不含sourceAnchor或文档revision。构建时仅ready，跨文件收集目标及未覆盖/补充命中；apply原地修改实体后更新对应草稿，随后统一映射flush。',
'jf2补录分派仅docx/pdf/image；修正已有实体赋值分支虽含Markdown，但Of2目标筛选先排除Markdown，本路径不能据此认定支持Markdown OCR修正。不能把OCR修正当全部格式通用补录。',
'Vf2替换异类时Image物理删除框；DOCX/PDF等调用er2拒绝实体。av2先Vf2后Wf2/qf2/Gf2，后续添加false不回滚先前删除；有replaceOther即使新增0也触发映射flush。',
'Wf2 Markdown新增需Qf精确映射；DOCX图片按imagePath/行/occurrence或手工框判重；新增默认confirmed、score1。qf2/Gf2依据文字类型及框重叠去重。完成后刷新当前组件；跨文件没有统一回滚事务。'],['Um2是映射flush而非保存，保存由父级事件/快照链负责；缓存时序/失败恢复仍R0。']),
('PA07','持久化出口的明确边界',['DEP27','DEP31'],[(32610,32629),(32802,32808),(32842,32845)],[
'Du2先Mm2再Nu2逐材料组装snapshot；changedDocumentIds可以复用已有文档，Nu2返回空则跳过；没有任何可用document返回false。',
'lc2仅snapshot存在且dirty才设置2s timer调用Ec2；Ec2无dirty直接true，否则await saveRecovery结果，成功Fc2。不能把子组件状态改变、Um2成功、timer已设置中的任何一个当磁盘写入成功。'],['Nu2/workspace saveRecovery/main容器写入已在UI剩余与格式专项；这里只补齐审计和投影到其交界，不提升运行状态。'])]
rows.append(('PA08','投影依赖的具体归并与重定位',['DEP27','DEP31'],[(4211,4243),(4868,4912),(5560,5694),(8833,8930),(6050,6087),(33424,33435)],[
'Md清理两端Unicode空白；显式start/end存在时不按trim再移位，position来源才扣空白；Sd接受Number可转且有限的值，未要求整数。Cd按规范化类型/文字/span/region去重。kd通过行首人工标记识别脚注、尾注、页眉页脚和图片OCR，并非解析真实OOXML结构。',
'mc按hc规范化occurrence键合并；完成模式用新检测替换非人工旧条目并保留旧ID，人工/确认/拒绝仍保留；已人工移动的原键阻止检测回填。ID碰撞时以offset/type生成唯一后缀，不保证原检测ID跨所有输入恒定。',
'Af先按start/end/Markdown exact+link优先级/id排序；同span同规范文字直接移除后项，此分支不要求type相同。包含关系按同类相对位置/组织别名/金额去重；Sf优先人工，随后表格上下文，其余保留第二参数。Ef仅异类包含且至少一项synthetic时消除synthetic或较短项。',
'$o2在首图片OCR实体offset或图片OCR标记前搜索正文；按region/type/text分组，人工项固定，自动项先匹配原span再按起止距离最近分配。无法匹配标invalid；剩余位置会复制syntheticOccurrence，但contract_amount不扩展，同region/type/text组内rejected条目的span阻止synthetic扩展（c2状态门）；Oo2人工fixed分组是另一独立门。Do2用兼容全半角标点和字符间空白的全局正则，非重叠命中，UTF16组装。',
'Xd2/Jd2/Qd2明确构造默认草稿：未预览、未选中，按profile/exportMode决定pseudonym/full-star，DOCX清理项读profile，Markdown创建schema2、blocker空和初始viewport。不是用户已复核的证据。'],['组织别名af/sf及策略表复用renderer-policy具体章节；真实重定位、自动扩展和误报率仍R0。']))
rows.append(('PA09','布局冲突与行框叶子',['DEP27','DEP28','DEP29','DEP32'],[(5026,5039),(5550,5559),(5696,5714)],[
'qh先过滤正面积rect并按top/left排序；按纵向严格超过1px交叠加入首个相交行组，扩大行组top/bottom，再按left合并相邻距离<=参数（默认2px）的rect。不是按文字基线或所有组传递闭包聚类。',
'df对可解析纯数字格式做邻界检查：相邻数字拒绝；形状像18位身份证/手机/12至30位长数字时在该门直接允许，普通金额遇邻接[.,，]，或后8字符切片以空格/tab/NBSP/全角空格后紧接百分号开头时拒绝。不作身份证校验位或手机号有效性验证。',
'Nf先排除Mf、Af、Ef后枚举span交叠；相同span直接跳过，同类型包含也不列冲突，其余返回contain/overlap和长短实体ID/交集span。If在该版本是Boolean(entity)，不是Markdown坐标完整性校验。'],['PDF框抑制wb/yb/gb/Qy及所有局部策略已由同轮state-policy SP15提供具体证据；实际排版仍R0。']))
sections=[]
for ident,title,deps,ranges,obs,gaps in rows:
 sections.append(dict(id=ident,title=title,dependencyIds=deps,observations=obs,remaining=gaps,evidence=[dict(path=p,startLine=a,endLine=z,fileSha256=hashlib.sha256(b).hexdigest(),sliceSha256=hashlib.sha256(b''.join(ls[a-1:z])).hexdigest()) for a,z in ranges]))
# Mechanical census is a locator, explicitly not proof all producer bodies were read in this iteration.
census=[dict(line=i+1,snippet=l.decode().strip()[:600]) for i,l in enumerate(ls) if b'reviewDraft =' in l]
d=dict(schemaVersion=1,date='2026-10-14',iteration='ITER-019',staticDepth='S2',runtime='R0',scope='DEP27/31命名主体和连接补证，全部赋值仅定位索引，未宣称完整产品等价',sections=sections,reviewDraftAssignmentCensus=dict(method='literal reviewDraft = on fixed renderer bytes',count=len(census),meaning='定位清单；不是每项语义闭合证据',locations=census),executedVendor=False)
md='# ITER-019 正文投影、审计草稿与持久化\n\nS2/R0，未运行竞品。精确范围、源码与切片hash、赋值索引见同名JSON。\n'
for x in sections:md+='\n## '+x['id']+' '+x['title']+'\n\n'+'\n'.join('- '+v for v in x['observations'])+'\n\n边界：'+'；'.join(x['remaining'])+'\n'
for f,raw in [(C/'iteration019-projection-audit.json',(json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode()),(C/'iteration019-projection-audit.md',md.encode())]:
 if '--check' in sys.argv:assert f.read_bytes()==raw,f
 else:f.write_bytes(raw)
print(len(sections),'sections',sum(len(x['evidence']) for x in sections),'ranges',len(census),'assignment locators')
