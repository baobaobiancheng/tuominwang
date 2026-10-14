# 人工业务契约追踪（公开包静态分析）

本轮核读 **63 / 217 个已知 IPC**，建立 6 条局部业务关系；另列辅助接口。**完整业务契约 0；全部建议维持 S2，竞品运行维持 R0。** 没有许可证，没有执行包内代码。

每条 IPC 的 JSON 同时保留原始包 handler 的精确 UTF-16 offset/hash、preload 暴露位置及下方人工行级证据。行号属于固定 hash 的 readable 派生快照，不能当作原始压缩文件行号。ASAR 成员对照结果见 JSON provenance。

## 关系图与依赖边界

### MANUAL-IMPORT · 导入与源文件生命周期

- `UI Ug2/Jg2` → `preload selectFiles/scanDroppedFolder`。证据：pick-ui, drop-ui。
- `UI Nn2（无已有 sourceRef）` → `条件 validateFolderSource → registerSource`。证据：import-ui。
- `folder _2 完成扫描` → `逐文件复核元信息 → S2 登记 sourceRef`。证据：scan。
- `registerSource handler S2` → `shared fp() registry.register`。证据：source-handler, registry。
- `registry.register` → `managed temp bytes / path Map`。证据：registry。
- `UI $n2` → `cancel await → releaseSources`。证据：import-ui。

### MANUAL-WORKSPACE · 项目保存、重开与恢复

- `UI C2/M2/N2` → `preload workspace.save/getSaveResult`。证据：workspace-ui。
- `dI handler n2/r2` → `startup injected sw/Hg`。证据：workspace-handler, workspace-injection。
- `sw.saveV2/open` → `L_ → Tx/Yb/vx/Fb and fp source registry`。证据：workspace-service, workspace-container。
- `Hg.save/open/discard` → `df protected store → .lrs files`。证据：recovery, protected-store。
- `sw recents` → `_g → recent.lri`。证据：workspace-injection, recents。

### MANUAL-PREVIEW · 预览源加载

- `UI Am2/Tm2 / workspace.loadSource` → `preload readSource`。证据：preview-ui, workspace-ui。
- `read-source → M2` → `registry.resolve → temp/provider bytes`。证据：source-handler, registry。

### MANUAL-DETECT · 检测与增量候选

- `UI request/session + listeners` → `preload detectOnly`。证据：detect-ui。
- `detect-only handler` → `su processDocx/processPdf/processImage/processTextInput`。证据：detect-handler。
- `su result/page callback` → `q2 OCR + y2 canonical + renderer result`。证据：detect-handler, detect-ui。
- `UI pauseSeals` → `n2 sender checked → engine.sealTask.pause`。证据：pause-ui, task-controls。

### MANUAL-OCR · OCR 缓存搜索与按页补识别

- `review UI invoke` → `generic preload ipcRenderer.invoke`。证据：ocr-ui-search, ocr-ui-region, ocr-ui-page, preload-generic。
- `batch-search/ocr-region` → `q2 cached pages geometry`。证据：ocr-search, ocr-region。
- `get-ocr-page missing cache` → `J2 shared promise → su.processPdfWithForcedOcr → q2`。证据：ocr-page。

### MANUAL-EXPORT · 导出与回执核对/取消

- `UI Gi2` → `preload apply with sourceRef/review payload`。证据：apply-ui。
- `apply handler` → `th filters → per-format masker → optional Mm mapping`。证据：apply-filter, apply-start, apply-format, mapping。
- `PDF branch` → `gh.renderSecure → canvas JPEG → new PDF bytes`。证据：apply-format, secure-pdf。
- `format buffer/result` → `A2 / MarkdownSourceWriter / commitMarkdownBuffer → file`。证据：apply-markdown, apply-write, write-helper。
- `receipt r2` → `UI Yp2/Up2 query / tm2 cleanup`。证据：apply-receipts-ui, apply-cancel-ui, task-controls。

### MANUAL-AUX · 已解析 handler 但未确立现行 UI 主链的辅助接口

只有 handler/preload 已核读；现行 UI 调用关系未确立。

## 逐项契约

### desensitization:select-files · 系统选择文件

`IPC-95d4f752bfb1` · MANUAL-IMPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数；系统选择器 openFile/multiSelections，扩展名过滤；renderer 再以 Fg2(name) 过滤。
- **输出类型**：取消返回 canceled:true,filePaths:[]；成功返回 filePaths 和 fileInfos(path,name,size,ext)。
- **前置条件**：需要 Electron 文件选择器；本 handler 无直接授权码断言。
- **内存和持久副作用**：只选择并 stat；UI 转成 pending 文件项，不等于已经检测。
- **失败、取消与恢复**：UI 将取消返回 null；选择/stat 抛错由 UI catch 显示失败；不更改已有审查。
- **尚未闭合**：Fg2 全部格式白名单尚未逐分支展开；OS 文件授权/可达性未运行。
- **证据**：pick-ui, pick-handler；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:scan-dropped-folder · 拖入文件夹扫描

`IPC-e29b03465bc3` · MANUAL-IMPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：folderPath 非空字符串；UI 限单一文件夹且不能与文件混拖。服务 lstat/realpath 检查普通目录、跳过符号链接/目录环/根外路径和不支持文件。
- **输出类型**：canceled:false、sessionId、sourceRootName/scannedAt、files（包含 sourceRef）、skipped、totalDiscovered/supportedBytes/counts；失败 canceled:false,error。没有 success 字段。
- **前置条件**：可访问本地普通目录；没有激活前置调用。
- **内存和持久副作用**：b2 内存记录扫描结果，12 小时按访问清理；末尾逐文件再次 lstat 检查后调用 S2 登记并复制受管源，返回 sourceRef。UI 用扫描清单构造批量项目。
- **失败、取消与恢复**：扫描报错 UI 保留当前审查；已登记的部分 sourceRefs 未见此处成组回滚。_2 调用未传 AbortSignal，不能归为可取消检测任务。
- **尚未闭合**：目录扫描中 TOCTOU 竞态未运行；UI folder registration 的完整边界仍需补审。
- **证据**：drop-ui, scan, pick-handler；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:validate-folder-source · 扫描后登记前校验

`IPC-96ccc7c0ce76` · MANUAL-IMPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：scanSessionId、relativePath（反斜线转 /）；须是该扫描结果已有相对路径。
- **输出类型**：success:true 或 success:false,error。
- **前置条件**：扫描会话有效；普通文件非符号链接，size 相同、mtimeMs 差不超过 1ms。
- **内存和持久副作用**：只读元信息；没有内容 hash 比对。UI Nn2 仅无 sourceRef 且有 path/relativePath/scanSessionId 时在 registerSource 前调用；已有 sourceRef 会先返回，正常扫描已登记文件不一定再走此校验。
- **失败、取消与恢复**：会话失效/文件变动/删除返回失败并阻止本次登记；不恢复原文件。
- **尚未闭合**：元信息相同但内容变化不在本校验覆盖范围；validate 与 register 间竞态未证明封闭。
- **证据**：validate-folder, import-ui, scan；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:register-source · 登记受管源文件

`IPC-8f1caa190dda` · MANUAL-IMPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：filePath 或非空 fileBuffer，fileName；路径 normalize；bytes 支持 Buffer/ArrayBuffer/view/array。legacy .doc/.wps 可转换为内部 DOCX。
- **输出类型**：success:true,sourceRef；可带 needsPassword/legacyOffice/internalDocxReused；失败 error 与可选 errorCode。
- **前置条件**：路径必须 stat.isFile；buffer 必须非空；本 handler 无直接激活断言。
- **内存和持久副作用**：普通路径复制进 safeTemp/lawbot-source-registry/<pid-uuid>；bytes 写临时文件并 SHA256；路径重复登记复用 Map 引用，并不重新复制。legacy 元信息另存 Map。
- **失败、取消与恢复**：异常包装失败；resolve 时临时文件缺失可从原路径重复制并清空旧 hash，因此 sourceRef 不等同永久内容寻址。登记中途 I/O 失败的孤立临时文件清理未证闭合。
- **尚未闭合**：Dp/Sp legacy 转换和格式探测内部未完整审计；来源路径授权/registry 跨窗口隔离未见本层约束。
- **证据**：import-ui, source-handler, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:unlock-source · 加密源文件解锁并替换引用

`IPC-d7d18b241f88` · MANUAL-IMPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceRef.id；password 非空、长度不超过 4096；格式限 docx/pdf/doc/wps。
- **输出类型**：新 sourceRef（可含 legacyOffice）；失败 DOCUMENT_PASSWORD_INVALID/DOCUMENT_UNLOCK_FAILED/DOCUMENT_ENCRYPTION_UNSUPPORTED 等。
- **前置条件**：旧引用有效；内容解密/魔数/大小约束必须通过。无直接产品激活断言。
- **内存和持久副作用**：登记解密后受管副本，保存 originalSourcePath，再 release 旧引用；UI 同步当前项、单批文件列表和 active ref。
- **失败、取消与恢复**：UI 120 秒超时仅拒绝等待，未中止主进程解密；新引用创建后旧引用释放失败可能使 UI 收不到新引用，未见事务回滚。
- **尚未闭合**：officecrypto/lp PDF 密码解密和大小限制具体实现未闭合；密码内存清理未审。
- **证据**：unlock-ui, source-handler, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:read-source · 按引用加载预览原件

`IPC-f071ce7c965b` · MANUAL-PREVIEW · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceRef.id 必填；可指定展示用 fileName；registry 不接受裸路径作为 resolve 替代。
- **输出类型**：success:true,fileName,data:Uint8Array（独立 buffer slice）；失败 success:false,error。
- **前置条件**：registry 记录有效；provider 流读取必须恰好满足登记 size；受保护 provider 下游可能要求解锁。
- **内存和持久副作用**：UI 单/批预览缓存 originalBuffer；registry 更新时间/hash；缺临时源时可能重新复制原路径。
- **失败、取消与恢复**：UI 30 秒 readSource timeout 未取消文件读取；错误不应被解释为空文档。
- **尚未闭合**：PDF/Word 浏览器渲染器完整坐标/分页链路未展开；preview blob 生命周期未全部追踪。
- **证据**：preview-ui, workspace-ui, source-handler, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:release-sources · 释放临时源及缓存

