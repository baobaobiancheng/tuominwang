# Luna 1：Word 图片与 PDF 交互对照（2026-10-15）

## 结论与范围

只读检查公开 0.5.9 的 renderer 静态路径、本地 `apps/web` 当前实现和已存证据；未运行竞品、服务、浏览器或 Edge。竞品处理仍为 R0。HEAD 为 `5cee048dd637aeac69fc30b5350c5494d9386c00`；审查开始时工作树有大量未提交改动。没有触碰产品文件或 ledger。本报告不主张像素等价，也不把静态证据升级为运行验证。

源 renderer 完整文件 SHA-256：`4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc`。先复核并复用 `visual-finite-source-chains-20261015` 与 `pdfjs-worker-resource-static-by-visual-20261015` 中的已闭合节点，没有重复新建这些节点。新补的 Word inline-image 节点只补充画布事件路径，未改变既有闭包计数。

## 公开源调用链与实际行为

|稳定 ID / 源锚点|静态 producer → consumer|可证行为|完整文件 SHA / 片段 SHA|
|---|---|---|---|
|`SRC-WORD-IMG-DRAW-20261015`，renderer.js 8054–8086、8111–8129|原生 Word 布局组件启用绘制 `en2` → `es2` 为非页眉/页脚克隆图像绑定覆盖层 → `ns2` / `ls2` 接收同一 DOM 图片上的指针起止 → 相对坐标乘 `naturalWidth/Height` 得到 image bbox → `Ye2` 携带 `imagePath`、DOM ID、索引、尺寸与 bbox 打开侧栏输入|标注锚定当前被点击的内嵌图片 DOM 实例；其 bbox 以自然图像坐标记录。|`4517cb61…32cdc` / `dc273f19…22a7a8`（8054–8086）；`4517cb61…32cdc` / `cd8270db…fd40e7`（8111–8129）|
|`SRC-WORD-IMG-OVERLAY-20261015`，renderer.js 8240–8252|复核实体中 image OCR 的 `imagePath` / `imageBbox` → 用 DOM ID 优先、索引其次、路径兜底找原图 → 根据自然尺寸或 display-ratio bbox 绘制实体覆盖层|源在文档内原生 DOM 图片上恢复和呈现审核框；同一路径可出现多个 DOM 实例。|`4517cb61…32cdc` / `bf6ccd4a…ef0c3`|
|`SRC-WORD-IMG-REUSED-PATH-20261015`，renderer.js 9425–9446|侧栏手工图像输入 `Nl2` → 按 `imagePath` 收集全部非克隆 DOM 图片 → 路径重复时要求确认 → 将 display-ratio bbox 应用到各相同图片位置并加入 review state|相同内嵌图片在文档中重复出现时，源具备“同一相对位置补录”确认分支；这是按内容路径传播，不只是按图序号切换。|`4517cb61…32cdc` / `9cb702ea…e13e655`|
|`PDF.Lo2/zo2/jo2`，24396–24414|PDF 侧栏序号跳转 `Lo2` → `Il2`；删除操作 `zo2` → emit `delete-entities`、`review-state-change`；按类型删除 `jo2` 再清理 focus|源侧栏序号可跳转；删除索引必须有效且实体未删除。|`4517cb61…32cdc` / `ec8fd7ee…ff7beb`|
|`PDF.Nl2/Il2`，24691–24708|画布选中实体 `Nl2` → 记录实体索引并 focus 侧栏；侧栏选中实体 `Il2` → 取该实体首个 bbox → 若目标页当前已渲染则滚到 `ir2(y)-100`|页面导航依赖 PDF canvas 当前已有该页；本范围没有 await 页面渲染或 deferred retry。既有 finite-chain 报告已记录此边界。|`4517cb61…32cdc` / `a481a445…ba9e06`|
|`PDF.Ju2`，25815–25879；mount/unmount 25959–25994|PDF viewer mount → `Ju2` 检查/获取 worker resource → preload invoke → main `get-pdfjs-worker-path` → PDF.js document/render；unmount 递增 generation、取消 render/listener/timer/RAF、清空 canvas/textLayer、cleanup/destroy|worker 资源报告的 10 节点已覆盖主进程 resolver、preload 直接转发、Ju2、mount/unmount 和原生 PDF 搜索 caller。Ju2 对 worker 获取/初始化失败会清空 workerSrc 或报当前 load 错误；源侧不是任意 worker URL 输入。|`4517cb61…32cdc` / `5c67bb5c…0f77fb`、`49576ec0…9c9b48`。resolver 全链与各片段 hash 见 `pdfjs-worker-resource-static-by-visual-20261015.json`|
|`Image.Ia2/Pa2/Ra2`，26935–26957；`wi2/ki2`，27274–27303|排序/筛选派生列表 Pa2 → sidebar consumer（27425）→ `wi2` 根据当前 bbox 调整可见画布与侧栏项；`ki2` 使用不滚动画布的 focus-only 分支|bbox scroll 支持 ensure-visible/y-center 并 clamp 实际 scroll bounds；筛选列表和实体 source state 分离。节点 hash 已在 finite-chain 报告中核对。|`4517cb61…32cdc` / `3770c735…e162`、`eb70d370…a3fc66`|

