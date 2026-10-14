# 系统53项独立对抗审查（2026-10-14）

结论：4项问题已修复；53项全部保留S2/R0，22个原S3候选全部退回。本体阅读可保留handlerBoundaryReviewed标记。本轮发现均已修复。

检查53项ID/通道集合无漏重；所有引用源码范围与切片哈希匹配。未执行竞品，未修改ledger。重点人工复核22项；其余31项为接口及依赖边界复核，不能冒充独立全量算法审计。

## 发现与复核

### SYS-R1 / P1 / fixed

22项仅展开接口本体至Node/Electron边界，却被列为S3候选；原定义要求完整静态链逐段闭合。22项未有renderer证据或无调用调查的显式整合。

全部改S2；handlerBoundaryReviewed单独记录本体阅读；未升级ledger。

### SYS-R2 / P1 / fixed

原生成器对候选执行gaps=[]，按名单删除已有依赖缺口，不能证明缺口已解决。

取消清空；53项均保留非空静态缺口。

### SYS-R3 / P2 / fixed

task-power:state原称resume扣睡眠时长；实际suspend扣已运行时间，resume只累计睡眠并以remainingMs重新arm。

已修正文案，休眠不消耗定时器预算。

### SYS-R4 / P3 / fixed

app:get-env称移除控制字符；源码replace(control," ")是替换成空格后trim，再按码点截5。内部控制字符会留下空格，例a\nb变a b。

已改为控制字符替换空格后trim并截5码点。

## 逐项结论

| 接口 | 本体已读 | 决定 | 剩余边界 |
|---|---|---|---|
| auth:get-capabilities | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 lawbot_auth_helper为原生二进制，其LAContext实现未逐指令分析；系统认证结果未运行。 |
| auth:request-system-grant | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 lawbot_auth_helper为原生二进制，其LAContext实现未逐指令分析；系统认证结果未运行。 |
| auth:set-password | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:has-password | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:verify-password | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:check-password | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:migrate-legacy-password | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:change-password | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:lock | True | S2 / R0 | kh只清零当前CMK；me清grant/token。没有发布renderer调用（ui-closure-b）。与OS锁屏直接kh的行为不同；待把无UI入口证据、初始化及调用边界显式接入。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:restore-session-token | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。 |
| auth:create-recovery-request | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。 |
| auth:save-recovery-request | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。 |
| auth:cancel-recovery | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。 |
| auth:import-recovery-file | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。 |
| auth:complete-recovery | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。 |
| app:consume-open-path | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:open-path | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:write-clipboard-text | True | S2 / R0 | 本体长度校验、写后读、异常已读；UI复制分支及失败呈现未并入此报告。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:get-env | True | S2 / R0 | 固定版本/环境/开发标题本体已读；标题控制字符实际替换空格，UI消费未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:get-version | True | S2 / R0 | 本体read/JSON/缺version/失败已读；generic invoke入口调查未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:read-legal-doc | True | S2 / R0 | 白名单、候选路径顺序、access/read分支已读；文档弹窗加载/失败/渲染依赖未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:read-onboarding-sample | True | S2 / R0 | 固定样例的候选读取与失败已读；后续File构建、导入/识别链不在本体。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:open-external | True | S2 / R0 | send/on无业务响应，truthy直接调用shell；UI合法链接构建/错误呈现未并入；Promise拒绝未捕获。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:export-crash-log | True | S2 / R0 | 缺失/取消/copy失败四分支已读；上游日志生产与错误弹窗结果处理未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:get-docx-safe-mode | True | S2 / R0 | 标志读取失败返回false已读；preview消费该状态与回退流程未闭合。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:reset-docx-safe-mode | True | S2 / R0 | unlink失败返回ok:false已读；UI重试渲染与标志重新创建链未闭合。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| app:set-docx-safe-mode | True | S2 / R0 | reason JSON直接写、失败留部分文件风险已读；native crash和JS失败标志生产/渲染回退未闭合。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| license:get-machine-id | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。 |
| license:get-status | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。 |
| license:activate | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。 |
| license:refresh | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。 |
| license:get-summary | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。 |
| window:minimize | True | S2 / R0 | fromWebContents与minimize调用已读；无窗口false、异常透传；UI窗口控制引用调查未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| window:toggle-maximize | True | S2 / R0 | 最大化状态分支与API调用已读；调用true不证明状态变化，UI刷新未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| window:is-maximized | True | S2 / R0 | getter无窗口false已读；状态消费与resize事件关联未并入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| window:close | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 关闭前renderer保存/工作区恢复及Vp处理任务取消全链由处理/格式报告覆盖，不能仅以hI状态机声明整个退出流程完成。 |
| window:before-close | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 关闭前renderer保存/工作区恢复及Vp处理任务取消全链由处理/格式报告覆盖，不能仅以hI状态机声明整个退出流程完成。 |
| window:resolve-close | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 关闭前renderer保存/工作区恢复及Vp处理任务取消全链由处理/格式报告覆盖，不能仅以hI状态机声明整个退出流程完成。 |
| net:set-offline | True | S2 / R0 | Boolean赋值与defaultSession拦截已读；依赖HI.allowsNetworkRequest及其活动状态生产，不能证明全进程离线。 整个进程所有网络出入口的封闭性不由这三个UI统计接口保证；逐出口见HTTP报告。 |
| net:get-stats | True | S2 / R0 | 快照与计数生产已读；仅requests/blocked增加，byte始终0；UI消费与全部出口非此契约。 整个进程所有网络出入口的封闭性不由这三个UI统计接口保证；逐出口见HTTP报告。 |
| net:reset-stats | True | S2 / R0 | 4字段清零已读，不改offline；UI刷新时序未并入。 整个进程所有网络出入口的封闭性不由这三个UI统计接口保证；逐出口见HTTP报告。 |
| software-update:get-state | True | S2 / R0 | JSON深拷贝本体已读；值来源横跨initialize/persisted/entitlement/updater事件，不能因getter短而关闭整个状态链。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| software-update:set-preferences | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| software-update:check | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| software-update:download | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| software-update:acknowledge-whats-new | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| software-update:restart-and-install | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| software-update:state | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。 |
| task-power:get-state | True | S2 / R0 | 快照本体已读；renderer 32807–32819取初值，状态update相关消费尚未递归闭合。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| task-power:state | True | S2 / R0 | 主进程suspend/resume→onState→Vn2.update→uc2→oc2/Yt/Du2/Ou2/Ec2依赖未逐段闭合；本报告遗漏renderer范围。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| debug:get-paths | True | S2 / R0 | 路径helper完整已读；fallback会更新Le内存缓存，无建目录；无发布UI调用证据应接入。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| electron:save-pdf-to-desensitized | True | S2 / R0 | 四业务参数；第五handler参数含event计数是originalFilePath且未用。写任意buffer，不验证PDF/filename范围，不生成证明；无renderer调用见A组。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |
| log:renderer-error | False | S2 / R0 | 已核对接口范围与组依赖；保留原S2及下列缺口，不宣称本轮独立重做整个外部/原生依赖实现。 入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。 |

精确源码范围及SHA-256保存在同名JSON逐项evidence；当前目标JSON SHA-256：`cbfb93b4155769c3de73517acaf774540e989e555b195365943e4e6fb87b6e7e`。
