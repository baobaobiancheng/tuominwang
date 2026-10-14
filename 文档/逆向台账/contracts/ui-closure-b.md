# 前端入口核验 B：57 项

本组57项已逐项归类：17项renderer调用或通知订阅，40项发布renderer无对应调用（其中3项是停用/常量兼容处理器）。这不是57个可运行功能，也不是全业务契约完成。运行仍为R0。

复核：`node 文档/逆向台账/contracts/scan-ui-closure-b.mjs --check`；`python3 文档/逆向台账/contracts/build-ui-closure-b.py --check`。

源文件全集、SHA-256、UTF-16字符偏移和源码行范围保存在JSON；同名候选排除记录在scan.json。

## IPC-7fb83198252b learner:rollback-previous

- 分类：disabled_or_constant_compatibility_handler
- 触发/无引用依据：没有专用preload，handler固定返回自学习回滚功能已下线；无renderer通道字面调用。
- 输入：无专用preload
- 返回：success:false,message
- 错误：rollback-to-previous用error，rollback/rollback-previous用message；get-stats捕获error
- 副作用：明确停用；共享存储：get-stats首次构造可能mkdir快照目录并读history；当前其他handler不调用学习算法
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [877988,878094)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-80e954e3a669 dictionary:remove-entry

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：id
- 返回：removed:boolean
- 错误：大部分success:false,error；选择取消也是success:false；get-entries为误置OCR错误文案
- 副作用：仅手工来源可删；共享存储：Mu单例手工memory，feedback_json.dat；direct sync write，非事务
- preload：dictionary.removeEntry
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [894880,895053)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-82ace6842a00 auth:restore-session-token

- 分类：renderer_entry_traced
- 触发/无引用依据：RestorePseudonymPanel mounted→ee2；自动回填ie2和用户重试前再次ee2。P2=window.anbao。成功保存authToken并设置已认证；失败清token、进入认证弹窗。
- 输入：必须senderFrame===sender.mainFrame，hierarchy当前unlocked且sender已登记ue。
- 返回：成功{success:true,authToken}；否则{success:false,error_type:AUTH_REQUIRED}。
- 错误：状态读取失败返回AUTH_REQUIRED；不能凭renderer缓存token重新解锁。
- 副作用：锁定时pe移除sender及其token；合格会话签发新一次性15分钟token。
- preload：auth.restoreSessionToken
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:28661-28685; .data/research/lawbot-2026-10-13/readable/renderer.js:28709-28716; .data/research/lawbot-2026-10-13/readable/renderer.js:28798-28803
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [903168,903579)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-85f474cad97a desensitization:generate-reports

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：results[],outputDir。
- 返回：success:true,report,outputDir；catch success:false,error。
- 错误：多文件顺序写，无事务；后一个失败前面的可能已存在；CSV错误吞掉。无任务取消。
- 副作用：su.generateReport/HtmlReport/ProcessingProof写JSON/HTML/MD；append userData/support/validation_log.csv。copy_export_test=blocked、page_continuity_check=pass、manual_ops_count=0为固定字段；OCR均值只来自输入results。
- preload：desensitization.generateReports
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [871816,873929)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-8a12674fee54 dictionary:select-export-path

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：filePath
- 错误：大部分success:false,error；选择取消也是success:false；get-entries为误置OCR错误文案
- 副作用：只选择，不写；共享存储：Mu单例手工memory，feedback_json.dat；direct sync write，非事务
- preload：dictionary.selectExportPath
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [896375,896739)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-8f0322abb8b8 auth:create-recovery-request

- 分类：renderer_entry_traced
- 触发/无引用依据：AuthDialog mounted且initialPhase=recovery：创建/恢复密码恢复申请；success后按exported恢复导入步骤，失败映射code展示且不重置申请。
- 输入：无参数；必须有效本机许可、设备/installation/recoverySlot绑定、已配置密钥。
- 返回：{success:true,request,exported:boolean}；已有有效pending复用。
- 错误：handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 已损坏/过期/绑定不符pending可清理重建；其他异常继续失败。
- 副作用：首次生成installation-id/32字节challenge/UUID；pending-recovery.v1.json以0600临时写rename；申请7天，恢复文件策略48小时。
- preload：auth.createRecoveryRequest
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:28439-28445; .data/research/lawbot-2026-10-13/readable/renderer.js:28587-28599; .data/research/lawbot-2026-10-13/readable/renderer.js:31891-31899
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1260015,1260398)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-93ba5dca8357 pseudonym:select-input-markdown-batch