`IPC-d9b14aa97589` · MANUAL-IMPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceIds 数组，经字符串归一化。
- **输出类型**：success:true,released,removedEngineCaches；provider.close 抛错可直接 reject（handler 无统一 catch）。
- **前置条件**：按 registry ID；本层未显示 sender 归属检查。
- **内存和持久副作用**：移除 registry/path Map，关闭 provider、删除 managedPath；清理 canonical/legacy/originalPath、source OCR 和相应 engine 缓存；不会删除原始路径。
- **失败、取消与恢复**：registry 先移除再 provider.close；close 失败可中断后续清理；临时文件 rm 失败仅 warn。UI Bn2 catch 返回 0，不能据 0 判断已恢复原状态。
- **尚未闭合**：所有 provider 的 close 语义；UI 所有离开/销毁入口覆盖未全部审。
- **证据**：import-ui, source-handler, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:open · 按路径打开审查项目

`IPC-feb24aa50a4f` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：open 接收 filePath；open-dialog 无参数，Electron .tmm 文件选择。
- **输出类型**：success:true,data:{filePath,snapshot,sources,sourceRefs?,format}；选择取消 data:null；错误为 success:false,error:{code,message}。
- **前置条件**：TMM v2/v3 的唯一 local-cmk 槽必须属于本机密钥体系；读取解包 requireUnlockedCmk；v1 为单独 archive 路径，不能一概说所有格式加密。
- **内存和持久副作用**：sw.open→nw/L_.openCompatible→Tx/Yb reader→registerSources；从 snapshot 恢复 source OCR 缓存；recents.remember 写最近列表。
- **失败、取消与恢复**：registerSources 失败关闭 reader；最近列表写失败在 open 路径可传播，不能说报错即完全无内存副作用。v1 容量超限可弹另存 v2 提示，取消 TMM_V2_MIGRATION_CANCELED。
- **尚未闭合**：nw/Tx/Yb/xg 容器目录/流校验未穷尽；大文件迁移 R_ 与原子替换未全部核读。
- **证据**：workspace-ui, workspace-handler, workspace-service, workspace-container, key-read, key-write, workspace-injection, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:open-dialog · 选择打开审查项目

`IPC-86a65aa5ca0e` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：open 接收 filePath；open-dialog 无参数，Electron .tmm 文件选择。
- **输出类型**：success:true,data:{filePath,snapshot,sources,sourceRefs?,format}；选择取消 data:null；错误为 success:false,error:{code,message}。
- **前置条件**：TMM v2/v3 的唯一 local-cmk 槽必须属于本机密钥体系；读取解包 requireUnlockedCmk；v1 为单独 archive 路径，不能一概说所有格式加密。
- **内存和持久副作用**：sw.open→nw/L_.openCompatible→Tx/Yb reader→registerSources；从 snapshot 恢复 source OCR 缓存；recents.remember 写最近列表。
- **失败、取消与恢复**：registerSources 失败关闭 reader；最近列表写失败在 open 路径可传播，不能说报错即完全无内存副作用。v1 容量超限可弹另存 v2 提示，取消 TMM_V2_MIGRATION_CANCELED。
- **尚未闭合**：nw/Tx/Yb/xg 容器目录/流校验未穷尽；大文件迁移 R_ 与原子替换未全部核读。
- **证据**：workspace-ui, workspace-handler, workspace-service, workspace-container, key-read, key-write, workspace-injection, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:save · 保存项目及源引用换代

`IPC-c356082df625` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：requestId 可选；projectId/revision 必须与 snapshot.projectId/contentRevision 相同；filePath、sourceFilePath、sources/sourceRefs、format。
- **输出类型**：success:true,data:{projectId,filePath,savedRevision,savedAt,format,sourceRefs?}；错误标准 workspace error。
- **前置条件**：本机 protected write 可通过已解锁 CMK 或设备恢复槽；不等同每次弹密码。旧 v1 原地写、v2 原地升 v3 可要求另存。
- **内存和持久副作用**：sw.saveV2 从 supplied bytes、旧 archive、registry stream 取源；L_.saveSnapshot 创建新 DEK 和 local-cmk 槽，保存 snapshot+source+OCR segments+rules+decision/audit 数据；重开文件登记新 sourceRefs，释放旧引用，最近列表更新失败被忽略。
- **失败、取消与恢复**：同 requestId 同 sender 复用 Promise（不比较 payload），异 sender 冲突；回执为内存且限容量/时间。UI 传输失败轮询而非盲重写；旧 project receipt 不覆盖当前项目，较旧 revision 不覆盖新引用。提交后重开或登记失败是否已落盘需核对，非事务回滚保证。
- **尚未闭合**：vx/Fb/cf 原子替换/崩溃中断一致性未完整审；所有 schema tg/ig 和 source provider 未穷尽。
- **证据**：workspace-ui, workspace-handler, workspace-service, workspace-container, key-write, workspace-injection；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:save-result · 保存回执查询

`IPC-1ad8e879614a` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：requestId 字符串。
- **输出类型**：state:running/completed(receipt)/missing。
- **前置条件**：仅同 sender 能获取 nI 条目。
- **内存和持久副作用**：只查主进程内存回执，不重新保存；进程重启不保留。
- **失败、取消与恢复**：UI 6 次、间隔 500ms；仍无结果则 WORKSPACE_SAVE_UNCONFIRMED，阻止重复保存。missing 不能证明磁盘未写。
- **尚未闭合**：跨进程重启后的磁盘对账机制未找到。
- **证据**：workspace-ui, workspace-handler；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:save-recovery · 自动恢复快照

`IPC-9be2a0784913` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：projectId/revision/snapshot/sources/sourceRefs/formalFilePath/format；revision 与 snapshot 必须一致。
- **输出类型**：success:true,data:{projectId,savedRevision,savedAt,stale}；旧 revision 可返回 stale:true 和已有 revision。
- **前置条件**：恢复服务存在，源数据有效；protected write 使用本机 key hierarchy。
- **内存和持久副作用**：先按 fingerprint 写 sources/<docId>.lrs，随后 workspace.lrs；删过期源/旧 plaintext workspace.json，prune 超过 20 条；移除 .discarded 标记。
- **失败、取消与恢复**：无 task cancel；UI 失效 sourceRef 可重登记再重试。源文件先写、快照后写，未证明多文件事务；失败可留源文件，不能说完整回滚。
- **尚未闭合**：df/cf 原子提交完整审计；自动保存节流与所有离开入口未全部核读。
- **证据**：autosave-ui, workspace-handler, recovery, protected-store, key-write, workspace-injection；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:open-recovery · 打开自动恢复

`IPC-8ed0acbb4144` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：projectId。
- **输出类型**：snapshot,sources:{},sourceRefs,format；失败标准 workspace error。
- **前置条件**：workspace.lrs 存在且 schema/project 匹配；读取需解锁；旧明文 workspace.json 返回迁移必需错误。
- **内存和持久副作用**：读取受保护 snapshot；释放该恢复旧打开引用；验证 source 长度，Markdown 重新解析比对 sidecar；给源创建惰性解密 provider。
- **失败、取消与恢复**：登记一半失败 release 本次 refs；UI KEY_HIERARCHY_LOCKED 提示解锁后重试。无单独取消入口。
- **尚未闭合**：所有格式来源哈希校验不等同 Markdown sidecar 校验；provider 读取中途损坏语义未全部审。
- **证据**：workspace-ui, workspace-handler, recovery, protected-store, key-read；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:discard-recovery · 丢弃恢复记录

`IPC-f53f8972c1a5` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：projectId。
- **输出类型**：success:true,data:null；否则标准 workspace error。
- **前置条件**：恢复服务可用；无直接激活断言。
- **内存和持久副作用**：先 release 打开的源，写 .discarded，再递归删除恢复目录；不删除正式 .tmm/原件。
- **失败、取消与恢复**：EPERM/EBUSY/ENOTEMPTY/EACCES 删除失败被转换 false，discard 未要求必须删除成功；标记让列表隐藏，后续启动 prune 重试。成功回执不是物理目录已删除证明。
- **尚未闭合**：文件锁/崩溃后的真实恢复未运行。
- **证据**：workspace-ui, workspace-handler, recovery；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:list-recent · 最近项目列表

`IPC-7e55b9d273b1` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：success:true,data:recent[]；附 fileExists/reusable 信息。
- **前置条件**：recent index 使用 protected write 读取通道，可通过设备恢复槽。
- **内存和持久副作用**：过滤磁盘不存在项目并回写 recent.lri；首次旧 recent.json 迁移可删除旧文件。不是纯无副作用 list。
- **失败、取消与恢复**：读取/迁移失败可返回空列表；空不等于没有历史项目；不删除 tmm。
- **尚未闭合**：UI 列表所有操作/恢复提示不同筛选语义仍需全量审。
- **证据**：workspace-ui, workspace-handler, workspace-service, recents, workspace-injection；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:forget-recent · 移除最近记录

`IPC-3c8789ad9a8f` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：filePath；按 resolve 路径比较。
- **输出类型**：success:true,data:null 或 workspace error。
- **前置条件**：可读写最近索引；无产品授权断言。
- **内存和持久副作用**：只从 recent.lri 项移除并重写；没有 rm 原 .tmm。
- **失败、取消与恢复**：UI success 后更新列表；失败提示原审查文件未删除。无取消任务。
- **尚未闭合**：protected store 提交失败恢复未闭合。
- **证据**：forget-ui, workspace-handler, workspace-service, recents；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:detect-only · 检测候选并增量预览

