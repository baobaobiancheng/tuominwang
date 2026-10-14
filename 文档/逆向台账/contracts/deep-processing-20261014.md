# 核心处理算法深审（公开 0.5.9，2026-10-14）

## 结论与计数

本轮是静态语义深审，未执行竞品受许可流程。完成 21 个分析节、4 个有界端点闭合记录，S3 升级候选 0 个（完整入口与上游链仍需交叉审查），整个 detect/apply/格式引擎 S3 为 0，R2 为 0。没有更改台账状态。

不存在名为 desensitization:start/export 的已核主通道；对应真实入口为 desensitization:apply、process-file-main、generate-reports。前端 partial_star 在 renderer wd；D9V2C_Ir 的 Markdown writer 消费 replacement。

## 对抗性发现（静态条件，未运行复现）

### DP-F01 · P1-static · batch-search 规范化后空查询可主进程死循环

条件：原始searchText truthy但wm结果为空；缓存有进入搜索循环的文字行/词。
影响：indexOf空串且步长0，IPC调用和主进程无法推进。
证据：batch-search, review-normalizers

### DP-F02 · P1-static · 多框假名字符分配无法结束

条件：drawPseudonymSplit的框数大于假名字码点数，初始每框至少1。
影响：循环sum>length但所有计数为1，不能减小；需对实际调用分支做授权运行复现。
证据：image-mask

### DP-F03 · P1-static · secure PDF 普通实体缺失或无效bbox被静默跳过

条件：先通过es/Za锚点门（approximate+回退默认框且未人工调整者会拒绝）；其余普通entity无bbox、框不合法或越界；samePositionBatch有更强throw例外。
影响：成功输出只证明新PDF像素化，不证明所有审查实体已被遮盖。
证据：secure-pdf, pdf-anchor-gate

### DP-F04 · P1-static · DOCX 局部错误和敏感原文残留不阻止保存

条件：header/textbox/image失败，或正文/table替换后original仍在。
影响：报告处理成功/结构校验通过不能当作全内容脱敏证明。
证据：docx-main, docx-runner, docx-images

### DP-F05 · P2-static · NER 和批量OCR搜索混用码点/UTF16索引

条件：文本含非BMP字符且后面有识别/搜索目标。
影响：offset与String.slice不同单位，实体文本/bbox可错位；默认512 config不构成另一个窗口空洞。
证据：ner, batch-search

### DP-F06 · P2-static · apply 普通早退留下running回执

条件：非Markdown处理结果success:false或无输出，17784–17788 return。
影响：finally删除活动任务但回执仍running，轮询状态与实际任务不一致。
证据：apply-entry, apply-save, task-control

### DP-F07 · P2-static · clear OCR cache 未停止在途重填

条件：q2删除时同key J2扫描仍在进行。
影响：删除成功响应后缓存可重新出现；不是全状态清空。
证据：clear-ocr, get-ocr-page

### DP-F08 · P2-static · 报告安全检查字段硬编码

条件：generate-reports调用。
影响：copy_export_test/page_continuity_check不能作为实际核验通过证据。
证据：reports

## 分链路契约

### DP01 任务注册、暂停、取消与回执

**输入**：requestId；cleanup 的输出路径；IPC sender

**调用链**：renderer 轮询/取消 → ipcMain.handle → a2 活动任务 / l2 已完成回执

**算法/分支**：pause 只允许同 sender 的 detect；get-apply-result 同 sender 才可见。cancel 按 requestId 查找后 abort，没有相同 sender 校验。cleanup 限同 sender、已完成成功、非 preserveOnCancel、未清理、15分钟内和归一化路径相等。

**副作用**：任务/回执保存在进程内；取消广播 progress；cleanup rm(force)。macOS IPC 包装持有电源租约并临时调整后台节流。

**返回**：running/completed/unknown；cancel 未找到仍 success/canceled:false；cleanup 返回删除数量。

**失败/取消/恢复**：进程重启不恢复内存回执；删除仅比路径，不验证文件 inode/hash；普通 apply 结果不可用的 return 分支（17784–17788）绕过 completed 回执写入，finally 仍移除活动任务。

**本轮已读边界**：所读任务控制和回执生命周期；确定存在无 sender 校验的 cancel 分支与早退回执不一致。

**剩余边界**：不等于所有异步子任务立即停止；OCR/ONNX/子进程各自取消行为见后续节。

**证据**：ipc, task-control, apply-entry, apply-save, ui-receipt

### DP02 运行中规则更新

**输入**：requestId/entityType/pattern；sessionI2；scope=project/spot/默认file；ruleType=blacklist或whitelist

**调用链**：runtime-rule-update → session/scope 筛选活动 engine → updateRuntimeRule

**算法/分支**：trim 必填；blacklist 返回 deprecated 不写入；spot immediateOnly；project 作用于匹配 session 的活动任务。whitelist 直接 append，不去重，后续 literal variants 增加识别候选；名称“白名单”在此是强制识别。

**副作用**：仅内存 engine 数组；不写规则数据库；重复 append 仍 added:true；handler 不检查 sender。

**返回**：success、updatedTasks、added 等汇总；缺参返回失败；无活动任务可成功但更新0。

**失败/取消/恢复**：无 await/外部 I/O；随任务/进程生命周期丢失；该接口无撤销或持久恢复。

**本轮已读边界**：IPC 参数归一化→作用域筛选→engine mutation→返回的静态链。

**剩余边界**：UI、数据库白名单与此运行时补丁语义不等价。；完整接口台账S3还要求preload/UI生产状态与上游数据生命期全部契约；本轮有界handler闭合不据此提级。

**证据**：runtime-ipc, runtime-engine, learned-whitelist

### DP03 文档类型路由

**输入**：文本/文件名/override；DOCX/PDF/image/Markdown bytes

**调用链**：detect-route → 格式文本提取 → Qe/nt → engine router → Vr strategy

**算法/分支**：Qe 是带文件名加分与规则优先分支的分类器：默认 other 分1；文件名多为30分、笔录35、部分申请25；文书词频加权，判断与文件名强制修正后计算最大分/总分并按最高分段限幅。用户协议特殊归 other。nt 默认阈值.75，engine设.5；pageRouting默认关；override other 或无效 override 都回默认策略。judgment/complaint/reply/contract 均绑定 LegalStrategy；独立 contractStrategy 不能推断为路由所用。

**副作用**：路由本身无输出文件；文本提取涉及依赖库。

**返回**：route、confidence、scores；图片没有文本，只给截图提示；PDF仅文本型第一页前6000，其他空文本；Markdown scanText前6000。

**失败/取消/恢复**：不可读/加密/坏ZIP由route handler分类失败；Vr 在策略调用前后检查取消，不把 signal 传给底层 ONNX session。

**本轮已读边界**：分类器权重/选择阈值/实际策略绑定已展开；确认 contract → LegalStrategy。

**剩余边界**：格式提取器内部全部语义尚未闭合；LegalStrategy每一类regex及后处理需单列规则清单，不能据此升级整个 detect-route。

**证据**：routing, router-binding, strategy-dispatch, detect-route, pdf-classifier

### DP04 NER 加载、切片、BIO解码及偏移

