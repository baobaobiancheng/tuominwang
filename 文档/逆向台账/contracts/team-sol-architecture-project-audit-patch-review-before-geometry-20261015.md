# iteration039 项目查漏暂存补丁：最新冻结版只读复核

审查对象为 `.data/research/lawbot-2026-10-15/iteration039/staged/` 当前最终文件；`README.md` SHA-256 `c75c6bf8e576afb32401ff14010957c20abe5e9d1c168edf7fff1d441756d7f6`，API `4ff58f54b70d6267be688a4a9be387e06bff2bf4de4e4a769ffe8e3b88edeb99`，adapter `8142069c928b3118d23c35479e1cea0abd3435863701b1f4bc9482a6c4519137`。上版报告原字节保存在 `team-sol-architecture-project-audit-patch-review-before-latest-freeze-20261015.md`。未应用产品或运行测试。

## 当前可证缺陷

**逐项异类替换遇到原标记已调整页面几何时会在保存阶段失败。** 暂存 `apps/api/project-entities.ts:200–203` 移除 `otherIndex` 原标记并加入新 pending 标记，直接调用 `saveReview`，未像现有 Web 编辑路径那样清除与被删原标记绑定的 `pageReview` 几何区域。现有 `apps/api/reviews.ts:27` 默认继续传入 `oldPagePolicy`；`packages/adapters/entity-geometry.ts:31` 对每个已有 geometry binding 要求原 opaque ID 在新标记数组仍有 `byBefore` 链接，否则抛 `ENTITY_GEOMETRY_INVALID`。反例：PDF/图片的异类标记已人工调整遮盖框并保存；项目查漏将同位置判为 `other`，用户确认“移除异类并补录”，API 进入保存却因旧区域仍指向被删除 ID 而回滚。应在同一事务中按被删除的 opaque ID 精确修剪关联几何区域，再调用 `saveReview`；保留其余实体区域与原审批，不以清空整页代替。需要实际 PDF/图片 API 回归，断言新 pending、旧 ID 退休、旧绑定移除、邻近区域与原审批保留及反馈无部分落盘。

## 上版三项复核

1. **视觉批量写入／回执：已修。** `project-entities.ts:131–142` 将旧 `check.additions` 与 `occurrences.uncovered` 合并并按位置/类型去重；`:171–181` 用这组 additions 保存并返回实际 `appliedAdditions`；Web `project-entities.tsx:12,14` 用 `bulkAdditions` 启用按钮、按服务端实际数提示。候选与写入在同一事务，失败不会成功回执。仍缺真实视觉文档的批量 API 测试，不能仅凭代码称已验收。
2. **部分保留：已修。** 文本 `project-entities.ts:45–48` 和视觉 `:94–96` 均只将完整覆盖列为 `retained`，部分交叠列 `conflict`；暂存 API 测试已加入纯文本部分交叠，视觉几何部分交叠尚未实测。
3. **文本定位：已修代码路径。** `apps/web/main.tsx:305–319,386–401` 在分页文档加载后通过原文 textarea 设置确切选择范围；Word 非页面区域切到文本视图。Edge 暂存断言第 600 字跨度；测试尚未运行。

## 新批量 facts 语义与边界

- `packages/adapters/project-entity-corrections.ts:14–38` 在一次调用中只准备一个已认证的原件、preview/map 和 PDF 句柄；每个 request 分配独立 `CorrectionDocument`、entity/hit/skip 数组，且 `correctionDocumentFacts(raw, request)` 包装单元素批量，保留现有项目纠正入口语义。没有跨请求缓存。API `project-entities.ts:63–72` 按 seed 原次序一一对应 facts；失败转为此材料的 `SOURCE_GEOMETRY_UNAVAILABLE` 跳过，不宣称几何全覆盖。
- `sourceAuditContains` 保持 Xf 的大小写敏感、无 NFKC 查找；`sourceAuditSameValue` 在最终 same 分类才做小写比较。PDF/图片同页重叠阈值 `>0.4`、缺几何候选的 occurrence fallback 仍是公开源的启发式，不是像素级证明。PDF native 缺可信 page map、DOCX 图片缺 OCR map 的覆盖限制继续保留。
- `tests/project-audit-batch-facts.test.ts:8–19` 构造一页三 query，检查返回 hits 和函数内部 `sourceValidations/previewValidations/mapValidations` 计数各一次。它证明该批量函数的单次准备路径；计数由被测函数自增，未独立 spy 底层 I/O，也未验证 PDF 多页、异常/skip 等价性。根完整 API/Edge 门禁仍待执行。
- `projectScope` 对 POST 先锁项目再进入 `snapshot`；全项目 revision CAS 和 owner/权限检查仍在。反馈和 file-only 临时规则沿用正式的 provenance、semantic、dedup 和当前授权窗口路径；本轮未发现新的跨租户或锁顺序反转。

结论：上版三项在最新冻结代码中已修。**合并前还需处理上述已有页面几何绑定的逐项替换失败**，并完成针对性实际测试；暂存代码尚未应用产品。