源 PDF 节点、hash 及闭合边均引用已有报告；这份报告没有把它们重复计为新增节点。两个核心源差异保持原描述：源 Word 图片是原生 Word DOM 内嵌图；本地是布局预览中的图片资源加独立资源审查区。源 PDF 为 Electron/PDF.js 连续画布和 fileURL worker；本地是认证页面图片、PDFium 文字/坐标与按页控件。两边坐标系和分页/渲染策略不同，不能据此主张像素差异缺陷。

## 本地 UI 静态映射

当前本地代码文件 SHA-256 以本次读取时工作树为准。

|本地精确证据|caller → consumer / 观察到的实现|
|---|---|
|`apps/web/docx-review.tsx` 67–102；全文件 `be197defe33a8489a8b9e09745710f9ec136798da09914b7878d56e582d8437c`，片段 `d3445fa28df6c70a37611fd59970e6c1fe0ffd4b8e05f43eebab9276c73a8c2b`|`main.tsx` Word 版式入口 → `DocxReview.renderBlocks`。图片作为只读 `<img>` 内联渲染，从 `/api/documents/{id}/pages/{run.page}` 取图；图片没有直达审查区的 click/selection handler。辅助文字明确要求区域标注使用图片审查区，并说明浏览器分页/浮动对象差异。|
|`apps/web/main.tsx` 1018、`apps/web/page-review.tsx` 27–42、80–104；全文件 SHA 见 JSON|Word 版式/对象原文入口 → `PageEditor`（当有 `doc.pages` 时挂载）。PageEditor 用固定页/图片索引下拉选择某个资源；内嵌 DOCX 图片用各自页面端点预览。页面选择变更时清除当前文本/区域选择，geometry editor 关闭。页面数值是图片资源顺序，不冒称 Word 页码。实体文字 selection 从当前 anchor 的 glyph/OCR 区域转回 canonical span。|
|`apps/web/page-review.tsx` 80–104、118–124|PDF PageEditor → 单一 `page=index` 图片、SelectablePageText、SVG 区域/几何层及本页处理预览。上一页/下一页/下拉改变 index；页面与实体不是一个连续 PDF.js DOM。浏览器只加载当前页审查图片和该页 OCR text overlay。|
|`apps/web/main.tsx` 1053–1139，局部 hash `f44b77ad…a5238e`（1053–1065；完整 hash见JSON）|右侧实体列表的 quote button → `setDocxFocus`、`loadText` 或 `original` textarea selection；它不调用 PageEditor 的页选择。`EntityGroups.onEdit` 只更改实体列表分页、逐条视图和被编辑 mark index。`PageEditor` 没有外部 focused-mark/page 参数。|
|`apps/web/main.tsx` 375–384、439–450|`openDoc` 将 GET 返回的 `pageReview` 装入编辑状态；文档运行中刷新也从当前响应更新 `pageReview`。`PageEditor` 的 `index` 是组件本地 state，初始化为 0，故重新打开后默认显示第 1 页/第 1 张图片；review regions 的 page index 本身由父级 review 状态保存。是否在用户数据保存/重开后正确恢复每个框，本次没有运行交互验证。|
|`apps/web/main.tsx` 1002–1014、`packages/adapters/page-export.ts` 1–100|父级把当前 marks/pageReview 提交为 dirty 状态；页面预览按页 POST `/pages/{index}/preview`。输出适配器走 `renderDocumentVisualPage`，是页面处理/栅格输出链，不是 PDF.js viewer。导出转换损失由 UI 明文说明：PDF 转图片型 PDF 不保留可选文字、图层、表单、链接、签名有效性及文件属性。|

`document-source.ts` 在此次审查只用于确认服务端文档视图的页面元数据入口；不从该文件摘要推断 OCR/坐标正确性。UI 的请求/响应完整运行结果没有本次 Edge 证据。

## 反例矩阵