**输入**：文本；环境变量模型路径/NER_DIRECT；本地 ONNX/config/tokenizer

**调用链**：zt.init → onnxruntime-node/web → tokenizer → buildInputs → session.run → BIO decode → on

**算法/分支**：默认 NER_DIRECT 非"0"即启用。候选优先 ner-cn-v3/int8/base/tiny；Mac/显式CPU用CPU，其余DML失败退CPU，web用WASM。文本450 UTF16切片、stride400；输入按 codepoint 截 maxLen-2；BIO映射 PER/name、ORG/company/government/organization、address；token softmax均值置信度。包内两个 config max_position_embeddings均512，所以默认450切片没有短maxLen空洞。

**副作用**：缓存单例模型 readiness/session；初始化读取模型与词表。

**返回**：direct 模式模型不可用直接抛错；legacy模式限时等待后可返回regex候选，且各类型设置信度阈值。

**失败/取消/恢复**：direct 推理错误附片段offset；回调取消码重抛，其余回调错误吞掉；ONNX运行自身不接受本链signal。buildInputs 的位置累加每codepoint为1而后续String.slice是UTF16，在非BMP字符后发生偏移漂移。

**本轮已读边界**：项目自有加载控制、输入构造、解码、direct/legacy退化分支已展开。

**剩余边界**：ONNX图/权重、第三方tokenizer/runtime数值行为、真实准确率没有执行核验；用户替换较短maxLen模型才可能与400 stride形成未覆盖间隙。

**证据**：ner, direct-ner, legacy-ner, ner-v3-config, ner-base-config

### DP05 检测后处理、冲突与坐标归一化

**输入**：候选 type/original/position/confidence/meta；canonical document/文本；ruleset/workspace rules

**调用链**：策略候选 → runtime skip/learned → legacy refinement → Cl → granular → finalize/Pl → lm；apply 前 normalizeReviewedMatchCoordinates

**算法/分支**：sn按start排序，对重叠/新长度>.7候选去重，同类型高置信替换；Pl仅名字重叠优先 boundaryNormalized/置信/更短精确段；Cl地址边界及表格锚点例外。lm 用4096桶比较重叠：特殊实体优先1200/1100、人工来源1000，再按类型(id100/bank95/uscc90/phone85等)、置信差≥.03、跨度、original长度；org完整后缀和某些同型长span优先。缺来源/非法offset/文本漂移等只累计报告，不一律拒绝。坐标修正仅当原范围不匹配且加页基址后精确匹配时迁移。

**副作用**：候选meta/诊断报告修改；默认packaged省略完整debug；规则强制检测/排除会增删候选。

**返回**：过滤后的 matches + 诊断统计（样本cap24）；偏移不可靠仍可能留下候选。

**失败/取消/恢复**：取消检查主要在策略前后/每250 granular步；规则源/页锚可靠性不是本段强制总门禁。

**本轮已读边界**：多层冲突优先次序、地址/名称边界和apply页offset修正的已读部分。

**剩余边界**：granular所有类型12481–12727、规则定位Id/Sd/Ed/Md、false-positive词典与所有策略规则尚未递归全展开；不可宣称全部脱敏规则等价。

**证据**：direct-ner, name-overlap, address-boundary, finalize, trace-filter, overlap-order, rules, md-coordinates

### DP06 OCR 平台与 macOS Vision

**输入**：图片路径、lang、recognition level、AbortSignal

**调用链**：cs平台单例 → macOS os/as → vision_ocr二进制或 xcrun swift；其他系统→Paddle

**算法/分支**：Mac helper默认zh-Hans+en、accurate；Vision usesLanguageCorrection，macOS13+多语言自动识别；topCandidates(1)，逐Swift Character bbox；Vision底部原点转顶部像素坐标。高度>7500按6500块/6300步切图，bbox加偏移，没有对重叠区去重。

**副作用**：子进程、临时切片文件；stdout JSON作为结果；Apple模型由系统提供。

**返回**：success/texts/charBoxes/meta；文件缺失/载入失败/识别异常的结构化error_type。

**失败/取消/恢复**：helper默认300秒；abort/timeout SIGTERM无强杀；二进制异常退Swift，取消码不退；JSON有效时wrapper不以退出码单独否决。临时文件finally清理。

**本轮已读边界**：公开Swift项目代码及JS适配控制流已读。

**剩余边界**：没有验证预编译vision_ocr与脚本二进制等价；Vision系统模型、Paddle推理内部、平台安装差异仍是依赖/运行边界。

**证据**：vision-wrapper, ocr-platform, vision-script

### DP07 图片预处理、OCR坐标与像素遮盖

**输入**：image bytes、recognize options/masks/bboxes、颜色/blur/mosaic/pseudonym

**调用链**：processImage → Sc.process → Sharp预处理 → OCR → canonical/strategy → bbox → canvas PNG；apply→mask methods

**算法/分支**：自动EXIF旋转、白底flatten、灰度normalize/sharpen；主缩放2200边/4MP，fallback1600/2.56MP；小图2x、长图限宽。截图启发式包含y补偿及窄图x+40。黑块/圆形/blur18(失败黑块)/mosaic8直接画像素。apply普通图像分支先过滤无meta.bbox实体；WithPseudonyms只读meta.bbox，内部渲染另一分支支持bbox数组。旋转90/180/270有逆变换和边界裁切。

**副作用**：临时图、OCR缓存、结果PNG；processImage结果复用 pdfBuffer 字段，desensitizedText仍原OCR文本。

**返回**：image result stats/entities/buffer；禁用OCR可成功返回空识别和警告。

**失败/取消/恢复**：主OCR异常可进入fallback（signal继续传递）；外层catch包装success:false可能丢失取消code；seals错误忽略、faces错误中止；清理3次重试。bbox invalid主mask抛错，但被调用前过滤缺bbox可漏遮。多框假名分配先给每框min1字符，当框数>假名字码点数时，递减while永远不能结束（6948–6967）。

**本轮已读边界**：项目图片预处理/遮盖与明显缺失bbox、短假名多框失败条件已展开。

**剩余边界**：Sharp/canvas/编码库像素准确性与真实坐标复现未验证；visual-table/token到bbox算法及人脸/印章模型未全部展开。

**证据**：image-process, image-mask, image, rotation, apply-image

### DP08 PDF 分类、文本层与扫描链

**输入**：PDF bytes、pageNumbers、rotation、detectOnly、AbortSignal

**调用链**：ma classifier → processPdf → text/hybrid native extraction 或 scanned raster OCR

**算法/分支**：PDF签名、pdfjs正常/恢复加载；取ceil20%页且3–20页均匀采样，≥10非空字符视有文字；ratio≥.6text、≤.1scanned，其余hybrid。文本PDF全native识别，坏层/图片计划补OCR；同类型文字空间重叠可移除native再加OCR。手动旋转强制扫描。扫描150dpi预取，旋转/部分页不使用整文件OCR缓存；blank heuristic依据压缩buffer一小段非常见字节占比<.015可跳OCR。目标页筛范围但不强制整数。

**副作用**：临时页图、canonical+OCR缓存；detectOnly不输出脱敏文件；full模式生成输出。