- 分类：no_published_renderer_caller
- 触发/无引用依据：当前恢复面板使用统一selectInputFiles，专用Markdown多选方法保留但无renderer引用。
- 输入：无
- 返回：filePaths
- 错误：AUTH_REQUIRED及key/mapping路径错误；单件可能reject，batchpartial；inspect歧义始终空
- 副作用：专用多MD选择器，当前UI未定位；共享存储：受保护lpm/index.lsi；保存先表再索引+读回；MD/Word结果文件，batch部分成功保留
- preload：pseudonym.selectInputMarkdownBatch
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [886102,886540)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-9577d3a9d6d0 desensitization:save-report

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：outputDir,fileName,content。
- 返回：success:true,reportPath 或 false,error/requiresActivation。
- 错误：catch包装；默认writeFile可覆盖，失败可留下部分文件，无任务cancel。
- 副作用：A2写outputDir/fileName UTF8；不验证报告对应真实运行结果。
- preload：desensitization.saveReport
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [814833,815200)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-978012face0b net:set-offline

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：任意值Boolean()转换，字符串false仍为true。
- 返回：{success:true,offline:boolean}。
- 错误：拦截器异常cancel:true；IPC本体无错误包装。
- 副作用：修改进程内offline开关，不持久化；网络拦截只在defaultSession webRequest，file/data/devtools放行，开发host和激活更新操作允许的feed路径例外。
- preload：net.setOffline
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1306195,1306305)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-9a7ac510f8c7 review:get-whitelist

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：whitelist
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：memory confidence>=.5；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.getWhitelist
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [909261,909437)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-9ac7b5cfa48e auth:lock

- 分类：no_published_renderer_caller
- 触发/无引用依据：auth.lock无调用；其他lock命中来自流/ZIP等三方对象，不能作为认证锁定入口。
- 输入：无参数。
- 返回：{success:true}。
- 错误：handler无catch；没有独立错误结果形状。
- 副作用：清零并移除内存CMK，清所有token及会话。
- preload：auth.lock
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [903104,903167)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-9b9d5a0f489e dictionary:save-export-file

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：{filePath,content}
- 返回：success:true
- 错误：大部分success:false,error；选择取消也是success:false；get-entries为误置OCR错误文案
- 副作用：直接UTF8写，没有局部路径限制；共享存储：Mu单例手工memory，feedback_json.dat；direct sync write，非事务
- preload：dictionary.saveExportFile
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [896740,896918)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-9bb6c463b31f feedback:get-global-stats

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：stats
- 错误：success:false,error；报告未激活加requiresActivation:true
- 副作用：总计及FP/FN/confirmed；共享存储：Mu单例反馈和记忆共享；clear清反馈/记忆/提示；导出Markdown普通文件写
- preload：feedback.getGlobalStats
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [875256,875715)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-9dbd84b9715b review:get-blacklist

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：blacklist
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：memory confidence>=.5；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.getBlacklist
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [909084,909260)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a05e3b6af8e1 review:add-feedback

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：camelCase feedback字段
- 返回：recordId,message
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：映射字段到共享Mu；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.addFeedback
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [908483,908903)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a07c3fdcbe45 desensitization:read-file

- 分类：no_published_renderer_caller
- 触发/无引用依据：唯一readFile成员属于process.getBuiltinModule("fs").promises，系PDF.js Node加载分支，不是anbao.desensitization.readFile。
- 输入：裸 filePath 字符串。
- 返回：success:true,data:Uint8Array,fileName,fileType；失败success:false,error。
- 错误：fs异常包装；无大小上限/取消任务见于此handler。
- 副作用：读整个文件进内存，复制buffer给renderer；无持久写。
- preload：desensitization.readFile
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [811812,812150)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a09f09579955 desensitization:get-markdown-export-stats

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无参数。
- 返回：Zf统计对象；读取缺失文件返回Zf([])，其他错误throw。
- 错误：ENOENT不是故障；finally关闭handle，无取消。
- 副作用：打开/关闭文件并聚合，不重新审查文档。
- preload：desensitization.getMarkdownExportStats
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [813518,813998)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a11af873aa1a app:open-path

