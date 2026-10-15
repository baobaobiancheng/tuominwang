# Luna 3：指南、截图与视觉 ID 审查（2026-10-15）

## 结论

本轮为只读审查。HEAD 为 `5cee048dd637aeac69fc30b5350c5494d9386c00`，工作区有大量未提交改动。未运行 Edge/API/模型测试，没有启动服务或竞品。竞品 0.5.9 保持 **source static only / runtime R0**。

指南对 PDF 按页、本工具 Word 图片资源区、桌面 Word 排版差异和模型公开集边界的说明总体谨慎。三张指南旧图均存在，哈希见下表；它们不能替代当前树新增的四类操作图。可见的最近 Edge PASS 日志早于相关 spec 的修改时间，所以不能记为当前树通过。隐藏/恢复仅见接口、codec/单测和静态证据，本轮未发现 type-hide Edge 运行日志。

本轮从 C 委托剩余 62 个 ID 筛得与指南可见界面直接相关的视觉 ID，并与 A/root 现有闭包去重；无新 ID、无新闭合链、无静态深度提升。`UI-ad41d13c4a2d` 与 `UI-2c1712d35460` 仍只是 A 报告中待 root 复审的精确 ID S3 候选；`IPC-a982d6d137ce` 仍只限既有 10 个静态节点。

## 指南逐项结果

| 位置 | 审查结果 | 建议 |
|---|---|---|
| 第3行 | 本地待发布、服务器入口依部署记录、type-hide Edge 待运行，证据层级清楚。 | 保留。后续只用 root 当前树 fresh Edge 结果更新。 |
| 第21–28行 | PDF/图片页码与 Word 图片资源序号区分清楚；同资源复用的影响范围合理，但本工具同一 media target 多引用尚无所审 Edge 例证。 | 保留主说明；资源复用句补一个合成 DOCX 同 media target 的保存/输出证据。 |
| 第30–42行 | 说明选字只从透明文字层产生标记；旧图手机号保留原值的限制有写出。旧版页面选字日志已 PASS，但早于当前 spec。 | 不将旧图称作当前旧 ignore 重加证据；补当前测试的状态截图。 |
| 第44–68行 | 画区域、八手柄、保存/清除是当前 E2E 的断言范围；历史 run 有 2 passed，但当前 spec 后续修改。现有图是保存后视图，未见保存前手柄与几何控件。 | 保留“新图待补”；新图拍保存前编辑画布，图中带 8 手柄与左/上/宽/高。导出拒绝仍需相应 API/导出证据支撑。 |
| 第70–84行 | 同文测试当前代码覆盖两个 Word 正文命中、勾选、定位、pending marks、FN API 断言。旧 pass 日志早于当前源，且已有图显示保存后主界面，不显示勾选态/FN。 | 先 fresh run，再拍“两个结果同时勾选”和“已添加后 pending/FN 可核对”两张图；trace/原始 API 响应保留实体文本、类型、producer。 |
| 第86–119行 | 图像搜索“区域外不是查漏证明”、区域 OCR 先展示、纠错显式保存、密码错误失败等边界清楚。本轮指定 Edge 文件没有覆盖该整组 UI。 | 不增写为 Edge 全验收或竞品等价。 |
| 第121–130行 | 手动旋转与重新识别分开；按页切换差异说明正确。附图是旧真实操作图。 | 可保留为旧图，避免称新 Edge 验收。 |
| 第132–141行 | 明确隐藏数据仍会输出；区分隐藏与折叠；恢复后待审核；拒绝把拖框的自动实体当人工新增。接口、codec 证据与说明一致，Edge 截图/日志缺。 | 保留 Edge 待运行；补隐藏前、隐藏后刷新、恢复后 pending 状态和 trace。 |
| 第143–189行 | 浏览器分页与桌面 Word 差异明确；旧继承记录图只显示历史审查记录。当前 source-review spec 无 Edge 日志。 | 保留非像素等价说明；若宣称当前来源 UI 已验收，补当前 spec Edge log。 |
| 第191–210行 | Word 图片资源区与源 Electron 内联 UI、PDF 按页与源连续滚动差异准确；Face/Signature/Stamp 指标与链接原报告相同，黑白商用章质量及竞品等价没有被宣称。 | 保留限制；特别保留印章“仍不足以宣称实用自动识别完成”。 |

### 已有指南图

| 文件 | SHA-256 | 审查用途 |
|---|---|---|
| `截图-20261015/页面文字选取与区域调整.png` | `c595f75e21fa5b150d728dbbc86526e65e103b5a7ebc8e0b00c6b41f5e8aaddf` | 旧选字/区域/查找示例；不是两个同文项勾选与自动 FN 图。 |
| `截图-20261015/页面旋转与复核.png` | `01ace3b94c23c8d14a5fd214bae9149c4cfbf6b70721fb7a5a448170c5f2c702` | 旧 PDF 旋转/复核操作图。 |
| `截图-20261015/继承审查记录.png` | `746392049d85054183b0478f8303f19af0e4428493e60cee15c907a940635933` | 旧继承审查 UI 图；不证明当前 source-review spec Edge 通过。 |