`IPC-7d7d2d58da91` · MANUAL-DETECT · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceRef、enabledRules 数组、requestId/sessionId、route/hint/overrideDocType、ruleSetSnapshot/workspaceCorrections；可选 pageNumbers/manualPageRotations/sealsOnly/completedSealPages。打包版删除 debug 字段。
- **输出类型**：success、originalText、matches、route、canonicalDocument、format sidecars；PDF 可含 pdfOcrOutcome/sealProgress；事件 progress/page-processed 以 requestId 关联。debug only fields 打包时省略。
- **前置条件**：先 assertActivatedOrThrow；sourceRef 必须可 resolve；格式限 DOCX/legacy 已转换、PDF、jpg/jpeg/png、Markdown；sealsOnly 限 PDF。enabledRules 未提供会在 forEach 抛错。
- **内存和持久副作用**：n2 注册 AbortController；su 分派 DOCX/text-PDF/scanned-PDF/image/Markdown；OCR 页缓存、canonical Map、DOCX temp path、部分 engine sidecars/日志可落盘。成功只表示候选检测，不是脱敏文件交付。
- **失败、取消与恢复**：传播到 handler 的 Kp 取消异常返回 success:false,canceled:true，finally 删除 task；processImage 底层 catch 会把异常转换 success:false/error，不能保证各格式取消都透传 canceled 标志。已发送页/缓存未 rollback。PDF OCR 部分失败有 failures；UI 可保留 incomplete 进度，不能按 done 认定每页成功。
- **尚未闭合**：su 内全部识别策略/NER/OCR Python 子进程、Markdown adapters 未逐层闭合；ruleset 冲突/去重/offset 修正规则 Wd/lm 未完全展开。
- **证据**：detect-ui, detect-handler, detect-service-docx, detect-service-pdf, detect-service-image, registry, ocr-cache；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:recognize-docx-images · DOCX 图片补充 OCR

`IPC-81f79eee361a` · MANUAL-DETECT · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceRef、requestId/sessionId、enabledRules、route/hint、workspaceCorrections/ruleSetSnapshot、tempDocxPath。
- **输出类型**：success/matches（过滤 meta.region=image_ocr）、ocrImageInfos/canonicalDocument 等；取消 canceled:true。
- **前置条件**：产品激活，输入转换后 DOCX；使用 processDocx skipImageOcr:false,imageOcrOnly:true。
- **内存和持久副作用**：n2 注册 docx-image-ocr task，补 canonical reviewSource SHA256/缓存；不保存用户导出。
- **失败、取消与恢复**：finally 删除 task；catch 取消异常才返回 canceled:true，其他错误字符串。正常返回分支未检查 b3.success 而硬编码 success:true，底层若把失败序列化而不 throw，可能形成空候选成功；不能把成功回执作为图片全部识别完成证明。底层缓存不自动撤回。
- **尚未闭合**：Iu 临时 DOCX 与重复图片映射完整生命周期；所有 DOCX 图片/嵌入对象格式支持未运行。
- **证据**：docx-images-ui, docx-images, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### image-review:batch-search · 缓存内批量搜索

`IPC-4dd20e80cae3` · MANUAL-OCR · UI 关系：tracked · S2/R0

- **输入与过滤**：fileName/searchText 必须 truthy，ocrCacheKey 默认 fileName；pageIndex 可选零基，仅筛对应 pageNumber=pageIndex+1。
- **输出类型**：success:true,results:几何命中[],checkedPageNumbers；没有缓存返回 error；结果含页、OCR尺寸、匹配行、可选跨行 bboxes。
- **前置条件**：q2 已有 OCR 页；本 handler 无直接激活断言。
- **内存和持久副作用**：只查询缓存和几何计算，不扫描原图、不持久保存审查决定。charBoxes 优先，缺失按字符宽度估计；跨相邻最多 4 行组合。
- **失败、取消与恢复**：UI 15 秒 timeout 是等待超时，无任务 cancel；成功 results:[] 只证明所查缓存页无命中，不证明整份文档没有该词。
- **尚未闭合**：wm/xm 文本归一化和 dd 去重全部边界；非 BMP 文本与几何精度待运行。
- **证据**：ocr-ui-search, ocr-search, ocr-cache, preload-generic；原始 handler/preload 精确范围在 JSON 同名条目。

### image-review:ocr-region · 框选读取缓存文字

`IPC-910347ed48b5` · MANUAL-OCR · UI 关系：tracked · S2/R0

- **输入与过滤**：fileName/cacheKey、pageNumber、canvasX/Y/W/H、canvasWidth/Height；框坐标按页像素比例换算。
- **输出类型**：success:true,text,ocrBbox 或 success:false,text:""；text 可为空且 success:true。
- **前置条件**：缓存页和 pageWidth/Height 有效；不是对区域重新运行 OCR。
- **内存和持久副作用**：charBox 中心点在框内时取字；缺 charBoxes 时按行宽均分近似。UI 检查当前框/请求序号防止旧结果覆盖新框。
- **失败、取消与恢复**：UI 5 秒超时提示手输；没有 AbortController。handler 未验证 canvasWidth/Height 正数有限数，调用者约束与零尺寸行为未闭合。
- **尚未闭合**：旋转/裁切坐标各 UI 分支未逐个证明；字框 Unicode 索引一致性未运行。
- **证据**：ocr-ui-region, ocr-region, preload-generic；原始 handler/preload 精确范围在 JSON 同名条目。

### image-review:get-ocr-page · 按页读取并按需补 OCR

`IPC-ba07bb14e3df` · MANUAL-OCR · UI 关系：tracked · S2/R0

- **输入与过滤**：fileName/cacheKey、正数有限 pageNumber；可选 pdfBuffer、totalPages/pageNumbers。
- **输出类型**：success:true,page:{pageNumber,pageWidth,pageHeight,lines[text,confidence,bbox,charBoxes]}；无页 success:false,page:null。
- **前置条件**：缓存缺失且有可转换 bytes 才启动 su.processPdfWithForcedOcr；没有直接激活断言。
- **内存和持久副作用**：J2 按 cacheKey 合并并行 forced OCR Promise，Af/Nf 回填缓存；候选页来自 pageNumbers 或 1..totalPages 或当前页。
- **失败、取消与恢复**：每 250ms 等待目标页或后台结束；J2 finally 清理。未进 n2 任务 Map/未传 cancelSignal，因此不能承诺 desensitization:cancel 会取消此补 OCR。
- **尚未闭合**：forced OCR 内部识别/子进程停机/页号上界未完整审。
- **证据**：ocr-ui-page, ocr-page, ocr-cache, preload-generic；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:apply · 应用已审查候选并导出

`IPC-5a998529649c` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceRef、matches、outputPath/outputDir、requestId；格式选项/假名/遮罩/删除页/旋转/approvedConflicts/Markdown reviewSnapshot。th 先过滤 signature/handwriting/handwritten_signature；不等于每个输入匹配均执行。exportMapping/mappingOutputPath 被拒绝。
- **输出类型**：success:true,result,outputPath,pseudonymMappingPath?,textPath?；result 含 matches、格式保留/文本层/Markdown报告、preserveOnCancel 等。失败含 error/errorCode、reviewTargets/draft 可能存在；canceled 是失败分支。
- **前置条件**：产品激活；有效 sourceRef；Markdown 快照源 hash 一致；格式和候选定位满足对应写回条件。自定义/default 假名 MD 要全部成功应用；保存映射失败阻断文档导出。
- **内存和持久副作用**：requestId/sender 回执去重；进度带 sequence/heartbeatAt，5秒心跳。PDF→gh.renderSecure 逐页画布遮罩后 JPEG 嵌入新 PDF；DOCX 优先 preserved buffer，允许生成式降级（legacy 有更严拒绝）；MD source writer 或 Gf exporter。假名 .lpm 先写，最终输出后记录 receipt。
- **失败、取消与恢复**：重复 running 返回 APPLY_ALREADY_RUNNING，completed 返回旧 receipt；不是 compare-payload 幂等。取消触发 finally rm cleanupPaths（错误吞掉）；普通失败不执行同样全部输出清理，映射不随文档失败回滚。普通 A2 writeFile 可覆盖同名；MD 单独冲突策略，UI _nonInteractiveSave:true 时拒绝已存目标。成功/失败回执只在内存。
- **尚未闭合**：DOCX preserved 修复完整规则/legacy 转换/PDF bbox 推导/全部 MD worker 与 writer 未闭合；所有异常发生点是否已写文件/部分写字节未穷尽；保护原件的调用者路径校验及非 MD 覆盖取消删除风险需专项审计。
- **证据**：apply-ui, apply-receipts-ui, apply-filter, apply-start, apply-markdown, apply-format, apply-write, write-helper, mapping, secure-pdf, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:get-apply-result · 导出结果对账

`IPC-8c5afeb517e6` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：requestId trim。
- **输出类型**：state:running/completed(receipt)/unknown。
- **前置条件**：receipt senderId 必须等于调用窗口 senderId。
- **内存和持久副作用**：仅内存回执查询，无写入；完成回执在后续写入时清理超15分钟/超过100项记录。
- **失败、取消与恢复**：UI 传输中断匹配错误后 4 次500ms查询；未知则 APPLY_RESULT_UNCONFIRMED，锁住重复导出，可人工核对后解除。unknown 不代表无产物。
- **尚未闭合**：重启后无持久任务对账；IPC其他错误类别是否进入核对路径未穷尽。
- **证据**：apply-receipts-ui, task-controls, apply-start；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:cancel · 取消注册任务

`IPC-88cd1d915682` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：非空 requestId。
- **输出类型**：success:true,canceled:true 表示已 abort；不存在返回 canceled:false；空ID失败。
- **前置条件**：任务存在 n2；该 handler 没有 pause-seals/get-apply-result 的 sender 校验，需单列待审，不据此推断可利用。
- **内存和持久副作用**：AbortController.abort(Hp())；向原任务 sender 发 canceled progress；实际停止/清理要等底层检查 signal 与 finally。
- **失败、取消与恢复**：abort 回执不是所有文件已删除/子进程已停止；detect 已发布缓存保留；apply aborted 删除登记 cleanupPaths 且 rm 错误吞掉。未注册 forced OCR 不受此入口管理。
- **尚未闭合**：sender 信任边界/多窗口可达性；各底层 signal 检查点及取消延迟未运行。
- **证据**：import-ui, apply-receipts-ui, task-controls, apply-write, detect-handler；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:pause-seals · 暂停印章子任务