- 分类：main_event_renderer_subscription_traced
- 触发/无引用依据：OS open-file/second-instance→主进程app:open-path→appRuntime.onOpenPath→Dashboard mounted订阅→Od2(path)→workspace store.openRecent→恢复审查；打开失败刷新最近列表并显示错误。
- 输入：事件型；只处理string且扩展.tmm且exists；选择第一个窗口。
- 返回：preload onOpenPath(handler)回调收到filePath；返回取消订阅函数，不是invoke结果。
- 错误：不存在路径被忽略；无窗口不发；fs exists异常忽略。
- 副作用：恢复最小化/聚焦；窗口loading时待did-finish-load再发；pending仍可冷启动consume。
- preload：appRuntime.onOpenPath, appRuntime.onOpenPath
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:32859-32876; .data/research/lawbot-2026-10-13/readable/renderer.js:33364-33373
- 主进程范围：
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a26e3c125cb6 app:get-env

- 分类：renderer_entry_traced
- 触发/无引用依据：case store.fetchEnvironment由AppHeader mounted触发，更新environment；LicenseView mounted另走window.ipc.invoke读取版本/mode，后读取授权状态。异常保留默认显示。
- 输入：无参数；devTaskLabel仅非packaged，移控制字符trim并截5个码点。
- 返回：{mode:production或development,devTaskLabel,appVersion:0.5.9,versions}。
- 错误：无catch，无专门失败包装。
- 副作用：读取运行环境。
- preload：getEnv
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:3574-3578; .data/research/lawbot-2026-10-13/readable/renderer.js:4163-4170; .data/research/lawbot-2026-10-13/readable/renderer.js:37618-37626
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1329743,1329897)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a70191351664 license:get-machine-id

- 分类：renderer_entry_traced
- 触发/无引用依据：LicenseView b2读授权状态失败且不是LEGACY_UPGRADE_NEEDED时的降级分支；机器码成功不代表授权成功。mounted调用b2。
- 输入：无参数。
- 返回：{success:true,machineId}，即使未激活也可能成功读取设备码。
- 错误：异常统一{success:false,error,errorCode:LICENSE_IPC_FAILED}。
- 副作用：缓存设备码和状态；getStatus可能读许可、验证时钟/版本记录。
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:37559-37580; .data/research/lawbot-2026-10-13/readable/renderer.js:37618-37626
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1323079,1323242)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a73b27802b39 software-update:set-preferences

- 分类：renderer_entry_traced
- 触发/无引用依据：SoftwareUpdateDialog保存按钮b2→Ru store.savePreferences→anbao.softwareUpdate.setPreferences，提交完整四个布尔偏好；success关闭弹窗，失败显示未确认。
- 输入：只保留setupCompleted/checkAutomatically/downloadAutomatically/installAutomatically且严格true；遗漏字段变false，非patch合并。
- 返回：{success:true,state}。
- 错误：持久化错误仅日志，调用仍可能success:true；自动下载异步结果不作为当前返回。
- 副作用：持久化software-update-state.json，更新autoInstallOnAppQuit；开自动检查1秒后检查，关则清定时；开启自动下载且available可立即下载。
- preload：softwareUpdate.setPreferences
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:4051-4054; .data/research/lawbot-2026-10-13/readable/renderer.js:4119-4128; .data/research/lawbot-2026-10-13/readable/renderer.js:4149-4158
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1324650,1324729)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-a982d6d137ce get-pdfjs-worker-path

- 分类：renderer_entry_traced
- 触发/无引用依据：PDFReview加载与Dashboard PDF文本预处理两处：workerSrc空时经window.electron.ipcRenderer.invoke取得fileUrl并传PDF.js；失败workerSrc置空，后续加载异常按预览流程处理。
- 输入：无参数。
- 返回：{type:"fileUrl",fileUrl}；找不到打包资源时throw。
- 错误：复制失败返回原资源URL；没有任务取消。
- 副作用：必要时复制到temp/lawbot-pdf-worker.mjs；大小相同且mtime较新则复用，未比较内容hash。
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:25823-25853; .data/research/lawbot-2026-10-13/readable/renderer.js:34691-34704
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1315483,1316184)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-acbca2a96370 dictionary:get-entries

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：entries[]
- 错误：大部分success:false,error；选择取消也是success:false；get-entries为误置OCR错误文案
- 副作用：只user_dictionary；共享存储：Mu单例手工memory，feedback_json.dat；direct sync write，非事务
- preload：dictionary.getEntries
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [894532,894700)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-b148b8418b82 window:toggle-maximize

