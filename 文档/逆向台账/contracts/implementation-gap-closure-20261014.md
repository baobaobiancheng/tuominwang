# 三项实现差距闭合与最终审查

**结论：定向代码审查无未解决行动项；最终files定向复跑7/7通过，首次全量37/38失败记录保留。不能称与竞品完全等价。**

## 范围与独立性

核心模块、API/worker/前端桥接及相关测试的定向语义审查；附源码整文件hash便于快照锁定，不代表这些模块及全应用每条路径都被动态覆盖。

审查者未修改业务实现；规则交接Markdown由本审查者编写与更新，不能把本报告对它的校验称为完全独立作者审查。ui_closure_a独立核读新增6.2 Word段，无问题；未由其独审5.3/6.1。

竞品保持 **S2/R0**；测试描述均为我方实现。未修改业务或ledger。

## 已修复问题

|ID|优先级|问题与修复|
|---|---|---|
|IGC01|P1|PDF预览像素坐标直接作为canonical页坐标：canonicalVisualResult按页宽高/检测图宽高比例映射；worker对visual-detect调用该函数。 独立回读与2倍尺度回归通过。 源：packages/core/visual-detection.ts:96-100、packages/adapters/processing-worker.ts:34-41、tests/visual-detection.test.ts|
|IGC02|P1|OCR删除或纯空白替换丢弃旧字框：删除/空白旧可见框额外关联最近含非空文字的有效保留范围；无接收范围拒绝OCR_POSITION_REQUIRED；去重并维持200000映射上限。 独立回读；clearPixels删除/空白回归15项组内通过；集成日志包括纠错后导出与再识别。 源：packages/core/ocr-correction.ts:40-54、tests/ocr-correction.test.ts:36-53|
|IGC03|P2|OCR保存期间可能覆盖新编辑的复核草稿：PageEditor给OcrTextEditor传父级run；run贯穿submit和onSaved，父busyRef与disabled阻止并发复核编辑。 已回读接线和同步busyRef门；浏览器纠错用例验证既有脏草稿禁纠错，未宣称对所有时序都作了注入测试。 源：apps/web/page-review.tsx:47-48、apps/web/ocr-text-editor.tsx:42-42、apps/web/main.tsx:257-273|
|IGC04|P2|Word排队态先挂载导致预览请求失败后不重试：只有review/outdated挂载DocxReview；queued/running不发版式加载。 根及Word作者定位修复；审查者回读状态门；full Edge中新Word用例通过。 源：apps/web/main.tsx:867-867、apps/api/docx-layout.ts、tests/e2e/docx-layout.spec.ts|

## 三项功能与仍有差距

### VISUAL

按页人脸/红蓝印章候选已接入；权限view_original+review、revision、state及预览hash检查；候选不自动写入清除区域；确认后经正常复核/导出。

已验证范围：YuNet模型hash、输出长度/finite、NMS、canonical转换、颜色规则；公开messi5单图smoke一个候选及合成红圈Edge导出像素黑色。

- 无自动签名/黑白章检测
- 未建立人脸/印章真实语料精度、召回率或跨平台性能基准
- 模型smoke不是全部模型输出/取消/资源场景证明

### OCR

页内UTF-16选区expectedText精确匹配、代理对边界、保守派生几何；写新map和revision，全体需重新复核，无新快照；旧已签发链接保持旧产物；重新识别验证hash后保留人工纠正文案。

已验证范围：纯函数增删/空白/代理对/定位错误、DB持久化与任务取消/快照失效/再识别/签发隔离、Edge实际改字并禁旧复核导出。

- 插入/删除共享原框可能多清除邻近内容，需检查预览
- 没有接收范围的全删被拒绝，需使用手工区域
- 纠错不证明原图无其他敏感像素，原件不会被修改

### WORD

读取原ZIP投影白名单JSON/React节点；按paragraph身份核验offset，跨run高亮、同段选择，图片只本地page索引；最终仍由原Office与图片适配器导出。

已验证范围：XML/实体防护与预算、样式边界、跨run和emoji、表格/页眉/文本框补充区、权限revision；full Edge新Word真实下载并检查ZIP文本。

- 浏览器字体/分页/浮动与多节布局不保证与Word像素等同
- 属性隐藏对象仍需对象原文审查，版式展示不代表完整coverage
- 仅支持的本地PNG/JPEG图片链，未知对象仍可能阻断

## 验证记录（失败与复跑分开）