`IPC-e4cf3e6c3c0a` · MANUAL-DETECT · UI 关系：tracked · S2/R0

- **输入与过滤**：requestId。
- **输出类型**：success:true 或 success:false,error。
- **前置条件**：任务 kind=detect-only、同 sender、有 engine。
- **内存和持久副作用**：调用 engine.pauseSealDetection→sealTask.pause，非整个 OCR/检测取消。
- **失败、取消与恢复**：完成/窗口不匹配报错；已完成印章页保留，后续 detect 可传 completedSealPages。
- **尚未闭合**：sealTask.pause 与底层模型实际协作终止未运行。
- **证据**：pause-ui, task-controls, detect-handler；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:cleanup-paths · 取消后清理已生成输出

`IPC-fd1ca8c6cb27` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：paths 数组，trim/filter；每条 resolve 后匹配成功 receipt.outputPath（小写比较）。
- **输出类型**：success:true,cleaned；rm 抛错可 reject。
- **前置条件**：同 sender、completed success、15分钟内、非 preserveOnCancel、未 cleanupUsed 的 receipt。
- **内存和持久副作用**：fs.rm(force:true) 删除匹配输出并标 cleanupUsed；不会接受任意没有回执的路径。
- **失败、取消与恢复**：UI 报告 cleaned/requested 并提示人工核对未清理输出；不删除假名映射。路径大小写比较在大小写敏感文件系统行为未验证。
- **尚未闭合**：原路径已被其他进程替换时 inode/content 未再核对；非 MD 覆盖与保护源路径一致性待审。
- **证据**：apply-cancel-ui, task-controls, apply-write；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:process-files · 旧批量读入辅助接口

`IPC-27dd16394cd6` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：filePaths,options.outputDir；解构在内层处理 try 外。
- **输出类型**：success:true,outputDir,results[fileName,fileType,filePath,buffer或error]；可部分失败。
- **前置条件**：直接激活断言；本地文件可读。
- **内存和持久副作用**：创建时间戳输出目录与已脱敏子目录，只 readFile 并返回字节；这里没有执行检测/脱敏。
- **失败、取消与恢复**：逐文件失败被收集；建目录后读取失败不会删除目录；无 requestId/cancel。
- **尚未闭合**：当前 UI 主链调用尚未找到；仅 preload 暴露，不能强行挂到现行导出按钮。
- **证据**：aux-files；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:save-file · 直接写内容辅助接口

`IPC-f1f713df2b98` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：outputDir,fileName,content,type(buffer/text)。
- **输出类型**：success:true,outputPath 或 false,error。
- **前置条件**：直接激活断言。
- **内存和持久副作用**：A2 写 outputDir/已脱敏/fileName；不自己核验输入 content 已脱敏。
- **失败、取消与恢复**：写入失败返回错误；默认 writeFile 可覆盖同名，无取消/回执。
- **尚未闭合**：现行 UI 调用未找到；路径/内容安全检查依赖调用者，不能当安全导出完成契约。
- **证据**：aux-files, write-helper；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:save-markdown-draft · 保存待人工处理 Markdown

`IPC-629ace0aecd1` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：outputPath 需 .md，content 字符串非空；重命名 _待人工处理稿.md。
- **输出类型**：success:true,outputPath 或 false,error。
- **前置条件**：直接激活断言。
- **内存和持久副作用**：prepend 未通过自动脱敏检查警告，A2 写文件，Cp 记录 degraded/manual-draft。
- **失败、取消与恢复**：若写后日志失败可回失败而文件已存在；这份草稿不等同安全脱敏结果，无 task cancel。
- **尚未闭合**：报告弹窗到该入口的全 UI 调用尚未本轮核读；Cp 具体日志落盘/失败处理。
- **证据**：aux-draft, write-helper；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:select-folder · 选择文件夹并登记源

`IPC-523337153cab` · MANUAL-IMPORT · UI 关系：not-established · S2/R0

- **输入与过滤**：无参数；Electron openDirectory。
- **输出类型**：选择取消 canceled:true；成功 canceled:false,sessionId,files[sourceRef],skipped/counts；失败 canceled:false,error。
- **前置条件**：普通目录可读，scan 服务校验链接/根路径；无直接激活断言。
- **内存和持久副作用**：复用 _2 全扫描+逐文件再次检查并 S2 登记受管副本；b2 保存扫描会话。
- **失败、取消与恢复**：取消选择没有扫描；扫描中途失败可能已登记部分源，无任务取消/成组回滚。
- **尚未闭合**：select-folder 现行独立按钮调用未定位；与拖放同服务不等于同UI入口。
- **证据**：pick-handler, scan, registry；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:create-folder-output · 创建独立结果目录

`IPC-e8dcb4d0e8b3` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：scanSessionId 可选、sourceRootName 可覆盖来自扫描的根名；只要名字存在并非强制会话存在。
- **输出类型**：success:true,exportSessionId,outputRoot；选择取消 success:false,canceled:true；失败 error。
- **前置条件**：选择普通本地输出目录非符号链接，Wf realpath；有扫描 sourceRootPath 时检查源/目标不能互为祖先。
- **内存和持久副作用**：sanitize 根名并 mkdir(recursive:false) 创建 <name>_已脱敏；EEXIST 用时间/序号最多999，w2内存登记12小时会话。
- **失败、取消与恢复**：无 cancel task；创建后调用者失败不会自动删新目录。缺扫描会话时源目录嵌套检查缺少 sourceRootPath。
- **尚未闭合**：扫描失效而手传rootName时的UI约束；目录创建到写文件期间符号链接替换竞态。
- **证据**：folder-output, folder-path, ui-folder-output, scan；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:resolve-folder-output-path · 结果相对路径解析

`IPC-3bea45842355` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：exportSessionId,relativePath；Uf拒绝空/NUL/绝对路径/盘符、空组件/./../非法字符和根外解析。
- **输出类型**：success:true,outputPath；会话过期或路径非法 success:false,error。
- **前置条件**：w2 中12小时内输出会话。
- **内存和持久副作用**：仅字符串路径解析，无创建目录或写文件。
- **失败、取消与恢复**：没有任务取消；会话失效提示重选保存位置。
- **尚未闭合**：Uf 是路径词法约束，未在这里验证每级真实路径/链接。
- **证据**：folder-manifest, folder-path, ui-folder-path；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:write-folder-manifest · 写文件夹处理清单

`IPC-e84cabdffc27` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：exportSessionId,batchName,entries；每项 sourceRelativePath 必须字符串；存在 outputRelativePath 则 Uf 校验。status 等枚举未在 handler 全部验证。
- **输出类型**：success:true,manifestPath,outputRoot；失败 success:false,error。
- **前置条件**：有效w2会话；目标清单文件不能已存在（wx）。
- **内存和持久副作用**：Hf转义单元格，生成 脱敏处理清单.html；统计来自调用者entries，不重新检查输出文件。
- **失败、取消与恢复**：重复写EEXIST返回失败；部分写失败未见删除半成品。无检测任务取消；清单说明本身明确不是质量证明。
- **尚未闭合**：非法status计数及源相对路径信息约束未完全验证；清单与实际产物一致性要运行核对。
- **证据**：folder-manifest, folder-path, ui-folder-manifest；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:select-output-dir · 选择导出目录

`IPC-102f9010076c` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数；openDirectory/createDirectory。
- **输出类型**：canceled:true,outputDir:null 或 canceled:false,outputDir。
- **前置条件**：Electron OS对话框；无产品激活断言。
- **内存和持久副作用**：返回路径；对话框允许用户新建目录；不导出文件。
- **失败、取消与恢复**：对话框拒绝可IPC reject；没有handler统一catch。
- **尚未闭合**：文件系统授权结果未运行。
- **证据**：output-dialog, ui-output-path；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:select-save-path · 选择文件保存路径

`IPC-7f07e8bd74ee` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：defaultFileName；按扩展名选DOC/DOCX/WPS/PDF/MD/图片filter，均允许全部文件。
- **输出类型**：canceled:true,filePath:null 或 canceled:false,filePath。
- **前置条件**：Electron保存对话框；filter不是强制扩展名校验。
- **内存和持久副作用**：返回建议路径，不写内容。
- **失败、取消与恢复**：没有catch；空payload访问defaultFileName可能reject。取消只取消选择。
- **尚未闭合**：各格式后续路径/源文件保护必须在apply服务另审。
- **证据**：output-dialog, ui-output-path；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:read-file · 按裸路径读取文件

`IPC-a07c3fdcbe45` · MANUAL-PREVIEW · UI 关系：not-established · S2/R0

- **输入与过滤**：裸 filePath 字符串。
- **输出类型**：success:true,data:Uint8Array,fileName,fileType；失败success:false,error。
- **前置条件**：fs.readFile可访问；无sourceRef/直接激活/本handler sender检查。
- **内存和持久副作用**：读整个文件进内存，复制buffer给renderer；无持久写。
- **失败、取消与恢复**：fs异常包装；无大小上限/取消任务见于此handler。
- **尚未闭合**：当前UI裸路径调用未本轮定位；上游路径授权和多窗口边界。
- **证据**：misc-read；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:get-resource-diagnostics · 开发态资源统计

