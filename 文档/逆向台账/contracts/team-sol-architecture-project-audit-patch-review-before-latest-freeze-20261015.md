# iteration039 项目查漏暂存补丁：独立只读审查

审查对象为 `.data/research/lawbot-2026-10-15/iteration039/staged/` 内**当前最终替换文件**，未应用产品、未运行测试。对照现有 `project-entity-corrections`、`review-tools`、`review-entity-slots`、`reference-review-feedback`、`automatic-runtime-rules`、`saveReview` 与 `projectScope`。以下行号均指 staged 文件，除非另有注明。

## 可证缺陷

1. **批量按钮承诺补录视觉未覆盖行，但 `apply` 不处理这些行。** `apps/api/project-entities.ts:116–118` 将 `auditVisualOccurrences` 的 OCR/PDF 图片 `uncovered` 纳入返回；`:148` 批量仍只写 `check.additions`。`apps/web/project-entities.tsx:14` 只要任一 `occurrences.uncovered` 就启用“补录全部未标记位置”；`:12` 调用 `apply` 后即显示“已补录待确认标记”。反例：DOCX 图片 OCR 命中经纠正的语义值，规范文本中无该值，故 `check.additions=[]`、视觉 `occurrences` 有 `uncovered`；点击按钮没有写入该标记却报告已补录。若同时有正文缺口，则仅补正文而视觉缺口仍在。应让批量动作覆盖同一审计结果中的可写视觉行，或将按钮和回执限定为正文批量，并明确视觉行须逐项处理；相应 API/Edge 测试需实际读回每类行。

2. **部分交叠的人工保留被误报为整处已保留。** `apps/api/project-entities.ts:43–46` 的 `retained` 只检查任意 `ignore` 标记与命中交叠，并优先于 `overlap`；`:86–87` 的视觉分支同样用任意已删除实体的范围交叠。反例：种子“甲乙”命中 `[0,2)`，用户仅对“甲” `[0,1)` 标 `ignore`，剩余“乙”未审；预览把整处“甲乙”列成 `retained`，而现有 `packages/core/review-tools.ts:59–63` 对这种部分覆盖列 `conflict`。这会使未覆盖部分从“待补录／冲突”统计中消失。应要求完整覆盖或将部分交叠列为 `conflict`；OCR 几何分支亦需按同页/同对象可靠位置，而非单纯范围相交判定整处保留。

3. **纯文本的“打开并定位”只打开窗口，没有定位选择。** `apps/web/project-entities.tsx:14` 把点击传给 `onOpen`；`apps/web/main.tsx:374–386` 只用 `focus.start-256` 分页加载并设置 `docxFocus`。现有 `docxFocus` 被 PageEditor 与 Word 版式消费；原文 textarea 的选择发生在 `loadText(..., mark)`（现有 `main.tsx:459–471`），新 `openDoc` 从未调用。反例：Markdown 或 Word “对象原文”里的命中在长文本中间，点击后会显示含该处的 512 字窗口，但光标和选中区仍为空，用户无法知道具体命中是哪几个字。暂存 `tests/project-entities.spec.ts:11` 只断言 textarea 包含“合成甲”，没有断言选择区或滚动位置。应在打开后对原文定位调用现有选择路径，并为分页与多次命中验证确切 offset。

## 已核对且当前无具体缺陷

- `projectScope` 的项目行锁和权限检查、全项目 revision CAS（`apps/api/project-entities.ts:98–106,143–158`）可阻止跨项目行注入和旧快照逐项写入；不能把这等同于已运行跨租户对抗测试。
- 逐项替换沿用 `addReviewEntityHints` 的原数组顺序，移除位置与 `otherIndex` 对齐；新标记不携带旧 opaque ID，`saveReview` 会重建出生与原审批状态，新增为 `pending`。`prepareActionFeedback` 通过共用的 provenance、语义纠正和 `referenceFeedbackKey` 做 FN/FP 生成；本路由不移除 `ignore`/隐藏标记，单纯保留或隐藏不会因本操作记 FP。对真正删掉的异类标记，既有 `single-delete` 会记 FP，这是该明确删除动作的既有合同。
- 临时规则只由 `audit-add` 的新增项产生且 `scope:'file'`，`queueAutomaticRuntimeRules` 还要求同用户、同项目、同文件、同 revision 的运行中授权 detect 窗口。普通 review 状态无此窗口时回执为 0；这不是持久白名单或重新识别。
- OCR 几何仅从已认证原件、预览和 OCR map 读取，不采用调用者坐标；PDF/图片 `>0.4` overlap 与同页 occurrence fallback 属源 `Tf2` 的**启发式**边界，不是精确覆盖证明。暂存 README 已明确缺 page map 的 PDF native 与 DOCX 图片覆盖限制。

## 合并前仍需验证

暂存 `tests/project-search.integration.ts:7–20` 仅合成纯文本、同跨度异类、CAS、反馈；Edge `tests/project-entities.spec.ts:5–12` 仅查一处正文命中。没有执行结果，也没有覆盖视觉 `>0.4`/fallback、同页相邻框、语义纠正值与 canonical 值分离、部分保留、视觉批量动作、位置选择、跨租户 ACL 撤权、重复 opaque ID 或反馈回滚。对这些边界应补有针对性的隔离测试和真实文档只读/写入回执，再运行根统一门禁。未发现本暂存补丁新增的确定锁顺序反转；几何扫描在全项目行锁内，规模与超时仍需实测。