- 分类：renderer_entry_traced
- 触发/无引用依据：AppWindowControls非macOS最大化/还原按钮onClick h2→通用invoke→随后c2查询is-maximized。异常吞掉但仍回查。
- 输入：无业务参数；窗口绑定调用sender。
- 返回：有窗口true，否则false。
- 错误：没有窗口返回false；handler未包装Electron异常。
- 副作用：查询或对应窗口动作；close经过保存确认状态机。
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:3945-3948; .data/research/lawbot-2026-10-13/readable/renderer.js:3964-3969; .data/research/lawbot-2026-10-13/readable/renderer.js:4026-4027
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1306578,1306735)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-b199b300f630 review:get-statistics

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：statistics
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：total/FP/FN/confirmed/byType；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.getStatistics
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [910285,910777)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-b2c075e4afde feedback:delete-by-document

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：documentName
- 返回：删除结果，以AST返回原形态为准
- 错误：success:false,error；报告未激活加requiresActivation:true
- 副作用：循环deleteFeedback，每条保存；共享存储：Mu单例反馈和记忆共享；clear清反馈/记忆/提示；导出Markdown普通文件写
- preload：feedback.deleteByDocument
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [875716,876014)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-b3931f25eb79 ai-collab:resume-local-restore

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：{jobId}
- 返回：job:服务投影（详细分支见文档第7节）
- 错误：IPC d2 success:false,error,errorCode；list直接[]；consume对象/null；gateway ok:false,error{code,message}
- 副作用：resumeLocalRestoreFromRenderer；见第7节状态/副作用/失败恢复表；共享存储：受保护jobs-v1.laj串行索引+backup；exchange/private-review/private-restore-input；多个阶段文件写
- preload：aiCollab.resumeLocalRestore
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1210563,1210678)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-b67938c0cb2f app:consume-open-path

- 分类：renderer_entry_traced
- 触发/无引用依据：Dashboard mounted从appRuntime一次消费冷启动.tmm路径，非空交Od2→store.openRecent；reject吞掉，后续仍订阅热启动onOpenPath。
- 输入：无参数；dS来自存在的.tmm命令行/系统open-file。
- 返回：string路径或null。
- 错误：无catch；路径此前exists，使用时可能已变动。
- 副作用：消费pending路径，置null。
- preload：appRuntime.consumeOpenPath
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:32859-32876; .data/research/lawbot-2026-10-13/readable/renderer.js:33369-33373
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1329447,1329522)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-b828b79da058 feedback:clear-all

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：count:0
- 错误：success:false,error；报告未激活加requiresActivation:true
- 副作用：共享clear同时清memory和hints；共享存储：Mu单例反馈和记忆共享；clear清反馈/记忆/提示；导出Markdown普通文件写
- preload：feedback.clearAll
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [876210,876381)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-ba48a535d0b1 auth:get-capabilities

