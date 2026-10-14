# 当前逐接口矩阵（ITER027）

每项分别核对源入口、实际实现和验证。源R0不等于我方I2；本产品浏览器适配不等于Electron协议、OS或设备密钥互通。旧阶段指纹保留在JSON。

| ID | 源入口 | 当前分类 | 证明/差异 |
|---|---|---|---|
| IPC-b67938c0cb2f | app:consume-open-path | electron_os_web_adaptation_not_equivalent | 浏览器无法接Electron启动argv/open-file系统事件；原工程需显式上传到portable/import，未伪造冷启动路径消费。 |
| IPC-7f4cfe68e159 | app:export-crash-log | implemented_adapted_static_proven | real per-user sanitized log bytes; absent404, native save-dialog adapted to download |
| IPC-f5725b5e0d8a | app:get-docx-safe-mode | electron_os_web_adaptation_not_equivalent | 源本地DOCX native safe-mode设置未在web提供同名状态；当前独立Word预览/导出gate存在，不等于该OS开关。 |
| IPC-a26e3c125cb6 | app:get-env | electron_os_web_adaptation_not_equivalent | 浏览器与worker只公开真实健康诊断；不提供Electron平台/userData环境对象。 |
| IPC-611ab311c5f6 | app:get-version | implemented_adapted_static_proven | 返回本产品真实RELEASE_VERSION/RELEASE_ID，未配置明确development；SupportPanel查看版本。不是返回竞品0.5.9冒充我方版本。 |
| IPC-499bd8d4596b | app:open-external | electron_os_web_adaptation_not_equivalent | 现有浏览器a链接使用用户选择打开；没有可调用的任意宿主shell.openExternal，属于OS能力未提供。 |
| IPC-a11af873aa1a | app:open-path | electron_os_web_adaptation_not_equivalent | 云服务不能直接打开用户绝对磁盘路径；显式上传与授权下载作为实际能力。 |
| IPC-5d7065a40d45 | app:read-legal-doc | implemented_adapted_static_proven | three exact allowed filenames; own product docs; agreement/privacy explicit unpublished drafts |
| IPC-65f32fe31f76 | app:read-onboarding-sample | implemented_adapted_static_proven | actual wholly synthetic own DOCX bytes, not competitor/cust materials |
| IPC-2e9ce1df9fec | app:reset-docx-safe-mode | electron_os_web_adaptation_not_equivalent | 未实现源OS偏好重置；不得用已有Word导出能力升格。 |
| IPC-e25810712ab1 | app:set-docx-safe-mode | electron_os_web_adaptation_not_equivalent | 未暴露本地DOCX渲染引擎safe-mode写入接口；云端受控预览不冒充源开关已保存。 |
| IPC-28d93302bd32 | app:write-clipboard-text | electron_os_web_adaptation_not_equivalent | MCP安装配置使用navigator.clipboard.writeText由用户触发；不是Electron任意路径/宿主clipboard协议兼容。 |
| IPC-243bf096202b | auth:cancel-recovery | electron_os_web_adaptation_not_equivalent | 源码桌面加密master-password恢复请求取消不等同云账号logout；未伪造桌面recovery状态。 |
| IPC-69f3f32b9683 | auth:change-password | electron_os_web_adaptation_not_equivalent | 源码本地加密master-password/keywrap变更尚无等价web包装；云用户密码认证与其不是同一安全域。 |
| IPC-4567d2cc2f1d | auth:check-password | electron_os_web_adaptation_not_equivalent | 云POST /api/login真实核验账号密码，但源本地master-password检查域不同，未声称wire兼容。 |
| IPC-3484537f3350 | auth:complete-recovery | electron_os_web_adaptation_not_equivalent | 源本机恢复文件/密钥包装解封依赖未移植云账号域；明确不能导入其private key恢复本机状态。 |
| IPC-8f0322abb8b8 | auth:create-recovery-request | electron_os_web_adaptation_not_equivalent | 源本机密钥恢复请求容器未提供；云账号管理员流程不假装为该格式。 |
| IPC-ba48a535d0b1 | auth:get-capabilities | electron_os_web_adaptation_not_equivalent | 源biometric/keychain能力在云server不代表用户设备；不返回假available。 |
| IPC-5f5d0e7e7171 | auth:has-password | electron_os_web_adaptation_not_equivalent | 源master-password是否设置与云账号是否注册不同；没有同域状态。 |
| IPC-2a09a00cba17 | auth:import-recovery-file | electron_os_web_adaptation_not_equivalent | 源密钥恢复文件验证/本机keychain依赖未移植；上传材料/portable文件不能充当此能力。 |
| IPC-9ac7b5cfa48e | auth:lock | electron_os_web_adaptation_not_equivalent | 云logout删除当前session实际可用，但不等于源销毁本机解密master-key的锁定。 |
| IPC-1a2923d565e2 | auth:migrate-legacy-password | electron_os_web_adaptation_not_equivalent | 源旧本机密码包装迁移不适用于云已有账号，未实现其密码密钥迁移。 |
| IPC-5634886c31f2 | auth:request-system-grant | electron_os_web_adaptation_not_equivalent | macOS biometric/keychain系统授权不可由云worker替用户确认；明确未提供。 |
| IPC-82ace6842a00 | auth:restore-session-token | electron_os_web_adaptation_not_equivalent | 源keychain会话token恢复未提供；云HttpOnly cookie当前session校验独立真实存在。 |
| IPC-34a47a0ff8e1 | auth:save-recovery-request | electron_os_web_adaptation_not_equivalent | 源恢复文件需浏览器下载容器及真正keywrap实现，当前未提供该keywrap，不能以下载空文件代替。 |
| IPC-f96c39b98bc8 | auth:set-password | electron_os_web_adaptation_not_equivalent | 源设置本机加密master-password尚无web keywrap状态；云organization新增账号只证明账号密码创建。 |
| IPC-251d99e85000 | auth:verify-password | electron_os_web_adaptation_not_equivalent | 源master-password/系统授予校验与云login安全域不同，不混为一个接口完成。 |
| IPC-73870d051b3f | debug:get-paths | electron_os_web_adaptation_not_equivalent | 不泄露server绝对数据/日志目录；已有受权限OCR诊断导出，源debug路径对象未暴露。 |
| IPC-5a998529649c | desensitization:apply | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/export"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-88cd1d915682 | desensitization:cancel | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/jobs/:id/cancel"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-fd1ca8c6cb27 | desensitization:cleanup-paths | implemented_adapted_static_proven | real successfulartifact hashchecked copy -> sessionreceipt -> strictage/preserve/type/owner/oneuse -> delete onlytemporary file |
| IPC-e8dcb4d0e8b3 | desensitization:create-folder-output | electron_os_web_adaptation_not_equivalent | 浏览器下载primary/sidecar或ZIP替代创建用户宿主目录；不返回假本地folder路径。 |
| IPC-7d7d2d58da91 | desensitization:detect-only | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/recognize"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-42a70f50df5f | desensitization:detect-route-only | implemented_adapted_static_proven | 静态逐入口证明：GET '/api/documents/:id/configuration'；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-85f474cad97a | desensitization:generate-reports | implemented_adapted_static_proven | 逐材料source/content/artifact真实hash与识别快照生成报告，AEAD、owner及原文/映射权限；不是仅生成空报告。 |
| IPC-8c5afeb517e6 | desensitization:get-apply-result | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/documents/:id/outputs"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-9a8232e44fb9 | desensitization:get-default-output-dir | electron_os_web_adaptation_not_equivalent | 浏览器下载位置由用户浏览器管理，服务端不知道用户默认目录。 |
| IPC-a09f09579955 | desensitization:get-markdown-export-stats | implemented_adapted_static_proven | 真实导出/手工稿/失败取消事件表消费；源码480静态统计oracle与实际导出集成覆盖，不把空事件表当闭合。 |
| IPC-7b3e67a5a715 | desensitization:get-resource-diagnostics | implemented_adapted_static_proven | 返回真实材料字节、页面、job聚合；源码开发模式native缓存/路径指标不伪造成云端数值。 |
| IPC-3211d99d0f20 | desensitization:open-output-dir | electron_os_web_adaptation_not_equivalent | 浏览器不能调用用户shell打开目录；真实输出列表提供下载，源OS动作不可等价。 |
| IPC-58567733591e | desensitization:page-processed | implemented_adapted_static_proven | parsePages and Word embedded images realonPage OCR callbacks with originalglyphs/hash; exact page-anchor filtered pending matches after all semantic policies; canonical-raster coordinateSpace; true1-basedpage total |
| IPC-e4cf3e6c3c0a | desensitization:pause-seals | implemented_adapted_static_proven | 限定当前owner/tenant/doc的活跃request，真正AbortSignal中止该seal worker并跳后续seal，不中止face/signature，已结束明确拒绝；原metadata/version保留。 |
| IPC-c1cec3199992 | desensitization:process-file-main | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/export"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-27dd16394cd6 | desensitization:process-files | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/projects/:id/upload-batches"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-8fc7e5c07051 | desensitization:progress | implemented_adapted_static_proven | real ProcessingWorker message separate from terminal response -> await serialized DB writes -> AEAD owner/job/generation/sourcehash/revision bound cursor API -> UI2secondread; real Markdown source-ready full sidecar/sourceMap/blockers; completed regex/NER window/contextual matches first25k250msfinal publisher |
| IPC-a07c3fdcbe45 | desensitization:read-file | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/documents/:id"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-f071ce7c965b | desensitization:read-source | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/documents/:id"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-81f79eee361a | desensitization:recognize-docx-images | implemented_adapted_static_proven | 静态逐入口证明：POST '/api/documents/:id/office-face-candidates'；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-8f1caa190dda | desensitization:register-source | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/projects/:id/files"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-d9b14aa97589 | desensitization:release-sources | implemented_adapted_static_proven | actual verified sourcebuffer -> session/user/project/private token -> AEAD temporary owned object -> read/release onlysame authsession; permanent original remains |
| IPC-3bea45842355 | desensitization:resolve-folder-output-path | electron_os_web_adaptation_not_equivalent | 文件名安全去重与ZIP内部路径真实实现；不解析用户磁盘输出绝对路径。 |
| IPC-f1f713df2b98 | desensitization:save-file | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/export"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-629ace0aecd1 | desensitization:save-markdown-draft | implemented_adapted_static_proven | 源原MD、真实当前MD artifact或明确literal canonical text为basis，实际编辑/双CAS/不可变版本/owner+view_original+export/hash重新验证；保存始终带人工稿警告，无trusted artifact注册。 |
| IPC-9577d3a9d6d0 | desensitization:save-report | implemented_adapted_static_proven | 已持久化报告按owner/project重新授权、解密及校验后实际下载；浏览器附件替代桌面保存对话框。 |
| IPC-e29b03465bc3 | desensitization:scan-dropped-folder | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-95d4f752bfb1 | desensitization:select-files | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-523337153cab | desensitization:select-folder | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-102f9010076c | desensitization:select-output-dir | electron_os_web_adaptation_not_equivalent | 输出在浏览器下载，尚未接FileSystemAccess目录授权；不返回用户未授权的磁盘目录。 |
| IPC-7f07e8bd74ee | desensitization:select-save-path | electron_os_web_adaptation_not_equivalent | 浏览器附件下载选择位置，不把server路径当用户路径。 |
| IPC-d7d18b241f88 | desensitization:unlock-source | implemented_adapted_static_proven | 静态逐入口证明：POST '/api/documents/:id/unlock'；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-0ea3b09c375b | desensitization:update-runtime-rules | implemented_adapted_static_proven | 任意非空wellformed实体类型保rawEntityType；name_/org_未知标签不再吞并，same-range不同raw保留；forceSkip优先/forceDetect跨profile门，9+source不丢；独立alias namespace、策略、LPM、还原及native工程scope重绑真实API通过。源码runtime掩码按exact input marker判定，非由中文兼容kind反推。 |
| IPC-96ccc7c0ce76 | desensitization:validate-folder-source | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/projects/:id/upload-batches"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-e84cabdffc27 | desensitization:write-folder-manifest | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/projects/:id/upload-batches"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-25271d44841c | dictionary:add-entry | implemented_adapted_static_proven | exact key/idempotent manual; existing automatic upgraded only by explicit manual add; no feedback learning |
| IPC-3f0d71fadee4 | dictionary:download-excel-template | implemented_adapted_static_proven | 18源选项、两真实action、inlineStr模板；source whitelist=forceDetect，blacklist=forceSkip。 |
| IPC-0f2d4d6b6262 | dictionary:export | implemented_adapted_static_proven | cloud JSON contains full preserved memories, not source minimal entries wrapper |
| IPC-22c459a29cd7 | dictionary:export-excel | implemented_adapted_static_proven | 完整导出名单并parse roundtrip验真；自定义raw支持由A最新扩展，原18类保持。 |
| IPC-acbca2a96370 | dictionary:get-entries | implemented_adapted_static_proven | manual entries present; wrapper additionally includes legacy automatic memories for complete audit |
| IPC-50d02c91469e | dictionary:import | implemented_adapted_static_proven | new exact keys only; existing automatic not upgraded; CAS |
| IPC-c19a241811ac | dictionary:record-hint-action | implemented_adapted_static_proven | 同个人hint revision CAS真实计数；第二次与全局一次提示、迁移archive，非模拟学习。 |
| IPC-80e954e3a669 | dictionary:remove-entry | implemented_adapted_static_proven | manual entries only; CAS |
| IPC-9b9d5a0f489e | dictionary:save-export-file | implemented_adapted_static_proven | 浏览器附件返回真实XLSX bytes，替代桌面选路径写文件；没有声称能返回用户绝对路径。 |
| IPC-7de3f60b8ed5 | dictionary:select-excel-import-file | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-8a12674fee54 | dictionary:select-export-path | electron_os_web_adaptation_not_equivalent | 真实XLSX浏览器附件下载由浏览器选择位置；不调用用户OS保存对话框IPC。 |
| IPC-d0b393b9e93d | dictionary:select-import-file | implemented_adapted_static_proven | explicit browser upload, no arbitrary host path; native chooser adapted |
| IPC-429f13ae0835 | electron:save-pdf-to-desensitized | electron_os_web_adaptation_not_equivalent | 当前page/PDF真实artifact导出与下载有gate；Electron print/save-to-native-dir专用链不宣称兼容。 |
| IPC-d874c25112ba | feedback:add | implemented_adapted_static_proven | canonical single record; authenticated actor/time; document revision+exact text binding |
| IPC-6ff537a49940 | feedback:add-batch | implemented_adapted_static_proven | source alias normalization, FP-only mapping, atomic transaction |
| IPC-b828b79da058 | feedback:clear-all | implemented_adapted_static_proven | explicit confirmation and CAS; clears records/memories/current hints; preserves archives/history/audits |
| IPC-b2c075e4afde | feedback:delete-by-document | implemented_adapted_static_proven | case-sensitive exact name, owner+tenant+project scope, CAS |
| IPC-efc77b9d6c1d | feedback:delete-by-id | implemented_adapted_static_proven | owner+tenant+project scope, CAS |
| IPC-196efa6b695b | feedback:export-audit-report | implemented_adapted_static_proven | same date-filtered and first1000 subset for Markdown/count/audit; <=50 detailed entries |
| IPC-14a3820628e8 | feedback:get-document-stats | implemented_adapted_static_proven | source case-sensitive exact document-name statistics |
| IPC-9bb6c463b31f | feedback:get-global-stats | implemented_adapted_static_proven | only owned and still-authorized project records |
| IPC-feab6613b5ed | feedback:query | implemented_adapted_static_proven | case-insensitive exact filename/type and optional scoped project/document |
| IPC-a982d6d137ce | get-pdfjs-worker-path | electron_os_web_adaptation_not_equivalent | 我方PDFium受控worker解析，不需要也不伪造Electron内置pdfjs worker绝对路径。 |
| IPC-47ecc7525dfe | image-review:clear-ocr-cache | implemented_adapted_static_proven | 清理当前用户/项目材料的派生查询缓存，原图、已纠正文字、复核/签发结果保留；cachehit仍重新验源与map。 |
| IPC-d3864dc80560 | image:export-labels | implemented_adapted_static_proven | 全部bbox absolute/normalized、type、confidence、source、imageSize、exportedAt/version；imagePath为相对名称，不暴露宿主绝对路径；附我方documentId/revision/sourceHash。源confidence\|\|1丢0，我方保留真实0。 |
| IPC-5569a4344615 | image:save-annotations | implemented_adapted_static_proven | bboxes/source元数据及savedAt/version完整保存为独立下载；source imageSize空对象，我方真实尺寸；全部OCR marks由真实glyph按行构框，native/raw类型、来源/score及annotations的id/text/shape/absolute span保留，未知raw类型不加200字符专用限制。。 |
| IPC-8018ac372ad7 | learner:get-high-confidence-memory-count | source_inactive_stub_adapted | source constant count0/total0/lastSnapshot0 |
| IPC-ca4c19558c55 | learner:get-snapshots | source_inactive_stub_adapted | source constant empty snapshots, no new snapshots |
| IPC-5457cc5660c4 | learner:get-stats | implemented_adapted_static_proven | source old history current_ruleset_hash only; zero update/application/rollback stats, no learning call |
| IPC-caef950fe9a5 | learner:rollback | source_inactive_stub_adapted | source explicit inactive failure, no mutation |
| IPC-7fb83198252b | learner:rollback-previous | source_inactive_stub_adapted | source explicit inactive failure, no mutation |
| IPC-43e13058e656 | learner:rollback-to-previous | source_inactive_stub_adapted | source explicit inactive failure, no mutation |
| IPC-2c55a1969fb8 | learner:update-rules | source_inactive_stub_adapted | source constant success,stats=null,rulesetHash empty; deprecated true, no update |
| IPC-d79e3892b954 | license:activate | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| IPC-a70191351664 | license:get-machine-id | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| IPC-0dcec6bac9d5 | license:get-status | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| IPC-765d8b00f827 | license:get-summary | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| IPC-527f74c7a029 | license:refresh | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| IPC-7c61ecffef61 | log:renderer-error | implemented_adapted_static_proven | ignore complete payload; persist only fixed category and server timestamp per user |
| IPC-f8d8e4c7c379 | net:get-stats | implemented_adapted_static_proven | 实际managedNetworkFetch统计请求/阻断和bytes，按user/project隔离，不虚构全宿主抓包。 |
| IPC-539465a49a9b | net:reset-stats | implemented_adapted_static_proven | 有manage_models权限的真实CAS清零计数，offline开关保留。 |
| IPC-978012face0b | net:set-offline | implemented_adapted_static_proven | 真实持久offline与外部HTTP gate，离线请求先阻断；源OS全局网络监控以本工具管理请求适配，未声称拦所有进程。 |
| IPC-0ecb1de9c806 | ocr:collect-diagnostic | implemented_adapted_static_proven | 真实版本/模型lock/架构/探针错误或置信度，私文/keys/宿主路径不输出；不伪造network bytes测量，标not_measured及离线配置。 |
| IPC-f02ad1fa2413 | ocr:health-check | implemented_adapted_static_proven | 真实模型lock校验、OCR worker初始化及合成TEST123运行探针，不只是硬编码installed。 |
| IPC-bd4779635d5d | pseudonym:inspect-restore-mapping | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/projects/:id/restoration/inspect"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-420bf82d10ca | pseudonym:list-mappings | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/mappings"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-32941c143267 | pseudonym:open-output-folder | electron_os_web_adaptation_not_equivalent | 批量还原已验证结果真实列表+ZIP下载；用户OS文件夹打开动作不提供。 |
| IPC-1d272ba10a6c | pseudonym:restore-docx | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/projects/:id/restoration/files"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-24fe13c4efb6 | pseudonym:restore-docx-batch | implemented_adapted_static_proven | 真DOCX跨run/story还原，逐份上传、真实completed/total进度、成功/失败/partial、zero_replacement_files、total_replacements；已成功独立immutable artifact persist/reload/hash/owner+restore检查，流ZIP安全去重名称，失败不回原件。 |
| IPC-5c2a14961699 | pseudonym:restore-markdown | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/projects/:id/restoration/files"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-096d3ecc2554 | pseudonym:restore-markdown-batch | implemented_adapted_static_proven | 相同批量机制覆盖MD/TXT；未知alias失败保留其他verified输出，原件不变；源Markdown同名可覆盖，我方主动修复避免覆盖。 |
| IPC-0fa110b8534b | pseudonym:restore-progress | implemented_adapted_static_proven | 每份实际HTTP任务完成更新completed/total/success/failure/zero-match；可从已持久化结果重载，非伪造进度或源Electron事件线兼容。 |
| IPC-6f749dcd2e0f | pseudonym:save-mapping | implemented_adapted_static_proven | 静态逐入口证明：POST '/api/projects/:id/mapping-export'；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-37a279488720 | pseudonym:select-input-docx | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-f69ef883aa33 | pseudonym:select-input-docx-batch | implemented_adapted_static_proven | 浏览器multiple .docx文件输入逐份上传；每份真实DOCX校验/还原与持久化、部分失败报告；未读取任意宿主路径。 |
| IPC-7fe81107ae4d | pseudonym:select-input-files | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-6dcdb71fa095 | pseudonym:select-input-markdown | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-93ba5dca8357 | pseudonym:select-input-markdown-batch | implemented_adapted_static_proven | 浏览器multiple .md/.txt输入逐份上传；逐份token检查/还原与持久化；没有伪造桌面原路径。 |
| IPC-a05e3b6af8e1 | review:add-feedback | implemented_adapted_static_proven | authenticated encrypted record; cloud canonical fields differ from IPC camelCase adapter |
| IPC-7d7beed074d0 | review:clear-all | implemented_adapted_static_proven | same store as source feedback clear |
| IPC-e024a8242875 | review:export-audit-log | implemented_adapted_static_proven | actual CSV/JSON/JSONL bytes; CSV escape/formula neutralization |
| IPC-bb6001e11068 | review:export-proof-lite | implemented_adapted_static_proven | actual metadata+feedback+requested memories/audits JSONL; network count explicitly unmeasured, not fabricated zero |
| IPC-d3e5e1de12d2 | review:export-user-memories | implemented_adapted_static_proven | actual all active memories and pattern lists JSON regardless requested format, matching source branch |
| IPC-9dbd84b9715b | review:get-blacklist | implemented_adapted_static_proven | source legacy blacklist means forceSkip, not new frontend blacklist terminology |
| IPC-72093dfff7bf | review:get-feedbacks | implemented_adapted_static_proven | real scoped encrypted records |
| IPC-b199b300f630 | review:get-statistics | implemented_adapted_static_proven | actual owned records, no accuracy claim |
| IPC-9a7ac510f8c7 | review:get-whitelist | implemented_adapted_static_proven | source legacy whitelist means forceDetect |
| IPC-1abcdf6d1a56 | software-update:acknowledge-whats-new | electron_os_web_adaptation_not_equivalent | 云版本更新由服务器发布；原desktop whats-new确认偏好未创建。 |
| IPC-6099fda9db85 | software-update:check | electron_os_web_adaptation_not_equivalent | 云发布状态不是Electron官方安装更新feed；未伪造发现可安装桌面更新。 |
| IPC-1e8858b1ed43 | software-update:download | electron_os_web_adaptation_not_equivalent | 不下载或安装竞品更新包；本工具前端由当前server部署，未提供desktop updater。 |
| IPC-4e269deca69e | software-update:get-state | electron_os_web_adaptation_not_equivalent | 没有desktop installer下载/安装状态；不能用cloud health替代。 |
| IPC-67a324d00c09 | software-update:restart-and-install | electron_os_web_adaptation_not_equivalent | 云浏览器不能重启用户native app/install；server部署由已授权运维流程单独完成。 |
| IPC-a73b27802b39 | software-update:set-preferences | electron_os_web_adaptation_not_equivalent | 源desktop updater偏好不适用本web包；未存空配置假装自动升级。 |
| IPC-6cb1afcdadfc | software-update:state | electron_os_web_adaptation_not_equivalent | 没有native更新器事件发射，真实Web作业状态不冒充desktop install进度。 |
| IPC-6f5f29f520a1 | task-power:get-state | electron_os_web_adaptation_not_equivalent | 源powerSaveBlocker/防休眠属于用户OS；web后台作业独立worker无需控制用户休眠，未伪造系统电源状态。 |
| IPC-cfbe72c62d81 | task-power:state | electron_os_web_adaptation_not_equivalent | 无用户OS电源事件；worker任务状态真实保留但不是powerSaveBlocker event。 |
| IPC-ce03744a77ef | window:before-close | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-3a73e0100026 | window:close | electron_os_web_adaptation_not_equivalent | 关闭当前浏览器标签由浏览器控制，不调用宿主所有窗口；产品未伪造返回native成功。 |
| IPC-ed495037f8dc | window:is-maximized | electron_os_web_adaptation_not_equivalent | 浏览器viewport只代表页面大小，不推断用户OS窗口maximize状态。 |
| IPC-e436786bb1f7 | window:minimize | electron_os_web_adaptation_not_equivalent | 浏览器权限无法最小化用户OS窗口，未以CSS隐藏页面假装成功。 |
| IPC-1e94f610b0e1 | window:resolve-close | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-b148b8418b82 | window:toggle-maximize | electron_os_web_adaptation_not_equivalent | 浏览器全屏/缩放不等于OS窗口maximize，未用别的动作伪装。 |
| IPC-e6a8f1b41825 | workspace:create-transfer | implemented_adapted_static_proven | 密码传输slot、AEAD整包、原件与完整native资产hash、source V2纯schema验证、三格式重新打开验真 |
| IPC-f53f8972c1a5 | workspace:discard-recovery | implemented_adapted_static_proven | owner/tenant/project权限与recoveryRevision CAS删除，仅当前恢复草稿。 |
| IPC-3c8789ad9a8f | workspace:forget-recent | implemented_adapted_static_proven | 只删除当前owner recent引用，原件和项目内容不变。 |
| IPC-7e55b9d273b1 | workspace:list-recent | implemented_adapted_static_proven | 真实个人recent表按当前project访问重新RLS；保存project/document位置，非泄漏其他账号最近材料。 |
| IPC-be30d4526c26 | workspace:list-recoveries | implemented_adapted_static_proven | 真实个人加密草稿头及材料名、revision、保存时间，撤权后不可见。 |
| IPC-a80eb991f683 | workspace:list-recovery-prompts | implemented_adapted_static_proven | 真实dirty草稿存在才提示，expired/outdated单独判定；本产品以逐材料云端草稿替代桌面workspace临时文件。 |
| IPC-f417c3628886 | workspace:migrate-v1-to-v2 | implemented_adapted_static_proven | ZIP→V2→V3真实编码转换，全部sources逐bytes、全部snapshot归一后深等价，错密/篡改拒绝 |
| IPC-feb24aa50a4f | workspace:open | implemented_adapted_static_proven | 旧native、source三格式完整导入；外部旧review按source/hash/新canonical anchor/context/sourceMap绑定恢复pending，歧义原条目完整保留并阻断导出直到逐项人工处理 |
| IPC-86a65aa5ca0e | workspace:open-dialog | implemented_adapted_static_proven | 静态逐入口证明：；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-8ed0acbb4144 | workspace:open-recovery | implemented_adapted_static_proven | 原件/内容hash、材料revision及recovery CAS、owner双权限验证后返未批准草稿；绝不自动生成trusted review/artifact。 |
| IPC-1d575f4ee880 | workspace:read-review-profile | implemented_adapted_static_proven | 直接提取并调用源main20094-20202纯规则ey及全部依赖，完整corrections/pseudonyms/reserved/conflicts；不调用licensed engine |
| IPC-70e09702200d | workspace:receive-transfer | implemented_adapted_static_proven | 用户给定传输密码验证后另建项目；新AEAD域与新材料/映射ID，重新识别，旧approval/artifact不信任；native和真正foreign source输入均实际跑通 |
| IPC-d78ef82e46d5 | workspace:reveal | electron_os_web_adaptation_not_equivalent | 工程内容通过云项目与portable下载查看；不调用用户shell reveal原绝对路径。 |
| IPC-c356082df625 | workspace:save | implemented_adapted_static_proven | 当前工程全材料/原件/预览/字形map/文档策略/marks/raw类型/mapping/forms/源archive/state+历史snapshot完整编码；native extension无损封装源未知字段；.markdown大小写及sourceExtension真实源schema通过 |
| IPC-ff1d1193dc22 | workspace:save-as | implemented_adapted_static_proven | 真实重新生成、校验、下载完整备份。浏览器另存位置由用户控制，绝不返回伪造宿主绝对路径或覆盖不可变原件 |
| IPC-9be2a0784913 | workspace:save-recovery | implemented_adapted_static_proven | AEAD完整marks/pageReview/映射引用，串行UIautosave加revision CAS；不把自动保存当通过复核。 |
| IPC-1ad8e879614a | workspace:save-result | implemented_adapted_static_proven | 静态逐入口证明：PUT "/api/documents/:id/review"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-98cb505df8ea | workspace:select-review-profile | implemented_adapted_static_proven | project锁+双权限+CAS；冲突必须选择。真实active规则快照、immutable假名和reserved集合；source raw identity/forms/标准profile/旧路由scope继承；旧文档outdated必须重识别复核 |
| IPC-8b8d74411dc8 | workspace:select-save-path | electron_os_web_adaptation_not_equivalent | 原.tmm保存对话框由浏览器下载替代；原容器格式兼容另有明确缺口。 |
| UI-2c1712d35460 | entity-group-review | implemented_adapted_static_proven | 静态逐入口证明：POST `/api/projects/:id/review-batch/${mode}`；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| UI-3f01047e6b59 | full-text-search-scopes | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/search"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| UI-339d8e53408d | review-preview-mode | implemented_adapted_static_proven | 静态逐入口证明：POST "/api/documents/:id/preview"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| UI-ad41d13c4a2d | preview-policy-hierarchy | implemented_adapted_static_proven | 静态逐入口证明：POST '/api/documents/:id/replacement-policies'；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| UI-67e30cf66ad0 | known-entity-audit | implemented_adapted_static_proven | 静态逐入口证明：POST `/api/projects/:id/known-entities/${operation}`；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| UI-32ce2fb60c5f | manual-correction-scope | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/documents/:id/pages/:page/ocr-text"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| HTTP-39c99fc0f49b | GET https://lis.lawbotai.cn/api/order/offer-{code}?sku={sku} | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| HTTP-5b15967de5d7 | GET https://lis.lawbotai.cn/api/order/referral-{code} | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| HTTP-c7b17225ac88 | POST https://lis.lawbotai.cn/api/order/create | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| HTTP-d01c26128e34 | POST https://lis.lawbotai.cn/api/order/{orderId}/contact | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| HTTP-5b5f45240232 | GET https://lis.lawbotai.cn/api/order/{orderId} | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| IPC-4dd20e80cae3 | image-review:batch-search | implemented_adapted_static_proven | 逐页真实原件hash/内容hash/字形maphash认证后，全页或pageIndex、Unicode空白归一、charbox优先/wordfallback、单行和至多4相邻行全部命中与逐box去重。无OCRmap/无效不可见glyph/CAS/sourcehash/跨tenant拒绝。 |
| IPC-ba07bb14e3df | image-review:get-ocr-page | implemented_adapted_static_proven | 静态逐入口证明：GET "/api/documents/:id/pages/:page/ocr-text"；源许可运行仍R0；该旧阶段测试是否本轮运行以tests.actualRanThisIndependentPass记录为准。 |
| IPC-910347ed48b5 | image-review:ocr-region | implemented_adapted_static_proven | 源缓存字形中心＋缺字符框的uniform-word fallback；fallback显式approximate，缩放与UTF16完整。新增真实OCR区域重跑作为我方扩展，输出供人工纠正，不覆写原文。 |
| HTTP-a71a256b3205 | GET https://downloading.lawbotai.cn/main/mac/stable/latest-mac.yml | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| HTTP-6d3c7c84fc7d | GET {updateInfo.files[].url \| updateInfo.path} resolved against update feed | private_licensed_external_dependency | vendor license/device entitlement/order/payment/signedrelease services cannot be invoked/impersonated; currentpublicstatic evidence retained; sourceR0 |
| LOCAL_HTTP-74413f3c6e71 | expected GET http://127.0.0.1:{port}/ | electron_os_web_adaptation_not_equivalent | 源临时native transfer listener首页不是云公开静态目录；我方认证portable传输使用项目作用域HTTP，未开放任意本机端口。 |
| LOCAL_HTTP-c7d0bee37342 | expected GET http://127.0.0.1:{port}/{128hex}.zip | electron_os_web_adaptation_not_equivalent | 源一次性本机zip令牌传输/TTL事件未完整实现；云portable导出是受权限下载，不能据此声称原128hex临时server闭合。 |
