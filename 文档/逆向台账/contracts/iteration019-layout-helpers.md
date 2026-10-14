# ITER019 布局直接依赖补读

6节13范围；S2/R0，未执行竞品；不宣称业务全链闭合。
本稿承接layout-manual留下的五函数，并读取Eo2/No2/xu2/ku2及Nd VML应用包装。

## LH01 Bb批量测宽与取消粒度

- Bb将batchSize夹在1..120，每批先批量读取offsetWidth，再按targetWidth/offsetWidth设置scaleX，比例严格处于min/max之间才写；默认0.1..20，toFixed(4)。批间await yieldWork或setTimeout(0)。
- cancelled只在每批开始检查；同步map/forEach内部没有逐项检查。native调用还在await后检查渲染代际，OCR调用使用代际或!isConnected，OCR参数70条/0.05..30。

条件与边界：
- 宽度为0或比例等于阈值不改transform；本体不主动还原既有transform，也不证明字体真实排版宽度。

证据：
- renderer.js:10683–10694，`measure-width`，SHA256 `0a55471fd68923c9b5981ca418cf88bc24ea5c136c1eb06817576a3e66b813df`。
- renderer.js:25735–25799，`render-caller`，SHA256 `0bf224d81a30c3b697cab96577f03c1cacda1bb2a08bf3ef44960381f2a06946`。
- renderer.js:25627–25649，`ocr-measure-caller`，SHA256 `5cacf2e9d49bacc370a21856c4e2811743c4afff0a4bf2588f6003032e140997`。

## LH02 Ir2空白采样与lo2原生文本可见fallback

- Ir2步长为max(10,floor(width/120))与max(10,floor(height/120))，逐采样行getImageData，每个采样像素alpha>8且任一RGB<248才计非白；非白占比<0.001判空白，读取异常返回false。
- lo2读取operatorList，以setTextRenderingMode更新当前mode，统计4种showText类operator；mode3或7记不可见，其余记可见。当不可见为0或不多于可见时允许fallback，异常false。它按operator数量比较，不是逐字/像素覆盖。
- Xu2仅位图失败或Ir2判空时调用lo2并切textLayer--visible；之后文字span按该结果设置可见色或transparent。位图失败不保证fallback文字可见。

条件与边界：
- 稀疏采样可能漏掉未采样细线或小字；lo2模式计数不等于真实PDF绘图顺序/可见性证明，无竞品运行。

证据：
- renderer.js:23610–23626，`blank-sampling`，SHA256 `7e29051ee3e64da8403109c07d80f86395fc0db5c66dee2f8a439baf85f78ecd`。
- renderer.js:24019–24031，`text-visible-ops`，SHA256 `ef835e011e9e750bd9001283298a334502c85241042089f8e14c54fa3ae7d9f0`。
- renderer.js:25735–25799，`render-caller`，SHA256 `0bf224d81a30c3b697cab96577f03c1cacda1bb2a08bf3ef44960381f2a06946`。

## LH03 To2原生实体框精修

- Ft2仅当保留页中有scanned类别、OCR尺寸实体或垃圾文本标记页才真；To2要求Ft2、未deleted、严格同pageNumber、有效单bbox、非user来源、未rangeAdjusted/userAdjusted且无number型OCR尺寸。caller另要求本页文本未判垃圾及en2旋转为0。
- viewport乘item.transform生成候选矩形，ascent或1+descent夹0.6..0.95；在旧框外扩24显示像素内按top（差>2）/left排序，经Eo2寻找文字。Qi2用viewport与缩放阈值猜旧框是否已在显示像素空间，并非明确单位标签。
- 匹配item矩形取并集；新宽>旧宽+10或y移动>旧高+20则拒绝。面积比0..0.9、x右移>2或宽缩小>2任一满足时原地写meta.bbox与textLayerRefined=true；catch返回false。caller累积成功后提升Je2。

条件与边界：
- Xi2只排NaN而非所有Infinity；Qi2有额外finite门。精修本体不触发保存、未更新meta.bboxes等其他框列表；不能把本次bbox变更称全链同步。

证据：
- renderer.js:22550–22575，`ocr-page-flags`，SHA256 `ea601e531515f9cc247d142b9ad40a8f12f15cf237a1b7bf0ea45005e60f154f`。
- renderer.js:23357–23363，`operation-source`，SHA256 `dfcbe33990231add7f878bc90589ffd0a8b73fc8d060c3dc2780157babeed751`。
- renderer.js:23396–23419，`bbox-scale-heuristic`，SHA256 `6ffe961ed3c5431e90a46c9d2e83351371e023bb187dba7d61e9d0c06d160901`。
- renderer.js:24217–24266，`refine-native`，SHA256 `2b0fa54ea1870da2f994ef7cc2eb3a9df663873a70a6c89ca1bb7af93a992959`。
- renderer.js:25735–25799，`render-caller`，SHA256 `0bf224d81a30c3b697cab96577f03c1cacda1bb2a08bf3ef44960381f2a06946`。

## LH04 Eo2/No2与xu2/ku2文字到框