`IPC-7b3e67a5a715` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：sourceRefs/canonicalDocuments数量、managedSourcePaths、engineOcrCache、ocrDataCache(files/estimatedBytes/maxBytes)裸对象。
- **前置条件**：仅 !app.isPackaged 时注册；preload可暴露不代表生产可调用。
- **内存和持久副作用**：读内存统计，无持久写。
- **失败、取消与恢复**：打包版没有handler，调用可能reject；无取消。
- **尚未闭合**：开发UI入口未定位；估算内存不是实测RSS。
- **证据**：misc-read, registry, ocr-cache；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:get-markdown-export-stats · Markdown导出日志统计

`IPC-a09f09579955` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：Zf统计对象；读取缺失文件返回Zf([])，其他错误throw。
- **前置条件**：读userData/markdown-export.log，尾部最多2MiB；有截断时弃首条可能不完整行。
- **内存和持久副作用**：打开/关闭文件并聚合，不重新审查文档。
- **失败、取消与恢复**：ENOENT不是故障；finally关闭handle，无取消。
- **尚未闭合**：Zf全部统计字段/过滤器未展开；UI调用未本轮定位。
- **证据**：misc-read；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:get-default-output-dir · 取得默认输出目录

`IPC-9a8232e44fb9` · MANUAL-EXPORT · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：success:true,outputDir；创建失败success:false,error,outputDir:home。
- **前置条件**：本地 Documents 路径可创建。
- **内存和持久副作用**：mkdir Documents/脱敏猫输出 recursive；名称get仍有写副作用。
- **失败、取消与恢复**：失败返回home只是fallback字段，不保证home可写或成功；无取消。
- **尚未闭合**：UI所有fallback分支对success的使用需运行核对。
- **证据**：misc-write, ui-output-path；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:open-output-dir · 在系统打开输出位置

`IPC-3211d99d0f20` · MANUAL-EXPORT · UI 关系：not-established · S2/R0

- **输入与过滤**：目录路径字符串。
- **输出类型**：success:true 或 false,error。
- **前置条件**：shell.openPath可处理本地路径；无直接激活断言。
- **内存和持久副作用**：委托OS打开路径，不验证脱敏结果。
- **失败、取消与恢复**：openPath非空错误字符串和异常都转通用失败；无取消。
- **尚未闭合**：OS打开效果/文件内容不在静态证据范围；本轮UI直接调用位置未定位。
- **证据**：misc-write；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:save-report · 保存调用者报告文本

`IPC-9577d3a9d6d0` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：outputDir,fileName,content。
- **输出类型**：success:true,reportPath 或 false,error/requiresActivation。
- **前置条件**：assertActivatedOrThrow。
- **内存和持久副作用**：A2写outputDir/fileName UTF8；不验证报告对应真实运行结果。
- **失败、取消与恢复**：catch包装；默认writeFile可覆盖，失败可留下部分文件，无任务cancel。
- **尚未闭合**：现行UI调用未定位；输入路径和内容格式依赖调用者。
- **证据**：misc-write, write-helper；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:detect-route-only · 仅预估材料类型

`IPC-42a70f50df5f` · MANUAL-DETECT · UI 关系：tracked · S2/R0

- **输入与过滤**：sourceRef,fileName,overrideDocType；打包删除debug字段。
- **输出类型**：success,route,error,errorCode；不返回matches/脱敏输出。
- **前置条件**：有效sourceRef；本handler无直接激活断言。DOCX取Fe文字；纯文字PDF仅前1页/6000字符，MD scanText前6000；图片和非纯文字PDF用空文本+文件名/override选策略。
- **内存和持久副作用**：仅粗路由结果；异常可写crash.log；不会为了图片路由重新OCR。UI批量失败时可退general/screenshot。
- **失败、取消与恢复**：无n2 task注册/取消；服务区分FILE_ENCRYPTED/TEXT_EMPTY/FILE_INVALID/FILE_READ_FAILED等。
- **尚未闭合**：router策略及classifier判据未全面穷尽；路由不是实体识别准确率。
- **证据**：route-handler, route-service, registry, drop-ui；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:update-runtime-rules · 当前任务运行时规则

`IPC-0ea3b09c375b` · MANUAL-DETECT · UI 关系：tracked · S2/R0

- **输入与过滤**：requestId/sessionId,entityType,pattern必非空；scope project/spot/否则file；ruleType blacklist/否则whitelist。
- **输出类型**：success和appliedToTasks/added/whitelistApplied；blacklist返回deprecated:true,0；spot返回immediateOnly:true,0。
- **前置条件**：project用sessionId筛detect-only且有engine；file按requestId；handler没按sender再筛。
- **内存和持久副作用**：调用engine.applyRuntimeRuleUpdate，修改现有任务内存规则；不写规则集库。
- **失败、取消与恢复**：UI调用catch吞异常，不代表已更新；0可能无任务或降级分支。无额外取消。
- **尚未闭合**：engine applyRuntimeRuleUpdate完整去重/模式含义；sender信任边界未运行。
- **证据**：runtime-rule, ui-runtime-rule；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:process-file-main · 旧单文件整链辅助处理

`IPC-c1cec3199992` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：filePath、enabledRules、enableOCR/outputDir/mode/matches、可选假名/route/fullRedactRules；th过滤签名类。
- **输出类型**：success:true,result 或 false,error,result?；不保证提供实际outputPath。
- **前置条件**：直接激活断言；裸路径读取；仅docx/pdf/jpg/jpeg/png；enabledRules需forEach。
- **内存和持久副作用**：su处理；PDF事件发getAllWindows()[0]而非当前sender且无requestId；有desensitizedText/outputDir时尝试生成并写文件。
- **失败、取消与恢复**：最终输出写入catch为空，仍可success:true；无n2注册/cancelSignal；不能用成功结果推断已生成文件。
- **尚未闭合**：现行renderer调用未定位，不挂到正式apply按钮；旧流程安全PDF策略与新apply不能混同。
- **证据**：old-process, apply-filter, write-helper；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:generate-reports · 生成报告/处理证明

`IPC-85f474cad97a` · MANUAL-AUX · UI 关系：not-established · S2/R0

- **输入与过滤**：results[],outputDir。
- **输出类型**：success:true,report,outputDir；catch success:false,error。
- **前置条件**：本handler无直接激活断言；输出目录可写。
- **内存和持久副作用**：su.generateReport/HtmlReport/ProcessingProof写JSON/HTML/MD；append userData/support/validation_log.csv。copy_export_test=blocked、page_continuity_check=pass、manual_ops_count=0为固定字段；OCR均值只来自输入results。
- **失败、取消与恢复**：多文件顺序写，无事务；后一个失败前面的可能已存在；CSV错误吞掉。无任务取消。
- **尚未闭合**：generateReport内部统计schema未全量展开；这些固定元数据不是实际验收证明。
- **证据**：report-generator, write-helper；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:progress · 进度通知通道

`IPC-8fc7e5c07051` · MANUAL-DETECT · UI 关系：tracked-event · S2/R0

- **输入与过滤**：main→renderer事件，不是invoke请求；payload格式随检测/导出/旧单文件流程变化。
- **输出类型**：preload listener转发(_event,update)，返回unsubscribe移除listener。
- **前置条件**：renderer注册监听；UI常按requestId/fileName筛选，apply按sequence去重。
- **内存和持久副作用**：更新UI进度、Markdown增量候选、心跳；无通道自身持久写。
- **失败、取消与恢复**：发送异常多数吞掉；done不是最终落盘回执；旧process-file-main无requestId会被现行过滤忽略。
- **尚未闭合**：全部事件union尚未完整类型化；断流/重连运行未验证。
- **证据**：ui-progress, detect-handler, apply-start, old-process；原始 handler/preload 精确范围在 JSON 同名条目。

### desensitization:page-processed · 增量页结果通知

`IPC-58567733591e` · MANUAL-DETECT · UI 关系：tracked-event · S2/R0

- **输入与过滤**：main→renderer；requestId/fileName/pageNumber、phase/matches/ocrCachePage等随格式变化。
- **输出类型**：preload onPageProcessed 转发并提供unsubscribe。
- **前置条件**：订阅存在；正式检测以任务ID匹配，旧处理未附ID。
- **内存和持久副作用**：主进程Af保存OCR页后发送；UI逐页合并检测结果供提前审查。
- **失败、取消与恢复**：发送失败不撤销cache；取消可能已保留页结果；回调异常存在吞掉分支。
- **尚未闭合**：全部单/批监听解绑和旧事件兼容未穷尽。
- **证据**：ui-page, detect-handler, old-process；原始 handler/preload 精确范围在 JSON 同名条目。

### image-review:clear-ocr-cache · 删除展示OCR缓存键

`IPC-47ecc7525dfe` · MANUAL-OCR · UI 关系：not-established · S2/R0

- **输入与过滤**：参数为缓存key字符串，直接q2.delete(t2)。
- **输出类型**：始终success:true（含不存在key）。
- **前置条件**：无产品激活或sender验证见于本handler。
- **内存和持久副作用**：仅删q2一个key；没有同步清理J2 forcedOCR或su engine cache。
- **失败、取消与恢复**：并发forcedOCR可之后重填；不代表取消或全量缓存释放。
- **尚未闭合**：renderer生命周期调用/完整缓存层一致性未本轮核读。
- **证据**：ocr-page, ocr-cache, preload-generic；原始 handler/preload 精确范围在 JSON 同名条目。

### ocr:health-check · OCR可用性预检

`IPC-f02ad1fa2413` · MANUAL-OCR · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：available及可选diagnosticSummary；异常available:false。
- **前置条件**：cs按darwin取Apple Vision适配器，否则Paddle；非单一通用OCR依赖。
- **内存和持久副作用**：mac调用helper getInfo；非mac调用Paddle可用性测试，失败可收集诊断/写日志。UI 5秒超时构造available:true,timeout:true后直接return，不是实测可用。
- **失败、取消与恢复**：无n2任务取消；预检异常UI部分吞掉。
- **尚未闭合**：helper/Python实际依赖与模型运行未验证；available不是识别准确率。
- **证据**：ocr-diagnostic, ocr-platform, ocr-paddle-diagnostic, ui-ocr-health；原始 handler/preload 精确范围在 JSON 同名条目。

