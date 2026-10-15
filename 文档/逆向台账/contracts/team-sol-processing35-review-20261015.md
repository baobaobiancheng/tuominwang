# 35 个处理稳定 ID 有限链重联与漏迁移审查

日期：2026-10-15。范围仅为 A 最终报告声明的 35 个 desensitization 稳定 ID；只读检查，不改产品、ledger、测试或部署。竞品仅有 0.5.9 公开发布包且没有许可，竞品运行状态维持 R0。页面OCR补录缺口按发现时工作区快照取证；发现后root已确认并正在窄修 `main.tsx` producer回调及PageEditor同位置标记处理，同时安排Edge/API断言。本报告所列旧 `main.tsx` SHA及“我方实际”只描述修复前快照，不能当作当前代码状态或修复后验证。

## 输入与证据一致性

- 依据 `remaining-static-processing-by-rules-20261015.json/.md` 的最终 35 ID 清单；JSON 标记 `exactIds=35`、`freshRanges=22`、`recommendedS3Upgrades=0`。逐行重算了22段 `freshReviewedRanges` 的 UTF-8（含换行）SHA-256，22/22 的切片hash与源文件完整hash均匹配。
- 复用 A JSON 每个稳定 ID 的 `primaryBodyEvidence`、`preloadEvidence`、`sourceContract` 和 `staticEntryMeaning`，不把入口登记当成消费闭合。以下父链重联再覆盖 A 标注为部分父级的 eg2、Dm2/Om2、xy2。
- 公开包文件基准：`main.js` SHA256 `40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba`；`renderer.js` SHA256 `4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc`；`preload/index.js` SHA256 `f593a0d62dbfd6296faa683b314b9cebb745908d997acd297c183d9c3d225f3b`。切片均按源行号 1 起、闭区间、UTF-8整行含换行计算。

## 对抗性发现：页面 OCR 文字新标记没有触发运行规则producer

**稳定 ID：`IPC-0ea3b09c375b`（`desensitization:update-runtime-rules`）**。这是一个公开业务producer路径遗漏，不是renderer平台差异。

- **源链。** 图片实际补录：`renderer.js:26603–26623`，切片 SHA256 `270ea23d5d332ec72be7d057be3ad41ec9b0fdabf2a524143fbecf501a454e34`。`dt2` 在 OCR 候选框中新增人工文字框后，于 26613–26618 调用 `updateRuntimeRules`，传当前 `requestId`、`sessionId`、scope、实体类型、pattern 和 whitelist。主 handler `main.js:17183–17195`（切片 SHA256 `36aa6de88e6de22a9d85df600284f75cc4e1d560097ac0a7c30903c07ab1d59f`）只向仍活动的 detect-only engine 应用；project 按同 session 筛选，file 按 requestId 筛选，spot 与 blacklist 不修改。
- **我方实际路径。** [page-review.tsx](/Users/admin/FDE/脱敏工具/脱敏汪/apps/web/page-review.tsx:97) 的页面文字选择把 OCR 文字变成 pending 人工标记并调用 `onMarksChange`；该行切片 SHA256 `1807b065c0d00137b22a761d037c222a72cb58b8c1655911aafd00d8d53d30de`，全文件 SHA256 `5228f0e392ab605bde9a8a3a410751c28ce737778c5408f1f0e2b52cfc97637e`。[main.tsx](/Users/admin/FDE/脱敏工具/脱敏汪/apps/web/main.tsx:1002) 的 PageEditor callback 只调用 `update(next)` 并保存预览文本，没有调用 `changeMarks` 或 `automaticRuntimeRules.dispatch`；行切片 SHA256 `d1f20d72515bf4c2defa47672f518058790ed767d29e83d9413c49905b298f52`，全文件 SHA256 `d4feb34dff5d6271b018c77096b5bc12dfcf028920a5d3ac26f5ffbea6bdf454`。通用人工文本入口 `main.tsx:484–485` 则确实连接 dispatcher，因此缺口限于 PageEditor 这条producer。
- **最小输入与差异。** 输入一份有页面 OCR 的 PDF/图片，选择原文中尚无同类型覆盖标记的连续文字 `ALPHA`，新增 pending 标记；设置规则范围为 project，且同项目有另一份仍在运行的 detect job。源同类图片 OCR 人工补录会向同 session 活动引擎投递 whitelist；我方 PageEditor 回调只修改当前本地复核 marks，不发送 `IPC-0ea3b09c375b` 对应的运行规则请求，因此同项目活动识别不会收到该值。这里对我方实际的依据为静态调用图，未运行接口/竞品流程。
- **复核对照。** ManualOccurrences 全重复路径不构成第二个缺口：`manual-occurrences.tsx:13` 在没有新mark时会找出已覆盖 selection 并走 `onCoveredSelection`，主组件:985 显式 dispatch 带 selection 的请求；实际使用前必须仍由 037 API 验证源span及活跃job。当前发现针对页面 OCR 文字新增路径，不泛化为所有人工改动。
- **建议实现与回归条件。** 将 PageEditor `page-text-selection` 新增送入与可见人工producer相同的 dispatcher，并保留当前 scope。最小回归应检查新增OCR文字 mark 后，项目另一活动任务收到临时白名单；普通几何区域、删除、改decision、隐藏类型不得触发。父代理/实现负责人处理；本审查没有改动代码或运行测试。