**返回**：原文/候选/路由/页数/输出；扫描页offset按文本长度+2累加；callback异常可吞。

**失败/取消/恢复**：外层catch将异常包装success:false；finally清理临时页；普通full文本PDF旧ns.render是覆盖绘制，与apply secure新PDF不等价。

**本轮已读边界**：格式分流、输入页选择、缓存条件、native/OCR汇总及扫描尾部已读。

**剩余边界**：扫描中段11651–12184的完整几何/NER融合与补充OCR11057–11299尚未全展开；native提取、重复区域、表格识别、PDF.js/canvas依赖仍待核。

**证据**：pdf-classifier, pdf-dispatch, text-pdf, scanned-head, scanned-tail, target-pages

### DP09 OCR 缓存与页面按需加载

**输入**：ocrCacheKey||fileName、pageNumber、可选pdfBuffer/pageNumbers/totalPages

**调用链**：get-ocr-page → q2 cache → J2 shared promise → processScannedPdf(forceOCR/skipBlank) → Af/Nf

**算法/分支**：engine LRU最多10文件/估算128MiB，键bufferSHA256前16hex，单文件超额可被容纳；与IPC q2缓存不同。pageNumber只要求有限>0。cache miss同key共用一个promise；每250ms等目标页或任务结束；共享任务如果没涵盖后续请求页可能返回未找到。

**副作用**：q2、engine、J2内存；unpackaged可写canonical sidecar；按需扫描无signal；finally仅删除自己的promise。

**返回**：页width/height/lines；没有words输出；cachemiss/页未找到结构化失败。

**失败/取消/恢复**：懒加载错误被吞后返回失败；无取消入口；重启缓存丢失；同key错误命名会共享状态，未绑定内容哈希。

**本轮已读边界**：缓存容量/键、懒加载并发控制和返回字段已展开。

**剩余边界**：get-ocr-page依赖整个扫描引擎，故不可仅按wrapper闭合升级S3。

**证据**：engine-cache-size, engine-cache, ocr-cache, get-ocr-page, ui-page

### DP10 缓存内批量搜索

**输入**：fileName/searchText truthy；ocrCacheKey；pageIndex可选

**调用链**：renderer search → batch-search → q2 cached pages → normalize/search/bbox/dedup

**算法/分支**：wm去扩展空白、零宽和软连字符。优先charBoxes，其次words，最后行宽均分；跨行最多4行，垂直间隔>前行2倍高停止。pageIndex与pageNumber按+1匹配。bbox取首末/联合范围，坐标round+pagenum去重。charBoxes按codepoint建表但indexOf是UTF16：非BMP后位置漂移。

**副作用**：无OCR、磁盘/DB写入或缓存修改；同步计算占主进程。

**返回**：results与checkedPageNumbers；无文件/空原始搜索/无缓存为失败。

**失败/取消/恢复**：raw空白字符串通过truthy后规范化为empty；有可检索行/词时indexOf("",offset+0)不前进，死循环。无超时/取消或统一catch；错误输入类型可抛出。

**本轮已读边界**：该端点UI调用→缓存读取→每个搜索分支→bbox去重→返回完整有界静态契约。

**剩余边界**：OCR上游准确率、UI canvas缩放是否一致不由此证明。；完整接口台账S3还要求preload/UI生产状态与上游数据生命期全部契约；本轮有界handler闭合不据此提级。

**证据**：batch-search, review-normalizers, bbox-dedup, ui-batch-search

### DP11 缓存内区域识别

**输入**：fileName/pageNumber/region/canvasWidth/canvasHeight；ocrCacheKey

**调用链**：renderer region → image-review:ocr-region → q2 page → geometry text selection

**算法/分支**：校验缓存/页与OCR尺寸；canvas尺寸未强制有限正数。按OCR/canvas比例映射；选交叉行，charbox中心在框内即取，缺字框则去空白后按UTF16等宽估位置；合并文本不插分隔，union bbox换回canvas。

**副作用**：无新OCR、I/O、缓存mutation。

**返回**：success/text/ocrBbox或null；没有命中仍success空文本。

**失败/取消/恢复**：无显式取消/重试；非法尺寸可能得到NaN/Infinity，无总有限值拒绝。

**本轮已读边界**：UI实参→纯缓存几何→响应的完整有界静态链。

**剩余边界**：上游bbox精度与显示坐标一致性需要运行样本。；完整接口台账S3还要求preload/UI生产状态与上游数据生命期全部契约；本轮有界handler闭合不据此提级。

**证据**：ocr-region, ui-region

### DP12 清理 OCR 缓存

**输入**：直接key参数（未String归一化）

**调用链**：clear-ocr-cache → q2.delete(arg)

**算法/分支**：只删除IPC缓存对应键；始终success，不报告是否存在。

**副作用**：q2 mutation；不清engine LRU、J2活动任务；在途扫描可再次填入。

**返回**：success:true。

**失败/取消/恢复**：没有cancel/wait/恢复；key类型与写入String不一致时可删不到。

**本轮已读边界**：单handler加缓存生命周期的完整静态边界。

**剩余边界**：不能把响应当作所有OCR状态已清空。；完整接口台账S3还要求preload/UI生产状态与上游数据生命期全部契约；本轮有界handler闭合不据此提级。

**证据**：clear-ocr, ocr-cache, get-ocr-page

### DP13 apply 主导出生命周期与旧入口

**输入**：requestId/fileName/bytes/sourcePath/reviewed matches/options/output destination

**调用链**：renderer apply → desensitization:apply → activation → receipt/task → source/frozen review → per-format writer → output/receipt

**算法/分支**：发布包没有 desensitization:start/export 同名字面通道；实际是 apply、process-file-main、generate-reports。apply先许可检查，同sender重复requestId已完成重放、运行中拒绝，跨sender冲突；5秒heartbeat；剔除signature/handwriting等；禁止明文mapping export；Markdown校验源hash/冻结审查并预检路径。PDF必须secure writer，失败不退覆盖。

**副作用**：读取/保存输出、映射、回执；目标显式路径或已脱敏目录；临时产物跟踪；回执内存。

**返回**：success/outputPath/报告；取消标记；MD可保留review草稿与指定保留输出。

**失败/取消/恢复**：try catch记录失败，finally清定时器/temp，abort时清tracked output；普通不可用结果早return绕过completed receipt。legacy process-file-main也检查许可，但没有此活动任务登记；保存异常可吞后成功返回；不能混用验收。

**本轮已读边界**：各格式入口/选路/保存与取消框架已读，明确新旧入口差异。

**剩余边界**：M2源获取、A2非MD原子写、完整mapping/pseudonym库和Markdown worker Gf仍需格式组交叉引用；不提议整个apply升S3。

**证据**：apply-entry, apply-md, apply-image, apply-pdf, apply-docx, apply-save, legacy-process, signature-filter, ui-apply

### DP14 PDF apply 安全像素重建

**输入**：PDF bytes、reviewed entities(meta bbox/bboxes)、保留页、OCR尺寸、旋转、pseudonym

**调用链**：apply → gh.renderSecure → pdfjs render canvas → draw mask → JPEG92 → new PDFDocument