- 分类：renderer_entry_traced
- 触发/无引用依据：三处：菜单ve2检查是否配置密码；AuthDialog mounted R2选择系统/密码/设置/迁移阶段；Dashboard qa2在受保护操作前要求initialized/unlocked否则打开认证弹窗。
- 输入：无参数；biometryType仅touch-id/face-id/none。
- 返回：success及systemAuthentication/biometryAvailable/biometryType；configured映射hasPassword/applicationPassword/applicationPasswordConfigured，initialized映射deviceProtectionInitialized。
- 错误：异常返回success:false及认证能力false、biometryType:none、error；wf内部映射AUTH_*。
- 副作用：读取密钥文件/旧密码存在性；macOS helper --capabilities（静态观察，没有执行）；过期内存密钥会lock。
- preload：auth.getCapabilities
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:28353-28359; .data/research/lawbot-2026-10-13/readable/renderer.js:28452-28468; .data/research/lawbot-2026-10-13/readable/renderer.js:28587-28588; .data/research/lawbot-2026-10-13/readable/renderer.js:31900-31924
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [899567,899997)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-bb6001e11068 review:export-proof-lite

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：options
- 返回：filePath为服务结果对象,message
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：network_out_bytes字面量0，不是网络测量；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.exportProofLite
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [909717,909997)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-c19a241811ac dictionary:record-hint-action

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：{action,entity_type,pattern}
- 返回：key,count,shouldPrompt,stat
- 错误：大部分success:false,error；选择取消也是success:false；get-entries为误置OCR错误文案
- 副作用：非delete变add，归一文本，>=2次且全局未提示；共享存储：Mu单例手工memory，feedback_json.dat；direct sync write，非事务
- preload：dictionary.recordHintAction
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [895054,895301)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-c1cec3199992 desensitization:process-file-main

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：filePath、enabledRules、enableOCR/outputDir/mode/matches、可选假名/route/fullRedactRules；th过滤签名类。
- 返回：success:true,result 或 false,error,result?；不保证提供实际outputPath。
- 错误：最终输出写入catch为空，仍可success:true；无n2注册/cancelSignal；不能用成功结果推断已生成文件。
- 副作用：su处理；PDF事件发getAllWindows()[0]而非当前sender且无requestId；有desensitizedText/outputDir时尝试生成并写文件。
- preload：desensitization.processFileMain
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [868565,871815)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-ca4c19558c55 learner:get-snapshots

- 分类：disabled_or_constant_compatibility_handler
- 触发/无引用依据：preload仍暴露，但handler固定success:true,snapshots:[]；无renderer入口。
- 输入：无
- 返回：snapshots:[]
- 错误：rollback-to-previous用error，rollback/rollback-previous用message；get-stats捕获error
- 副作用：常量处理器；共享存储：get-stats首次构造可能mkdir快照目录并读history；当前其他handler不调用学习算法
- preload：learner.getSnapshots
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [877811,877889)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-caef950fe9a5 learner:rollback

- 分类：disabled_or_constant_compatibility_handler
- 触发/无引用依据：专用preload仍暴露snapshotId参数，handler忽略并固定返回已下线。
- 输入：snapshotId通过preload但handler忽略
- 返回：success:false,message
- 错误：rollback-to-previous用error，rollback/rollback-previous用message；get-stats捕获error
- 副作用：明确停用；共享存储：get-stats首次构造可能mkdir快照目录并读history；当前其他handler不调用学习算法
- preload：learner.rollback
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [877890,877987)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-ce03744a77ef window:before-close

- 分类：main_event_renderer_subscription_traced
- 触发/无引用依据：OS窗口关闭→主进程阻止默认关闭并发requestId→AppWindowControls mounted onBeforeClose→等待workspace:prepare-close→无dirty则resolve allow，有dirty展示保存/不保存/取消；失败resolve failed；卸载取消订阅。
- 输入：事件payload {requestId:string}；每窗口状态机生成非空请求ID。
- 返回：preload onBeforeClose(handler)回调并返回取消订阅函数。
- 错误：无自动超时分支；renderer未回可能保持waiting-renderer。
- 副作用：第一次preventDefault并请求renderer；等待中重复close仅聚焦；allow-once下次关闭放行。
- preload：windowLifecycle.onBeforeClose, windowLifecycle.onBeforeClose
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:3970-4005; .data/research/lawbot-2026-10-13/readable/renderer.js:4008-4027
- 主进程范围：
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-cfbe72c62d81 task-power:state