## 037 preload 与 detect-only 生命周期重联

源边闭合如下，没有发现 IPC 登记缺口：

1. **公开暴露与发送。** `preload/index.js:164–188`（包含 `detectOnly`、`updateRuntimeRules`、`onProgress`、`onPageProcessed` 与各自 unsubscribe；范围 SHA256 `4358a3bf775e523fda24c8d52e0f73be236e55567b9eaf5a51b38aacf04424e3`）。该切片属于 A 22 fresh ranges 之一且hash相符。
2. **入口注册/暂存 engine。** `main.js:17196–17215`，切片 SHA256 `f8036cfecd1a7e6516c2dd232281e2f92a3a910083b58c03e2716d3e34b06c2c`：handler 先检查激活，再将 AbortController、sender、文件名和归一化 session 放入活动任务表；创建 engine 后存入对应 task，建立 requestId 标记的 progress sender。未授权状态在开始任务前返回，不伪造engine。
3. **处理与事件consumer。** 同一handler于 `main.js:17265–17320` 将 PDF、图片、DOCX/text 分派给相应处理器；页面结果经 `desensitization:page-processed` 发给 renderer，事件带 requestId/fileName，规则快照和 workspace corrections 也在返回最终 matches 前消费。A fresh `main.js:17196–17367` hash为 `542c0036dd6b8c1636c9e17dce1e1447f2317161d59632e13c945d0ae5f5d2d1`，正文含上述有限入口、事件和清理。
4. **producer、worker查询和注销。** runtime update 选择活动 `kind=detect-only` task 后调用其 engine mutator；`main.js:17354–17367` catch 包装取消/异常并在 finally 无条件 `n2.delete(requestId)`（切片 SHA256 `aa8c7d43228cdc67bdccd3311fc7111889debddd36ecfe597750bc637cdd2cc4`）。源的“活动engine”生命周期确实是 handler 异步处理期间，不是持久规则状态。
5. **我方适配边。** 云端没有 Electron preload/task map：`apps/api/automatic-runtime-rules.ts:23–39` 检权并校验document revision/source/canonical/span；`packages/adapters/automatic-runtime-rules.ts:6–25` 以 AEAD 临时记录和job/generation绑定；`apps/worker/main.ts:74–86` 与 `packages/adapters/processing.ts:65–81` 绑定worker、读取与最终drain。对应精确静态/实际证据已经在 `team-luna-runtime037-review-20261015.md` 给出。本审查确认其有意适配为 job generation 窗口，不将Electron preload/内存Map误称为我方缺失组件；PageEditor漏接producer是上节的独立公开分支反例。