### ocr:collect-diagnostic · OCR诊断材料

`IPC-0ecb1de9c806` · MANUAL-OCR · UI 关系：tracked · S2/R0

- **输入与过滤**：原因字符串或缺省user_requested。
- **输出类型**：success:true,summary,filePath?；mac适配器只返回summary，filePath可缺。
- **前置条件**：cs平台适配器可创建。
- **内存和持久副作用**：mac系统信息；Paddle记录Python/model路径、Python版本/import等并可能保存诊断文件；不是外发网络上传接口。
- **失败、取消与恢复**：catch success:false,error；UI复制诊断；无取消任务。
- **尚未闭合**：诊断信息最终文件路径/脱敏策略未穷尽；实际程序执行被本轮禁止。
- **证据**：ocr-diagnostic, ocr-platform, ocr-paddle-diagnostic, ui-ocr-diagnostic；原始 handler/preload 精确范围在 JSON 同名条目。

### get-pdfjs-worker-path · PDF worker地址

`IPC-a982d6d137ce` · MANUAL-PREVIEW · UI 关系：not-established · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：{type:"fileUrl",fileUrl}；找不到打包资源时throw。
- **前置条件**：打包需app.asar.unpacked/node_modules/pdfjs-dist/build/pdf.worker.mjs；开发用相对node_modules路径。
- **内存和持久副作用**：必要时复制到temp/lawbot-pdf-worker.mjs；大小相同且mtime较新则复用，未比较内容hash。
- **失败、取消与恢复**：复制失败返回原资源URL；没有任务取消。
- **尚未闭合**：renderer PDF worker加载/跨协议行为未本轮关联；资源依赖未实际运行。
- **证据**：pdf-worker；原始 handler/preload 精确范围在 JSON 同名条目。

### image:save-annotations · 保存图片标注JSON

`IPC-5569a4344615` · MANUAL-AUX · UI 关系：tracked · S2/R0

- **输入与过滤**：imagePath,bboxes；本handler不校验bbox schema。
- **输出类型**：success:true,path,entityCount 或 false,error。
- **前置条件**：目录需可写；无直接激活断言。
- **内存和持久副作用**：写图片同目录/同basename.json，含imagePath,imageSize:{},bboxes,savedAt,version；覆盖同名。
- **失败、取消与恢复**：UI随后仍调用exportLabels，两笔非原子；任一失败提示核对；无取消任务。
- **尚未闭合**：ImageReviewWindow实际路由可达性和数据来源未全量核读。
- **证据**：annotation, ui-annotation；原始 handler/preload 精确范围在 JSON 同名条目。

### image:export-labels · 导出图片训练标注

`IPC-d3864dc80560` · MANUAL-AUX · UI 关系：tracked · S2/R0

- **输入与过滤**：imagePath,imageWidth/imageHeight,bboxes；bbox除以宽高归一化，未校验非零；confidence||1使0变1。
- **输出类型**：success:true,outputPath,entityCount 或 false,error。
- **前置条件**：本地home目录可创建/写；无直接激活断言。
- **内存和持久副作用**：写home/脱敏猫标注数据/datasets/images/labels/<basename>.json；含原imagePath及绝对/归一化框，未复制脱敏图片。
- **失败、取消与恢复**：覆盖同名；UI先save后export但没有事务。无task取消。
- **尚未闭合**：不是脱敏交付接口；无效维度JSON序列化结果和同名来源冲突待运行。
- **证据**：annotation, ui-annotation；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:list-recoveries · 列恢复快照

`IPC-be30d4526c26` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：success:true,data:recovery[]；服务缺失data:[]；失败workspace error。
- **前置条件**：Hg.list/readCurrent可能需解锁；锁定保护数据可退匿名临时审查条目。
- **内存和持久副作用**：mkdir根目录，扫描隐藏.discarded，按更新时间倒序取最多20条。
- **失败、取消与恢复**：读取损坏部分跳过，空列表不证明磁盘为空；无取消。
- **尚未闭合**：Hg/Wg错误分类全分支未穷尽。
- **证据**：workspace-ui, workspace-handler, recovery；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:list-recovery-prompts · 启动恢复提示候选

`IPC-a80eb991f683` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数。
- **输出类型**：success:true,data:候选[]；服务不存在[]。
- **前置条件**：Hg.previousUncleanSessionId来自.active-session.json；保护读取仍受key体系约束。
- **内存和持久副作用**：筛PDF OCR incomplete或上次非正常session，最多20；与list-recoveries不等价。
- **失败、取消与恢复**：读取特定保护错误也可能加入提示；无取消。
- **尚未闭合**：Wg错误范围/所有session clean时序未全部审。
- **证据**：workspace-ui, workspace-handler, recovery；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:select-save-path · 项目另存路径选择

`IPC-8b8d74411dc8` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：suggestedName可选，oI/cI清理文件名。
- **输出类型**：success:true,data:{filePath} 或取消data:null；失败workspace error。
- **前置条件**：Electron保存对话框。
- **内存和持久副作用**：iI补.tmm扩展名，只选路径不保存。
- **失败、取消与恢复**：catch包装；选择取消不写项目。
- **尚未闭合**：oI/cI/iI全部路径大小写规范未穷尽。
- **证据**：workspace-ui, workspace-handler；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:save-as · 带对话框的旧另存入口

`IPC-ff1d1193dc22` · MANUAL-WORKSPACE · UI 关系：not-established · S2/R0

- **输入与过滤**：suggestedName及完整保存payload(projectId/revision/snapshot等)。
- **输出类型**：success:true,data:保存回执；取消data:null；失败workspace error。
- **前置条件**：n2.save同revision/key/source约束。
- **内存和持久副作用**：对话框选path后rI计活跃写并sw.save；该入口未使用workspace:save requestId回执Map。
- **失败、取消与恢复**：取消只限选择阶段；已开始保存无取消；路径写入/后续读取失败状态同sw.save。
- **尚未闭合**：当前UI store另存走select-save-path+save，此save-as现行调用未定位。
- **证据**：workspace-handler, workspace-service, workspace-container；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:select-review-profile · 选择沿用审查记录

`IPC-98cb505df8ea` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：无参数，.tmm文件选择。
- **输出类型**：success:true,data:{filePath}，取消data:null。
- **前置条件**：仅OS选择，不读取文件也不判断项目适用性。
- **内存和持久副作用**：不写文件；随后UI另调readReviewProfile。
- **失败、取消与恢复**：handler无catch，原生对话框异常reject；无任务cancel。
- **尚未闭合**：UI沿用规则/假名选择全决策需结合profile契约。
- **证据**：workspace-handler, ui-profile-pick；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:read-review-profile · 提取可复用审查规则/假名

`IPC-1d575f4ee880` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：filePath。
- **输出类型**：success:true,data:ey生成审查档案；失败标准workspace error。
- **前置条件**：v2/v3读取需解锁；v1走archive，容量超限可进入迁移辅助。
- **内存和持久副作用**：sw.readReviewProfile读snapshot经ey转换，缓存correction/pseudonym计数并写最近索引；finally关闭reader。
- **失败、取消与恢复**：UI KEY_HIERARCHY_LOCKED解锁后重试；索引写失败可令读取成功后的请求整体失败。
- **尚未闭合**：ey字段选择/敏感原文归并/规则冲突待逐项审；不能从来源名推定可全部复用。
- **证据**：workspace-handler, workspace-service, workspace-container, ui-profile-read；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:reveal · 定位审查文件

`IPC-d78ef82e46d5` · MANUAL-WORKSPACE · UI 关系：not-established · S2/R0

- **输入与过滤**：filePath。
- **输出类型**：success:true,data:null 或workspace error。
- **前置条件**：shell.showItemInFolder。
- **内存和持久副作用**：启动系统文件定位，不读文件内容/不删除。
- **失败、取消与恢复**：同步异常包装；无回执确认OS真正显示成功。
- **尚未闭合**：现行UI入口未本轮定位。
- **证据**：workspace-extra；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:migrate-v1-to-v2 · 旧项目迁移为保护容器

`IPC-f417c3628886` · MANUAL-WORKSPACE · UI 关系：not-established · S2/R0

- **输入与过滤**：sourceFilePath非空，OS选择另存目标并补.tmm。
- **输出类型**：success:true,data:{sourceFilePath,filePath,documentCount,sourceBytes,ocrPages}；取消data:null。
- **前置条件**：L_.migrateLegacy要求aw(source)=v1；新DEK/localCmkSlot需要protected write本机能力。
- **内存和持久副作用**：R_读取旧项目并写目标容器；DEK finally清零。
- **失败、取消与恢复**：catchworkspace error；本handler无取消进行中的迁移；源目标是否同路径由更下游约束仍待查。
- **尚未闭合**：R_转换全schema及原子提交未闭合；现行直接UI调用未定位。
- **证据**：workspace-extra, workspace-service, workspace-container；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:create-transfer · 创建带密码传输副本

`IPC-e6a8f1b41825` · MANUAL-WORKSPACE · UI 关系：not-established · S2/R0

- **输入与过滤**：已保存filePath，OS选目标；resolve后拒绝目标与源完全相同。
- **输出类型**：success:true,data:{filePath,transferPassword}；取消data:null；错误workspace error。
- **前置条件**：V_存在；manager.openCompatible要求能读取本机保护容器。
- **内存和持久副作用**：V_.createTransferCopy生成随机传输密码/新DEK，以SCRYPT+AES-GCM transfer槽通过cf写副本，再打开自检；finally清DEK/关源reader。
- **失败、取消与恢复**：写后自检失败可能有目标文件；没有撤销任务；主进程未复制用户账号/产品激活。
- **尚未闭合**：cf流封装/自检失败清理；UI创建副本调用本轮未定位。
- **证据**：workspace-extra, transfer-service, workspace-injection；原始 handler/preload 精确范围在 JSON 同名条目。

### workspace:receive-transfer · 打开传输副本供本地审查

