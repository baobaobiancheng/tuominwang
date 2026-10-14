# PDF/OCR 中段与视觉表格几何增补（2026-10-14）

本报告继续补读主报告列出的可见代码，不执行竞品，不提级S3。8个分析节、8项稳定接口关联。不能把接口关联数当全链闭合。

## PDF01 PDF 子进程与页渲染协议

- 打包macOS主进程选Resources/pdf-render-runtime/pdf-render-worker.cjs；Ee清NODE_OPTIONS/NODE_PATH/ELECTRON_RUN_AS_NODE，校验本地manifest、Node Mach-O codehash、codesign以及version/platform/arch后spawn；此处只读取校验代码，没有执行。
- ve.request等待ready，每次只容许一个pending，序号绑定reply；默认120秒awake计时，abort/timeout/error/exit dispose并kill child，无崩溃后自动续页。async generator return也dispose。
- worker以Promise队列串行接收；open仅一次，getDocument disableWorker/useSystemFonts/WASM；render页号整数合法、dpi有限>0且≤600；canvas白底、viewport dpi/72、PNG返回尺寸和cropBox；finally清canvas/page/document；异常只返PDF_LOAD_FAILED/PDF_RENDER_FAILED。
- getPdfTargetPageNumbers仅范围筛选未要求整数，而render stream再做整数筛选，两个列表可不一致；processScanned中预取序号/totalPages依赖上层目标列表。worker render无maxPagePixels上限，与secure writer默认16MP不同。

**已读边界**：自有spawn包装、取消、request队列、worker加载与open/render全部项目控制流。

**待汇合边界**：PDF.js/native canvas/OpenJPEG数值与内存行为为依赖；manifest/Mach-O签名真实性引用系统/native专项，不能在此称验证通过。

证据：render-child, worker-stream, worker-implementation

## PDF02 图片层 OCR 计划与区域复用

- Ha遍历PDF operatorList，维护save/restore矩阵栈、transform连乘，支持image/inline/mask/repeat/group；以viewport×当前矩阵映射四角，区域±3像素裁边；未知/无效变换标full-page。相邻相交2像素范围合并；区域>24或占页面面积≥.72降整页。
- 规划器逐页执行getOperatorList；单页异常或缺OPS退full-page/planner-failure；坏native页强制full-page。此规划器本身不收AbortSignal，进度callback异常不单独捕获。
- Ka以页point尺寸映射150dpi像素并floor/ceil/clamp，Ya按sourceKey+crop尺寸+四位归一化方向key复用，qa将识别bbox/word/charbox加crop左上偏移。复用不是每页重新OCR。

**已读边界**：图像operator计划/裁片矩阵/复用键及错误退路完整项目算法。

**待汇合边界**：PDF.js operator语义、可复用image object真实渲染相等性没有像素比对；reader upstream是否已知全部图片/clip区域另属PDF解释器依赖。

证据：image-plan, page-select-plan, supplement

## PDF03 文本 PDF 补充 OCR 的失败与候选链

- TEXT_PDF_IMAGE_OCR=0直接返回空结果；已有整页OCRcache可复用。缺页优先region OCR，主2200边/4MP带charbox，失败降1600/2.56MP；region仍失败整页重试。取消在OCR异常与页/region边界重抛，临时文件finally清理。
- 补充识别渲染/OCR失败记录pdfOcrOutcome.failures并继续后页；只将成功页入缓存，但部分成功region的text仍可进入候选；onPageProcessed异常吞掉。这与required扫描OCR默认中止不同。
- 坏native页或native正文<20字符时记ocrTextByPage；过滤已包含在native文本中的行，非坏页短于4字符直接排除，≥12字符仅凭前12在native中也排除。
- 相同strategy.name/documentType/OCR文本SHA缓存候选，缓存键不含运行时规则版本；cache hit跳过新applyLearnedWhitelist/forceSkip/规则调用，后续表格合并仍做。因此在一次supplement期间运行时规则更新与重复文字复用的交互不能视作每页最新规则。
- 策略→learned whitelist/forceSkip/legacy rescan→sc表格合并；有框直接用，否则D2按行文本offset等宽算框并横向±3。无框跳过；输出region=image_ocr/transportSource=text_pdf_image_ocr/no_text_replace=true和OCR/crop尺寸。