## 父级链路重联：入口 → producer/helper → state/worker → consumer/异常

### eg2：单文件当前审查检测与stream消费

- 源 `renderer.js:35746–36017` SHA256 `24fced722e6b30f93bf2a72427ff607f062c2233f76ade424263d5c28eb90996`。eg2在开始前请求停止先前task并用 `eh2` 代际避免过期回执覆盖；检验当前文件buffer、实体类型与detectOnly API；注册requestId并重绑page/progress listener；对流式DOCX/PDF/图像/text按文件名、requestId和代际过滤并累积正文/页面候选。最终再次校验generation/文件仍在当前队列及成功/取消状态，合并流式候选与最终matches，保留用户审查实体/来源、OCR页缓存与格式sidecar，然后才置 `ready`。失败/cancel由`eg2`调用方分类，结束时解绑listener与清状态。部分细节前半/后半还有 A fresh ranges :34071–34095、:31775–31855。
- 我方对应识别/事件链为 `apps/api/documents.ts` 当前 `/recognize` 入队（handler由 `apps/api/main.ts` 挂载）、`apps/worker/main.ts` 取代并校revision、`packages/adapters/processing-worker.ts:200–240` 分格式检测并产生识别事件、`packages/core/processing-events.ts:1–14` 校验event envelope。A报告为processing-worker切片；本轮没有重新运行实际接口。
- 旧 ITER019 `SC02–SC03` 的状态机入口/导出门与 `SC04–SC05` 的准备、逐文件写入、错误回执有父层消费信息；本次补读eg2确认输出review态需经过新一代检测/源缓冲读取/候选覆盖，而不是“有detectOnly endpoint就等于审查完成”。PDF OCR阶段性失败/部分页面未完成仍保留review提示和覆盖门。

### Dm2 / Om2：批次检测与异常调度

- 源 `renderer.js:34142–34352` SHA256 `83305698126f4a3fc0f30b0aa72361af4dfa27601348051ffa96e35c883d62f1`；`Dm2:34353–34400` SHA256 `92959bf04bec85b8eb16e42737a9a1c2962af1e32d5a063651b9942022c4280d`。Dm2锁定当前session generation、选用协作任务profile/ruleset snapshot，过滤实体类型后登记detect request，订阅页流并校requestId/file/generation；PDF区分required与supplement并维护完成页/OCR cache，DOCX增量页事件与保留原有复核标记，最终合并stream及返回matches、markdown sidecar、document canonical与审查状态。失败由Om2按取消、用户暂停、优先抢占、印章人工确认、普通失败分支分别分类；只允许一个worker串行消费 `bm2()` 队列，最后 drain/export回执由`oe2`调度，不把部分完成转ready冒充成功。
- 入口 `Rm2` 有只处理选中文件与全批重置两支；后者清空每份候选/OCR/临时状态、增加 generation 并再调用Om2。取消若停止未确认会暂存 stopping并延迟确认，不直接认作worker已停止。此重联支持ITER019 SC02/03原调度陈述，也补上A曾标为partial的 Dm2父级。
- 我方为worker job序列化、单次处理worker、generation/revision绑定event落库；失败及cancel结果与成功的review/exportable分支分开。静态可见的是公共业务语义部分，不推断Vision、PDF.js、字体、canvas、Office、ONNX内部实现等价。

### xy2：批量导出与交付前置