**算法/分支**：DPI默认150，>30/60/120页降135/120/110，scanned120/hybrid135，像素上限默认16MP最少1MP。白底canvas完整页光栅；按OCR尺寸/原生坐标/旧偏移校正，框高10–42可median归一；圆形/矩形遮盖，假名需flag及文本，多框无片段选最大框。新PDF只嵌入渲染JPEG，不复制原对象/文本层；页面点数用像素宽高。

**副作用**：新buffer/PDF；每页canvas/page清理，finally PDF清理。

**返回**：新PDF buffer；删完所有页报错。

**失败/取消/恢复**：es先检查Za：anchorStatus=approximate且anchorReason含“回退默认框”、rangeAdjusted/userAdjusted均非true时抛PDF_ENTITY_ANCHOR_REQUIRED。通过此前置门后，缺bbox直接continue；无效/越界普通实体continue，samePositionBatch特殊实体则抛错；不是所有reviewed实体都一定被画。没有输出OCR残留复验；native坐标分组helpers仍需核对。

**本轮已读边界**：writer的逐页栅格化与像素mask主算法已展开；证明没有复制源文本对象，但不证明所有敏感文本都遮住。

**剩余边界**：es页分组/c3转换辅助函数全语义及native库栅格化精度；真实PDF范围/旋转样本还没运行。

**证据**：secure-pdf, pdf-anchor-gate, apply-pdf

### DP15 DOCX 原位文字替换

**输入**：entities original/masked/meta/sourceRegion；DOCX路径；headers/textbox/images处理模式

**调用链**：apply→Iu.redact→redact_docx_inplace.main→body/table/header/textbox→replace_in_runs

**算法/分支**：replacement优先pseudonym/显式masked/meta.pseudonym/fallback；按original长度降序；paragraph读取含hyperlink的run，exact寻找全部(advance1)，无exact则标点/空白归一化的首处。逆序写回；跨run将前缀+替换+末尾suffix放第一run样式并删除其余。按literal匹配，不以review offset限定出现次数。每实体每段落最多3轮替换尝试；每轮可处理该段落的多个匹配；header/textbox等分域控制。

**副作用**：修改OOXML并保存文件；正文/递归表格、可选header/footer/textbox/image；修订预处理失败可回原文。

**返回**：处理统计；JS再检查文件min1024及ZIP必需部件/原部件/表格sectPr文本框数量。

**失败/取消/恢复**：header/textbox/image错误可吞继续；body/table残留检查发现original仍在只pass（无拒绝）；结构验证不证明文字全部脱敏。normalize移除零宽但run回映射仅isspace计数存在差异。

**本轮已读边界**：文本run替换、范围来源、部分失败与返回校验已深入到Python项目实现。

**剩余边界**：修订预处理407–554、保存部件1585–1683、notes1826–1923及metadata全部递归仍未完成；依赖python-docx/lxml真实保真行为未运行。

**证据**：docx-mask, docx-runs, docx-main, docx-runner

### DP16 DOCX 内嵌图片像素遮盖

**输入**：图片predetected OCR/bbox、entities、manual_input、image mode

**调用链**：Python packageparts drawingML/VML rid → bytes/Pillow → supplied bbox 或 lazy Paddle OCR → mask → replace part.blob

**算法/分支**：blob<100或width<100且height<50跳；支持png/jpeg/gif/bmp/tiff。有传入图片信息优先使用，manual_input总纳入，其他按original/normalize/邻行组合命中；空legacy信息可整图黑。bbox矩形/圆形黑，假名白底字。无信息时Paddle predict第一page、按整行/邻行匹配并整行框遮盖。非PNG保存JPEG再替part。

**副作用**：图片bytes替换；临时OCR图；不等于保持每种原content-type；缺依赖返回0。

**返回**：count/failure计数；父main仍可输出DOCX。

**失败/取消/恢复**：每图片/每bbox异常可忽略；Paddle缺失可跳过；JS pythonrunner SIGTERM后5秒resolve，无SIGKILL；stdout/stderr会重置idle timer、另有hard timeout；取消不保证子进程立刻停止。

**本轮已读边界**：图像获取→匹配→像素写回和错误吞掉分支已读。

**剩余边界**：Paddle模型数值行为、OOXML图片关系/所有media part保真仍需实样本；跨格式content-type兼容待验证。

**证据**：docx-images, docx-main, docx-runner, python-process

### DP17 partial_star 与格式默认mask差异

**输入**：entity type/original；action=partial_star/full_star/pseudonym/mask

**调用链**：renderer wd → action replacement/masked → apply → 各writer；D9V2C_Ir消费replacement

**算法/分支**：wd partial_star：人名首UTF16字符+余码点星；组织保留前缀/后缀，地址省市+****；手机号11位前3后4；身份证18位14星+后4；银行卡≥12前4+4星+后4；USCC前6+8星+后4；邮箱前2***加域首字符***；邮编前3***、护照*****后4；其他类别固定或UTF16长度星。full_star按codepoint数。D9无独立partial_star token。Python fallback人名至少2星、组织前2***后2、身份证前6+8星+后4、邮箱首1***@完整域，与UI不同，但显式masked通常优先。

**副作用**：前端构造masked；不单独存储；writer据最终replacement写出。

**返回**：替换字符串或mask动作null；不是每格式重新使用同一个生成器。

**失败/取消/恢复**：无校验原始是否与offset匹配（后续writer承担）；nonBMP姓名首charAt可能拆代理对。

**本轮已读边界**：已区分UI真正partial_star与Python缺masked时的fallback，不伪称统一。

**剩余边界**：组织地名/品牌前缀列表精确全量尚未枚举；待我方按公开行为独立实现并验证，不复制未授权资源。

**证据**：partial-star, action-materialization, docx-mask, apply-md

### DP18 Markdown 输入、冲突映射与安全降级

**输入**：UTF8≤10MiB、无NUL；sidecar hash/sourceMap/blockers；review operations

**调用链**：Hi.parse → source scan/map → planReviewedTextEdits → jo/$o → 3次确定性比对

**算法/分支**：UTF8 fatal+BOM保留；GFM+YAML，image alt和链接字段扫描。edit先验证整数/范围，按start/end降序聚合严格重叠union；抑制同型包含段，fullStar对union码点数，其他拼接剩余replacement。映射exact或Lo处理反斜杠/CRLF/HTML实体(UTF16每单位表)，再唯一original搜索；允许特定Markdown符号gap。表格Po重建只保留文本、rowspan/colspan并HTML转义。

**副作用**：纯write产生buffer；移除所有blockers（集合由全blockers构造，blockerDecisions没有参与），剥离链接目的地/定义，可整体降为fenced plain text。

**返回**：passed要求零issues且applied数=operations数；3次hash一致；format preserved/plain-text、removedAssetCount。

**失败/取消/恢复**：非法operation拒绝；其他mapping错误可降级，清除之前issues并标全部操作applied，然后重parse检验normalized扫描文本等于预期、无blockers、敏感original出现次数不高于预期；链接target残留零。该fallback语义须如实展示。

**本轮已读边界**：writer主要映射/冲突/降级/验收流程和输入编码门禁已读。