- 分类：main_event_renderer_subscription_traced
- 触发/无引用依据：macOS powerMonitor suspend/resume实际状态变更→广播→Dashboard mounted taskPower.onState→Vn2.update→uc2恢复快照/保存；卸载取消订阅。
- 输入：事件payload状态同get-state。
- 返回：onState回调并返回removeListener函数。
- 错误：重复suspend/resume返回false不广播；本层未包装send异常。
- 副作用：仅macOS状态实际改变才广播；suspend清原生timer保留remainingMs，resume重arm并累计睡眠毫秒revision+1。
- preload：taskPower.onState, taskPower.onState
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:32807-32819
- 主进程范围：
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-d0b393b9e93d dictionary:select-import-file

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：无
- 返回：entries,filePath
- 错误：大部分success:false,error；选择取消也是success:false；get-entries为误置OCR错误文案
- 副作用：原生选择JSON；返回预览；共享存储：Mu单例手工memory，feedback_json.dat；direct sync write，非事务
- preload：dictionary.selectImportFile
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [895791,896374)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-d3e5e1de12d2 review:export-user-memories

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：options
- 返回：filePath为服务结果对象,message
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：实际JSON内容；外层不展开服务结果；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.exportUserMemories
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [909998,910284)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-d78ef82e46d5 workspace:reveal

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：filePath。
- 返回：success:true,data:null 或workspace error。
- 错误：同步异常包装；无回执确认OS真正显示成功。
- 副作用：启动系统文件定位，不读文件内容/不删除。
- preload：workspace.reveal
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1267740,1267884)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-d79e3892b954 license:activate

- 分类：renderer_entry_traced
- 触发/无引用依据：LicenseView激活按钮/Enter触发x2，trim输入授权串后invoke；success重新b2确认并清输入，旧版升级进入对应状态，其余显示错误。仅静态阅读，未激活/绕过。
- 输入：必须非空string；Gu去空白并验证payload.signature和必要字段；必须本机设备码、许可类型和版本适配；非permanent要求未过期expiresAt。
- 返回：通过{success:true,activated:true,customer,type,versionRange,issuedAt,expiresAt}；不通过{success:false,error,errorCode?}。
- 错误：签名、机器、撤销REFUNDED_LICENSE、早期版本LEGACY_UPGRADE_NEEDED、类型/过期/IO失败。
- 副作用：先清cachedStatus；验证后写license.dat并缓存。没有运行、修改或绕过此链。
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:37591-37608; .data/research/lawbot-2026-10-13/readable/renderer.js:37636-37639
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1323747,1324195)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-d874c25112ba feedback:add

- 分类：no_published_renderer_caller
- 触发/无引用依据：renderer实际使用feedback.addBatch；没有feedback.add。普通Set.add/Array等同名方法已排除。
- 输入：record
- 返回：id
- 错误：success:false,error；报告未激活加requiresActivation:true
- 副作用：透传字段，存储强制id/time/os_user；共享存储：Mu单例反馈和记忆共享；clear清反馈/记忆/提示；导出Markdown普通文件写
- preload：feedback.add
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [873943,874112)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-e024a8242875 review:export-audit-log

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：options?:{format?,outputDir?,filePrefix?,includeStatistics?}
- 返回：filePath为服务结果对象,message
- 错误：导出服务结果对象被handler嵌到filePath，可能外成功内失败；其他success:false,error
- 副作用：内层success:false仍可能外success:true；共享存储：同Mu存储；Dm在exports目录写审计/ProofLite/记忆；clear影响同一库
- preload：review.exportAuditLog
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [909438,909716)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-e25810712ab1 app:set-docx-safe-mode

- 分类：no_published_renderer_caller
- 触发/无引用依据：renderer没有docxSafeMode命名空间；Map.set等同名方法已排除。
- 输入：reason原样写JSON，未观察到类型/大小过滤。
- 返回：{ok:true}。
- 错误：异常{ok:false,error:message}，非原子写。
- 副作用：覆盖写入{time:ISO,reason}。
- preload：docxSafeMode.set
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1329153,1329411)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-e436786bb1f7 window:minimize

- 分类：renderer_entry_traced
- 触发/无引用依据：AppWindowControls非macOS最小化按钮onClick d2→window.ipc.invoke；异常忽略。
- 输入：无业务参数；窗口绑定调用sender。
- 返回：有窗口true，否则false。
- 错误：没有窗口返回false；handler未包装Electron异常。
- 副作用：查询或对应窗口动作；close经过保存确认状态机。
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:3945-3948; .data/research/lawbot-2026-10-13/readable/renderer.js:3958-3963; .data/research/lawbot-2026-10-13/readable/renderer.js:4026-4027
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1306458,1306577)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-e6a8f1b41825 workspace:create-transfer

