# 文件／视觉作者对 OCR、映射及多产物链的只读交叉审查

## 范围与证据

读取 `adapters/ocr-correction.ts`、`core/ocr-correction.ts`、`adapters/reference-spatial.ts`、`adapters/visual-replacement.ts`、`core/visual-replacement.ts`、`adapters/profile-export.ts`、`core/profile-export.ts`、初版 `/documents/:id/restore` 要求任意 `【...】` 都在映射表，合法正文标签被误判。根作者现已复用共享 `inspectRestorationTokens`，普通标签保留，未知序号假名／破损 token 仍拒绝。

独立复跑：`公开【重要】 与【姓名001】` 正确得到 `公开【重要】 与合成甲`；`【姓名999】` 仍 `UNKNOWN_ALIAS`。证据：`.data/research/lawbot-2026-10-14/iteration022/root-restore-tag-independent-probe.log`。本审查者未修改共享映射/Bend 门。

## 其他已核事项

- OCR 纠正 map 原 hash、正文 hash、canonical glyph 完整范围与当前 revision 绑定；source preview不修改；全部候选需重新复核。
- Raster 多产物正文沿公共 visualReplacementPlan：人工区域接触的 glyph 不进入 MD，只有实际栅格绘制的 replacement label 输出；MD 对普通解析文本转义，UTF16/codepoint不拆代理对。
- 原生 DOCX 附加 MD 从已校验的处理副本取得；PDF→DOCX 是已脱敏栅格数据，不直接复制原 PDF 隐藏对象。
- Immutable alias 按 mappingId/token/version/kind/value 验证，payload 用当前 tenant/project/mapping/version AAD 解封。当前 namespace 为同项目业务规则，不能把它当 tenant 权限隔离之外的额外安全边界。
- 未发现其他具备足够复现证据的新缺陷；这一结论仅限上述读取及独立探针，不是完整竞品授权运行验收。
