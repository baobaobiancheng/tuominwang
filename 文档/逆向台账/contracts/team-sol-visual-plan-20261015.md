# 视觉与文档线接力计划（2026-10-15）

状态：仅分工计划，尚未启动子任务、服务、竞品授权流程或 Edge。基线为 `complete-porting-20261014` 的 `5cee048`；当前工作树有大量未提交变更，任何人不得 reset、清理或覆盖。源为脱敏猫 0.5.9 可公开取得的代码/资源；竞品处理运行仍 R0。前端按源行为对照，不另做视觉设计；本计划不授权部署、外发资料或修改产品。

## 共用证据规则

- 每条新发现给稳定 ID、原始文件和精确起止行（或二进制字节范围）、整文件及片段 SHA-256、真实 caller→helper→consumer→持久化/输出链；现有片段须核对 hash 后复用。明确区分「源静态可证」「我方 API」「我方 Edge」「竞品运行」。不可达私有服务、许可证处理和模型质量均不能由源静态图代替。
- 报告具体反例：合成输入、操作顺序、期待与实际、原件 hash、保存/重开或导出结果、日志/截图路径及可复现步骤。未见问题也列实查节点和反例尝试。只读源；不改 `ledger.json`，发现条目交 root 统一维护和运行 `maintain.py --check`。
- 不启动或占用 5178/4318，不独立运行全量 Edge/重模型测试；需要浏览器现象时审 root 完整 Edge 的原始 trace/截图，或先给 root 精确补测请求。使用隔离账号与合成材料，不购买或绕过竞品许可证。
- 对照现有 `visual-finite-source-chains-20261015.{md,json}`（31 精确节点）、`renderer-finite-static-closure-20261015.{md,json}`（A34+B31+C24，55 peer 范围复核；仅 UI-ad41d13c4a2d、UI-2c1712d35460 建议 S3）、`pdfjs-worker-resource-static-by-visual-20261015.{md,json}`（IPC-a982d6d137ce，10 节点）和 `source-finite-closure-C-20261015.{md,json}`（196 ID；剩余 62 不在 C 交付中）。不要将节点重复计数或批量提高 258 个 ID。

## Luna 1：Word 图片、PDF 真实源交互与本地 UI 差异

范围：在源 `renderer.js` 核查 Word 图片资源切换、PDF 页切换、文字层选择、侧栏导航、滚动/卸载与保存后恢复；核查本地 `apps/web` 实际相应入口及 root 的 Edge trace。优先复用 `PDF.Lo2/zo2/jo2` 24396–24414、`Nl2/Il2` 24691–24708、PDF mount/unmount 25959–26002、Image `Ia2/Pa2/Ra2` 26935–26957 与 `wi2/ki2` 27274–27303、`get-pdfjs-worker-path` 的 10 节点图，扩展时必须给新的精确范围/hash。明确 Word 内嵌图片序号和 PDF 页码不是同一坐标；源 Electron PDF.js fileURL 与我方 PDFium 页面图片/文字坐标是环境适配差异，不作像素等价结论。

至少尝试：两张 Word 内嵌图片资源直达后保存/重开；PDF 跨页选字并切换页面；PDF 已选实体跳转到未渲染页后立即切页/卸载；连续滚动与坐标缩放；缺 worker 或资源失效的降级。逐项表明原源 UI 预期、我方可观察行为和差异类型（缺陷、明确适配、未验证），指出能使差异复现的最小输入。交付 `team-sol-visual-luna1-20261015.{md,json}`，不改产品。

## Luna 2：页几何、隐藏、纠错、来源与导出数据链独立审

范围：独立复查页面 bbox/多框/旋转、实体八手柄、手工区域、类型隐藏恢复、纠正文与原识别文、原始来源及处理副本/导出。源锚点为 PDF `er2/tr2` 23439–23448 与 `Po2` 24330–24366、Image 删除 `Si2/Ci2` 27304–27348、Word `gn2` 6536–6570、`Ql2/eu2/tu2` 9621–9690、shared `xc/_c/Sc` 4270–4288、父保存草稿 `Mm2` 34026–34068 和四格式 apply 34411–34592；以 `review-type-hide-source-by-visual`、`review-hidden-entity-corrections-by-visual` 精确 JSON 复核 ID/hash。避免混淆 PDF `er2` 几何 getter 与父 `er2` 删除状态生产器。

反例至少包括：旋转后旧 bbox、跨页/多框同文、缩放/八手柄越出原敏感字、类型隐藏保存重开恢复再保存、保留原值不记 FP、手工新增漏检记 FN、纠正文 138/149 类双值不污染 canonical/原件、无权限/跨租户读取原始来源与导出、旧版本/篡改 geometry 恢复、撤权时临时规则 payload 清理。最后一项与 A 的 037 实测去重，Luna 只独立审 API/SQL 证据，不抢测。给数据流图或逐边表：UI 动作→请求→复核状态→原件引用→处理预览→最终导出，指出每边证据/缺口和最小可重现反例。交付 `team-sol-visual-luna2-20261015.{md,json}`。

## Luna 3：Edge 操作图、指南质量声明及剩余 62 ID 中视觉静态边

范围：审 root 对 `manual-occurrences-geometry.spec.ts`、`type-hide-persistence.spec.ts`、`source-review.spec.ts`、`entity-corrections.spec.ts` 的完整 Edge 结果，结合 `文档/使用指南/公开功能补齐操作-20261015.md` 的 3 张旧真实图和新操作图需求。要求查到两处同文勾选而非保存后折叠画面、画布上八手柄和几何参数保存前画面、隐藏组与恢复画面、实际自动 FN 记录；每张图列测试名、运行退出码、时间、材料/账号、动作与断言、截图 hash。未跑的图继续标待补，不生成假截图。

静态面只从 C 未覆盖的 62 稳定 ID 中筛与可见 UI、文档呈现、图片/PDF/Word 交互直接相关的 ID，先与 A/root 已认领清单去重；逐 ID 记录原 entry、caller/consumer、范围/hash、确实未读的有限节点和已声明外部 leaf。特别核对两原 UI 入口 `UI-ad41d13c4a2d`、`UI-2c1712d35460` 的 S3 建议是否被新证据反驳，及 PDF worker `IPC-a982d6d137ce` 是否仍仅十节点范围。禁止因 C 的 196 ID 完成而声称其余 62 自动闭合。

指南需逐句核对功能、步骤和限制：Office/图片人脸、印章、签名的质量只用本次可复现样本与指标；不引用不存在的竞品黑白金效果基准；源 Electron 与我方网页显示差异明确写入。交付 `team-sol-visual-luna3-20261015.{md,json}`，可提交指南中的事实修订与真实截图，但先等 root Edge 素材，不占测试端口。

## 主 agent 复审与汇总门槛

三份成果到齐后，我逐份按原始源 hash、ID 去重、反例可复现性、API/Edge 日志退出状态和未验证边界交叉复审；把具体产品缺口交 root 修，文档事实修订合并进指南。若发现新逆向事实，交 root 统一更新台账及生成视图。最终报告按「源静态／我方实际／竞品运行 R0／待办」四列列证据；只有 root 的 fresh 全 `pnpm check`、API、Edge 与部署验证完成才可扩大对外完成表述。
