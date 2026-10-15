# 视觉组交叉复核与交接（2026-10-15）

本组 3 名指定 Luna 均完成只读审查：`team-sol-visual-luna1-20261015.{md,json}`（Word/PDF 源 UI 与本地入口）、`team-sol-visual-luna2-20261015.{md,json}`（几何、隐藏、纠错、原件与导出数据链）、`team-sol-visual-luna3-20261015.{md,json}`（指南、截图与视觉 ID）。我复读三份报告，三个 JSON 均可解析；独立重算 Luna1 的 10 个源范围与整文件 SHA，全部一致。工作树未重置；本组未编辑产品、台账或部署。源 0.5.9 仍只有公开静态证据，竞品处理运行 R0。

## 需要 root 处理的具体项

| 项目 | 证据和当前状态 | 接续动作 |
|---|---|
| PDF 右侧实体定位不能直达目标页 | 本地 `apps/web/main.tsx` 的 quote/`EntityGroups.locate` 只加载原文字窗，`onEdit` 只改实体编辑视图；`PageEditor` 的 `index` 是 `page-review.tsx` 内部状态，没有外部目标页输入。源 `PDF.Il2` 可按实体 bbox 页定位，前提是目标页已渲染。属静态可证的导航链缺口，运行尚未验。 | root 已接手修复。用两页合成 PDF、第二页有实体、当前在第一页点击右侧实体，fresh Edge 断言画布切到第二页并截 trace；检查快速连续点击与非 PDF 格式不串页。修复后更新静态证据与台账。 |
| 图片几何与类型隐藏组合 | Luna2 静态链认为已保存 override 在隐藏时不作普通区域遮盖，恢复后保留 binding、重新保存会重签。root 新增 `tests/type-hide-geometry.integration.ts` 实跑 `type-hide-geometry-api-first.log`：1 pass/0 fail，约 27.1 秒；`type-hide-geometry-actual.json` 记录隐藏时保留原图像素、恢复 pending 导出被拒、显式批准后 override 改变导出像素、原件不变。 | API 组合风险已实际覆盖；完整浏览器手势和截图另由 root 的 Edge 门禁证明。不要把 API PASS 说成 Edge 或竞品运行。 |
| 指南新操作图 | 指南现有三图路径/hash 均有效，但都不是本轮两处同文勾选、八手柄保存前、隐藏恢复、旧 ignore 页面选字重加的操作图。旧 page-selection 1PASS 与 manual geometry 2PASS 的日志早于当前 spec 修改，图又是保存后画面；type-hide/source-review/entity-corrections 的当前 Edge 日志未见。 | 等 root fresh 全 Edge，按 Luna3 的 `newScreenshotRequirements` 拍操作时画面并绑定测试源 hash、运行日志、原始 API 断言、截图 hash；随后据实修改指南待验表述。不能拿旧图或旧 PASS 填新证据。 |

## 交叉审结论

- Luna1 新补三个 Word 内嵌图相关源段（8054–8086、8111–8129、8240–8252、9425–9446）的静态 producer/consumer 与 hash；现有 PDF/Image/worker 节点只引用，不重复计数。Word 源内联 DOM 绘制/按 imagePath 确认复用，与我方独立图片资源审查区属于已声明 UI 适配。PDF 源连续 PDF.js canvas/fileURL worker 与我方按页 PDFium 页面图和文字坐标同理；不声称像素等价。
- Luna2 重读 8 个源范围，没有新可确证缺陷或源 ID。页面选字 `onMarksChange→changeMarks(manual-add)` 与 old-ignore 重加是 root 已知修复链，未重复登记。旋转旧 bbox、跨页多框、纠正文双值、原文权限、来源哈希、保存与导出的本轮结论均是静态审查；过去 API 证据按各原始报告计算。
- Luna3 从 C 委托 62 ID 中筛 12 个可见视觉相关 ID 并与 A/root 图去重，没有新静态闭合或升格。`UI-ad41d13c4a2d`、`UI-2c1712d35460` 仍是仅两项待父审 S3 候选；`IPC-a982d6d137ce` 仍只限 PDF.js worker 资源 10 节点；其他 256 ID 及竞品 R0 不受影响。指南人脸/签名/印章数字与三份公开集报告一致，保留印章质量不足、非商用独立金标等限制。

## 证据边界与移交

三份子报告均无本轮服务/Edge/竞品运行。Luna1 导航项为静态路径缺口，需 root 的补测和修复验收；Luna2 组合项现有 root 的真实 API 测试 1PASS，但未证明浏览器；Luna3 指南保持旧截图与待补图分明。root 统一完成 fresh `pnpm check`、完整 API/Edge、台账生成/检查和后续发布判断。本组不借静态图或旧日志宣称全面完成。三名 Luna 已结束，释放并发位给下一组。
