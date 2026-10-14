#!/usr/bin/env python3
# coding: utf-8
"""Static report generator; never execute vendor modules."""
from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[3];C=Path(__file__).parent
SOURCE='.data/research/lawbot-2026-10-13/readable/renderer.js'; EXPECTED='4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc'
sha=lambda b:hashlib.sha256(b).hexdigest()
b=(R/SOURCE).read_bytes();assert sha(b)==EXPECTED;ls=b.splitlines(keepends=True)
ranges={
'pdf-page-utils':(22301,22313),'pdf-page-state':(22481,22484),'pdf-page-map':(22527,22549),'pdf-rotation':(22595,22650),'pdf-page-delete':(22653,22718),'pdf-offset':(23355,23397),'pdf-native-shift-constant':(22340,22340),'pdf-height':(24500,24536),
'pdf-window':(25553,25623),'pdf-ocr-layer':(25627,25660),'pdf-eviction-layout':(25661,25684),'pdf-render-layout':(25685,25734),'pdf-render-canvas':(25735,25771),'pdf-render-text':(25772,25819),'pdf-load':(25820,25877),'pdf-unmount':(25973,25995),
'docx-load':(7467,7508),'docx-postprocess':(7509,7594),'docx-unmount':(10336,10342),'docx-body-watch':(6606,6630),'docx-anchor':(4620,4668),'docx-coordinator':(4669,4791),
'docx-text-inventory':(7595,7699),'docx-text-match':(7700,7827),'docx-text-mark':(7828,7896),'docx-text-overlay':(7897,8031),'docx-text-end-image-index':(8032,8050),
'docx-image-refresh':(8152,8193),'docx-image-paint':(8194,8254),'docx-image-position':(8255,8286),'docx-image-manual':(8068,8151),'docx-image-repeat':(9425,9450),'docx-image-correct':(8676,8743),'docx-audit-insert':(6538,6577),
'pdf-manual-build':(23883,23997),'pdf-manual-call':(24789,24816),'pdf-batch-pages':(23686,23699),'pdf-batch':(23726,23790),'image-union':(26469,26496),'image-manual-choice':(27226,27244),'pdf-candidate-dedupe-call':(10571,10579)
}
ev=[dict(id=k,path=SOURCE,startLine=a,endLine=z,fileSha256=EXPECTED,rangeSha256=sha(b''.join(ls[a-1:z]))) for k,(a,z) in ranges.items()]
sections=[]
def add(id,title,deps,claims,risks,remaining,refs):
 assert set(refs)<=set(ranges)
 sections.append(dict(id=id,title=title,dependencyIds=deps,status='S2',runtime='R0',completeBusinessContract=False,claims=claims,conditionalRisks=risks,remaining=remaining,evidenceIds=refs))