`IPC-70e09702200d` · MANUAL-WORKSPACE · UI 关系：tracked · S2/R0

- **输入与过滤**：transferPassword非空；OS另选.tmm。
- **输出类型**：success:true,data:临时workspace(snapshot/sources/sourceRefs/format)；取消data:null；密码错误等workspace error。
- **前置条件**：openTransferContainer校验objectType=tmm-transfer、唯一transfer槽、SCRYPT/AES-GCM及base64长度；合法密码解包。
- **内存和持久副作用**：handler走openTransferCopy+sw.openTransientV2Reader，登记provider；没有调用receiveTransferCopy写本机持久副本，不能说接收即已保存本机.tmm。
- **失败、取消与恢复**：注册失败会close reader；用户后续保存单独操作。无后台任务取消。
- **尚未闭合**：Kb双次打开的reader关闭生命周期；全部本地保存引导/密码清理需继续审。
- **证据**：workspace-extra, transfer-service, workspace-service, ui-transfer-receive；原始 handler/preload 精确范围在 JSON 同名条目。

## 高风险结论的限定

- handler 内缺少直接 activation/sender 检查，只能证明这一层没有该断言；不能据此宣称整条链无权限控制或可以绕过授权。
- `apply` 的非 Markdown 输出使用默认 `writeFile`。编号备选路径由 EPERM/EACCES/EBUSY 触发，并非重名检测。是否覆盖原件还需核读调用者路径选择；本轮不作漏洞可利用性结论。
- `cancel` 返回已发 abort；`cleanupPaths` 的删除错误可能被吞掉。普通失败、进程崩溃、超时和取消不是同一结果。
- 假名映射可先持久化，输出后续失败不会自动撤销映射。回执 `unknown/missing` 也不能反推文件不存在。
- PDF 分支静态展示“渲染页→JPEG→新 PDF”的实现，不能替代实际输出的文本层/页面/视觉验收。OCR 搜索/选框大部分读取已有缓存；不能描述为完整漏标检测。
- 审查打开需解锁；protected write 可以使用设备槽。二者的权限语义不同，不能统一表述为保存前必须密码解锁。

## 尚未完成的明确范围

- UI→handler→直接服务→存储/缓存的局部连线已人工证实；第三方 codec/OCR/NER、全部错误状态、崩溃恢复和授权运行未全部闭合，因此无 S3。
- 优先补审 apply 非 Markdown 同名写入、取消删除与原件保护；th 过滤签名类别的 UI 提示与最终选中计数。
- 优先补审 workspace vx/Fb/cf 提交后重开失败、恢复多文件写入失败、close 失败及旧 sourceRef 释放时序。
- OCR get-page 缺取消登记、批量搜索缓存完整性/Unicode坐标、PDF rotated/deleted page 边界需合法运行样本。
- 项目组统一策略、规则集、报告/审计、假名恢复/传输等未覆盖接口保持既有单项静态深度；不得从本轮关联推导完成。

## 可追溯行级证据

