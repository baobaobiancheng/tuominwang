# 前端入口核验 A（58 项）

核读 58 项：UI/生命周期可追踪 26 项、可追踪但存在传输方式缺陷 1 项、发布包无静态前端引用 31 项。入口分类未决 0；竞品运行验证 0；完整业务契约声明 0。

“无静态前端引用”是明确分类，不是伪造UI闭合。通用invoke桥仍允许外部字符串；动态输入边界须结合单独审查。缺少许可证，不能把静态完成写成运行全覆盖。

发现：log:renderer-error 的renderer invoke与主进程handle匹配，但preload的两个send兜底不匹配。auth:cancel-recovery未被当前UI调用；恢复UI返回只清空本地状态。

| ID / 通道 | 入口分类 | 入口与语义 |
|---|---|---|
| IPC-0dcec6bac9d5 / `license:get-status` | reachable_static | 授权页初始化/激活成功回读、App挂载、受许可保护的路由beforeEach、应用菜单授权信息、导出客户名读取；window.ipc.invoke常量通道；五处调用。路由/初始化未激活跳转license；客户名读取1500ms超时回空。 |
| IPC-0f2d4d6b6262 / `dictionary:export` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；renderer主包无dictionary引用；PDF worker中三处exportData属于Font/ErrorFont，不是anbao.dictionary。 |
| IPC-14a3820628e8 / `feedback:get-document-stats` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-196efa6b695b / `feedback:export-audit-report` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-1a2923d565e2 / `auth:migrate-legacy-password` | reachable_static | 认证弹窗“验证并升级”/新密码输入回车；$2验证旧密码及两次新密码；i2=window.anbao；成功emit success/password_set/authToken，失败保留错误并清空旧密码。 |
| IPC-1abcdf6d1a56 / `software-update:acknowledge-whats-new` | reachable_static | 软件更新弹窗“开始使用”；_2→Ru.acknowledgeWhatsNew→anbao.softwareUpdate；更新state，setupCompleted后关窗，否则进入设置。 |
| IPC-1c4d31759888 / `mcp-connectors:open` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；72个open词法候选逐项接收者核查属于确认弹窗、workspace、PDF/XHR等。mcpConnectors的5处API引用仅getStatus/copySetup/retry/chooseFolder，未取对象别名或open方法。 |
| IPC-1e8858b1ed43 / `software-update:download` | reachable_static | 软件更新详情“开始下载”；x2→Ru.download，先关弹窗；成功取state，失败重开status，异常标UPDATE_DOWNLOAD_RESULT_UNKNOWN。 |
| IPC-1e94f610b0e1 / `window:resolve-close` | reachable_static | 标题栏关闭后收到before-close；保存退出/放弃退出/取消/失败；m2将requestId、decision、error传preload；保存或恢复记录清理失败时decision=failed，窗口继续保留。 |
| IPC-22c459a29cd7 / `dictionary:export-excel` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；同名exportExcel三处属于rulesets store→anbao.rulesets.exportExcel；没有dictionary接收者。 |
| IPC-243bf096202b / `auth:cancel-recovery` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；cancelRecovery/channel零引用；恢复弹窗j2仅重置UI字段并emit cancel，不调用主进程cancelRecovery（28568–28570）。 |
| IPC-251d99e85000 / `auth:verify-password` | reachable_static | 认证弹窗确认/回车；verify-or-setup设密码后的授权回填；B2/ F2→i2.auth.verifyPassword；读取authToken；NEED_SET_PASSWORD切设置，其他失败清空输入。 |
| IPC-25271d44841c / `dictionary:add-entry` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-27dd16394cd6 / `desensitization:process-files` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；processFiles/channel零引用；handler虽命名process-files，实际只读源文件字节并建输出目录，不执行脱敏。 |
| IPC-28d93302bd32 / `app:write-clipboard-text` | reachable_static | 应用菜单的传输副本弹窗“复制传输密码”；he2传y2.value，回读success后显示已复制；失败提示手动复制。navigator.clipboard其他三处并非此IPC。 |
| IPC-2a09a00cba17 / `auth:import-recovery-file` | reachable_static | 认证恢复步骤“导入恢复文件”/重新导入；z2只在申请已导出且未busy时调用，取消不报错，success后允许设置新密码。 |
| IPC-2c55a1969fb8 / `learner:update-rules` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；updateRules/channel零引用；主进程是常量success/stats:null/rulesetHash空串，不实际学习。 |
| IPC-2e9ce1df9fec / `app:reset-docx-safe-mode` | reachable_static | DOCX安全预览提示“恢复高保真预览”；Gr2先删localStorage DOCX_PREVIEW_DISABLED，再通过window.ipc??window.anbao的invoke常量调用，吞异常并显示恢复提示；故UI提示不是主进程成功确认。 |
| IPC-3211d99d0f20 / `desensitization:open-output-dir` | reachable_static | 回填结果、单文件导出结果、批量导出结果打开输出目录；P2=window.anbao的可选链fallback和两处window.anbao直调用。回填优先pseudonym.openOutputFolder，只有outputDir存在时走此接口；导出两处吞异常。 |
| IPC-3484537f3350 / `auth:complete-recovery` | reachable_static | 认证恢复步骤“重置密码”/回车；K2要求已验证恢复文件、两次密码一致且未busy；传nextPassword，成功清空字段回到密码解锁。 |
| IPC-34a47a0ff8e1 / `auth:save-recovery-request` | reachable_static | 认证恢复步骤“导出恢复申请文件”/申请遗失重新导出；L2要求已生成申请，调用无参；用户取消不改变成功状态，成功置exported并显示支持邮箱。 |
| IPC-37a279488720 / `pseudonym:select-input-docx` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-3a73e0100026 / `window:close` | reachable_static | 非Mac自绘标题栏“关闭”；p2→window.ipc.invoke(window:close)；主进程close触发关闭确认协议，不能等同立即退出。 |
| IPC-3b4c9f7c2b97 / `ai-collab:set-review-intent` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-3f0d71fadee4 / `dictionary:download-excel-template` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；同名downloadExcelTemplate三处属于rulesets store→anbao.rulesets.downloadExcelTemplate；不是dictionary。 |
| IPC-429f13ae0835 / `electron:save-pdf-to-desensitized` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-43e13058e656 / `learner:rollback-to-previous` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；rollbackToPrevious/channel零引用；主进程明确返回自学习回滚已下线。 |
| IPC-4567d2cc2f1d / `auth:check-password` | reachable_static | 应用菜单修改密码“验证当前密码”/旧密码回车；ie2将旧密码传auth.checkPassword，成功才开启新密码输入；KEY_HIERARCHY_AUTH_FAILED和AUTH_NOT_CONFIGURED分别提示。 |
| IPC-47ecc7525dfe / `image-review:clear-ocr-cache` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；无专用preload暴露，通道常量在全部renderer资产零引用。注册的handler只删除一个缓存key。 |
| IPC-499bd8d4596b / `app:open-external` | reachable_static | DOCX预览/文本预览点击http或https链接；fu2捕获a[href]点击，阻止默认导航，仅http(s)调用openExternal；preload使用send，主进程on接收。 |
| IPC-4e269deca69e / `software-update:get-state` | reachable_static | App已激活挂载或离开license路由时初始化更新store；Ru.initialize幂等，先订阅state再getState；首启设置/whats-new自动展示，失败UPDATE_STATUS_UNKNOWN。 |
| IPC-50d02c91469e / `dictionary:import` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-523337153cab / `desensitization:select-folder` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-527f74c7a029 / `license:refresh` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；无专用preload方法；全部renderer资产不存在此通道常量，界面刷新使用get-status。 |
| IPC-539465a49a9b / `net:reset-stats` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-540edc231d28 / `ai-collab:attach-source` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-5634886c31f2 / `auth:request-system-grant` | reachable_static | 认证弹窗“使用Touch ID或Mac密码”；O2→i2.auth.requestSystemGrant无参；authToken成功后进入设置或emit success，AUTH_CANCELLED不报错。 |
| IPC-5d7065a40d45 / `app:read-legal-doc` | reachable_static | 应用菜单用户协议/产品介绍/隐私政策；watch s2将agreement/intro/privacy映射三个固定md名称；成功显示content，失败清空文案并显示错误。 |
| IPC-5f5d0e7e7171 / `auth:has-password` | reachable_static | workspace打开/保存前密钥状态检查；认证能力读取失败后的fallback；workspace x2→hasPassword返回initialized/hasPassword/unlocked/needsLegacyMigration；AuthDialog i2=anbao 的fallback从结果选password/system-unavailable/set-password。 |
| IPC-6099fda9db85 / `software-update:check` | reachable_static | 软件更新弹窗“检查更新”；w2→store.check→anbao.softwareUpdate.check；保留更晚available/downloading/ready状态，成功切详情/ready。 |
| IPC-611ab311c5f6 / `app:get-version` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；无专用preload方法；全部renderer资产不存在此通道常量，UI当前版本用编译常量0.5.9/其他状态数据。 |
| IPC-629ace0aecd1 / `desensitization:save-markdown-draft` | reachable_static | 单文件/批量导出失败后的“导出待人工处理稿”；两处取得方法别名t3/n3再调用，确认明确残留敏感信息后传outputPath/content；单文件失败保留审查，批量逐项保留失败记录。 |
| IPC-65f32fe31f76 / `app:read-onboarding-sample` | reachable_static | 导入页“导入示例文档”；yn2→readOnboardingSample无参；检查success/data和至少1024bytes，转换Uint8Array经Kg2导入替换；失败显示未完整加载。 |
| IPC-67a324d00c09 / `software-update:restart-and-install` | reachable_static | 更新准备完成“重启并更新”；k2→Ru.restartAndInstall无参；store更新state，异常提示先检查是否仍运行而非反复安装。 |
| IPC-69f3f32b9683 / `auth:change-password` | reachable_static | 应用菜单“修改密码”/确认新密码回车；re2要求已验旧密码且两次新密码一致；传currentPassword/nextPassword；成功清空字段；异常标结果未确认。 |
| IPC-6cb1afcdadfc / `software-update:state` | reachable_static | 主进程更新状态通知→已激活App的更新store；HI.emitState发送至所有存活窗口，preload listener去event后传state并返回取消订阅；Ru在dispose移除监听，非invoke接口。 |
| IPC-6dcdb71fa095 / `pseudonym:select-input-markdown` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-6f5f29f520a1 / `task-power:get-state` | reachable_static | macOS工作台挂载获取电源状态初始快照；e3=window.anbao?.taskPower别名，darwin条件成立才e3.getState；onState驱动Vn2与恢复保存，unmount注销。 |
| IPC-72093dfff7bf / `review:get-feedbacks` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-73870d051b3f / `debug:get-paths` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-765d8b00f827 / `license:get-summary` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；无专用preload方法；全部renderer资产不存在此通道常量，授权摘要由get-status字段投影。 |
| IPC-77baf8b1932c / `ai-collab:attach-sources` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；attachSources/channel零renderer引用；但是服务attachSelectedDocxPaths在ai-collab:authorize处理器中被内部调用（M24440–24447），不能把内部复用写为这个IPC有UI调用。 |
| IPC-7a1832cb9fe9 / `mcp-connectors:update-automation` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-7b3e67a5a715 / `desensitization:get-resource-diagnostics` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-7c61ecffef61 / `log:renderer-error` | reachable_with_transport_mismatch | DOCX预览失败、审查挂载异常、Vue捕获、window error/unhandledrejection；preload异常兜底；renderer七处通过通用invoke可到ipcMain.handle。preload两处send未找到同名on，存在transport mismatch，不把这两条兜底标成有效。 |
| IPC-7d7beed074d0 / `review:clear-all` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-7de3f60b8ed5 / `dictionary:select-excel-import-file` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |
| IPC-7f4cfe68e159 / `app:export-crash-log` | no_renderer_reference | 本发布包未引用的暴露/注册端点，不能虚构UI按钮；全部renderer资产中通道字面量和专用preload方法名均无AST引用；主进程handler与preload暴露仍存在。 |

## 逐项证据和契约

JSON中每项保存 renderer/preload 精确行范围、文件和范围 SHA256，主进程原始UTF-16范围、既有服务证据、参数/返回/错误/副作用及未知项。census保存全部候选，不能单独作为语义闭合结论。

复核：
```sh
node 文档/逆向台账/contracts/scan-ui-closure-a.mjs --check
python3 文档/逆向台账/contracts/build-ui-closure-a.py --check
```
