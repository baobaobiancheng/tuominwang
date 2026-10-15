# 视觉 21 ID 与规则组 2 ID 的公开应用语义合图

本报告只建议逐 ID 的有界源静态 S3；未改产品、台账、服务或旧报告。公开竞品运行始终 R0。这里的完整是已取得的应用调用图：renderer producer、preload/Main、业务消费、写入/错误和明确的系统/格式库叶。不是 PDF.js、Paddle、Electron、python-docx 或许可证后实际质量等价。

## 历史字节 pin

- `visual-interface-closure-20261015.json` SHA-256 `1a6944a6d7902ee20ee0d10cd6ca6e25a284664564c63c1a63a47a8111b25815`
- `pdfjs-worker-resource-static-by-visual-20261015.json` SHA-256 `380fac8a732a28cd036f26c35c177c230d701039ed81daed33619664147c5f22`
- `source-finite-closure-C-20261015.json` SHA-256 `485167f23f097cac100b1df5e233a66bd8a70e727cbdddfb2755fe13f29fbfa1`
- `team-sol-rules-static35-join-20261015.json` SHA-256 `2523c8ec5f8622f251fa40ce287536f5262f4645ad29a29dbc02bf62a465056d`
- `root-ui-six-semantic-join-20261015.json` SHA-256 `60d65a13159e4c45218026b90e3e4d044abca5cae8add98e7113a342dd2aa2e1`
- `deep-formats-20261014.md` SHA-256 `dea2bb876a7017e9edf1a4429618ace18920ea6f9fd17e4297898b73595aebd6`

## 逐 ID 合图