- 分类：no_published_renderer_caller
- 触发/无引用依据：preload保留createTransfer；当前renderer没有createTransfer成员或该通道字面量，不能用页面传输文案推断此调用。
- 输入：已保存filePath，OS选目标；resolve后拒绝目标与源完全相同。
- 返回：success:true,data:{filePath,transferPassword}；取消data:null；错误workspace error。
- 错误：写后自检失败可能有目标文件；没有撤销任务；主进程未复制用户账号/产品激活。
- 副作用：V_.createTransferCopy生成随机传输密码/新DEK，以SCRYPT+AES-GCM transfer槽通过cf写副本，再打开自检；finally清DEK/关源reader。
- preload：workspace.createTransfer
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1268325,1269089)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-eceef0e6cff3 ai-collab:retry-authorization

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：{jobId}
- 返回：job:服务投影（详细分支见文档第7节）
- 错误：IPC d2 success:false,error,errorCode；list直接[]；consume对象/null；gateway ok:false,error{code,message}
- 副作用：rollbackAuthorizationAfterImportFailure；见第7节状态/副作用/失败恢复表；共享存储：受保护jobs-v1.laj串行索引+backup；exchange/private-review/private-restore-input；多个阶段文件写
- preload：aiCollab.retryAuthorization
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1208912,1209035)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-ed495037f8dc window:is-maximized

- 分类：renderer_entry_traced
- 触发/无引用依据：四处真实调用：AppWindowControls mounted和切换后c2；DOCX/PDF/图片审查组件窗口resize后Dn2/B2/Wa2，布尔用于布局；异常false。
- 输入：无业务参数；窗口绑定调用sender。
- 返回：布尔；无窗口false。
- 错误：没有窗口返回false；handler未包装Electron异常。
- 副作用：查询或对应窗口动作；close经过保存确认状态机。
- preload：没有专用暴露；检查通用invoke/通知。
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:3951-3957; .data/research/lawbot-2026-10-13/readable/renderer.js:3964-3969; .data/research/lawbot-2026-10-13/readable/renderer.js:4008-4009; .data/research/lawbot-2026-10-13/readable/renderer.js:6641-6650; .data/research/lawbot-2026-10-13/readable/renderer.js:22408-22417; .data/research/lawbot-2026-10-13/readable/renderer.js:27063-27072
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1306736,1306855)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-efc77b9d6c1d feedback:delete-by-id

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：id
- 返回：删除结果，以AST返回原形态为准
- 错误：success:false,error；报告未激活加requiresActivation:true
- 副作用：String(id)，按id删除；共享存储：Mu单例反馈和记忆共享；clear清反馈/记忆/提示；导出Markdown普通文件写
- preload：feedback.deleteById
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [876015,876209)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-f1f713df2b98 desensitization:save-file

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：outputDir,fileName,content,type(buffer/text)。
- 返回：success:true,outputPath 或 false,error。
- 错误：写入失败返回错误；默认 writeFile 可覆盖同名，无取消/回执。
- 副作用：A2 写 outputDir/已脱敏/fileName；不自己核验输入 content 已脱敏。
- preload：desensitization.saveFile
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [813089,813517)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-f417c3628886 workspace:migrate-v1-to-v2

- 分类：no_published_renderer_caller
- 触发/无引用依据：发布renderer没有该专用方法成员或通道字面调用；只有preload暴露和主进程注册，不能虚构对应按钮。
- 输入：sourceFilePath非空，OS选择另存目标并补.tmm。
- 返回：success:true,data:{sourceFilePath,filePath,documentCount,sourceBytes,ocrPages}；取消data:null。
- 错误：catchworkspace error；本handler无取消进行中的迁移；源目标是否同路径由更下游约束仍待查。
- 副作用：R_读取旧项目并写目标容器；DEK finally清零。
- preload：workspace.migrateV1ToV2
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1267885,1268324)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-f5725b5e0d8a app:get-docx-safe-mode

- 分类：no_published_renderer_caller
- 触发/无引用依据：renderer没有docxSafeMode命名空间；profiles.get/rulesets.get和Map.get等同名方法已排除。
- 输入：无参数。
- 返回：存在{safeMode:true,detail:原始字符串}；否则{safeMode:false}。
- 错误：所有读取异常降级safeMode:false，不区分缺失和损坏。
- 副作用：读取安全模式标志。
- preload：docxSafeMode.get
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1328696,1328937)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-f69ef883aa33 pseudonym:select-input-docx-batch