- Eo2从每个item起最多拼max(100,5*query.length)项，去空白完全相等即返回；包含query先尝试No2收窄，失败才允许query/拼文长>=0.5的最佳候选。超过4倍query长度停止当前拼接。
- No2取首indexOf命中，先保留重叠>=该item文字长度一半的范围；没有则保留所有正重叠。最多20轮左右扩展，返回包含query的连续item子数组或空；不切item内部几何。
- xu2按viewport变换和字体ascent建立__rectPx并按top/left排序。ku2在这些item拼文中首indexOf，按每item宽度/去空白UTF16长度等比分摊命中宽，按y差<=4合并首行组，再取union。

条件与边界：
- 匹配与宽度分配均用UTF16及等字符宽假设，不能由源码保证非BMP、比例字体、竖排或复杂脚本定位准确；这里是应用启发式，不执行字体渲染器。

证据：
- renderer.js:24267–24327，`text-match-items`，SHA256 `2f72d8a7c3fedeb3d585db0ba2ad86ea05416f83183e1cf9b801e730a70546cf`。
- renderer.js:25333–25386，`native-items-boxes`，SHA256 `fa36d631da9f11dd00515339da227558dd0fa87158a2de72731843918d13fb81`。

## LH05 _u2 OCR优先、原生与LCS回退

- _u2先要求当前PDF对象和非空原始query；有IPC和fileName先batch-search，可选pageIndex。成功结果按requested page过滤，构造框并经Xi2，按OCR y/ocrImageHeight与approxY*zoom/pageHeight距离排序，立即返回最邻近；缺尺寸距离为0。该OCR分支没有deleted页集合过滤。
- OCR失败或无结果再按指定页、其后页、前页的顺序遍历，过滤deleted页。优先xu2→Eo2→ku2，指定页有approxY时先查中心±80区域再全页；否则依PDF原始item顺序拼文字、局部等比分割宽、按y差<=4合并。
- 若原生精确候选仍无结果且指定页非null，再在该页每起点最多20item的串上算LCS，匹配长度/query.length>=0.7列候选、串超3倍query停止。优先LCS最高；有approxY且多个候选在最高差2以内，按y距离选；返回单union框。该最终指定页分支没有再次检查deleted页。
- 各层catch可吞失败，最终null；没有自有timeout、revision/代际检查。读取Ee2.value、props和布局发生跨await，单函数不能保证切文档后仍指同材料。Zs2当前仅返回多框才采用_u2结果，单框LCS结果在该caller不会替换用户框。

条件与边界：
- 删除页过滤只覆盖原生主循环；OCR与最终指定页LCS另有条件，不能宣称_u2所有分支排除已删页。no local generation不等于已经复现跨文档错误，外围锁定/卸载仍需合法运行。

证据：
- renderer.js:25387–25549，`reversefind`，SHA256 `db98ff649a7cf55d517bd7fbc2ac5e20a5e1b1e55e5faa152bdf5af5d9996675`。
- renderer.js:25333–25386，`native-items-boxes`，SHA256 `fa36d631da9f11dd00515339da227558dd0fa87158a2de72731843918d13fb81`。
- renderer.js:24267–24327，`text-match-items`，SHA256 `2f72d8a7c3fedeb3d585db0ba2ad86ea05416f83183e1cf9b801e730a70546cf`。
- renderer.js:23396–23419，`bbox-scale-heuristic`，SHA256 `6ffe961ed3c5431e90a46c9d2e83351371e023bb187dba7d61e9d0c06d160901`。

## LH06 DOCX VML应用包装与资源边界

- Ad只接受恰好两项有限数，其他值用默认coordsize/origin；Td解析样式，group裸数按父坐标原点/尺寸转百分比，无父裸数用pt。CSS单位仅pt/px/in/cm/mm/%，rotation需finite，flip可x/y，z-index要求整数字符串。
- Ed解析f单位除65536、百分号除100或直接Number，非finite变0但不夹到0..1。Nd递归group要求coordsize正数；image crop剩余宽高比例<=0报错，否则生成裁剪百分比容器。
- imageHref.id缺失时委托renderElement；有id必须imagePath可得，并将loadImage→赋src→decode Promise登记给宿主waitFor。含foreignObject再加renderTextBox覆盖层。无本地代际/timeout；宿主Yr2既有取消与等待上限不能当该包装内部已主动终止decode。

条件与边界：
- 负crop比例可能导致向外扩展；应用只拒绝剩余比例非正。真实VML解析、资源decode及复杂排版由外部renderer/浏览器决定，本体静态已读。

证据：
- renderer.js:4913–4984，`vml-wrapper`，SHA256 `2b8108880ffde76daf32e4200457d6b3006fc1321f8865a75fcb6e51b3897056`。

## 剩余

- cross-report：DOCX qh/df/Nf/_2/v2见同轮projection PA09及PA01；PDF wb/yb/gb/Qy见同轮state-policy SP15，非本作者重复审查。
- external-runtime：PDF.js getPage/getTextContent/getOperatorList/render、动态DOCX模块、真实DOM/font/canvas、合法竞品材料保存导出及取消切换均未由静态应用代码验证。
