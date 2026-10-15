# Luna 2：视觉数据链独立静态审查（2026-10-15）

## 范围与结论

只读复查了指定的源 UI producer、隐藏/纠错语义、页几何、原始来源、草稿保存与页面导出。源 `renderer.js` SHA-256 为 `4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc`（2,771,447 bytes），与现有静态报告一致。竞品运行仍为 R0。产品代码和 `ledger.json` 均未修改；没有启动服务、浏览器或 Edge。

没有发现可独立确证的新产品缺陷。已观察到页面文字手工新增的 `onMarksChange → changeMarks(..., "manual-add")` 与 root 正在修正的 producer/重复项链相同，因此列为已知待验证事项，不另立新发现。它允许对旧 ignore 范围重新添加 pending 项；反馈 API 在统计 FN 时以同 family/span 去重。

## 源节点与 UI producer

以下精确片段 hash 与 `visual-finite-source-chains-20261015.json` 对齐；未新增 ID，也未扩大闭包声明。

| 节点 | 精确源范围与片段 SHA-256 | 静态结论 |
|---|---|---|
| PDF `er2/tr2` | 23439–23448；`d12def03dbac32e8cf7c9c3b15a761f99cc5edb30daa3c2a501695d6483fee73` | `er2` 从 `meta.bboxes`、`_splitBboxes`、`meta.bbox` 中按页取框；`tr2` 以 0.01 容差匹配，否则取首框。这是几何读取器，不是删除状态生产器。|
| PDF `Po2` | 24330–24366；`3735460f0774787a0114da4d0e51d23922178938d1011ccab94c40dedf15a57c` | 列表按删除/抑制、类型、查询、分数筛选；保留原始索引并计算全部显示框。|
| Image `Si2/Ci2` | 27304–27348；`ee10481c965e22d772d39b98b7eb3f391f7625ebc4ac5e9459cf90e191250f83` | 删除键盘和单项删除走普通拒绝语义；这个 Image 节点本身不证明跨格式持久化 type-hide。|
| Word `gn2` | 6536–6570；`d3d7b77b0580e40a91c1dfe5359da5a78cb90f165185ff2e4cff911bf116b368` | 手工全文补录对活跃同范围去重；图片 OCR 以路径/行/序号去重；只对实际新增项记 FN。|
| Word `Ql2/eu2/tu2` | 9621–9690；`ea4ffd3fccd63579cb485369c4a994bcb5ab1d86f95096657ea4ad8b8c309617`（Ql2）；`e41b7bdaae32ce4feee29011ca52e92438171126d0bb7f62921ce048c465bddd`（eu2/tu2） | type-hide 禁止反馈与 FP 计数；普通组/多选删除聚合 FP；删除用户新增项会相应扣减 FN。|
| shared `xc/_c/Sc` | 4270–4288；现有 finite chain 行 4270–4288 hash `11f2b1dd33563d0b1ee3ad8c5e118c273c8ffe76e626c87e4c6d6ab82e799fcd` | type-hide 是 `deleted` tombstone 加 `hiddenByType`，保存用户新增来源，再恢复成 user-added 或 pending；语义不是临时展示过滤。|
| 父 `Mm2` | 34026–34068；`47559ffa51c8d9f95ead5ca3fda9aad82cc5252d7d24b75a63caf3e72eb1d5e9` | 按格式读取子编辑器 draft 并形成 workspace reviewDraft；PDF/Image 保存实体/页面状态，Word/Markdown 读取 review draft。|
| 四格式 apply | 34411–34592；`632e9a9cf49bd81b871b0ad9998abd9a7b40f315dcf0e1df577f7f92748630b6` | 父协调器分别把 draft 应用到 Word、Markdown、PDF、Image 编辑器；属于当前 UI 会话同步。|

## 本地链条核对

1. 页面文字选择位于 [page-review.tsx](/Users/admin/FDE/脱敏工具/脱敏汪/apps/web/page-review.tsx)：选中文字映射回当前页 anchor 的 canonical offsets，产生 pending mark 和文字预览。父组件 [main.tsx](/Users/admin/FDE/脱敏工具/脱敏汪/apps/web/main.tsx) 将它标为 `manual-add`，再进入 dirty review 状态及反馈/自动规则 dispatcher。
2. 页实体几何由 [entity-geometry.tsx](/Users/admin/FDE/脱敏工具/脱敏汪/apps/web/entity-geometry.tsx) 请求服务端签发的 opaque descriptor。拖动和八手柄编辑单框或多框合并边界；每次变更写入 PageReview，等待普通复核保存。
3. [reviews.ts](/Users/admin/FDE/脱敏工具/脱敏汪/apps/api/reviews.ts) 在保存时将客户端 marks 匹配回可信 provenance，验证几何 token 的实体身份、页、revision、map/preview/base hash 和范围；写 marks、PageReview、历史快照及审计事件。`entity-geometry.ts` API 只在当前 review 状态和 revision 匹配时签发描述符。
4. [page-export.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/adapters/page-export.ts) 验证最终 page review、marks、glyph map 与 preview hash，然后 `verifiedDocumentSource` 校验来源，按 redact marks 生成几何并栅格化；输出还经过 OCR 残留检查和 PDF 重开像素/元数据检查。[page-redaction.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/core/page-redaction.ts) 对自定义框实施页边界检查。
5. Markdown 原文浏览由 [source-review.ts](/Users/admin/FDE/脱敏工具/脱敏汪/apps/api/source-review.ts) 提供：`projectScope` 要求 `view_original`，校验 revision、canonical hash 和 sidecar；前端原文 UI 从 sourceMap 定位候选。复核来源接口也按项目权限、revision、文档 ID 返回本地/继承历史，其中继承数据显式标注非当前权威。导出另要求 `export` 权限。
6. 纠正文保留 canonical text 与 `recognizedText/correctedText` 两套值。纠正可改变语义呈现和导出替换输入，不通过 correction helper 覆盖 canonical 原文；现有报告记录合成图片 API 对原始字节的 hash 未变。