|稳定 ID／接口|producer → transport → main／消费|写入与失败／外部叶|建议|
|---|---|---|---|
|`IPC-a982d6d137ce` get-pdfjs-worker-path|PDF Ju2 and project native-text vf2 worker setup → renderer uses window.electron.ipcRenderer.invoke generic bridge; no named worker preload method → main packaged/dev/unpacked/temp copy/cache/fallback resolver → PDF loader+native search document creation, generation/unmount destroy|workerSrc in renderer process; temp copy cached by size/mtime；失败：copy failure falls back source URL; setup failure clears workerSrc/returns load error; stale generation ignored；叶：FS/path/fileURL; PDF.js worker internals|有界 S3；R0|
|`IPC-47ecc7525dfe` image-review:clear-ocr-cache|review utility clear button → renderer uses window.electron.ipcRenderer.invoke generic bridge; no named imageReview preload method → main deletes q2 key → subsequent get-page/search must miss and re-OCR if caller provides PDF buffer|q2 derived OCR cache only, not source/review；失败：deleting absent key still success; key caller supplied；叶：in-memory Map|有界 S3；R0|
|`IPC-d3864dc80560` image:export-labels|Image annotation export action → preload image direct invoke → main serializes normalized+absolute boxes to labels JSON → renderer handles save result/path|FS JSON at homedir datasets/images/labels；失败：write exception success:false; source confidence 0 becomes 1 by //；叶：FS/path, image dimensions caller|有界 S3；R0|
|`IPC-5569a4344615` image:save-annotations|Image annotation save action → preload image direct invoke → main writes sidecar JSON of bboxes → renderer handles save result/path|adjacent basename .json with imagePath, empty imageSize, savedAt；失败：write exception success:false; same basename path can collide；叶：FS/path|有界 S3；R0|
|`IPC-0ecb1de9c806` ocr:collect-diagnostic|OCR diagnostic UI request → preload OCR direct invoke → main cs().collectDiagnosticInfo(reason) → UI displays summary/path|diagnostic file written by OCR service, not review document；失败：exception success:false; diagnostic can disclose local file path in source；叶：OCR runtime/model/service, FS|有界 S3；R0|
|`IPC-f02ad1fa2413` ocr:health-check|OCR availability UI request → preload OCR direct invoke → main cs().checkAvailabilityWithDiagnostic() → UI uses available/diagnosticSummary|runtime availability probe only；失败：exception available:false summary；叶：OCR runtime/model/service|有界 S3；R0|
|`IPC-4dd20e80cae3` image-review:batch-search|Image/PDF query and scope UI → renderer uses window.electron.ipcRenderer.invoke generic bridge; no named imageReview preload method → main q2 cache search normalized charBoxes, word fallback, cross-line multibox → returns results+checkedPageNumbers to scoped result/filter/navigation|read-only q2 OCR cache；失败：missing parameters/cache failure; approximate word fallback; de-dup dd；叶：OCR cached geometry/Unicode normalization|有界 S3；R0|
|`IPC-ba07bb14e3df` image-review:get-ocr-page|PDF/page reviewer glyph and source caller → renderer uses window.electron.ipcRenderer.invoke generic bridge; no named imageReview preload method → main q2 lookup; optional forced OCR using PDF buffer with J2 inflight promise → page lines/charBoxes consumed by canvas/selection|q2/J2 derived OCR state；失败：missing page returns false; forced OCR rejection swallowed at this caller; stale page unresolved；叶：PDF/OCR engine and buffer|有界 S3；R0|
|`IPC-910347ed48b5` image-review:ocr-region|Selected region query → renderer uses window.electron.ipcRenderer.invoke generic bridge; no named imageReview preload method → main maps canvas to OCR page, char center inclusion, uniform word fallback → returns text+ocrBbox for user correction/copy|read-only q2 cache；失败：missing cache/page returns false; approximate fallback；叶：OCR charBoxes and canvas dimensions|有界 S3；R0|
|`IPC-bd4779635d5d` pseudonym:inspect-restore-mapping|restore panel mapping/password step → preload pseudonym direct ipcRenderer invoke → main fe(sender,authToken), Pm map read and Ad ambiguity policy implicit → panel gates next restore and refreshes token|read-only encrypted mapping under userData；失败：AUTH_REQUIRED or map read error; ambiguities currently empty；叶：key hierarchy and FS|有界 S3；R0|
|`IPC-32941c143267` pseudonym:open-output-folder|restore success panel → preload pseudonym direct ipcRenderer invoke → main dirname(outputPath) shell.openPath → panel reports opened/failed without changing artifact|none；失败：shell error returns success:false；叶：Electron shell/path|有界 S3；R0|
|`IPC-1d272ba10a6c` pseudonym:restore-docx|single Word/WPS output → preload pseudonym direct ipcRenderer invoke → main fe/Pm/Ad; choose save path; Rp DOCX or legacy conversion → panel sets success/partial/error and AI collaboration completion only after response|writes output file; source input untouched；失败：auth/dependency/format/conversion/write error; preserveExistingOutput suffix；叶：python-docx preserver, legacy Office service, FS/dialog|有界 S3；R0|
|`IPC-24fe13c4efb6` pseudonym:restore-docx-batch|batch Word/WPS panel → preload pseudonym direct ipcRenderer invoke → main validates list/map/outdir then loops Rp with unique names → per-file progress/results and final partial stats to panel|successful output files retained; failed output removed；失败：missing inputs/dependency; one file failure does not stop others；叶：FS, python-docx, legacy Office|有界 S3；R0|
|`IPC-5c2a14961699` pseudonym:restore-markdown|single MD output → preload pseudonym direct ipcRenderer invoke → main fe/Pm/Ad; save dialog or explicit output; Td longest token replacement → panel success/partial/error|UTF8 output written; source untouched；失败：auth/cancel/read/write failure; source explicit output may overwrite unless preserve flag；叶：FS/dialog/RegExp|有界 S3；R0|
|`IPC-096d3ecc2554` pseudonym:restore-markdown-batch|batch MD panel → preload pseudonym direct ipcRenderer invoke → main validates list/map/outdir; loops Td with exclusive-name mode → progress, per-file results and partial stats|successful outputs retained, one error does not abort all；失败：invalid input/dir/auth; per-file error and partial receipt；叶：FS/RegExp|有界 S3；R0|
|`IPC-0fa110b8534b` pseudonym:restore-progress|Word/MD single and batch handlers → main webContents.send to preload onRestoreProgress event → main sends progress while Rp/Td/batch loops → panel listener updates percent/message; unmount removes listener|transient UI state; no durable progress object from this event；失败：sender window destroyed suppresses event; no process guarantee；叶：Electron webContents/IPC|有界 S3；R0|
|`IPC-37a279488720` pseudonym:select-input-docx|legacy single Word selector → preload pseudonym direct ipcRenderer invoke → main focused-window openDialog doc/docx/wps single → no direct current renderer call found; current restore panel uses selectInputFiles|returns OS filePath only; no persisted state；失败：no focused window/cancel；叶：Electron dialog/FS path|有界 S3；R0|
|`IPC-f69ef883aa33` pseudonym:select-input-docx-batch|legacy batch Word selector → preload pseudonym direct ipcRenderer invoke → main focused-window openDialog doc/docx/wps multiple → no direct current renderer call found; current restore panel uses selectInputFiles|returns OS filePaths only；失败：no focused window/cancel；叶：Electron dialog/FS path|有界 S3；R0|
|`IPC-7fe81107ae4d` pseudonym:select-input-files|current mixed selector → preload pseudonym direct ipcRenderer invoke → main focused-window openDialog Word/WPS/MD mixed multiple → restore panel se2 replace/append, then map selection|returns OS filePaths in UI draft only；失败：no focused window/cancel; duplicate path handling in panel；叶：Electron dialog/FS path|有界 S3；R0|
|`IPC-6dcdb71fa095` pseudonym:select-input-markdown|legacy single MD selector → preload pseudonym direct ipcRenderer invoke → main focused-window openDialog md/markdown single → no direct current renderer call found; current restore panel uses selectInputFiles|returns OS filePath only；失败：no focused window/cancel；叶：Electron dialog/FS path|有界 S3；R0|
|`IPC-93ba5dca8357` pseudonym:select-input-markdown-batch|legacy batch MD selector → preload pseudonym direct ipcRenderer invoke → main focused-window openDialog md/markdown multiple → no direct current renderer call found; current restore panel uses selectInputFiles|returns OS filePaths only；失败：no focused window/cancel；叶：Electron dialog/FS path|有界 S3；R0|
|`IPC-e4cf3e6c3c0a` desensitization:pause-seals|Qt2 PDF single/batch pause control → preload166 direct invoke → main requestId lookup requires active detect-only engine and same sender; su.pauseSealDetection→Ne.pause → PDF seal loops check paused and preserve completedPages; Qt2 generation checks then updates deferred sealProgress|task memory and review draft sealProgress; no cancellation of face/signature；失败：missing/wrong sender/finished request success:false; current page await can finish；叶：Electron IPC, seal detector and PDF raster|有界 S3；R0|
|`IPC-81f79eee361a` desensitization:recognize-docx-images|Rv2 single and Ov2 batch Word image OCR actions → preload165 direct invoke → main activation gate, request registry/Abort, M2 sourceRef, rules/corrections then su.processDocx imageOcrOnly → filters image_ocr matches; renderer appends candidates+OCR infos+canonical into single/batch draft then lc2 save|in-memory job/ocr infos and workspace draft after save; source bytes unchanged by detect-only；失败：activation/source kind/dependency/abort/processing failure; UI keeps body review and marks image OCR error；叶：DOCX parser, OCR/model, FS source registry|有界 S3；R0|