**剩余边界**：Hi完整scan/node/sourceMap每类及第三方mdast/YAML解析器尚未全展开；Markdown worker对canonical多页转换需格式组补齐；不升整个Markdown导出S3。

**证据**：md-input, md-edit-plan, md-mapping, md-write, md-coordinates

### DP19 Markdown 文件提交

**输入**：target/buffer、requiredExtension、onConflict/onWriteError、existingDestination

**调用链**：writeFile → Io → fo → wx temp/fsync → link or exclusive copy → conflict callback

**算法/分支**：mkdir、statfs可用空间（默认预检64KiB，提交按buffer bytes），wx probe+sync+删；temp wx写+fsync；link目标，特定不支持错误退COPYFILE_EXCL。EEXIST可稳定后缀、另选或replace；replace前后stat(mtime,size,ino)相同才rename。后缀1000起UUID。

**副作用**：创建目录/probe/tmp/最终文件；不会悄然覆盖，replace来自callback；finally删tmp。

**返回**：最终路径；save cancelled用MARKDOWN_SAVE_CANCELLED；扩展不符专有错误。

**失败/取消/恢复**：writeError callback可重选，取消保留审查描述；没有目录fsync或处理stat与rename之间全部竞态的证明；任务abort需外层控制。

**本轮已读边界**：项目提交器所有分支已读，和格式转换本身区分。

**剩余边界**：未验证文件系统原子性/权限/磁盘满故障；本段无独立IPC，不能独立升级整apply。

**证据**：md-preflight, md-save, md-write

### DP20 报告生成与旧 full 流程的验收陷阱

**输入**：batch processing results/outputDir

**调用链**：generate-reports → engine.generateReport/json/html/md → logCSV；legacy full → ns.render

**算法/分支**：报告handler写入copy_export_test:"blocked"、page_continuity_check:"pass"、manual_ops_count:0固定值；这些不是现场测试结果。旧文本PDF full overlay路径保留源对象风险与新apply raster分开。

**副作用**：JSON/HTML/Markdown报告与best-effort日志CSV；legacy保存错误可能吞掉。

**返回**：输出报告路径/成功；文件写入成功不能证明脱敏结果安全。

**失败/取消/恢复**：不同失败路径不共享apply receipt；报告固定字段不可当R2依据。

**本轮已读边界**：入口元数据与固定验收字段来源已确认。

**剩余边界**：engine.generateReport12728–12898模板详细输出、ns.render依赖与所有旧调用可达性未深审；不升级S3。

**证据**：reports, legacy-process, text-pdf

### DP21 我方实现差异（源代码，非运行验收）

**输入**：我方NER/OCR/规则与导出源码

**调用链**：本项目packages/core → adapters/page-export

**算法/分支**：我方NER是BERT start/end span标签、126窗口/94步、UTF16 offset加char.length，与竞品BIO/450窗口不同；我方OCR Tesseract chi_sim+eng，与Mac Vision/其他Paddle不同。规则merge只合并同span/type，其他重叠留人工review，不复刻竞品抑制顺序。页面导出做源hash/坐标验证、clearPixels、OCR残留检查、新PDF重开验页/无文本/附件/脚本/元数据。

**副作用**：独立实现文件/任务副作用由业务源码决定；本次无业务修改。

**返回**：源码显示不同的模型/算法/验证边界；不可由接口同名推导能力相同。

**失败/取消/恢复**：我方type replacement限制与PDF假名能力尚不等同竞品；本次没有运行本项目回归或竞品受许可流程。

**本轮已读边界**：当前四份我方源码快照的主要可比差异。

**剩余边界**：模型准确率、格式保真、性能与完整E2E对等需有权执行的样本验收；代码hash更新后应重新检查。

**证据**：ours-ner, ours-ocr, ours-redaction, ours-pixel-export

## 固定 44 项稳定接口映射

该映射固定原始接口ID；无对应新算法节的辅助入口保留旧合同且明确待继续，不以登记行数代表完成。

| 稳定ID | 接口 | 相关新分析节 | 全链闭合 |
|---|---|---|---|
| IPC-0ea3b09c375b | desensitization:update-runtime-rules | DP02 | 否 |
| IPC-0ecb1de9c806 | ocr:collect-diagnostic | DP06 | 否 |
| IPC-102f9010076c | desensitization:select-output-dir | 旧manual证据；本轮未新深审 | 否 |
| IPC-27dd16394cd6 | desensitization:process-files | DP03, DP04, DP08, DP20 | 否 |
| IPC-3211d99d0f20 | desensitization:open-output-dir | 旧manual证据；本轮未新深审 | 否 |
| IPC-3bea45842355 | desensitization:resolve-folder-output-path | 旧manual证据；本轮未新深审 | 否 |
| IPC-42a70f50df5f | desensitization:detect-route-only | DP03, DP08 | 否 |
| IPC-47ecc7525dfe | image-review:clear-ocr-cache | DP12 | 否 |
| IPC-4dd20e80cae3 | image-review:batch-search | DP10 | 否 |
| IPC-523337153cab | desensitization:select-folder | 旧manual证据；本轮未新深审 | 否 |
| IPC-5569a4344615 | image:save-annotations | 旧manual证据；本轮未新深审 | 否 |
| IPC-58567733591e | desensitization:page-processed | DP08, DP09 | 否 |
| IPC-5a998529649c | desensitization:apply | DP01, DP05, DP07, DP13, DP14, DP15, DP16, DP17, DP18, DP19 | 否 |
| IPC-629ace0aecd1 | desensitization:save-markdown-draft | DP18, DP19 | 否 |
| IPC-7b3e67a5a715 | desensitization:get-resource-diagnostics | DP06 | 否 |
| IPC-7d7d2d58da91 | desensitization:detect-only | DP02, DP03, DP04, DP05, DP06, DP07, DP08, DP09 | 否 |
| IPC-7f07e8bd74ee | desensitization:select-save-path | 旧manual证据；本轮未新深审 | 否 |
| IPC-81f79eee361a | desensitization:recognize-docx-images | DP06, DP16 | 否 |
| IPC-85f474cad97a | desensitization:generate-reports | DP20 | 否 |
| IPC-88cd1d915682 | desensitization:cancel | DP01 | 否 |
| IPC-8c5afeb517e6 | desensitization:get-apply-result | DP01 | 否 |
| IPC-8f1caa190dda | desensitization:register-source | 旧manual证据；本轮未新深审 | 否 |
| IPC-8fc7e5c07051 | desensitization:progress | DP01, DP08, DP13 | 否 |
| IPC-910347ed48b5 | image-review:ocr-region | DP11 | 否 |
| IPC-9577d3a9d6d0 | desensitization:save-report | DP20 | 否 |
| IPC-95d4f752bfb1 | desensitization:select-files | 旧manual证据；本轮未新深审 | 否 |
| IPC-96ccc7c0ce76 | desensitization:validate-folder-source | 旧manual证据；本轮未新深审 | 否 |
| IPC-9a8232e44fb9 | desensitization:get-default-output-dir | 旧manual证据；本轮未新深审 | 否 |
| IPC-a07c3fdcbe45 | desensitization:read-file | 旧manual证据；本轮未新深审 | 否 |
| IPC-a09f09579955 | desensitization:get-markdown-export-stats | DP18 | 否 |
| IPC-a982d6d137ce | get-pdfjs-worker-path | DP08 | 否 |
| IPC-ba07bb14e3df | image-review:get-ocr-page | DP09 | 否 |
| IPC-c1cec3199992 | desensitization:process-file-main | DP03, DP04, DP05, DP07, DP08, DP20 | 否 |
| IPC-d3864dc80560 | image:export-labels | 旧manual证据；本轮未新深审 | 否 |
| IPC-d7d18b241f88 | desensitization:unlock-source | 旧manual证据；本轮未新深审 | 否 |
| IPC-d9b14aa97589 | desensitization:release-sources | 旧manual证据；本轮未新深审 | 否 |
| IPC-e29b03465bc3 | desensitization:scan-dropped-folder | 旧manual证据；本轮未新深审 | 否 |
| IPC-e4cf3e6c3c0a | desensitization:pause-seals | DP01, DP08 | 否 |
| IPC-e84cabdffc27 | desensitization:write-folder-manifest | 旧manual证据；本轮未新深审 | 否 |
| IPC-e8dcb4d0e8b3 | desensitization:create-folder-output | 旧manual证据；本轮未新深审 | 否 |
| IPC-f02ad1fa2413 | ocr:health-check | DP06 | 否 |
| IPC-f071ce7c965b | desensitization:read-source | 旧manual证据；本轮未新深审 | 否 |
| IPC-f1f713df2b98 | desensitization:save-file | 旧manual证据；本轮未新深审 | 否 |
| IPC-fd1ca8c6cb27 | desensitization:cleanup-paths | DP01 | 否 |