add('LM01','PDF原始页集合、旋转和删除投影',['DEP28','DEP32'],[
'gC将有限数四舍五入到90度再归一到0/90/180/270；yC把删除页转正整数去重排序，并在已知总页时截界。bC从1..floor(total)排除删除页。总页Pe2来自已加载PDF.numPages。',
'Be2是保留原始页码数组，不重新编号实体pageNumber；un2选择不小于目标的首保留页，无则末页。cn2禁止删除全部：从删除集合移除首项以至少保留一页。',
'en2叠加待重识别ft2与已提交vt2；tn2再加PDF自身page.rotate。手动90度旋转将该页现有实体deleted并标rotationInvalidated；保留旋转人工审查把ft2迁入vt2、记录manualOnlyPages并emit。',
'hn2修改删除页、清选中、过滤当前搜索结果、提升搜索代际并重新搜索/渲染；initial旋转/删除props有deep watcher。原文实体数组并未因删页被整体移除。'],[],[
'源PDF内部rotate/getViewport数值、导出端如何使用pageRotations/删除页以既有处理报告及运行样本为准。'],['pdf-page-utils','pdf-page-state','pdf-rotation','pdf-page-delete','pdf-load'])
add('LM02','PDF页布局生产者与原生框修正',['DEP28'],[
'pt2由Xu2/Yu2写入pageNumber、四舍五入viewport width/height和累积offsetY；mt2按原始pageNumber映射且保留首项。大于12页时未知页先沿用首保留页尺寸，实际页加载发现尺寸变化会重算全部offsetY。',
'Yi2优先当前微任务Map缓存，否则查询该页pdf-viewer-container或canvas的DOM矩形，减容器矩形再加scroll。queueMicrotask清缓存；它不是长生命周期页面坐标cache。',
'Li2仅无数值OCR尺寸、非page-top且rangeAdjusted或userAdjusted=true时启用原生修正；vE固定-17.5，ar2/ir2此前已读乘sx/sy的-2/-17.5修正。缺DOM时相关转换可回退pt2.offsetY，布局间距未由Yu2额外加入。'],[
'虚拟模式未加载页尺寸只是首页面估算，实际尺寸重算可移动后续页offset；静态不能将它描述为所有页起始就精确定位。'],[
'浏览器CSS间距、设备缩放、字体与实际PDF.js viewport真值仍R0。'],['pdf-page-map','pdf-offset','pdf-native-shift-constant','pdf-eviction-layout','pdf-render-layout'])
add('LM03','PDF预览统一行高的样本门',['DEP28'],[
'al2按meta.bboxes优先、_splitBboxes其次、单bbox最后计算框数量。il2只从Xo2当前投影中取单框且Ji2有效的实体，经Tr2转换后高度10..42之间，按页求中位数。',
'rl2仅预览且单框时考虑中位数；原高<10、>1.8倍中位数或差值>0.45倍中位数仍保留原高，否则替成中位数。sl2以高度差的一半补y使中心不变。'],[],[
'Xo2投影生产者由DEP27关联阅读；此处只闭合行高计算本体，未证明文字真实baseline。'],['pdf-height'])
add('LM04','PDF虚拟窗口、渲染队列和代际',['DEP29'],[
'Bu2以总页数>12启用虚拟化；Fu2在保留页数组上选择当前页前后各2项，最多5页。滚动RAF由Mu2用elementsFromPoint和已渲染DOM定位当前页，100ms调度缺页重绘。',
'zu2提升Eu2并cancel在途render，串行Tu2排队；virtual在full/其他渲染busy时复用旧Promise。Xu2的virtual快速路径还要求缩放、页集合长度与首保留页尺寸cache匹配。',
'Xu2先按当前页距离排序待渲染页；若窗口已移开当前候选则break，finally解除busy后可再次调度。Gu2只保留目标窗口的canvas/textLayer，canvas尺寸归零再移除。',
'页render以Ri2设置20s等待上限，超时主动cancel该render；取消/过期退出，普通错误删canvas并显示该页warning，继续尝试文本fallback。整个Xu2失败写Ye2，不等同抛给所有caller。'],[
'完成状态可达到100%同时存在单页bitmap失败；await zu2成功不证明每页视觉正确。'],[
'PDF.js render/getPage本体、浏览器canvas和第三方线程不可由应用队列代码证明；Ir2/lo2/To2等应用子路径见剩余清单；Ri2超时包装器已在旧UIR报告读取。'],['pdf-window','pdf-eviction-layout','pdf-render-layout','pdf-render-canvas','pdf-render-text'])
add('LM05','PDF文本层/OCR fallback、加载与卸载',['DEP29'],[
'位图成功后仍取getTextContent；Tt2按16页/估算32MiB上限逐出文本cache。垃圾比例Pt2标页后可取OCR页，Uu2按page防并发，回执后检查代际和isConnected才写透明span。',
'文本span以viewport*item.transform、字体ascent或1+descent并clamp0.6..0.95定位；按Lu2批次append并yield，再Bb缩放文字宽度。getTextContent/实体To2更新局部错误可被吞，文本层失败不自动令位图失败。',
'Ju2加载代际Ie2和渲染代际Eu2独立；旧loadingTask销毁等待最多3s，getDocument等待45s超时触发destroy；晚到document如代际/任务不符则destroy。首屏自动缩放0.5..3，initialViewport可覆盖。',
'PDF卸载提升两代际，取消render并清定时器、缓存、监听、canvas/textLayer；把loadingTask/document引用取出后异步cleanup/destroy。清理不声明所有底层任务已同步停止。'],[
'OCR加载失败返回false但可保留已存在位图；该路径没有把失败提升为全面导出禁用。'],[
'lo2原生文本可信fallback、Ir2位图空白判断、To2实体定位、Bb字体测宽批处理未本轮递归读完；各自位置写入projectReadableRemaining。'],['pdf-page-map','pdf-ocr-layer','pdf-window','pdf-render-text','pdf-load','pdf-unmount'])
add('LM06','DOCX动态加载、超时与卸载',['DEP29'],[
'Yr2每次++Ze2，先dispose旧coordinator，动态导入CpyDD6WX.js并缓存renderAsync包装器，追加renderVmlImage:Nd。缺预览buffer报告错误；加载后及batch回调都检查Ze2。',
'文长>12000或buffer>2MiB启用md增量coordinator；首batch即可挂DOM并显示。renderAsync使用useBase64URL=true、包含页眉页脚脚注尾注、isRenderCancelled及yieldRender；15s提示，hard wait= min(120s,max(45s,45s+10s*ceil(bytes/5MiB)+5s*ceil(chars/10000)))。',
'成功后contentVisibility处理大页，插分页分隔，缺失后续页header/footer时clone首页并标data-cloned-hf，调整溢出浮动图片；多个后处理/高亮错误被吞。',
'失败当前代际++Ze2、dispose、清DOM并切纯文字审查；timeout通过Promise.race拒绝及isRenderCancelled协作，不能当成任意第三方代码硬中断。10336卸载++Ze2、dispose、移画框/监听/observer/RAF/timers；docxBuffer watcher仅byteLength改变才尝试重开且已就绪时跳过。'],[
'仅相同byteLength的buffer替换不触发该watch分支；是否由父组件key重建保护须结合parent，不能断言全部换文档路径都漏刷。'],[
'本轮未深入动态模块CpyDD6WX.js和VML Nd的全部解析/渲染；纯文字降级的最终导出语义复用处理报告。'],['docx-load','docx-postprocess','docx-unmount','docx-body-watch'])
add('LM07','DOCX增量段落锚点与调度',['DEP29'],[
'hd将正文按cd去空白/不可见字符、统一标点形成compact及原始offset；追加文本保留cursor，非前缀变更重建。按正文/页眉页脚/脚注尾注及noteId查找，body顺序推进cursor。pd排除sup/overlay且mark读data-original。',
'md只登记未注册p且排除克隆页眉脚和嵌套p；IntersectionObserver根scroll容器、rootMargin600px。实体signature只含type/text/deleted/start/end，二分索引找重叠段落，region必须一致。',
'可见pending按每轮约8ms预算绘制；当前选区/编辑defer的块推迟，50ms重调度。focus可同步paint，needsConservativePass发现未锚定段或未覆盖实体时允许Xr2从增量转全文。dispose断observer、timer并清集合。'],[
'md签名不含masked/meta/confirmed等其他字段；这些改变是否走外部refresh需看具体caller，不能仅据signature证明所有预览状态自动重绘。'],[
'动态renderer批次p结构及region标记真实生成由外部模块决定；此处应用coordinator和hd本体已读。'],['docx-anchor','docx-coordinator','docx-text-inventory'])
add('LM08','DOCX Xr2全文匹配、DOM标记及冲突层',['DEP29'],[
'Xr2先尝试md增量，需conservative时dispose回全文；移旧mark并恢复original文本，排除image_ocr，先把候选标failed，再由Nf拆重叠组。TreeWalker跳过旧mark与克隆页眉脚，跨段插FDD0分隔。',
'按文本长度降序匹配；中文/金额允许受限空白及标点变化并经df边界检查，结合context和docxDomOffset/文长比例选位置。4个以上非特殊组可按排序配对；候选不足时存在复用最近位置的分支。',
'O3逆序splitText加mark，跨run记录first/mid/last并在成功挂mark后写resolved；异常吞掉。后续保守扫描与Range定位补漏，分段矩形经qh合并成overlay，重叠组单独conflict层和warning并标conflict-only。',
'最终未找到DOM且非冲突组的候选仍failed；函数是启发式映射，不证明sourceOffset与DOM一一对应。'],[
'多个实体可映到同DOM位置，resolved只是找到mark；不能当作导出位置正确或所有敏感内容已覆盖证明。'],[
'Nf重叠分组、df词边界、qh矩形合并和_2/v2过滤器需结合DEP27/既有leaf具体范围；本节不重复声称这些children本体已全读。'],['docx-text-inventory','docx-text-match','docx-text-mark','docx-text-overlay','docx-text-end-image-index'])
add('LM09','DOCX图片定位、overlay与延迟回调',['DEP29','DEP32'],[
'Qr2优先已有imagePath/space标签，否则按自然尺寸±2像素匹配尚未使用img并赋domId/path；同尺寸不能作为像素身份的保证。ps2清overlay，等待未完成img的load/error一次回调或5s timer，再fs2。',
'fs2每OCR图片优先path、回退尺寸找DOM；ms2按parent和scale建立overflow:hidden百分比overlay。非imageBbox的OCR实体按文本包含关系匹配每行再vs2找第occurrence框，此循环没有额外比对该实体imagePath/ocrLineIndex。',
'显式imageBbox实体优先domId、DOM索引、path，优先已给displayRatioBbox否则除自然尺寸。vs2优先charBoxes索引归并，回退行框按规范文本索引等比例切分；无命中回退整行。'],[
'同文本分布在多图/多行而实体缺imageBbox时，fs2可以将同实体ID画到多个行/图片；这是条件性静态路径，不代表导出也会使用这些DOM框。',
'ps2的5s timer和load/error回调没有Ze2/ct2/isConnected门，也未将timer存入卸载清理；调用可在卸载或重绘后操作捕获旧DOM并读取当前局部实体状态。实际可见后果未运行。',
'vs2 charBoxes循环按码点建index map但indexOf和query.length是UTF16，非BMP可影响切框；尚未动态验证。'],[
'第三方DOCX图像尺寸和路径标记生成、CSS缩放真实结果仍未运行；不把尺寸匹配视为内容hash。'],['docx-text-end-image-index','docx-image-refresh','docx-image-paint','docx-image-position','docx-unmount'])
add('LM10','DOCX人工框与同路径重复图片批量',['DEP32'],[
'框选ts2把offsetX/Y转0..1比例，mouse-up尺寸需至少5显示像素，bbox转自然图尺寸并保存DOM身份与displayRatio。hs2直接加入image_ocr实体，offset按正文长度+实体数合成，emit/保存由外围承担。',
'El2/Nl2按相同imagePath且非克隆页眉脚找到重复DOM图。Il2 UI入口只在manual且seal或other+directRegion时调用Nl2；它不是任意文字批量API的已证前端入口。',
'Nl2确认后对每图用同相对比例乘自然尺寸建框；同DOM已有任意未deleted实体且ratio框相交即跳过，不核类型/文字或90%覆盖。逐项push并记录repeatedImageBatchId，末尾emit review-state-change、gs2，0新增仍可能显示完成0处。',
'OCR修订另经Ys2找同实体/未覆盖匹配；Qs2可复用预览plan，manual先插入再await项目apply，无局部事务回滚。该路径与重复图印章入口分开记录。'],[
'Nl2确认前捕获图列表与t3，await确认后没有局部文档revision/连接性检查；可触发的父组件锁定/换文档条件还需运行或parent证明。',
'批量相交去重会跳过不同类型或文字的已有框；同路径表示同资产引用，不等同按像素搜索相似图。'],[
'最终应用的review-state-change持久化与DOCX图片asset多引用写回须结合已审父链/处理报告；此报告不宣称逐实例导出等价。'],['docx-image-manual','docx-image-repeat','docx-image-correct','docx-audit-insert'])
add('LM11','PDF Ul2到Zs2及页范围批量',['DEP32'],[
'Ul2取当前drawRect/多框、other+directRegion生成regionOnly；Zs2按vr2反向转页框，多个框按页/y/x排序。普通非seal/other文字可await _u2重找多行框，只有返回>1框才替代；失败保留手动画框。',
'新实体position固定0..0、page-top、manual，OCR尺寸齐备才标pdf_image_ocr，否则pdf_native_text；regionOnly另标manual_region。wb认为candidate已被覆盖时只提示，不emit；正常emit add-entity并触发文本反馈。',
'Vl2 occurrence路径await Ul2后把affectedCount设1，无论Ul2早退或wb跳过；成功toast不等同新增1实体回执。Zs2 await _u2后本体没有捕获/复核文档revision或绘制代际。',
'_s2从指定页数组去重范围约束或start/end生成原始页列表；Rs2每次循环再跳deleted页、Es2尺寸失败/旋转不兼容分列，覆盖率>=0.9跳过，其余收集后一次emit。取消代际检查在emit前，30s预算在每页开始检查，正在await不被它中断。'],[
'Zs2的跨await无局部revision门需结合父组件换文档与取消条件验证，不能与Rs2批量代际门混写成全部同等安全。'],[
'_u2 PDF文本/OCR反查完整候选选择、wb→yb/gb/Qy覆盖冲突内部仍需具体范围；原始页集合与Rs2本体本轮已读。'],['pdf-manual-build','pdf-manual-call','pdf-batch-pages','pdf-batch','pdf-candidate-dedupe-call'])
add('LM12','Image手动有效框与PDF命中几何去重',['DEP32'],[
'Image mi2保留用户rect，但非seal/other且有ocrBbox时以OCR框作effectiveRect；继续多框fi2保存该组合并恢复drawing。关闭vi2提升dn2并清框数组。',
'Image Ye2将bboxes或单框Number化，要求x/y finite、width/height>0后取union；未显式finite检查宽高，Infinity可保留。Xe2只在OCR成功且结果非空时走该union，其他情况回退已有实体文本框。',
'PDF ro2要求同page，取marks或displayRect，io2按交面积/两框较小面积>=0.6判断；一侧所有rect各被另一侧任一rect覆盖即视同。so2先入native后OCR，按这个几何条件保留首次命中，无文字相等门。'],[
'几何去重按较小面积而非IoU，包含关系容易去重；Image union未完整排非有限尺寸，后续main坐标门可能拒绝。报告不将辅助函数通过称完整有效框。'],[
'图像OCR实际回执、最终边界夹取及完整图像导出以main报告和运行样本另验。'],['image-union','image-manual-choice','pdf-manual-build'])
remaining=[
 dict(kind='project-readable',functions=['PDF To2 (24217起)','PDF _u2 (25387起)','PDF Ir2 (23610起)','PDF lo2 (24019起)','Bb (10684起)'],detail='Xu2/Zs2主体已读，文字到实体框更新、fallback可见文本与测宽children未在本补充全部递归。'),
 dict(kind='project-readable-cross-report',functions=['DOCX Nf (5696起)','df (5550起)','qh (5026起)','_2/v2过滤器','PDF wb→yb/gb/Qy (10577及上游)'],detail='本文读caller/用途，须与DEP27和旧报告已读范围对账；不默认列为本体未读或全闭合。'),
 dict(kind='external-module-readable-boundary',functions=['CpyDD6WX.js renderAsync','Nd (4950起) VML包装','PDF.js getPage/getTextContent/render','canvas/DOM字体/Resize行为'],detail='应用传参/取消回调已读，不扩成整个第三方库重实现等价。动态模块是否继续读由具体项目修改范围判断。'),
 dict(kind='runtime',functions=['合法激活产品','混合尺寸/旋转/非BMP','重复图片/DOM迟到回调','取消/换文档/保存重开/最终导出'],detail='全部R0，无竞品动态运行或我方等价验收。')]