## 本轮真正补读的公开子节点与例外

- `image-review` 四接口的底层 `q2` 是 `vf/kf` 包装的内存 OCR 页缓存（main 15335–15376，注册处 16875）；`get-ocr-page` 可在给定 PDF buffer 时通过 `J2` 同任务 promise 强制 OCR，结果按页写缓存。`batch-search` 优先 charBoxes、否则等宽词框，并能拼邻接行多框；`ocr-region` 从 canvas 换到 OCR 尺寸，字符中心落框或等宽近似；`clear-ocr-cache` 只删除指定 key。已补入 JSON 精确片段哈希。
- OCR 两接口从 preload 302/304 到 main 18761–18776，再到 `ss` facade 与实际诊断处理。源诊断会采集 Python/模型宿主路径与 stderr 并写本地日志；我方云端诊断的脱敏是明确适配差异。
- 假名 inspect/restore 的 `Pm→mf.readByPath` 严格检查映射位于受保护根目录、UUID `.lpm`，经 key hierarchy 保护；`Ad` 按 token 选 canonical，`restoreChoices` 当前无消歧效果，`ambiguities:[]` 固定。DOCX 单/批经 `Rp` 与已公开的 897 行 `restore_pseudonym_docx.py`，DOC/WPS 先转 DOCX 再转回。MD `Td` 长 token 优先并补 Markdown/HTML 变体。旧 `deep-formats-20261014.md` 已逐体覆盖脚本；本轮将其接回具体 IPC。批量成功文件保留、失败项单独报；源 DOCX batch stat 命名存在跨进程窗口，源 MD 单文件可能覆盖。
- 五个 `select-input-*` 均有主进程 OS dialog handler。当前 renderer 恢复面板只直接调用混合 `select-input-files`；另四项仅闭合已注册 handler，不杜撰正在使用它们的 UI。`restore-progress` 是主进程 `webContents.send`→preload listener→面板临时 percent/message，面板卸载撤监听；不是独立恢复作业持久化。
- PDF worker 资源复用既有十节点报告：Ju2 PDF 视图和 vf2 项目搜索经 generic preload invoke 到 main packaged/dev/unpacked/cache/fallback。只闭资源定位和两处 caller 生命周期；PDF.js 内核、OCR 准确率、连续滚动画质仍为叶/未运行。