- 源 `renderer.js:36890–37164` SHA256 `cda1b6a6539fac6e00145420bbd756fa8787e3fc3b572ec5067667f675659fd4`。xy2首先阻止未确认写入结果和重复导出；过滤 `ready` 文件并用`Gc`检查识别/OCR覆盖，失败项先向协作服务报告失败；同步候选版本签名，等待人工印章和失败项处理；计算每文件模式、项目假名表和真实mapping；建立输出目录/文件夹会话；然后逐文件重核ready与内容签名，调`Am2`读取文件字节、协作`prepareExport`、`Jp2`进入主进程apply，按实际结果保留错误/人工稿。Markdown额外导出失败与主文件完成明确分开；协作release逐项消费write receipt，最后`finishBatchExport`，失败不会以toast代替deliver。
- 取消检查位于逐文件边界及Jp2取消回执：未确认写入会截停后续并提示不能重复提交；普通用户取消时已完成文件保留，未完成文件生成canceled manifest。folder manifest失败不撤销已生成主文件，manifest也不证明文件质量。source A fresh范围为 `renderer.js:36950–37165` SHA256 `6e233296440789c89685a9d1891e36b9f806c38deec89a562b3d2005fb9b0514`，覆盖逐文件主要业务循环。
- 当前产品使用逐文档 `/export` job和 `assertExportable`（`apps/worker/main.ts:98`），实际文件export service读取经过验证的 source/snapshot，再写 artifact。批量输出、mapping、report和cancel各由不同API/helper承接，没有证据表明用下载门替代了处理时`ready`校验。旧 ITER019 `SC05–SC06` 所述逐文件准备/释放/finish顺序与本次xy2一致；不宣称外部协作AI或第三方renderer内部可见。

## 35 个稳定 ID 覆盖索引

下表逐项沿用 A JSON 的确切ID及单行API名；每项的handler输入/先决条件/副作用/错误契约已在该JSON `rows` 对象中保留。本次核对索引显示其有限父图均已归到下列已读链，不把35行原入口证据扩张成产品等价或S3升级。新发现仅落在运行规则 ID 的一个特定OCR页面manual producer。

| 稳定 ID | API | 本次父图 |
|---|---|---|
| IPC-5a998529649c | desensitization:apply | xy2 单文件写入/receipt |
| IPC-88cd1d915682 | desensitization:cancel | eg2/Dm2 cancel 与 worker清理 |
| IPC-fd1ca8c6cb27 | desensitization:cleanup-paths | xy2失败/取消清理边界 |
| IPC-e8dcb4d0e8b3 | desensitization:create-folder-output | xy2准备阶段 |
| IPC-7d7d2d58da91 | desensitization:detect-only | eg2/Dm2入口与识别 |
| IPC-42a70f50df5f | desensitization:detect-route-only | eg2路线前置 |
| IPC-85f474cad97a | desensitization:generate-reports | xy2结果后消费；报告固定字段边界 |
| IPC-8c5afeb517e6 | desensitization:get-apply-result | eg2/xy2写入receipt |
| IPC-9a8232e44fb9 | desensitization:get-default-output-dir | xy2准备 |
| IPC-a09f09579955 | desensitization:get-markdown-export-stats | xy2 Markdown消费 |
| IPC-7b3e67a5a715 | desensitization:get-resource-diagnostics | eg2资源叶子 |
| IPC-3211d99d0f20 | desensitization:open-output-dir | xy2成功回执后 |
| IPC-58567733591e | desensitization:page-processed | eg2/Dm2流事件consumer |
| IPC-e4cf3e6c3c0a | desensitization:pause-seals | Dm2/Om2失败与暂停分类 |
| IPC-c1cec3199992 | desensitization:process-file-main | 单文件helper/xy2 apply父链 |
| IPC-27dd16394cd6 | desensitization:process-files | Om2批次与xy2批量 |
| IPC-8fc7e5c07051 | desensitization:progress | eg2/Dm2进度consumer |
| IPC-a07c3fdcbe45 | desensitization:read-file | eg2缓冲输入 |
| IPC-f071ce7c965b | desensitization:read-source | sourceRef读取链 |
| IPC-81f79eee361a | desensitization:recognize-docx-images | Dm2/DOCX补充识别叶子 |
| IPC-8f1caa190dda | desensitization:register-source | eg2/Dm2输入绑定 |
| IPC-d9b14aa97589 | desensitization:release-sources | eg2当前session teardown |
| IPC-3bea45842355 | desensitization:resolve-folder-output-path | xy2 folder写入 |
| IPC-f1f713df2b98 | desensitization:save-file | xy2文件消费 |
| IPC-629ace0aecd1 | desensitization:save-markdown-draft | xy2部分失败人工稿 |
| IPC-9577d3a9d6d0 | desensitization:save-report | xy2报告消费 |
| IPC-e29b03465bc3 | desensitization:scan-dropped-folder | 批量入口/Om2 |
| IPC-95d4f752bfb1 | desensitization:select-files | 批量入口/Om2 |
| IPC-523337153cab | desensitization:select-folder | 批量入口/Om2 |
| IPC-102f9010076c | desensitization:select-output-dir | xy2准备 |
| IPC-7f07e8bd74ee | desensitization:select-save-path | xy2准备 |
| IPC-d7d18b241f88 | desensitization:unlock-source | eg2/Dm2密码前置 |
| IPC-0ea3b09c375b | desensitization:update-runtime-rules | 活动detect-only producer；本报告新增的页面OCR文字漏接 |
| IPC-96ccc7c0ce76 | desensitization:validate-folder-source | folder输入稳定性检查 |
| IPC-e84cabdffc27 | desensitization:write-folder-manifest | xy2成功/取消manifest |