## 仍可继续阅读的项目源码与外部边界

- **策略/规则全量**：逐类型正则、上下文例外、证件校验、地址/组织词典及granular规则逐分支闭合；本报告只深入主调度/NER/冲突。 定位：.data/research/lawbot-2026-10-13/readable/main.js:567–1463；.data/research/lawbot-2026-10-13/readable/main.js:1907–3192；.data/research/lawbot-2026-10-13/readable/main.js:12481–12727
- **PDF/OCR中段与表格几何**：native/OCR supplement、行列/字体/旋转合并和所有bbox产生器、es/c3/visual table完整链。 定位：.data/research/lawbot-2026-10-13/readable/main.js:11057–11299；.data/research/lawbot-2026-10-13/readable/main.js:11651–12184
- **DOCX OOXML保真与notes**：接受修订、保留package parts、脚注尾注与metadata/删除图片全部helpers；建议格式组继续。 定位：.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:407–554；.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:1585–1683；.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:1826–1923
- **Markdown解析/多页导出**：所有node扫描与source-map生产，worker canonical多页转换与恢复链引用格式组证据。 定位：.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1645–1795；.data/research/lawbot-2026-10-13/readable/main.js:Gf worker/export helpers
- **印章/人脸**：模型入口及实际后处理尚未递归，不得因OCR覆盖而记为已闭合。 定位：.data/research/lawbot-2026-10-13/readable/main.js:processImage/processScannedPdf called seal and face services
- **report/legacy/atomic source helpers**：报告模板/旧覆盖PDF/源文件获取和非Markdown原子提交仍需展开。 定位：.data/research/lawbot-2026-10-13/readable/main.js:12728–12898；.data/research/lawbot-2026-10-13/readable/main.js:M2/A2/ns.render
- **外部运行依赖**：公开项目调用语义可以继续读；模型数值精度、原生实现、有效许可证下E2E不能以静态证据替代。 定位：ONNX模型/Apple Vision/Paddle/OCR与Office/PDF渲染依赖

## 证据索引

所有范围为一基、含末行；JSON 同时保存整文件及原始行字节片段 SHA-256。行号指明 readable 派生文件时，不假装是原始压缩包行号。D9 转换脚本与 raw/readable 双 hash 可重建验证。