## 规则组待补 2 ID 的具体合边

- `IPC-e4cf3e6c3c0a / pause-seals`：Qt2 的单/批 PDF 审查 UI 用当前 requestId 发 preload 166；main 17166–17169 仅接受同 sender、仍活跃且 kind=`detect-only` 并已有 engine 的请求。`su.pauseSealDetection`→`Ne.pause` 设置暂停；PDF seal detector/页流循环在 main 10139–10155、10957–11024 检查 paused，保留已完成页，face 通路不随此请求取消。UI 再核当前批次/代际才写 `deferred` sealProgress 与完成页，失败只提示。`Ne.whileActive` 对已经开始的当前 await 不保证立即打断；不能称同步中止整项检测。精确 7 节点/hash 见 JSON。建议此 ID 有界 S3。
- `IPC-81f79eee361a / recognize-docx-images`：renderer Rv2 单文件、Ov2 批量（35504–35557）分别取原 sourceRef、规则快照与当前会话，preload 165 转 main 17368–17416。main 先过激活门、注册可取消 job、由 M2 取源、应用规则与纠正，只容 DOCX 类输入，以 `processDocx(skipImageOcr:false,imageOcrOnly:true)` 返回；main 10294 与 10513 保留 `image_ocr` 命中，并附 OCR 图片信息、结构化/canonical 文档及调试域。UI 仅将补充候选合入实体与单/批草稿，保存由已有 `Yt/lc2` 发起；失败不清空正文审查，取消返回 canceled。实际 OCR/Paddle/Office 质量仍属叶且 R0。精确 5 节点/hash 见 JSON。建议此 ID 有界 S3。

## 根六 UI 图交叉核

- `UI-2c1712d35460`：Word/PDF/Image sidebars join Mm2 draft/save; image OCR result append connects recognition chain. No extra unassigned public child found.
- `UI-ad41d13c4a2d`：RuleSet snapshot and enabled forceDetect entries used by recognize-docx-images; no new unassigned public child.
- `UI-3f01047e6b59`：PDF native search vf2 joins worker resolver; image search OCR cache and PDF forced OCR branch joins page/search UI.
- `UI-339d8e53408d`：Single/batch OCR writes candidate draft then lc2; source preview/save partial mutation boundary unchanged.
- `UI-67e30cf66ad0`：vf2 native PDF search joins pdfjs worker resolver; audit source/page search leaf unchanged.
- `UI-32ce2fb60c5f`：Image OCR candidate append and page/OCR helpers join manual correction scope; no new unassigned public child.

六 UI 的上述连接未发现新增未读公开应用子边；该判断只覆盖本报告的 23 条业务链，根报告对六 UI 的其余格式/状态图仍为权威范围。两原 UI S3 候选不因本轮扩大到其他 256 ID。

## 证据边界与结论

配套 JSON 对每行记录实际 producer、generic/命名 preload、main handler、业务 consumer、状态/持久化、失败路径、明确叶，另有 105 个可重算整文件与逐行片段 SHA 节点。21 个 C 委托非脱敏/非 UI ID 和规则组两条 pending 均可**建议**有界 S3；未发现该范围另一条未读公开应用边。最终台账升格需 root 按稳定 ID 审批并维护生成视图；本报告不把我方 API 或 730 check 算作竞品运行。