**已读边界**：补充OCR方法11057–11299每分支、失败/重试/缓存/返回均已读。

**待汇合边界**：yt/策略与oi/Vo/Ei可见规则已在deep-processing-supplement-rules-20261014的DPS01–06、DPS30–33展开；模型识别准确性、native文本过滤假阴性和缓存规则交互仍未运行验证。

证据：supplement, layout-tokens, ocr-join, table-processing, table-merge

## PDF04 扫描 OCR 必需路径及文本拼接

- 压缩PNG小片段字节占比启发式可当空页success；skipBlankPageHeuristic绕开。主OCR抛异常才降级，若返回success:false会直接进入页失败（不再发fallback）。
- 页失败先记录失败页、空正文、进度和offset+2；默认抛OCR_PAGE_FAILED停止，唯环境LAWBOT_OCR_CONTINUE_ON_PAGE_FAILURE=1可继续，此时full输出可保留原始未脱敏页图。
- Kl按bbox中心聚类推断行/表格，但最终正文按输入items顺序遍历，不按聚类排序。同行数字片段直接拼，跨行数字换行；表格按行/间距加分隔，其他仅ASCII相接需分隔；ranges是UTF16原文offset。
- 前3页累计>200字符尝试router，非other或第三/末页时固定strategy；后续若仍无strategy且单页>100再选择。规范化OCR仅按白名单词对/中英数字接邻删除空白，保留每UTF16单位raw offset；mapNormalizedMatchesToRawText回原文并保存normalizedSpan/canonicalSpan。
- 视觉表格cc同时看当前/上页token，限定当前页输出；catch会吞表格分析异常。desensitizedText可先替换但bbox仍需下节验证；不是文字结果存在就有有效像素框。

**已读边界**：required OCR fallback/失败环境例外/拼接及raw-offset转换已展开。

**待汇合边界**：模型及规则精度在规则专项；输入items是否按真实阅读顺序由OCR引擎决定，不是Kl保证。

证据：required-ocr, ocr-normalization, ocr-join, raw-remap

## PDF05 扫描候选到像素框的完整优先次序

- 先接受visualTableBBox/Bboxes；否则按实体类型剥标签、统一易混数字/邮箱，再找与position相交的包含行，找不到退全页最长包含行。
- 优先name单word→数字/ID/email等单word→同行多个word最小面积union→line加权比例。字符权重空白.25/中日韩2/数字1.3/其他1；标点可从词宽中位数学习。charBoxes精确匹配有单box过长、占整行>.85但目标短的拒绝门；失败退加权比例。
- 组织框避标签冒号前缀；邮箱尝试专门匹配；横向padding3，clamp页内；超过页面积25%删除。address/name跨≥2OCR行且无多框时删除单框，再按交叉文本行重建charbox/word/牌照比例/覆盖半行则整行。地址charbox纵向跳>max(1.2倍字高,12)分两框。
- Yl去地址标签与非中英数，长度<8直接valid；否则估容量Σwidth/(.55height)，比值≥.62才有效。人名>2框或总宽>max(80,maxHeight*codepoints*1.9)，或非特许双行双框，删框。保留实体并记bboxMappingStatus=missing，没有总拒绝。
- 重叠span且单框包含（4像素容差）时保留更长original/较早项，不按type区分；加全局page offset，Gl将有效框转regions，unmapped只做诊断表达式，不抛错；后续seals/faces/渲染继续。
- charBoxes归一化建索引多处按for-of码点append一次，而indexOf/range按UTF16；非BMP存在错框条件。还必须区分此类与原始normalizeOcrDetectionText（后者按UTF16遍历、映射一致）。