- 分类：no_published_renderer_caller
- 触发/无引用依据：当前恢复面板使用统一selectInputFiles，专用Word多选方法保留但无renderer引用。
- 输入：无
- 返回：filePaths
- 错误：AUTH_REQUIRED及key/mapping路径错误；单件可能reject，batchpartial；inspect歧义始终空
- 副作用：专用多Office选择器，当前UI未定位；共享存储：受保护lpm/index.lsi；保存先表再索引+读回；MD/Word结果文件，batch部分成功保留
- preload：pseudonym.selectInputDocxBatch
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [885264,885697)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-f8d8e4c7c379 net:get-stats

- 分类：renderer_entry_traced
- 触发/无引用依据：Dashboard sn2→net.getStats读取计数/offline，更新在线状态；un2立即及每2秒轮询，visibilitychange隐藏时停轮询；失败保留前值。
- 输入：无参数。
- 返回：{bytesOut,bytesIn,requests,blocked,offline}。
- 错误：拦截器异常cancel:true；IPC本体无错误包装。
- 副作用：读取计数；网络拦截只在defaultSession webRequest，file/data/devtools放行，开发host和激活更新操作允许的feed路径例外。
- preload：net.getStats
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:31394-31413
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1306306,1306348)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-f96c39b98bc8 auth:set-password

- 分类：renderer_entry_traced
- 触发/无引用依据：AuthDialog设置并继续按钮/Enter→F2：先校验最少4位及两次一致→i2.auth.setPassword；verify-or-setup再verifyPassword取得token；设置成功但授权失败不会报告全部成功。
- 输入：String(value||空串)；Ng要求字符串长度至少4、UTF-8不超过1024字节、不可全空白；scrypt参数校验后派生。；已配置拒绝AUTH_ALREADY_CONFIGURED，旧密码存在拒绝AUTH_LEGACY_MIGRATION_REQUIRED。
- 返回：{success:true}，不直接发authToken。
- 错误：handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。
- 副作用：创建/更新密码槽与设备恢复槽，原子临时写入并解锁；migrateLegacy失败被吞；将sender标为已认证。 旧假名映射迁移逐个JSON校验/受保护写入并更新索引，成功后删除旧JSON；逐文件失败收集为failures，handler不展示这些失败。
- preload：auth.setPassword
- 前端范围：.data/research/lawbot-2026-10-13/readable/renderer.js:28495-28523; .data/research/lawbot-2026-10-13/readable/renderer.js:28602-28602
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [901105,901524)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-feab6613b5ed feedback:query

- 分类：no_published_renderer_caller
- 触发/无引用依据：query为路由/DOM/三方对象字段，未归属于anbao.feedback。
- 输入：options?:{documentName?,type?}
- 返回：records
- 错误：success:false,error；报告未激活加requiresActivation:true
- 副作用：按可选条件过滤，不等价强schema；共享存储：Mu单例反馈和记忆共享；clear清反馈/记忆/提示；导出Markdown普通文件写
- preload：feedback.query
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [874363,874763)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

## IPC-ff1d1193dc22 workspace:save-as

- 分类：no_published_renderer_caller
- 触发/无引用依据：renderer中saveAs属于vu工作区store。实际M2调用selectSavePath再N2/workspace.save；不是该旧save-as通道。
- 输入：suggestedName及完整保存payload(projectId/revision/snapshot等)。
- 返回：success:true,data:保存回执；取消data:null；失败workspace error。
- 错误：取消只限选择阶段；已开始保存无取消；路径写入/后续读取失败状态同sw.save。
- 副作用：对话框选path后rI计活跃写并sw.save；该入口未使用workspace:save requestId回执Map。
- preload：workspace.saveAs
- 前端范围：全5个发布renderer文件AST无对应已知调用，见缺席审计。
- 主进程范围：.data/research/lawbot-2026-10-13/extracted/dist/main/index.js [1267038,1267353)
- 剩余边界：竞品无许可证，逐项运行保持R0；静态入口归类不证明操作系统/远端/磁盘失败恢复。 未宣称全产品完整业务契约或我方同名功能均已对齐。