report=dict(schemaVersion=1,date='2026-10-14',iteration='ITER-019',scopeIds=['DEP28','DEP29','DEP32'],status='S2',runtime='R0',candidateS3=0,completeBusinessContracts=0,method=['人工阅读所列应用函数及控制流；未执行竞品代码或绕激活。','精确范围为1-based inclusive原始字节SHA256；builder check仅复现内容/hash，非独立语义审查。','历史ITER018报告与pins不改；本新增证据由其他agent独立审。','已读函数本体不表示所有子依赖或runtime闭合；同名压缩符号按组件作用域区分。'],discovery=dict(reference='文档/逆向台账/contracts/remaining-dependencies-20261014.json',role='historical-discovery-reference-only',note='Used ITER018 DEP28/29/32 remainingLocations; no live matrix hash dependency to avoid cycle.'),sections=sections,evidence=ev,evidenceCount=len(ev),remaining=remaining)
md=['# ITER019 布局、渲染生命周期与人工建框补读','','DEP28/29/32；全部S2/R0，0 S3候选，0完整业务闭合声明。',f'{len(sections)}节、{len(ev)}段精确范围。人工阅读应用代码；未运行竞品。旧ITER018快照不变。','']
for s in sections:
 md+=['## '+s['id']+' '+s['title'],'','关联：'+', '.join(s['dependencyIds'])+'。','']
 for k,t in [('claims','已读结论'),('conditionalRisks','条件性风险与失败'),('remaining','仍缺边界')]:md+=['### '+t,'']+['- '+x for x in s[k]]+['']
 md+=['### 精确范围','']+[f'- `{k}`：renderer.js:{ranges[k][0]}–{ranges[k][1]}；SHA256 `{next(e["rangeSha256"] for e in ev if e["id"]==k)}`。' for k in s['evidenceIds']]+['']
md+=['## 剩余依赖分层','']+['- '+x['kind']+'：'+', '.join(x['functions'])+'。'+x['detail'] for x in remaining]+['']
outputs={C/'iteration019-layout-manual.json':json.dumps(report,ensure_ascii=False,indent=2)+'\n',C/'iteration019-layout-manual.md':'\n'.join(md)}
if '--check' in sys.argv:
 for p,s in outputs.items():assert p.read_text()==s,p
 print(json.dumps(dict(result='passed',mode='structural-hash-only',sections=len(sections),ranges=len(ev)),ensure_ascii=False))
else:
 for p,s in outputs.items():p.write_text(s)
 print(json.dumps(dict(result='written',sections=len(sections),ranges=len(ev)),ensure_ascii=False))