**已读边界**：11754–12248所有局部几何函数和调用优先级、门限、失配保留链已逐读。

**待汇合边界**：真实字体/字形bbox准确性依赖OCR；没有运行旋转/跨行/Unicode语料，不将missing诊断视作安全拒绝。

证据：scanned-geometry, match-normalization, ocr-join, scanned-output

## PDF06 视觉表格重建几何

- fs以OCR bbox构造token，hs按charbox横向gap>max(8,2.4×中位字宽)拆片；有关系文本包含验证，rawStart/rawEnd由字串长度求和。
- D9先用vectorTableCell直取，按source/page/table聚合、至少2行2列4格，confidence1。其他token按中心y/重叠≥.38或距离≤max(3,.7*minHeight)聚物理行；native分组gap≤max(2,.85height)，OCR≤max(3,.2height)，日期可粘连。
- 候选行≥2组，行距≤max(24,6.5height)且横向overlap≥.35或左边距离≤2height组成region；排除全法官署名/全条款标题及按序号+长句标点判定的列表。
- 列锚取数值/日期右边、其他左边；邻锚阈值max(5,1.35medianHeight)，同一行不复用候选；优先有数字行，支持行数阈值与相近互斥候选合并；缺列锚回最密行左边。
- 置信=.25多列行占比+.3覆盖列+.2数值密度+.25行数量饱和，默认≥.58、至少2行2列；连续行可合并到上一行条件排除序号/单位/数字；推断路径输出rowSpan/colSpan均1，bbox union，tokenIds和structureConfidence；vectorTableCell直取路径保留上游rowSpan/colSpan。

**已读边界**：D9 reconstructVisualTables及全部直接几何helpers已展开，不只函数名枚举。

**待汇合边界**：上游项目产出算法已见PDF09；PDF.js依赖与实际合并单元格/嵌套表格输出仍未运行，不能证明还原正确。

证据：table-reconstruction-helpers, table-reconstruction, layout-tokens

## PDF07 表格识别合并、几何锚与排除

- ac给前3行列标签和跨前一页相同列数/列锚差≤42继承表头，并取上方150内最近3token/财务上下文；cc按table处理，先Ei关系图、严格释义表法人/alias、明确地址/专利/证号证据。
- lc调用oi(禁用column profile、不按body锚)、单cell结构格式yt、明确语义证据；抑制证号列误识别金额/卡号、公司类型字段、同格电话重复；Qi给每候选实际框，ec给文本anchor，phone/mobile/landline的bbox-only候选被rc丢弃。
- Qi优先字符框Zi否则Xi加权比例；跨token合并限同线≥.7垂直overlap及中心差≤.35height，再水平gap≤max(1.5,.85height)合并，并与cell bbox裁交。Xi用[...text]码点数组，却接$i给出的UTF16 rawIndexes；含非BMP前缀时会把UTF16索引当码点位置，发生fallback错框。
- ec先单token/跨token精确规范化校验，再附近±max(512,8×compact长度)搜索最靠近token起点，最后全文；失败返回{0,0}，tc标bbox-only。不是所有类别都拒绝bbox-only。
- sc合并按同type/页/规范化original/空间重叠，缺框才退span重叠；未被NER同页支持的pendingGlossaryConfirmation候选删除；explicit语义和registration/area exclusions按跨度/空间比例压制误识别；重复优先表格geometry、置信取max并保NER来源。Ki跨cell框只有某单cell文本包含目标时裁约束，否则抑制。

**已读边界**：几何锚、上下文继承、结果合并和排除阈值已读。

**待汇合边界**：oi/Vo/Ei见deep-processing-supplement-rules-20261014 DPS30–33，yt见DPS01–06；本报告不重复宣称穷举这些规则，模型及外部运行仍为独立边界。

证据：table-context, table-boundaries, table-anchor, table-merge, table-processing, relations-entry

## PDF08 新旧 PDF 导出的定位拒绝边界