|验证|状态|证据与结果|
|---|---|---|
|CHECK|passed|.data/evals/iteration021-check-release.log：11 Bend laws；13错误变异拒绝；TypeScript；17文件82单元测试；Vite构建成功。|
|DB|passed|.data/evals/iteration021-integration-final.log：18/18隔离PostgreSQL/API/worker集成，包括OCR纠错、NER及导出。|
|REVIEWER_UNIT|passed|pnpm exec vitest run tests/ocr-correction.test.ts tests/docx-layout.test.ts tests/visual-detection.test.ts：3文件15测试，修复后独立执行。|
|RULES34|passed|.data/research/lawbot-2026-10-14/iteration020/handoff-34-cases.json：34/34；仅detect(text,[],[])指定kind/quote，不含模型/DB/浏览器。|
|EDGE_INITIAL|incomplete-failed|.data/evals/iteration021-edge.log：37项初始启动，仅部分进度，无完整统计且exit1，不计通过。|
|EDGE_OCR_EARLY|failed-then-corrected-in-full-run|.data/evals/iteration021-edge-ocr.log：等待标记2不存在，60秒超时；修正测试预期为实际单标记，后来全量运行通过。|
|EDGE_WORD_EARLY|failed-then-corrected-in-full-run|.data/evals/iteration021-edge-docx.log：等待成功docx-layout响应120秒超时；queued挂载门等修复后fullrun新Word通过。|
|EDGE_VISUAL|passed|.data/evals/iteration021-edge-visual.log：1/1合成印章候选确认与PNG像素导出通过。|
|EDGE_FULL|partial-failed|.data/evals/iteration021-edge-final.log：38项37通过1失败；仅files.spec.ts旧DOCX下载按钮5秒就绪超时，新三功能测试未列为失败。不得写成首次38/38。|
|EDGE_FILES_RERUN|passed-after-test-wait-adjustment|.data/evals/iteration021-edge-files.log：下载按钮就绪等待由5秒调到45秒后，files.spec.ts定向7/7通过（1.3m）。该复跑不改变首次全量37/38事实，也未再宣称完整38项重跑全绿。|

## 交接文件更新

`文档/脱敏规则技术交接-20261014.md`：更新OCR/Word/视觉候选语义及流程；刷新51个我方文件/记录hash（含main与revision-history）；保留17/41/108清单、34样例、3Mermaid及96竞品范围hash。

SHA256 `65961ef0563fcf1a0d2c7d842761cfdaaad4f08a5011dfe72ef7135c8362a704`。

## 边界

- 我方17检测项不等于竞品41基础组及所有场景增强；108配置类别不是我方已自动启用规则。
- 竞品仍S2/R0；未执行竞品，不声明算法等价、全接口运行等价或零漏报。
- Bend仅已建模纯逻辑，不证明解析器、OCR、模型、权限或整个产品。
- Mermaid已存3块，未用离线渲染器做语法/布局验收。
- 本地测试不证明公网部署；本报告不包含部署成功证据。

## 证据锁定

下列区间1起算、闭区间；range hash保留原始行结束符。整文件hash另存JSON；hash一致性不能代替语义或运行证明。

