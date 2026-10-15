# 规则／业务接口小队交叉汇总（2026-10-15）

## 结论

- 对 60 个命名云端适配 I4 候选、6 个保守 I1、037 自动运行规则 producer 与 35 个处理稳定 ID 的有限公开链完成本轮审查。竞品 0.5.9 无许可证，所有竞品运行仍为 R0；本报告不升级台账状态。
- 发现两类真实公开分支遗漏并已分工修复：`ruleset:update` 等命名对象的合法扩展键/源归一输入；页面 OCR 手工补录没有通知活跃识别任务。前者由规则子代理修复并通过独占隔离 API 4/4，后者由 root 修复 `PageEditor` 回调和同位置隐藏/忽略处理；root 的 Edge/API 与新冻结全量门禁仍另行记录。
- 037 运行窗口本身的 AEAD、owner、generation、序号、最终 drain 和 pending 语义已按 A/B 现有真实回执及本轮只读源码核对，未再发现可复现问题。源活跃 engine 即时追加、我方最终 canonical 取窗的时点差异继续声明为适配边界，不能说时序完全等价。
- `profile` 的源 TI 会移除 `signature`，我方已交付可选签名自动识别依赖该字段。云端 profile create/update 使用内部 `preserveNativeSignature:true` 保留用户显式选择；默认源对照函数仍执行 TI。合成 PNG 经真实 worker 的 `documents.recognition.visual.pages[].detectors` 包含 `signature`，证明该自有能力未被对标归一悄悄删除。此字段是我方扩展，不能声称源等价。

## 本轮确证与修复

|范围|发现时反例|当前处理与证据|
|---|---|---|
|`IPC-9a6a89a8fb10`，连带 `ruleset:get/list`|源 `Bd.update` clone 整份 RuleSet，`Rd/Cd`不拒额外字段；我方 RuleSet/entry `.strict()` 导致合法 PUT 400，已有扩展 payload 也会读失败。源 `validateRuleSet` 整体覆盖 applicability；我方原先保留其 extra 后在嵌套 strict 拒绝。|RuleSet 本体和 entry 限定 `.passthrough()`；applicability 按源整体重建。外层 PUT/POST wrapper 继续 strict。独占 API 验证 PUT→GET→duplicate→project snapshot→worker末项 pending+trace→native codec，Excel仍投影既有列。|
|`profile:create/update`|源完整 JSON clone/存储可保留 root、docx/markdown/pdf/image/batch、两个 batch 子对象和标准 template 的合法扩展键；我方各层 strict 会拒绝。源 `kI/PI/TI` 的默认/旧版归一另有可复现差异。|只对源原样保存的节点透传；`pseudonymTypeActions`仍按源拒绝未知键；缺失 markdown、batch markdown mode、actions 和 legacy party_slots/default_pseudonym按源归一。写入前 certNoPreferenceRecorded=true 与旧存储 readUser 的 cert_no迁移区分。独占 API + 源 helper VM 核验；不赋 extra 任何审批、权限或来源身份效力。|
|`IPC-0ea3b09c375b` 页面 OCR producer|源 `renderer.js:26603–26623` 人工 OCR 框补录后发送临时 whitelist；我方原 `PageEditor onMarksChange` 只更新本地 marks，项目其他活跃 detect job 收不到。|root 已将回调接 `changeMarks(next,"manual-add")`，同位置重复判断排除 ignore/hidden 旧槽并保留新 pending；修后实际 API/Edge 状态由 root 验收。|

## 证据范围与剩余门禁

- 命名输入报告：`team-luna-named-input-review-20261015.md`；最终产品文件 hash：`packages/contracts/presets.ts` `b96205488e580d937bd151f6f876963a161655068a5f87cdcb024bf88411f917`，`packages/core/presets.ts` `ea28f23c0745e1cd58bcc6ea0c5a864272b82fc612016a882e3426f5c9095757`，`apps/api/presets.ts` `3820fe5c6fa2ea215a33867a6310d3a00611da9a54bdca4d5c580a4cc83e7bae`。`tests/ruleset-entry-extension.integration.ts` hash `f977cfcc64f47946665d504e1c8474a43f3ce7fa25831ec502b2a5100a30ee7b`；Node 24 独占隔离结果 4 pass / 0 fail / 0 skip。源 helper VM 与精确 OI/Bd 静态写回链、我方真实 API 是不同证据类型；未运行竞品 create/update 磁盘全类 VM 或许可产品。
- 037 只读报告：`team-luna-runtime037-review-20261015.md`；A 原 3 API / 10.910 秒、4 单元，B 实际 worker 1 项 / 3.562 秒。后续 OCR producer 反例已追加限定，不能沿用其初版“无新漏迁移”作为整体结论。
- 35 ID 有限图：`team-sol-processing35-review-20261015.md`；A 的 22 段 fresh range hash复算 22/22；eg2、Dm2/Om2、xy2 与 ITER019/031/035/036 和 037 preload/detect-only 生命周期已重联。未把公开 DOCX fork CpyDD6WX、PDF/font/canvas/ONNX/Office 库误称私有，亦未无限递归第三方库。`team-sol-rules-cross-review-20261015.md` 为修中代码的先前交叉复核，最终签名扩展以本报告及命名子最终报告为准。
- 60 I4 仍只是各自声明云端适配的候选，6 个原生/会话项继续 I1；两个 UI S3 候选与 35 ID 不顺带升级。取消路径无独立并发取消实测，源/云时序及第三方叶子保留边界。新共同快照的 `pnpm check`、全量隔离 API、Edge、ledger合并、发布/线上验收由 root 门禁，不以本轮独占测试替代。