- es全量Za门先拒绝approximate+anchorReason含回退默认框且未userAdjusted/rangeAdjusted；Qa把无效页号默认1，正数floor；多框按各框page分组，假名Xa用累计宽度比例切片，允许空片段，没有图像drawPseudonymSplit的min1死循环。
- secure writer c3只是scale=min(dpi/72,sqrt(maxPagePixels/pageArea))，并非另一个未读转换函数；OCR框按参考图尺寸缩放，原生框按point→scale及旧调整偏移；额外rotation由hh四种90度矩形映射；sh只验有限正尺寸并与canvas相交。
- 通过Za后普通缺/坏/越界bbox仍可continue；samePositionBatch缺bbox同样提前continue，仅在bbox存在但无效或完全越界分支throw。扫描旧full流程Gl未映射实体也不抛，且环境允许页失败时可带原页。这个差异必须在对齐中保留为已知缺陷，不照搬为安全标准。

**已读边界**：补齐主报告DP14/F03的es前置拒绝例外、分组与本地全部scale/rotation helper。

**待汇合边界**：PDF.js/canvas/JPEG编码、导出内容残留仍需授权运行；旧ns覆盖writer见deep-processing-supplement-rules-20261014 DPS14。

证据：pdf-grouping, secure-helper, secure-writer, scanned-output

## PDF09 有线表格上游产出及原生文本消费者

- extractTextOnly先常规getDocument，失败销毁loadingTask后尝试recoveryMode；失败区分PasswordException。逐页getTextContent/viewport，Ca按基线差>2再x排序；用font ascent/descent钳在.7–.98计算文字框。空白、车牌及法律角色文字另归一化；Fa生成block _textStart/_textEnd。maxChars在整页处理/回调完成后检查，所以不是精确截断上限；此方法无AbortSignal参数。
- 仅ba门通过才调用va：至少8个文字块，且含ga表格关键词或两行多列的几何启发式。后者要求至少6有效块、同行≥3块、≥2间隙、宽≥6倍字高，邻候选行距≤max(36,8h)且≥3列锚相近。va失败catch吞掉，继续原生文字。
- va读取operatorList、viewport×save/restore/transform矩阵，仅constructPath的stroke/fill系列；曲线段令当前path无效，未知path码停止。变换后只留轴对齐误差<.1且长度>2线段；填充闭合4点细矩形仅厚≤1.5生成中线。忽略一般斜线/曲线和不可识别编码，而非任意PDF表格解析。
- 线坐标以1.25容差聚合，线段覆盖允许1.25缝隙；四边闭合且宽≥8、高≥7、内部无完整横/竖分割线才产出一个cell，并标记占用网格。排除单边尺寸>页面.98及越页±2；半像素坐标去重。相邻边1.75且交叠>2或双向面积相交的cell连通成表，≥4cell且横纵各≥3边界才分配tableId。rowSpan/colSpan按边界跨度计算。
- Na将文字框匹配到扩张1.5的cell：宽覆盖≥.8、高≥.55，优先面积覆盖、再小cell；命中挂vectorTableCell。页边1–4位数字/字高<14先标页码，但有cell或同行近邻则保留。D9消费者按source/page/table建表，保留cell span并给confidence=1；此1是路径固定值，不是对真实表格正确率测量。
- 原生layout token消费者将vectorTableCell原样传cc；globalTextStart用页累计正文长度+block _textStart。Fa之后文字又被La/角色/车牌归一化，token offset可能需要后续ec校验，不能默认完全等于规范正文。canonical fromPdfTextExtraction用Ir顺序indexOf；找不到顺序命中则退全文并标approximate，再找不到时按cursor+原block长度估计，不钳正文上限；同时保留vectorTableCell至structure.pdf。
- 原生Ba定位直接文字块exact唯一→重复项离position最近→去空白跨块→span交叠，Da按CJK权重2/其他1估宽；Pa按行合并且不同cellKey或夹住其它文字时不桥接。Da展开codepoints却接UTF16 start/end，Oa使用charCodeAt使补充平面CJK判断不可达，不能宣称非BMP字形精确。