| ID | 派生/原始文件与行范围 | 切片 SHA256 |
|---|---|---|
| registry | `.data/research/lawbot-2026-10-13/readable/main.js:15718–15912` | `00e2bfffe1409ca7d258397075fe286926de2daa758f116005ac7fd2a39143fe` |
| source-handler | `.data/research/lawbot-2026-10-13/readable/main.js:16981–17072` | `df3afed3fa99ed243b8228beaf6f2f5443dd7050c4142514b2f211eca305e727` |
| import-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:31552–31640` | `d088282b690a8c615db8a7f008772e91ab7bf889797b43474a0b1269cf88ee38` |
| pick-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:36449–36468` | `3e674042f9861a26f10428aeddbcb232c7213a3c1b517c47bb07afe4957dc991` |
| drop-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:36511–36544` | `30ebbfa46bfe8b8247cebe255b5117f0e6fffb23eda019121a56a12e7b8397e0` |
| scan | `.data/research/lawbot-2026-10-13/readable/main.js:16633–16732` | `c5701a721ada5aa5e963fdb4dd74ec7e09555fd07b46f06c2bc9a3f0fa18cc1a` |
| pick-handler | `.data/research/lawbot-2026-10-13/readable/main.js:16876–16901` | `cb3a9baec00b6db62cead96aaa356b0d9a2e1e758c450019778622efb08906b1` |
| validate-folder | `.data/research/lawbot-2026-10-13/readable/main.js:16912–16927` | `ff6c53833a8395185e499596becc4bcfd8ad73d11225737eba2a1530e65d7aec` |
| unlock-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:36250–36274` | `0fce93f6f954aedc43be117095d15c6e6ea7c57ef7cd33c74d1a3213fc83f940` |
| preview-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:34071–34095` | `84f3824072f5b0dfc1e9c6c24b5d6d4cf07be69ee0318c8c1661527448cbec88` |
| workspace-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:3733–3887` | `490ab412fc5ae7126742321540c92bf276e48ccbacf761dbcad916e15c651e83` |
| autosave-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:3888–3918` | `ad7599857ed648123285203e47c32568ab95421fb7cc5833df8e73f71769ec7a` |
| workspace-handler | `.data/research/lawbot-2026-10-13/readable/main.js:25616–25745` | `0ccd7a0ec87e93651df77641a699c30182aec16c6b1f2c09be8925a1995228bc` |
| workspace-service | `.data/research/lawbot-2026-10-13/readable/main.js:22560–22693` | `44f9d179492376761f40cf4878f9e02b131a981454177f447bb2b8fe0cd24ab6` |
| workspace-injection | `.data/research/lawbot-2026-10-13/readable/main.js:26848–26883` | `df889b3f50454fbe58db8b65c497dfadee4214a7bc099715f7ce15aa7fded2b6` |
| recents | `.data/research/lawbot-2026-10-13/readable/main.js:19505–19570` | `05e0d86c90e6bd39a5c64b7044faccf4379d1e0de99a9574f547d383e8c3d205` |
| recovery | `.data/research/lawbot-2026-10-13/readable/main.js:19894–20092` | `a71dadd65a71ec8832a31dc336d6021d5947e434004dee1e8cf4fe11ceb28e83` |
| protected-store | `.data/research/lawbot-2026-10-13/readable/main.js:15074–15120` | `4e17fb1f9152e17f8763f738c3c5c4c31c5e6a7b940f59c1cda308b45cb48d6a` |
| workspace-container | `.data/research/lawbot-2026-10-13/readable/main.js:25190–25276` | `468011082d038c22e27932a04d4c8bb3b67856359249d88278a2add770954f9a` |
| key-read | `.data/research/lawbot-2026-10-13/readable/main.js:19688–19696` | `e4d864149e1e1b0d0fbf01ba6351af257e3a0b3d9ea6d82a90e1a6f260be7dce` |
| key-write | `.data/research/lawbot-2026-10-13/readable/main.js:19791–19840` | `70a36eca7489865878f41340b4cc27584d20c6d52e357345783aa64b77963ac4` |
| detect-handler | `.data/research/lawbot-2026-10-13/readable/main.js:17196–17368` | `2638cdd033f80ca824c5b838e0f23771bc0b26972708f2cb90964e6d167cd553` |
| detect-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:35912–35962` | `5e11d7a02e6b1a879431f9491faa9f5cbcafcbff915e01f34158b0512a31bb8e` |
| detect-service-docx | `.data/research/lawbot-2026-10-13/readable/main.js:10236–10292` | `740c5adf2712aa44e4b00ce915a6537921f2ac80f3b6b172246443b4cd9167e1` |
| detect-service-pdf | `.data/research/lawbot-2026-10-13/readable/main.js:10647–10675` | `d623c66e39e1df5247b87c3192e8e2e685b99a8ac5823751b57786644c97f272` |
| detect-service-image | `.data/research/lawbot-2026-10-13/readable/main.js:12390–12476` | `21c64c7b2bf20eb5dab869d1fb589587ee4e495d0adb66468ea30bc2d21369ab` |
| docx-images | `.data/research/lawbot-2026-10-13/readable/main.js:17368–17409` | `9910197ef19c4365b810b6985fde9081295dd16014c25fa9a60e85d118969120` |
| docx-images-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:35502–35553` | `e812a36b620235f7e68527d8ee1d720fb47e912662da3ec31a18ff8b55ceef85` |
| ocr-search | `.data/research/lawbot-2026-10-13/readable/main.js:18186–18273` | `dbd71a1b2ea82683ef86daacb7a8a8099045930bff739d9ff5fef023db1f9fd2` |
| ocr-region | `.data/research/lawbot-2026-10-13/readable/main.js:18273–18308` | `849d05143932393c1c71aabf3602a5dd65f04d57b91416ba04d9dce2a65e9422` |
| ocr-page | `.data/research/lawbot-2026-10-13/readable/main.js:18308–18342` | `9a8edccef23ede20e759fbf2159321fbe03ebc37e6e7bbf278c90670c09c77ee` |
| ocr-ui-search | `.data/research/lawbot-2026-10-13/readable/renderer.js:22975–22999` | `546075f258a62a73bfd23809b30a49064979e1e058e67c4ff9d3144c83fd7505` |
| ocr-ui-region | `.data/research/lawbot-2026-10-13/readable/renderer.js:24171–24200` | `f69fc9afdae1715ac3093293ac9c87964150e09211035f63486b3b464e4ac476` |
| ocr-ui-page | `.data/research/lawbot-2026-10-13/readable/renderer.js:25622–25655` | `16c833f39f088ac543e6b136c76abedef22e57cd8594e752b427e26dcd00893f` |
| ocr-cache | `.data/research/lawbot-2026-10-13/readable/main.js:15335–15375` | `f69b32ca0f5dd85459ce10adc8fced173efd6f4d07ef7cd6a34333d721b22375` |
| apply-filter | `.data/research/lawbot-2026-10-13/readable/main.js:14537–14549` | `2057d2129d8a6de57c64af4063894485ef1967fc44378521b8728d39cbeed121` |
| apply-start | `.data/research/lawbot-2026-10-13/readable/main.js:17409–17462` | `aa9a37d81fce61aefa28605da06878ddcfed676b9aba5bf5286cd0224aa1d64e` |
| apply-markdown | `.data/research/lawbot-2026-10-13/readable/main.js:17463–17526` | `7ca8f977d9a94a64f43a1faffcea1938e74f5b79f2dc00bfd2dd1d059dd0bd19` |
| apply-format | `.data/research/lawbot-2026-10-13/readable/main.js:17527–17789` | `28c074f2dd04325ee6dc1abaaf40ad59298db002e98c791d495994f9c73eef35` |
| apply-write | `.data/research/lawbot-2026-10-13/readable/main.js:17790–17934` | `784047a9badfad979e7490362a4f6bc43815b93c1d46abc46205664f8e401402` |
| apply-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:32063–32082` | `0a7dbf94874dfc8b93644fbb71e4f0a2d8b21217533cb7f8c5afeb34e4b8f9e2` |
| apply-receipts-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:33795–33889` | `cd1df6458546083df32afca79d55cab286e9d538aa6ebbf306c86cb6af951272` |
| apply-cancel-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:33889–33908` | `8082e2d0463ffc825852578bb339f1300a6e381aa23ef8050ec6e49a9aad1ee9` |
| write-helper | `.data/research/lawbot-2026-10-13/readable/main.js:16759–16789` | `a33caf4010e37c5626d2587adca7997065f68155e30af27f297cde1f17ac76ac` |
| task-controls | `.data/research/lawbot-2026-10-13/readable/main.js:17158–17183` | `d2563fcbf512f34e10e2fceb4a1082d448bffb605284fd59edf670631325e32a` |
| pause-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:31236–31254` | `e1fe81eea7b2678e39d9ec58ab842d5246e9cffcaa7187fd602a6272950f6a1d` |
| mapping | `.data/research/lawbot-2026-10-13/readable/main.js:16586–16638` | `d381bfd3a1127e3b24e54280185b1f6adbf511b46cf97fd93c5c527eb5df0cf2` |
| secure-pdf | `.data/research/lawbot-2026-10-13/readable/main.js:14599–14777` | `b3c7682ffd0137dcf74cab3ef6e83ed47f70ceba9f9d55630de3f7283b1bc9c0` |
| aux-files | `.data/research/lawbot-2026-10-13/readable/main.js:17073–17107` | `e5a9d260ae3b6280c130ecd09191f3b1d3ba072798ff7184014ff1886f95cf62` |
| aux-draft | `.data/research/lawbot-2026-10-13/readable/main.js:17117–17132` | `18fcd28c0852b3ad33e8da673f4cd8e41eab1fd18ff110ba33f8b160ba4c7d44` |
| forget-ui | `.data/research/lawbot-2026-10-13/readable/renderer.js:37465–37485` | `4bdff93aac85e8e517a064429bafce3367336990794f0539a6aa7990248dab32` |
| preload-generic | `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:303–323` | `22691f8fa042abb98f6b2106f8335970a0562e725e7508fb97393913113d91e2` |
| folder-output | `.data/research/lawbot-2026-10-13/readable/main.js:16900–16911` | `855d67ff5023ec4aaf715176bfe6afc290566a9474c41e88a7f1b77baa9c8fb5` |
| folder-path | `.data/research/lawbot-2026-10-13/readable/main.js:15385–15438` | `7234e66393eb1ac4c8c43ed7a9655a0cea37de6b5d064e8beeb7d9c041194edd` |
| folder-manifest | `.data/research/lawbot-2026-10-13/readable/main.js:16926–16974` | `e7aa001fd07e9e10df69b158c4b914018342664dff9b138086b20b25e51e9b9e` |
| output-dialog | `.data/research/lawbot-2026-10-13/readable/main.js:16975–16980` | `bd87535ee9c7ff9f55b4e338975c0057576c054bd9e76726b46cf1b0407774e1` |
| misc-read | `.data/research/lawbot-2026-10-13/readable/main.js:17059–17117` | `351c5015e4ea2c4a16b67bc13d513c6edf8b9fc71e221dd410d3953db9f92b3d` |
| misc-write | `.data/research/lawbot-2026-10-13/readable/main.js:17132–17157` | `34e8f9ef4704cb72beb6b07b1ddb3911e6586cc5dc46d272142596d813139c57` |
| runtime-rule | `.data/research/lawbot-2026-10-13/readable/main.js:17183–17195` | `36aa6de88e6de22a9d85df600284f75cc4e1d560097ac0a7c30903c07ab1d59f` |
| route-handler | `.data/research/lawbot-2026-10-13/readable/main.js:17934–17949` | `b9ae0a43a5c09056fd95f4e6af4462adf329222a453ede0e2c555b710a2044cd` |
| route-service | `.data/research/lawbot-2026-10-13/readable/main.js:10569–10600` | `e319163c034a637b78a70cce467e58a56a45d5c40876dd7377e63e5d39493b14` |
| old-process | `.data/research/lawbot-2026-10-13/readable/main.js:17950–18043` | `f762b488f3ebb763a49c532d68e5ec8fca78cc3bbcbde7d433e8a874b88b104b` |
| report-generator | `.data/research/lawbot-2026-10-13/readable/main.js:18044–18092` | `e7159c655e0fd6fe0cd780f008b0f581ab9165de7c63ffdd22715e6d39526c3b` |
| workspace-extra | `.data/research/lawbot-2026-10-13/readable/main.js:25740–25786` | `fefde79bbecd4d60c208d4f9536dc02d190c0f63dde3f7383e2438808648166a` |
| transfer-service | `.data/research/lawbot-2026-10-13/readable/main.js:25283–25352` | `3b4aea590f45028cc904aed9032510872cdf000f6d6d5e571ce9f2fe3d037da0` |
| ocr-diagnostic | `.data/research/lawbot-2026-10-13/readable/main.js:18761–18776` | `cde31061cd080181257b3346b588735b35a495ff3921b90f24a28e4cc5343f2d` |
| ocr-platform | `.data/research/lawbot-2026-10-13/readable/main.js:4599–4659` | `00962d6e8a4d52af67bdc899f54908dd860dacc29da0270f5004df1597df0836` |
| ocr-paddle-diagnostic | `.data/research/lawbot-2026-10-13/readable/main.js:7954–8034` | `3d1543795439d0116deb624e113f36baf4879f188d7227f9a724fc588f13c60d` |
| pdf-worker | `.data/research/lawbot-2026-10-13/readable/main.js:26715–26740` | `4f0ad3609ac7d51fc82295e257aefd562fae15aeb5a74e1d03ea891adeca7cb1` |
| annotation | `.data/research/lawbot-2026-10-13/readable/main.js:26985–27005` | `117815323a8206ba943ad915d719a48d9c8546e78981343765e8ed851e80efd9` |
| ui-progress | `.data/research/lawbot-2026-10-13/readable/renderer.js:31803–31835` | `746f726fd5f38af7e1ecf0780a2f10468217c5821cd1764ac2c178a329999a55` |
| ui-page | `.data/research/lawbot-2026-10-13/readable/renderer.js:34203–34226` | `0e04a2b5f4fdfdd01da9208bb5da6ac33610a6de8de873b6ebe78aabc58a8852` |
| ui-runtime-rule | `.data/research/lawbot-2026-10-13/readable/renderer.js:6185–6193` | `3234b338ab8f63866918798ae5c0593a8471091df0757a4ddc4051eb3637d9c7` |
| ui-ocr-health | `.data/research/lawbot-2026-10-13/readable/renderer.js:31983–31994` | `3a20e1f422fc9a68197b7d9ad191df3787836aad9be6f3e366533d4e3490fcfc` |
| ui-ocr-diagnostic | `.data/research/lawbot-2026-10-13/readable/renderer.js:29301–29318` | `4446ea4e737d85545a718656a60c579573d496692ec3b92f2453990eaf37e293` |
| ui-output-path | `.data/research/lawbot-2026-10-13/readable/renderer.js:36636–36670` | `2480e36be99567192f3c5beaf5ec478088620f603d5442aa185cba536b807fb0` |
| ui-folder-path | `.data/research/lawbot-2026-10-13/readable/renderer.js:36182–36186` | `cec88f26a2fee701c642d4aa111fe8bbcd24269f7b76778ca9cb77817630091d` |
| ui-folder-output | `.data/research/lawbot-2026-10-13/readable/renderer.js:36986–37001` | `105c81ab6f54632db267db217abd8dc842a016d43b3c4bc3ddf3e38694f57eab` |
| ui-folder-manifest | `.data/research/lawbot-2026-10-13/readable/renderer.js:37101–37111` | `7430aa40031737ab4a197edbfb0fb1c0856e12f4e79aeb6d09be886ce6406334` |
| ui-profile-pick | `.data/research/lawbot-2026-10-13/readable/renderer.js:32425–32435` | `f8d2d9bfe86265d89564187620520736e92127a9ddb9f5cb697a622fbf1f7a31` |
| ui-profile-read | `.data/research/lawbot-2026-10-13/readable/renderer.js:33001–33020` | `734298c3270649275b08574692a7ec3180f99cf032d66fb4e33c3127b388bce3` |
| ui-transfer-receive | `.data/research/lawbot-2026-10-13/readable/renderer.js:28310–28325` | `864fa1558bd6285d164f11642541c791d475db71cde48f2077189d70bffbc256` |
| ui-annotation | `.data/research/lawbot-2026-10-13/readable/renderer.js:37534–37546` | `f665e5879a09172f9afdedb5b2c8a2951e92ca5f488d90c98a084656f24be0f3` |

## 核验与重新生成

先运行 `python3 文档/逆向台账/contracts/build-manual-workflows.py --check`。它只读验证 ASAR/源切片及两份现有人工产物是否一致；不证明文字结论正确。人工审查变更后显式移除 `--check` 重生成。原始完整契约核验仍单独使用 `verify-contracts.mjs`。