## 031/035/036 状态证据与语义分离

- **031来源槽/人工出生。** `scripts/031.sql:1–4` 在 review snapshot 增 `entity_metadata`、document 增AEAD `entity_corrections`；它提供来源/实体槽和校正状态，并不自动批准标记或代替 runtime whitelist。公开producer新增标记和持久审查证据是两条独立副作用。
- **035纠正语义。** `scripts/035.sql:1–4` 加密保存规范内容/语义纠正；[hidden-correction-lifecycle-20261015.md](/Users/admin/FDE/脱敏工具/脱敏汪/文档/逆向台账/contracts/hidden-correction-lifecycle-20261015.md:1) 标为closed-independent-runtime-and-read-only-review，仍声明竞品R0。该闭环说明修改OCR实体的语义/几何，不等同手工补录产生whiteList，也不将修正值升级为审批。
- **036隐藏/恢复。** `scripts/036.sql:1–12` 建受RLS保护的 `review_entity_history`；`review-type-hide-source-by-visual-20261015.md:1–18` 核对类型隐藏/恢复持久化并保留可信创建来源，隐藏/恢复不产生FP/FN，真实新增与普通删除分别走feedback。故producer必须从实际新增事件区分type-hide、restore、decision和delete，不能用“实体发生变化”统发runtime规则。当前core producer明确只接受`manual-add/audit-add/one-click-add`，并排除ignore/hidden及旧span。
- 证据文件行 hash以当前文件为准；竞品仍R0。此前 031/035/036及037的API/worker回执仅证明我方快照和受控输入路径。

## 无反例范围与叶子边界

- 对本次声明的35稳定ID做了入口→preload/renderer producer→主helper/worker→事件/UI或文件消费及异常路线的有限交叉；A 22段range复算全部一致；ITER019旧SC03–06与eg2/Dm2/Om2/xy2父链没有发现另一处已存在公开业务分支完全未读。A 原 `namedApplicationNodesStillProvenUnreadInThis35Scope=[]` 只对它定义的应用handler/direct-helper有限集合有效，不宣称竞品全库闭合。
- DOCX renderer动态加载依赖fork `CpyDD6WX`，以及PDF parser/renderer、字体、canvas、Sharp、ONNX、Office组件的库内部不在本次递归范围；这是公开第三方/系统叶子，不应误称私有算法，也不作为掩盖上述PageEditor应用入口漏接的理由。Mac/Windows原生文件对话框与OS engine、许可交易/已授权竞品执行、模型质量另属边界。
- 未运行测试/服务/竞品流程，未升级任一stable ID到S3，也未更新ledger。推荐把页面OCR补录producer作为一个具体修复和最小回归，修复后的运行验证由root全量门禁安排。