**已读边界**：ba→va全部项目线段/连通网格helpers、Na赋值、extractTextOnly回调/失败/清理，以及canonical/layout-token两个消费者已读。

**待汇合边界**：PDF.js的getTextContent/getOperatorList/font metrics/实际PDF编码依赖仍未运行；S.loadPdfJs外部loader已由系统包来源专项登记。文字offset近似、斜线/曲线/无框表格与OCR结果是否一致需要授权样本，不能由固定confidence=1推导正确。；本PDF专项可读producer已补齐；oi/Vo/yt/Ei规则语义仍引用dynamic规则增补，renderer编辑后坐标如何回传应引用UI专项，不宣称此报告重读完整renderer。

证据：native-table-producer, native-pdf-reader, pdf-canonical-offset, pdf-canonical-consumer, native-token-consumer, table-reconstruction

## 精确证据

整文件与片段SHA-256见JSON；以下范围一基含末行。

- render-child：`.data/research/lawbot-2026-10-13/readable/main.js` 86–201
- ocr-normalization：`.data/research/lawbot-2026-10-13/readable/main.js` 2656–2707
- match-normalization：`.data/research/lawbot-2026-10-13/readable/main.js` 404–423
- image-plan：`.data/research/lawbot-2026-10-13/readable/main.js` 4133–4269
- pdf-grouping：`.data/research/lawbot-2026-10-13/readable/main.js` 4270–4320
- layout-tokens：`.data/research/lawbot-2026-10-13/readable/main.js` 4717–4756
- relations-entry：`.data/research/lawbot-2026-10-13/readable/main.js` 5808–5827
- table-context：`.data/research/lawbot-2026-10-13/readable/main.js` 5828–5883
- table-boundaries：`.data/research/lawbot-2026-10-13/readable/main.js` 5884–6026
- table-anchor：`.data/research/lawbot-2026-10-13/readable/main.js` 6027–6146
- table-merge：`.data/research/lawbot-2026-10-13/readable/main.js` 6147–6212
- table-processing：`.data/research/lawbot-2026-10-13/readable/main.js` 6213–6363
- ocr-join：`.data/research/lawbot-2026-10-13/readable/main.js` 8814–8885
- raw-remap：`.data/research/lawbot-2026-10-13/readable/main.js` 9167–9172
- worker-stream：`.data/research/lawbot-2026-10-13/readable/main.js` 9734–9754
- page-select-plan：`.data/research/lawbot-2026-10-13/readable/main.js` 9755–9815
- supplement：`.data/research/lawbot-2026-10-13/readable/main.js` 11057–11299
- required-ocr：`.data/research/lawbot-2026-10-13/readable/main.js` 11556–11753
- scanned-geometry：`.data/research/lawbot-2026-10-13/readable/main.js` 11754–12248
- scanned-output：`.data/research/lawbot-2026-10-13/readable/main.js` 12249–12366
- secure-helper：`.data/research/lawbot-2026-10-13/readable/main.js` 14550–14598
- secure-writer：`.data/research/lawbot-2026-10-13/readable/main.js` 14599–14777
- native-table-producer：`.data/research/lawbot-2026-10-13/readable/main.js` 3537–3811
- native-pdf-reader：`.data/research/lawbot-2026-10-13/readable/main.js` 3812–4132
- pdf-canonical-offset：`.data/research/lawbot-2026-10-13/readable/main.js` 2830–2836
- pdf-canonical-consumer：`.data/research/lawbot-2026-10-13/readable/main.js` 2879–2899
- native-token-consumer：`.data/research/lawbot-2026-10-13/readable/main.js` 10857–10882
- table-reconstruction-helpers：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 1732–1797
- table-reconstruction：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 2212–2264
- worker-implementation：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/pdf-render-runtime/pdf-render-worker.cjs` 1–407

复核：`python3 文档/逆向台账/contracts/build-deep-processing-pdf-20261014.py --check`。此命令只读源码并核对重建的报告，不执行项目模块。
