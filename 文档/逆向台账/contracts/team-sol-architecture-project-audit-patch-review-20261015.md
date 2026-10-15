# iteration039 项目查漏暂存补丁：最终冻结版只读复核

审查对象为 `.data/research/lawbot-2026-10-15/iteration039/staged/` 最新最终文件；API SHA-256 `5a85aa8d9aacd24749ec57b67298adc8937079f9f118b984e8b2bd2ed5dda8b4`，几何测试 SHA-256 `0b4f9f9ea07c64cadcdf568e344674d804839b09494d3d0e1e0f3f4094288fe6`，批量 adapter SHA-256 `8142069c928b3118d23c35479e1cea0abd3435863701b1f4bc9482a6c4519137`。前两版报告原字节分别保存在 `team-sol-architecture-project-audit-patch-review-before-latest-freeze-20261015.md` 和 `team-sol-architecture-project-audit-patch-review-before-geometry-20261015.md`。

## 结论

**No findings（本轮只读静态复核）。** 先前报告的四项代码缺陷均有针对性修正；未在当前最终文件中找到新的可证反例。补丁仍未应用产品，暂存 API/Edge/几何测试未执行，故此结论不代表运行验收。

## 逐项核对

- **页面几何与 opaque ID。** 暂存 `apps/api/project-entities.ts:202–208` 从认证的 `readReviewProvenance` 为旧 marks 加 ID，仅过滤 `otherIndex`，再以原 `openPageReview` 调用 `pruneEntityGeometryRegions`。现有 `packages/contracts/entity-geometry.ts:19` 用旧、新 ID 与原 span/type 判断绑定是否保留；被删目标的 ID 不在 next，只有其绑定区域被移除。其余区域及 ID 留下，由 `saveReview`→`validateEntityGeometryPolicy` 按实际 after link 复核源/preview/map/token/bboxes，并重封新 revision。既有非实体区域不受 prune 影响；原审批仍随保留的 marks 保存，新实体为 pending。该清理在同一项目事务内进行，失败时 marks、pageReview、反馈和规则投递一并回滚。
- **几何回归测试边界。** 新 `tests/project-audit-geometry.integration.ts:18–116` 构造两页真实 PDF、两条不同 opaque ID 的已调整几何，逐项替换第一页，断言仅第一页绑定移除、第二页 ID/region/bboxes/redact 保留、原件字节/hash 不变、FN/FP 各一；pending 导出实际预期 HTTP 400 `INVALID_MARKS`，确认后请求导出并下载 PDF。测试用 ID 查找保留区域，未依赖数组顺序。它尚未运行，且不能代替更多格式与异常回滚验证。
- **上版三项。** `bulkAuditAdditions` 合并旧 `check.additions` 与视觉 `uncovered`，预览和 apply 使用同一候选并返回实际写入数；部分 `ignore` 仅完整覆盖才列 `retained`，交叠列 `conflict`；文本定位在分页加载后设置 textarea 选择，Word 非页面区域进入文本视图。暂存测试已有纯文本 partial ignore 与第 600 字定位断言；视觉批量和几何 fallback 的实际测试仍缺。
- **源比较与批量 I/O。** `sourceAuditContains` 保持 Xf 的大小写敏感和无 NFKC，最终 same 分类才按 iv 小写比较；PDF/图片 `>0.4` overlap 与 occurrence fallback 如实保留启发式边界。 `correctionDocumentFactsMany` 每次调用只读取一次认证原件与每页 preview/map、每 request 独立生成 facts，单请求包装保持既有项目纠正接口；没有跨请求 cache。其计数测试是一页三 query 的函数内计数断言，未独立 spy 底层 I/O，也未实测 PDF 多页与失败/skip 等价性。
- **权限、反馈与临时规则。** POST `projectScope` 先取项目锁并检查 `view_original+review`，再做全项目文档 revision CAS；逐项 target 重新扫描并绑定 hitId。正式 feedback helper 的 provenance、semantic/canonical、dedup 路径保留；异类明确移除产生既有 single-delete FP，新 pending 产生 audit-add FN，纯保留/隐藏无本路由删除动作。自动规则只从新增项生成且为 file scope，生产投递仍要求当前运行中、同 owner/项目/文件/revision 且已授权的 detect 窗口；无新公网或持久规则写入。

## 仍需实际门禁

根应用暂存补丁后应运行隔离 API、Edge、全量 check；尤其确认双页几何测试、视觉 OCR 批量补录及 >0.4/fallback、跨租户/撤权和异常事务回滚。PDF native 缺可信 page map、DOCX 图片缺 OCR map 时，报告的 geometrySkipped 仍表示覆盖不完整。