## 反例审查与状态

| 反例 | 静态结果 | 验证状态 |
|---|---|---|
| 旋转后旧 bbox | 旋转处理重建页 map；复核几何绑定 page map、preview 与 base geometry hash，旧 override 在不匹配时拒绝。| 未运行浏览器。|
| 跨页同文、多框 | 源按 `pageNumber` 过滤；本地 override 保留 box 数组并绑定页。| 未运行浏览器。|
| 八手柄越出敏感字/页 | UI 拒绝越界；保存与导出再次检查所有框落在页面内。敏感字覆盖率取决于用户编辑，只有 OCR 残留检查提供最终拒绝门。| 未运行视觉断言。|
| type-hide 保存/重开/恢复 | 源 tombstone、codec 和本地 ignore 状态语义相符；反馈 builder 对 `type-hide` 返回零记录、零 FP/FN。| 既有 API/unit/codec 记录已读；本次不重跑，Edge 未运行。|
| 保留原值、手工补漏 | type-hide 无 FP；手工新增只对新增跨度记 FN；普通 ignore 不是 type-hide。| 既有 API 证据已读，未本次运行。|
| 纠正文双值和原件 | correction frame 保留识别值、纠正值及类型；canonical 内容/hash 独立。| 既有 synthetic integration 记录；竞品未运行。|
| 无原文权限/跨租户/导出 | 原文端点要求 `view_original` 与项目 scope；导出要求 export scope 且验证来源。| 没有执行权限拒绝请求。|
| 篡改/旧几何 | token 绑定租户、项目、文档和来源/内容/页/实体几何哈希；越界或 stale geometry 拒绝。| 静态检查。|

## 已知待办和边界

- 页面文字手工新增 producer 链正由 root 修正；在完整 Edge trace 到齐前不将预期写成 PASS。
- 本次仅静态审查本地实现和公开 renderer 源。竞品许可证处理与运行维持 R0。
- 本次未运行 API、数据库、Edge、重模型或导出样本；所有本地链结论都是代码静态证据。
- 父 `Mm2` 与 34411–34592 是委托要求的宽范围；详细节点 hash 应使用已有有限链报告的精确子节点，不能把范围整体说成新闭合。


## 补充：已保存实体几何 + type-hide 组合（root follow-up）

**静态追踪结果：隐藏时旧 override 不会作为普通区域遮盖 PDF 或 Word 图片；恢复后仍绑定相同实体，并在下一次复核保存时重签。** 这是代码静态结论，本次没有运行相应组合测试。

- [entity-geometry.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/contracts/entity-geometry.ts:19) 的 `pruneEntityGeometryRegions` 仅在 reviewEntityId、范围或类型身份变化时移除 region。只切 `hiddenByType`/`decision` 会保留 region，符合恢复草稿语义。
- [page-redaction.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/core/page-redaction.ts:29) 将带 `entityGeometryOverride` 的 region 从普通区域列表排除；只在 `decision === "redact"` 分支消费 override。隐藏 mark 为 ignore，不会用旧 override 清像素。
- [entity-geometry.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/adapters/entity-geometry.ts:35) 仍认证保留的 override，并将其放入 markIndex map；ignore mark 不消费该条目。stale geometry 会 fail closed。
- [visual-replacement.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/core/visual-replacement.ts:36) 复用 `pageBoxes`，其 `finalClear` 只纳入非 geometry region。[office-images.ts](/Users/admin/FDE/脱敏工具/脱敏汪/packages/adapters/office-images.ts:28) 的 Word 图片输出经同一 `renderDocumentVisualPage` 路径。
- restore 会清除隐藏标志并置 pending，保留 birth。相同 reviewEntityId、范围和身份保留 binding；后续复核保存会校验实体链接并重签 token 到目标 revision。再次明确选择 redact 后才会消费该几何。

### 现有测试覆盖边界

`tests/entity-geometry.test.ts` 第 4–8 行（SHA-256 `b5683bcadc34d2a331ffbec9a46fa12a1f3ce2e615656cbc3b66d164135f8509`）分别测删除/改身份时 prune 和 hidden descriptor UI 过滤，没有测 region 在 hide/restore 中的保存导出。`tests/entity-geometry.integration.ts` 第 7 行覆盖可见 redact mark 的错位几何与导出残留拒绝；`tests/review-type-hide.integration.ts` 第 4 行覆盖 Word 隐藏/导出/恢复但没有图片几何；`tests/e2e/type-hide-persistence.spec.ts` 第 14–17 行也没有创建 override。此组合仍是回归测试覆盖缺口。

最小组合回归：自有合成 DOCX 含内嵌 OCR 图片和敏感实体；保存扩展 bbox，隐藏类型并保存/重开，确认隐藏期间原图像素保留；恢复并保存，确认 pending、binding 保留且 token revision 更新；再次显式 redact 后，确认预览/导出应用调整后的框。