|路径|范围|区间SHA256|
|---|---|---|
|`packages/core/visual-detection.ts`|1–100|`353ba241c55feeced7004596bfdc17ec7fa65f697bd5146a605a32144cb4dc59`|
|`apps/api/visual.ts`|1–20|`36ade77b92408a57853b75711216004c7dbf86a1ef4ad2e2cdf4bde22ad22781`|
|`apps/web/visual-suggestions.tsx`|1–21|`ebd81c64d77d5cca32be7066a7ffd74d8bec0d00becb77e9ad4ed81ee10ba652`|
|`scripts/visual-lock.json`|1–10|`1cf36bf6c10d935c72ed87c2f2926b7450e2ffd7907db2e1a5182295cb4ba4ab`|
|`scripts/visual-models.ts`|1–24|`e842347f073413f34c3fa7265ab76224134fc31a0a981154b43ba5c25840b756`|
|`packages/core/ocr-correction.ts`|1–64|`b679a676a0210fc7229e8d88b5fb2b2f9689db7cab7fb5c23c0aec69745067fe`|
|`packages/contracts/ocr.ts`|1–10|`ed2d60de2bf73aa6cfa70809dbb5af379f3fc9913ff65a8caf37023b9bd3a9a7`|
|`packages/adapters/ocr-correction.ts`|1–38|`1589ff174e76096b93acb78d8bd1eba59efb922e1da59370c854c5ad7bde5408`|
|`apps/api/ocr.ts`|1–39|`5ec6b12f2605b2a4bbe63bb11fb916dddb7bfd44635c81b998d7bcf22c1b5376`|
|`apps/web/ocr-text-editor.tsx`|1–46|`30252ebfb44a44479e4ab63a7102dbea2ba2e721a9ad0f2e4656a60d14f29bc8`|
|`apps/web/page-review.tsx`|1–64|`39cd0043fc2cf9303a6a7384b8218544b6ef6fc6db9d06b7daf191e429f898b6`|
|`packages/adapters/processing-worker.ts`|1–150|`0447daea19be5042ae7387d320e76d982bd9345b5d4f07cc65e26656b92a1539`|
|`packages/core/docx-layout.ts`|1–117|`03ab637dbe842a8affa03646ac44dd66886733f41887ebe39650a59209bff512`|
|`packages/contracts/docx-layout.ts`|1–7|`734849b54023c31ff23f539f3edde7d3ac36560d30ba806937d14ab9c0da77a7`|
|`packages/adapters/docx-layout.ts`|1–11|`561f35896c8bf6464cec6bc9a6c20bb0dbf77dd80a6ac7a04ddd7dee9c9e679f`|
|`apps/api/docx-layout.ts`|1–22|`aa299e7f9723a43d1398dee2e1008adbd30e0a1b8dc3f74de7f5e13d4b7b68f4`|
|`apps/web/docx-review.tsx`|1–94|`47b0f8f84b54e635c3a4a570a4522db9adf5c47fa103b058145d84d3f96fba87`|
|`apps/web/docx-review.css`|1–23|`1e4959fa092ba0b6eca9770307099cb5a2bff0b538bbc232a741ab9531adce93`|
|`packages/core/page-redaction.ts`|1–89|`493aaea212e47322683a12b73d049842e39fb63cc8d2f927cdb03e133caf09f8`|
|`packages/adapters/page-export.ts`|1–62|`203eaf260d8021380fbf06ef3b96f5eecf3dce9b976186192868c6b46f19453f`|
|`packages/adapters/office-images.ts`|1–50|`1a78cb57f655e7cc32375fadb33c24a1a1fea77e958c0ef5e6464ef589b6dcdd`|
|`apps/web/revision-history.tsx`|1–7|`c9b061ca0568460b39f660c69a90067aa649a2be6dae274de466ab3ad67c9fb2`|
|`tests/ocr-correction.test.ts`|1–53|`1c883e296ce9e72df51e642c6371b769adce23e6523863587b2212afd06d1661`|
|`tests/ocr.integration.ts`|1–81|`8003b93af88f463a082dc4e72c3dfb3d6411f7a73a8b4e4b5c8f6ae6f3e39f41`|
|`tests/docx-layout.test.ts`|1–73|`d34706030f9ebfc0a8412633e9f646ef4a7551488660b1b6984634fd80ceda60`|
|`tests/visual-detection.test.ts`|1–25|`572e3eacc0dc545a06879782c51d7ca164915e05d0c29cdc3be5f8ca66dbec2b`|
|`tests/e2e/ocr-correction.spec.ts`|1–45|`6c02fbaf94448f79aa5552afef64086d0ff6ea8470de75e11876262de4438c86`|
|`tests/e2e/docx-layout.spec.ts`|1–105|`d5dc526a1c1322d6a51acba2410ae621ac135e2879dd5e6de608bad485f3ccfe`|
|`tests/e2e/visual-detection.spec.ts`|1–41|`c7a20a96e1d7f5034d6a27593ff6f829d2d5a73f787e3afd09adadb8883d1ba3`|
|`tests/e2e/files.spec.ts`|1–240|`005f1887e6d05c092467ca1bf7b2a51ff16d4821bff528e9e6b8ce70f9236548`|
|`playwright.config.ts`|1–20|`add706fefe1252d8bef39f9abc1095bb329c41bddc354b21937ba05720fcf90d`|
|`apps/web/main.tsx`|805–878|`6604133a044af6ba14d12511647578f1538fce8644f8ac44f25ea8b405c0c2ca`|
|`.data/evals/iteration021-check-release.log`|1–26|`347c44854dff7b36fe1a2abc30ab97bded257a2ef43151765ff03bfb49694776`|
|`.data/evals/iteration021-integration-final.log`|1–28|`b4a5b6e609f47b5c76d1dcf491ff6e754c2dfdbbd1acac5ceae2c03d145ac342`|
|`.data/evals/iteration021-edge-final.log`|1–87|`2ae42771cbec174339359191b6ea56815b08ee52180a1bd651fca233ea23e323`|
|`.data/evals/iteration021-edge-docx.log`|1–58|`3892fa228fc2b47f1530224f8a2af974d1d12ec6188c126606546168df24a8a9`|
|`.data/evals/iteration021-edge-ocr.log`|1–66|`f0329228a15131737a6a92c0fd213b14ec51939835c0aa12c8e999c577ef7786`|
|`.data/evals/iteration021-edge-visual.log`|1–48|`75c0f0414147ac6147bd3b3cadd80e92e813b9d1e56d71ccfdf0494787db7556`|
|`.data/evals/iteration021-edge.log`|1–29|`94b75be323574f10daae8a26c9b5c09acfbc8ace44db22c2bcb7ae4aafacee3f`|
|`.data/evals/visual/face-smoke.json`|1–18|`1a2b9c292b8c98b791c07d07693e8dec8ee04200699850c17f46b0ca1288de0a`|
|`.data/research/lawbot-2026-10-14/iteration020/handoff-34-cases.json`|1–538|`3f7c72754de3388140e7a770e60f62540babb48fa7665f19ce1fcfae2f419c91`|
|`.data/evals/iteration021-edge-files.log`|1–33|`329147f14a9401003997f7fbca14e1e6cfe972d53c47ac8664deec843e271bb1`|