|最小合成输入与动作|源预期|当前代码可证的我方行为 / 实际缺口|分类与影响|验证|
|---|---|---|---|---|
|Word 文档含两张不同图片（各有一个不同敏感字）；在 inline image 2 和资源审查下拉资源 2 添加框，保存复核，重开检查两个资源|源在原生 DOM 直接框选该图，并按图片 path/DOM 实例保存 bbox 与 overlay；重复路径时单独确认对同图多处复用。|本地 inline image 只读；独立资源审查区可下拉到资源 2 并加 page-index 区域。OpenDoc 恢复整体 `pageReview`，但 PageEditor 本地显示 index 归零；没有把 Word inline image DOM 点击和独立 review 区联动。|已知环境/UI适配；不认定数据缺陷。用户需从独立控件选择资源；保存后默认回到第一资源。是否数据真能跨重开保存未跑。|源码静态；请求 Edge 补测：两张 distinct-image 合成 DOCX，第二张加框后保存/关开，确认第二张资源区域仍在且只影响目标图片。|
|2 页合成 PDF，实体位于第 2 页；停留第 1 页，从右侧 mark quote 或实体组点该实体|源 `Il2` 将目标实体页滚入已渲染 PDF canvas，并同步侧栏选择。|本地右栏 quote 只选中原文 text span；EntityGroups `onEdit` 只切换 50 条分组。`PageEditor` 独立 index 没有目标实体 page 输入，也没有 main→PageEditor 导航回调。静态路径不能令 canvas 跳到第 2 页；操作者可用页下拉手动切页。|疑似功能缺口（优先 root 补测）：实体侧栏“定位”无法直达对应 PDF 页面，增加人工定位步骤，可能导致位置核验遗漏。考虑本地明确分页适配，需按产品要求确认是否接受；本报告不据静态代码宣告运行缺陷。|代码静态可证；Root Edge 未运行。补测动作：实体栏点第二页实体定位；断言当前 page canvas 是否切至 2，截图/trace 留存。|
|PDF 当前第 1 页框选文字，切到第 2 页再立即切回/换文档卸载|源连续 PDF.js text layer 支持页内可选文字；mount/unmount 会取消渲染任务并清理文本层/文档。|本地每页的 `SelectablePageText` 由 index 与 revision key 管理；翻页清理 selection 并切换当前页图片/OCR overlay。React key 变化应重建 page-local selection；关闭组件卸载逻辑需 runtime 确认。|适配；跨页 selection 不会作为一个连续 selection 提交。本地声称逐页选字，应按页复核。|源码静态；未做 PDF 跨页 selection / 快速切页 Edge。|
|PDF 页面/画布滚动、缩放，保存后重新打开|源 renderer 有连续 canvas、缩放工具、滚动监听和 resize observer；PDF.js 以 worker document render。|本地图片按容器 aspect-ratio 显示，并保留手绘 SVG viewBox 坐标映射；没有连续页面滚动/源同款缩放工具，主滚动由页面容器管理；审查框使用 canonical page coordinates。保存只覆盖复核 state，显示页索引重置为 0。|布局/坐标环境适配。不能称像素或连续滚动等价；若需求是审查状态含当前页位置，存在未实现证据，但 plan未要求持久化 viewport。|源码静态；需 root 实际浏览器检查滚动缩放坐标和重开显示行为。|
|worker 缺失/临时资源路径不可用|源有 Ju2→preload→main resolver 路径和失败清空/加载报错分支；缓存复制失败回源路径、外层异常由源日志/调用处理。|本地审查页请求服务器页面 raster/PDFium 与 glyph API；Web 页没有 `get-pdfjs-worker-path` 入口。服务端另有固定 PDF.js route 的静态证据，但此审查没模拟 PDFium/OCR 资源失效。|平台适配；本地故障降级仍未验证。|worker 静态报告可复用；本地 fail behavior 需 API/Edge failure injection。|
|Word/PDF 侧栏定位至未渲染页后立即切页、关闭/unmount|源 PDF `Il2` 仅在目标 page 已渲染时滚动，静态上没有等待或重试；unmount 防旧任务回写。|本地 PageEditor 实际仅装当前页，侧栏实体没有画布聚焦路由；没有可以交叉复现源同款“已选实体且未渲染页”的连续 canvas 状态。组件清理/异步 OCR取消仍需浏览器确认。|源已知限制 + 本地页式适配；快速切页是否出现旧请求/selection 污染未验证。|静态可证边界；请求 root 用选页→立即选另一页→关闭/重开检查无旧选区串页。|

## 独立检查范围与后续

已重读节点：Word image draw/overlay/repeated-path 三段；PDF Lo2/zo2/jo2、Nl2/Il2、Ju2、mount/unmount；Image 派生侧栏/scroll 节点；worker 资源十节点图。源 claim 只涉及公开静态代码。应用行为全部基于当前工作树静态实现，不是 Edge/API运行结论。

建议先由 root 对“右侧实体定位应否控制当前 PageEditor 页”做上述两页最小合成 PDF 补测。补测之前将其保持“静态可证的导航能力缺口，运行未验证”，不在 ledger 单方添加条目。Word 内嵌 DOM 与独立页面资源审查区、PDF.js连续滚动与PDFium按页 raster 坐标为明确适配边界。竞品处理保持 R0；本次没有授权流程、运行、部署或外发。