## Edge 证据及缺口

| E2E 文件 | 最新可见日志 | 结果与时效 |
|---|---|---|
| `page-selection-edit.spec.ts` | `iteration034/edge-page-selection-fifth.log`, SHA `f87a03a9ad93ee598048c4520b439bbbca6ef6e00d53f7cd5c6cd43fe4dc68e0` | `1 passed (20.0s)`；合成 PNG 页面选字、加入标记、图像搜索范围/保存断言。日志 12:47:28，当前 spec 于 14:52:38 修改且新增 ignore 后重加断言。只算历史版本 PASS。 |
| `manual-occurrences-geometry.spec.ts` | `iteration035/edge-manual-geometry-second.log`, SHA `737021d205d2e3882582233912ed8006f0d3f9ce40f42ef500b70d242bae68f8` | `2 passed (5.9m)`；合成 DOCX 两个 CLIENT A 匹配与几何测试。早先 first log SHA `757145…` 的一次失败也保留。PASS 日志 13:47:44，当前 spec 于 14:40:50 修改；当前树没有绑定日志的源 hash。 |
| `type-hide-persistence.spec.ts` | 未找到对应 Edge 日志 | 接口、codec/单测和静态报告不能证明 Edge 刷新、重开、恢复。 |
| `source-review.spec.ts` | 未找到对应 Edge 日志 | 当前 spec 只有代码，不记 browser PASS。 |
| `entity-corrections.spec.ts` | 未找到对应 Edge 日志 | API/integration 与截图另算，未找到此 E2E 的 Edge 运行结果。 |

两份旧 PASS 日志都没有显式保留 shell 自然退出码或测试源码 SHA；本报告不填造。`edge-word-manual-1792042962419.png`（SHA `c62c50653ae2312e520a8f1b2abc97b8bf7426351d99ee1666f12476d6594d74`）和 `edge-entity-geometry-1792042976956.png`（SHA `2424bbff71a60ed1472678576071ac90929dd8aa56fc5f90b6fe572550aef279`）都是保存后的页面视图，没有保存前画布手柄或同文勾选界面。当前目录未找到 `edge-word-manual-results-*.png`。

## 静态 ID 筛选与去重

C 报告 `source-finite-closure-C-20261015.json` 的 `delegatedRows=62`，明确 `all258Complete=false`、`allNativeEquivalent=false`。本轮筛出的直接 UI/文档关联 ID：

- A 已接管的两个 exact UI：`UI-ad41d13c4a2d`、`UI-2c1712d35460`。A 的 `renderer-finite-static-closure-20261015.json` 只建议这两个具体 UI ID 为 S3 candidate，parent review required，source runtime 仍 R0。新指南和 Edge 日志没有反驳其静态图的证据；也没有因此证明源运行/模型等价。
- A 已列剩余源节点的 `UI-3f01047e6b59`、`UI-32ce2fb60c5f`、`UI-339d8e53408d`、`UI-67e30cf66ad0`。它们仍按 `source-static-remaining-by-visual-20261015` 与各自精确格式报告保留未闭边界，不重复记成新缺陷或新闭合。
- 图像查找与导出通道 `IPC-4dd20e80cae3`、`IPC-ba07bb14e3df`、`IPC-910347ed48b5`、`IPC-d3864dc80560`、`IPC-5569a4344615` 在 `visual-interface-closure-20261015.json` 已有源范围/我方实际 API 分层；沿用该证据，不将 API pass 记成竞品运行或额外 S3。
- `IPC-a982d6d137ce` 只复用 `pdfjs-worker-resource-static-by-visual-20261015.json` 既有 10 节点闭包：`main.js:26323, 26715–26740`、preload invoke `311–315`、renderer 两处 setup/lifecycle `25823–25853` 和 `34691–34704`。叶节点是外部 PDF.js worker/环境；不扩大成全 PDF 处理业务图。

未新增视觉 ID、未提升 62 或 258 个 ID、未改 ledger。每个已认领 ID 的 source/caller/consumer/外部 leaf 及精确 hash 详见同名 JSON 的 `sourceStaticIdScreen.visualDirectCandidates`；本轮未新读并未闭合新的源节点。

## 来源差异和指标

- 竞品 Word 图片交互来自公开 Electron renderer；我方网页把图片作为“内嵌图片资源”切换，不主张相同 DOM 手势或相同图像资源呈现。
- 源 PDF 有 PDF.js worker 和滚动/视窗生命周期；我方指南选择按页切换。它说明了业务可达性与 UI 呈现差异，不是像素等价。
- Face 5749 张的 IoU 0.5 指标、1 张原尺寸拒绝；Signature 官方 validation 35 张默认模型+NMS；Stamp 786/1315 与低召回指标，均与对应评估 MD 相同。印章上游逐图授权、训练重叠、商用黑白章分层未核；这些结果不能用来对标竞品质量。

## 只读边界

未运行 Edge、API、模型或竞品；未制作截图；未改指南、ledger、产品或部署。所有旧日志和图仅按其各自原始路径与 SHA 引用。机器清单、指南位置、证据层级及准确限制见本目录同名 JSON。