- `ipc`：`.data/research/lawbot-2026-10-13/readable/main.js` 15–23；片段 SHA-256 `8c9e526a662c30ac42c312b1e4308a163bdd4831636dd2d6a5d6dcd72218f5aa`
- `routing`：`.data/research/lawbot-2026-10-13/readable/main.js` 475–566；片段 SHA-256 `18d5d575557c0664d6a9e46ed632b963fc1dff58942be4c9fa3edd33eb1be79a`
- `ner`：`.data/research/lawbot-2026-10-13/readable/main.js` 1464–1750；片段 SHA-256 `df988e86505b77511f00e341cdcf2a5d4ee2ea8e3f3c0813777324a1792b77f1`
- `direct-ner`：`.data/research/lawbot-2026-10-13/readable/main.js` 1799–1906；片段 SHA-256 `fdce7c1f283083122f954d07a964a0c151e36723ec9534888d9804e016b54b35`
- `legacy-ner`：`.data/research/lawbot-2026-10-13/readable/main.js` 2444–2495；片段 SHA-256 `ec3142bd7e007e36734da83c0fb51bb4a3b4a93bc59126f1d8cafb21a61cb8bb`
- `strategy-dispatch`：`.data/research/lawbot-2026-10-13/readable/main.js` 3193–3202；片段 SHA-256 `376af1cf269aff60ececeedd22604ed1a0a50a787ac598f1c2c603297a750f7e`
- `pdf-classifier`：`.data/research/lawbot-2026-10-13/readable/main.js` 3464–3540；片段 SHA-256 `458bc3a336c8c7060bab950f39a96bc64cb6a72c70e18441e708d1cc32717af3`
- `vision-wrapper`：`.data/research/lawbot-2026-10-13/readable/main.js` 4485–4599；片段 SHA-256 `3315b2a1d55b91581b0390c7faf5f6e46a0b09381161c7091e0db6fa3dc2fa83`
- `ocr-platform`：`.data/research/lawbot-2026-10-13/readable/main.js` 4599–4659；片段 SHA-256 `00962d6e8a4d52af67bdc899f54908dd860dacc29da0270f5004df1597df0836`
- `image-process`：`.data/research/lawbot-2026-10-13/readable/main.js` 6436–6690；片段 SHA-256 `9bbd8a3b13987e78c08ca9268cc0c4237126779ea8291a8a5f6b587187601dd2`
- `image-mask`：`.data/research/lawbot-2026-10-13/readable/main.js` 6838–6967；片段 SHA-256 `f08072ba7f6e3216a5a0318ef7f90902fc59b41002369e7dc90b2c628bba1747`
- `name-overlap`：`.data/research/lawbot-2026-10-13/readable/main.js` 8492–8508；片段 SHA-256 `2b820769fe0731048e2af0fee42351019fbf5768df820ce026786f149f9cac22`
- `address-boundary`：`.data/research/lawbot-2026-10-13/readable/main.js` 8536–8585；片段 SHA-256 `9d69f54465c387af582ad4e0f9c10f3aa02afbcee7eb06ee93c8321241bb7345`
- `engine-cache-size`：`.data/research/lawbot-2026-10-13/readable/main.js` 9016–9064；片段 SHA-256 `fcb3ffdf0e16cb099c4cc23daf9fadfbf30836dab092854058a5e76e15cdcfe4`
- `finalize`：`.data/research/lawbot-2026-10-13/readable/main.js` 9080–9166；片段 SHA-256 `39112970c7b60a19c8b25970814ead0caa9f16f78949aa02758a1444bc288c5d`
- `runtime-engine`：`.data/research/lawbot-2026-10-13/readable/main.js` 9286–9304；片段 SHA-256 `a9deb11a110fafe9fb3ba57ef735d06d3f87ef6222594456389adc7bc7de092d`
- `rotation`：`.data/research/lawbot-2026-10-13/readable/main.js` 9308–9367；片段 SHA-256 `809caf725ecbfb0d30ca224eb569ef68b6b321da25ac5efeea6571794ae17770`
- `router-binding`：`.data/research/lawbot-2026-10-13/readable/main.js` 9368–9386；片段 SHA-256 `9118b94934f8ca50feb046be67d9329457d87c3c323caf07f7d9dce43ccd3182`
- `engine-cache`：`.data/research/lawbot-2026-10-13/readable/main.js` 9400–9438；片段 SHA-256 `4d8fa3919ae1861aaba1773edeb1e1fe4c372ec4e5a6288ed3c46f859c9f914f`
- `learned-whitelist`：`.data/research/lawbot-2026-10-13/readable/main.js` 9439–9464；片段 SHA-256 `49615652aabda0e05b42026dca62087cf0fb75e84ac5725d66dd00af4d1b1401`
- `target-pages`：`.data/research/lawbot-2026-10-13/readable/main.js` 9755–9773；片段 SHA-256 `bf5acc0f03232632a7c45dc5c173d822f3fbb09339c6eba2d1fd82f494ef3991`
- `detect-route`：`.data/research/lawbot-2026-10-13/readable/main.js` 10569–10598；片段 SHA-256 `2cfa90979bfa221e6165e531a8ea840b2067e56ebf64e0b654e3c05b3e5e3b37`
- `pdf-dispatch`：`.data/research/lawbot-2026-10-13/readable/main.js` 10647–10675；片段 SHA-256 `d623c66e39e1df5247b87c3192e8e2e685b99a8ac5823751b57786644c97f272`
- `text-pdf`：`.data/research/lawbot-2026-10-13/readable/main.js` 10796–11056；片段 SHA-256 `a191d89dfbbc85fe1dac55e8943f314d95f0be502d77a9e3c7a9e2d8674a80de`
- `scanned-head`：`.data/research/lawbot-2026-10-13/readable/main.js` 11556–11650；片段 SHA-256 `c4b695507d92998613c16e18f1b837867089827f0a216a8bfc3829c2a5a605de`
- `scanned-tail`：`.data/research/lawbot-2026-10-13/readable/main.js` 12185–12366；片段 SHA-256 `535ab8e2c9c01efc4784fabfcef4f2be6a6326606e63743a1561eb40fdd4a4c3`
- `image`：`.data/research/lawbot-2026-10-13/readable/main.js` 12390–12476；片段 SHA-256 `21c64c7b2bf20eb5dab869d1fb589587ee4e495d0adb66468ea30bc2d21369ab`
- `docx-runner`：`.data/research/lawbot-2026-10-13/readable/main.js` 13143–13198；片段 SHA-256 `2e6ee13a12cd7642a146618117c7dc4dd5e5c3ea1c3ade9f9e72a1c57f450487`
- `python-process`：`.data/research/lawbot-2026-10-13/readable/main.js` 13243–13306；片段 SHA-256 `ddc6ee8082eda431efe0f6348b0857b1271dba7d2c57369bbfda93f4c1407baf`
- `bbox-dedup`：`.data/research/lawbot-2026-10-13/readable/main.js` 14030–14039；片段 SHA-256 `e2cf13b77c235bf557423920e81a2f5b7850c07e7710e0c69a1e8e35d7c31361`
- `rules`：`.data/research/lawbot-2026-10-13/readable/main.js` 14458–14502；片段 SHA-256 `954584719006c694068b28a8aa4f1b0478cdc5b251ce114a97f01671df2fa6a4`
- `signature-filter`：`.data/research/lawbot-2026-10-13/readable/main.js` 14537–14549；片段 SHA-256 `2057d2129d8a6de57c64af4063894485ef1967fc44378521b8728d39cbeed121`
- `secure-pdf`：`.data/research/lawbot-2026-10-13/readable/main.js` 14599–14777；片段 SHA-256 `b3c7682ffd0137dcf74cab3ef6e83ed47f70ceba9f9d55630de3f7283b1bc9c0`
- `pdf-anchor-gate`：`.data/research/lawbot-2026-10-13/readable/main.js` 4285–4320；片段 SHA-256 `3668a99af471ca6bb5599e83bc214f3924fdca6934333f1abb5031bf3286b917`
- `ocr-cache`：`.data/research/lawbot-2026-10-13/readable/main.js` 15335–15375；片段 SHA-256 `f69b32ca0f5dd85459ce10adc8fced173efd6f4d07ef7cd6a34333d721b22375`
- `overlap-order`：`.data/research/lawbot-2026-10-13/readable/main.js` 16361–16407；片段 SHA-256 `00ee5716325fd94be1ebb5853fd48ba26bc304d142079609d81086d5e9ae107f`
- `trace-filter`：`.data/research/lawbot-2026-10-13/readable/main.js` 16408–16508；片段 SHA-256 `a631a731af33915f124ed09ee0adaa147a2212e9a356ad78e70c5edd08722568`
- `review-normalizers`：`.data/research/lawbot-2026-10-13/readable/main.js` 16523–16580；片段 SHA-256 `c817b05c3f8af4672f957dee6449e1e5eeb3ed1fe38894cdd7f481697c9d7fa5`
- `task-control`：`.data/research/lawbot-2026-10-13/readable/main.js` 17158–17183；片段 SHA-256 `d2563fcbf512f34e10e2fceb4a1082d448bffb605284fd59edf670631325e32a`
- `runtime-ipc`：`.data/research/lawbot-2026-10-13/readable/main.js` 17183–17195；片段 SHA-256 `36aa6de88e6de22a9d85df600284f75cc4e1d560097ac0a7c30903c07ab1d59f`
- `detect-handler`：`.data/research/lawbot-2026-10-13/readable/main.js` 17196–17368；片段 SHA-256 `2638cdd033f80ca824c5b838e0f23771bc0b26972708f2cb90964e6d167cd553`
- `apply-entry`：`.data/research/lawbot-2026-10-13/readable/main.js` 17409–17462；片段 SHA-256 `aa9a37d81fce61aefa28605da06878ddcfed676b9aba5bf5286cd0224aa1d64e`
- `apply-md`：`.data/research/lawbot-2026-10-13/readable/main.js` 17463–17526；片段 SHA-256 `7ca8f977d9a94a64f43a1faffcea1938e74f5b79f2dc00bfd2dd1d059dd0bd19`
- `apply-image`：`.data/research/lawbot-2026-10-13/readable/main.js` 17527–17554；片段 SHA-256 `e6d26df517a7392dde37885de039f4c55c04d2014165012be3b5281a04437a38`
- `apply-pdf`：`.data/research/lawbot-2026-10-13/readable/main.js` 17555–17656；片段 SHA-256 `f6b6d504f90f83abc56b87272709231521e9cf226eb72a74e32057d70039a860`
- `apply-docx`：`.data/research/lawbot-2026-10-13/readable/main.js` 17657–17774；片段 SHA-256 `c9459d331efacd8ac772807525f4b6d29086d169d0c6119bfadcf8e2bde88dac`
- `apply-save`：`.data/research/lawbot-2026-10-13/readable/main.js` 17775–17934；片段 SHA-256 `819c608fc0cffaca74407a30620c112ef7e4e3adb78f1b4ce4b7d590fee94cec`
- `legacy-process`：`.data/research/lawbot-2026-10-13/readable/main.js` 17950–18043；片段 SHA-256 `f762b488f3ebb763a49c532d68e5ec8fca78cc3bbcbde7d433e8a874b88b104b`
- `reports`：`.data/research/lawbot-2026-10-13/readable/main.js` 18044–18092；片段 SHA-256 `e7159c655e0fd6fe0cd780f008b0f581ab9165de7c63ffdd22715e6d39526c3b`
- `batch-search`：`.data/research/lawbot-2026-10-13/readable/main.js` 18186–18273；片段 SHA-256 `dbd71a1b2ea82683ef86daacb7a8a8099045930bff739d9ff5fef023db1f9fd2`
- `ocr-region`：`.data/research/lawbot-2026-10-13/readable/main.js` 18273–18308；片段 SHA-256 `849d05143932393c1c71aabf3602a5dd65f04d57b91416ba04d9dce2a65e9422`
- `get-ocr-page`：`.data/research/lawbot-2026-10-13/readable/main.js` 18308–18343；片段 SHA-256 `37ba8101eaa1d83b7a17ef8713cae763e7c3a1614570782d4f07a40c06e39592`
- `clear-ocr`：`.data/research/lawbot-2026-10-13/readable/main.js` 18341–18341；片段 SHA-256 `34dd54db56ffdc40ec3ccc7998c664e01b9a420a03f5b03b6c4b01c8f5f37b71`
- `partial-star`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 4792–4867；片段 SHA-256 `b4fba7c9675fe066d8436bcfc384ccf9e895ac55872e06c0933fc0dc6151850f`
- `action-materialization`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 5321–5330；片段 SHA-256 `1fc8b78db483111485d61ee0bc9b7fa8d6d0f7d9bca6a6a07576756380832c4a`
- `ui-batch-search`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 22975–22999；片段 SHA-256 `546075f258a62a73bfd23809b30a49064979e1e058e67c4ff9d3144c83fd7505`
- `ui-region`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 24171–24200；片段 SHA-256 `f69fc9afdae1715ac3093293ac9c87964150e09211035f63486b3b464e4ac476`
- `ui-page`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 25622–25655；片段 SHA-256 `16c833f39f088ac543e6b136c76abedef22e57cd8594e752b427e26dcd00893f`
- `ui-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 32063–32082；片段 SHA-256 `0a7dbf94874dfc8b93644fbb71e4f0a2d8b21217533cb7f8c5afeb34e4b8f9e2`
- `ui-receipt`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 33795–33908；片段 SHA-256 `ae588ba898d315c208571f25dadab0f6cc0862b13ae408c183037d3dc81c7c19`
- `ui-detect`：`.data/research/lawbot-2026-10-13/readable/renderer.js` 35912–35962；片段 SHA-256 `5e11d7a02e6b1a879431f9491faa9f5cbcafcbff915e01f34158b0512a31bb8e`
- `md-input`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 1575–1644；片段 SHA-256 `3e1b0f58e79c8dadc1dcba190e2cd68a6b3ab2b5ebc898ab1e2aa9496f8ef1ba`
- `md-edit-plan`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 1796–1804；片段 SHA-256 `b40ce117aeea020a1a9706ccf8a5e07b4adc36ea65331ff9c4fae783f82b4421`
- `md-preflight`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 1805–1830；片段 SHA-256 `2b07643516a7b989087bd716f25d28ed6988ee24a7c72805509fe51f2fb60cc5`
- `md-save`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 1865–1926；片段 SHA-256 `e0bd971c52f2151bd27a908ca82e3fdcadbfd43ad955291a17ed1c850edd0b39`
- `md-mapping`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 1954–2024；片段 SHA-256 `efbd5901cf8fc8d29b5dee7768606921ca4c52e9afbac4c12c429004c940f18e`
- `md-write`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 2025–2178；片段 SHA-256 `22f5b10731d44a7f2ee8d70e0742d413e78520ca232beb8df4e5c0ef8480652d`
- `md-coordinates`：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js` 2203–2212；片段 SHA-256 `0556b4805314890dc1624add11dc862a82ddc790785b9804cb15718589d06f0b`
- `docx-mask`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py` 153–273；片段 SHA-256 `53a568fdb581c784f3c6096c2d1de370f34494091ba6560ee378f765a76206ec`
- `docx-runs`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py` 592–813；片段 SHA-256 `7512999fea5330e0c38aa384cb20859c8aa5ff1223f38b90600302eacfcb6723`
- `docx-images`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py` 1000–1480；片段 SHA-256 `db77b7de5119dc8eb9aba17bc52da29871ae6561ad21f8d89c5324c0441025ac`
- `docx-main`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py` 2039–2282；片段 SHA-256 `28058c9a557a84509ae07d08aa0fcde44471d194cdc5451baba415ba52a141d2`
- `vision-script`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/ocr/vision_ocr.swift` 1–159；片段 SHA-256 `e9a47bdf4f793012703a85f8be48bde735a7458e4ccb7f3713be810be15b2a25`
- `ner-v3-config`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/support/models/ner-cn-v3/config.json` 1–51；片段 SHA-256 `374e4c6ef295a02cdbde90b7c9e94fd27c517899f17f261d6a589bb4726d51b4`
- `ner-base-config`：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/support/models/ner_base_bert/config.json` 1–141；片段 SHA-256 `48e38323071c96fdce44081898baf843f3057f592d1b8f19398c5e54cb904c7f`
- `ours-ner`：`packages/core/ner.ts` 1–70；片段 SHA-256 `dd3927a426fdfe7e953a2f7119a6594f44d594b94a76e806635aec325a70373d`
- `ours-ocr`：`packages/core/ocr.ts` 1–38；片段 SHA-256 `028b581372437dcf88dbec259be9d8f99bd70d27644d01e20802bb05e2443e10`
- `ours-redaction`：`packages/core/redaction.ts` 1–145；片段 SHA-256 `45b9efd268926620384d6c8de2a5b39964d414d54f965208feb9137f93531d34`
- `ours-pixel-export`：`packages/adapters/page-export.ts` 1–62；片段 SHA-256 `203eaf260d8021380fbf06ef3b96f5eecf3dce9b976186192868c6b46f19453f`

## 复核命令

```sh
node 文档/逆向台账/contracts/prepare-deep-processing-20261014.cjs --check
python3 文档/逆向台账/contracts/verify-deep-processing-20261014.py
```

验证器只能证明证据文件/范围/hash与报告一致，不能自动证明人工语义结论正确。必须由另一审查者回到对应源码分支核读。
