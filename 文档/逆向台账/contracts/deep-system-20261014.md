# 系统接口递归契约分析（2026-10-14）

53 项均保留 S2 / R0。独立对抗审查否决22项仅到接口本体的S3候选，handlerBoundaryReviewed单独记录本体阅读。

## 状态边界

不把项目代码到 Node/Electron API 的边界等同于完整用户业务链。运行行为、依赖内部、私有签发服务分开保留。不会通过修改旧状态定义获得完成率。

## auth:get-capabilities / IPC-ba48a535d0b1

候选：S2；运行：R0。

- bf依次找Resources与cwd的lawbot_auth_helper，X_OK后spawnSync --capabilities探测；真正调用shell:false、中文locale，解析stdout JSON且只要求success布尔。
- 同sender新请求abort旧请求；sender销毁触发abort；SIGTERM、超时、stdout上限、stderr裁尾与finally解绑已追踪。系统认证成功后若CMK已初始化才解锁，未初始化仍登记sender并返回token。

剩余静态缺口：lawbot_auth_helper为原生二进制，其LAContext实现未逐指令分析；系统认证结果未运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18665–18671；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:15265–15335；.data/research/lawbot-2026-10-13/readable/main.js:19650–19697；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:283–283；.data/research/lawbot-2026-10-13/readable/main.js:15264–15334；.data/research/lawbot-2026-10-13/readable/main.js:18665–18699；.data/research/lawbot-2026-10-13/readable/main.js:19733–19742

## auth:request-system-grant / IPC-5634886c31f2

候选：S2；运行：R0。

- bf依次找Resources与cwd的lawbot_auth_helper，X_OK后spawnSync --capabilities探测；真正调用shell:false、中文locale，解析stdout JSON且只要求success布尔。
- 同sender新请求abort旧请求；sender销毁触发abort；SIGTERM、超时、stdout上限、stderr裁尾与finally解绑已追踪。系统认证成功后若CMK已初始化才解锁，未初始化仍登记sender并返回token。

剩余静态缺口：lawbot_auth_helper为原生二进制，其LAContext实现未逐指令分析；系统认证结果未运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18672–18699；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/readable/main.js:15265–15335；.data/research/lawbot-2026-10-13/readable/main.js:19733–19742；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:284–284；.data/research/lawbot-2026-10-13/readable/main.js:15264–15334；.data/research/lawbot-2026-10-13/readable/main.js:18665–18699

## auth:set-password / IPC-f96c39b98bc8

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18700–18709；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19603；.data/research/lawbot-2026-10-13/readable/main.js:19650–19717；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/readable/main.js:16623–16626；.data/research/lawbot-2026-10-13/readable/main.js:15152–15263；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:285–285；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:has-password / IPC-5f5d0e7e7171

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18710–18716；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19650–19697；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:286–286；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:verify-password / IPC-251d99e85000

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18717–18724；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19603；.data/research/lawbot-2026-10-13/readable/main.js:19718–19732；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/readable/main.js:16623–16626；.data/research/lawbot-2026-10-13/readable/main.js:15152–15263；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:287–287；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:check-password / IPC-4567d2cc2f1d

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18725–18731；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19603；.data/research/lawbot-2026-10-13/readable/main.js:19718–19732；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:289–289；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:migrate-legacy-password / IPC-1a2923d565e2

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18732–18741；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19603；.data/research/lawbot-2026-10-13/readable/main.js:19698–19717；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/readable/main.js:16623–16626；.data/research/lawbot-2026-10-13/readable/main.js:15152–15263；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:290–290；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:change-password / IPC-69f3f32b9683

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18742–18750；.data/research/lawbot-2026-10-13/readable/main.js:19567–19603；.data/research/lawbot-2026-10-13/readable/main.js:19743–19760；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:291–291；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:lock / IPC-9ac7b5cfa48e

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18751–18751；.data/research/lawbot-2026-10-13/readable/main.js:14843–14845；.data/research/lawbot-2026-10-13/readable/main.js:19788–19790；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:292–292；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:restore-session-token / IPC-82ace6842a00

候选：S2；运行：R0。

- 参数先 String(value || "")；应用密码至少4个UTF16单元、UTF8最多1024字节且不能全空白。scrypt 默认 N=131072,r=8,p=1,32字节；派生参数范围和salt规范化单独校验。
- Fg 使用随机CMK、password-cmk和device-recovery-cmk两个槽；AES-256-GCM AAD采用排序JSON，并验证nonce/tag/密文长度。读文件限128KiB；wx临时文件0600、sync、rename、finally清理，目录未fsync。
- CMK会话默认15分钟，requireUnlockedCmk延长有效期；status仅在读取时清理过期密钥。lock清零内存CMK；auth:lock还清除webContents集合及一次性令牌。
- 令牌绑定sender id并15分钟过期；fe先删除再验证，因此错误sender尝试也消耗令牌。restore-session-token要求mainFrame、当前CMK已解锁且sender在集合中，然后新发一次性令牌。
- 旧密码通过safeStorage解密、等长timingSafeEqual；迁移先rename旧文件，再setup并删除备份，失败尝试回滚rename，但回滚异常被吞。setup成功后的映射迁移失败被handler吞掉，仍返回成功。
- changePassword与setup未用统一串行锁；只有保护写首次初始化的pendingInitialization去重。不能把单文件rename当作多步骤事务或并发安全证明。

剩余静态缺口：set/verify/migrate还调用mf.migrateLegacy，完整映射存储链见格式报告；此报告不独立替代该链。；OS safeStorage/Node crypto的实际运行及磁盘故障组合未验证。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18751–18760；.data/research/lawbot-2026-10-13/readable/main.js:29–48；.data/research/lawbot-2026-10-13/readable/main.js:14831–14845；.data/research/lawbot-2026-10-13/readable/main.js:19694–19697；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:288–288；.data/research/lawbot-2026-10-13/readable/main.js:29–49；.data/research/lawbot-2026-10-13/readable/main.js:14788–14845；.data/research/lawbot-2026-10-13/readable/main.js:19567–19887；.data/research/lawbot-2026-10-13/readable/main.js:26849–26864

## auth:create-recovery-request / IPC-8f0322abb8b8

候选：S2；运行：R0。

- 申请绑定license/installation/device/recoverySlot与32字节challenge，最长7日；导出状态持久化后才允许导入官方恢复文件。导入限普通文件且<=64KiB。
- 恢复文件检查受信Ed25519公钥、排序payload签名、目的/版本、最长2日、未来时差60秒、申请绑定；complete再次验证，再调用redeemer和device slot重包新密码，最后清除申请。
- 打包代码实际注入Q_，redeem固定返回redeemed:true；虽payload要求maxUses=1，本客户端没有持久化已兑付token表。不能写成已证明远端一次性兑付。
- 完成恢复时device slot自检后写入password slot并锁CMK；若后续pending文件清理失败，handler返回失败而密码已改变。cancel先清内存再删文件，删文件异常不被handler包装。

剩余静态缺口：官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:25539–25547；.data/research/lawbot-2026-10-13/readable/main.js:25347–25443；.data/research/lawbot-2026-10-13/readable/main.js:25446–25538；.data/research/lawbot-2026-10-13/readable/main.js:19761–19790；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:293–293；.data/research/lawbot-2026-10-13/readable/main.js:25446–25584

## auth:save-recovery-request / IPC-34a47a0ff8e1

候选：S2；运行：R0。

- 申请绑定license/installation/device/recoverySlot与32字节challenge，最长7日；导出状态持久化后才允许导入官方恢复文件。导入限普通文件且<=64KiB。
- 恢复文件检查受信Ed25519公钥、排序payload签名、目的/版本、最长2日、未来时差60秒、申请绑定；complete再次验证，再调用redeemer和device slot重包新密码，最后清除申请。
- 打包代码实际注入Q_，redeem固定返回redeemed:true；虽payload要求maxUses=1，本客户端没有持久化已兑付token表。不能写成已证明远端一次性兑付。
- 完成恢复时device slot自检后写入password slot并锁CMK；若后续pending文件清理失败，handler返回失败而密码已改变。cancel先清内存再删文件，删文件异常不被handler包装。

剩余静态缺口：官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:25548–25564；.data/research/lawbot-2026-10-13/readable/main.js:25347–25443；.data/research/lawbot-2026-10-13/readable/main.js:25446–25538；.data/research/lawbot-2026-10-13/readable/main.js:19761–19790；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:294–294；.data/research/lawbot-2026-10-13/readable/main.js:25446–25584

## auth:cancel-recovery / IPC-243bf096202b

候选：S2；运行：R0。

- 申请绑定license/installation/device/recoverySlot与32字节challenge，最长7日；导出状态持久化后才允许导入官方恢复文件。导入限普通文件且<=64KiB。
- 恢复文件检查受信Ed25519公钥、排序payload签名、目的/版本、最长2日、未来时差60秒、申请绑定；complete再次验证，再调用redeemer和device slot重包新密码，最后清除申请。
- 打包代码实际注入Q_，redeem固定返回redeemed:true；虽payload要求maxUses=1，本客户端没有持久化已兑付token表。不能写成已证明远端一次性兑付。
- 完成恢复时device slot自检后写入password slot并锁CMK；若后续pending文件清理失败，handler返回失败而密码已改变。cancel先清内存再删文件，删文件异常不被handler包装。

剩余静态缺口：官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:25565–25565；.data/research/lawbot-2026-10-13/readable/main.js:25347–25443；.data/research/lawbot-2026-10-13/readable/main.js:25446–25538；.data/research/lawbot-2026-10-13/readable/main.js:19761–19790；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:296–296；.data/research/lawbot-2026-10-13/readable/main.js:25446–25584

## auth:import-recovery-file / IPC-2a09a00cba17

候选：S2；运行：R0。

- 申请绑定license/installation/device/recoverySlot与32字节challenge，最长7日；导出状态持久化后才允许导入官方恢复文件。导入限普通文件且<=64KiB。
- 恢复文件检查受信Ed25519公钥、排序payload签名、目的/版本、最长2日、未来时差60秒、申请绑定；complete再次验证，再调用redeemer和device slot重包新密码，最后清除申请。
- 打包代码实际注入Q_，redeem固定返回redeemed:true；虽payload要求maxUses=1，本客户端没有持久化已兑付token表。不能写成已证明远端一次性兑付。
- 完成恢复时device slot自检后写入password slot并锁CMK；若后续pending文件清理失败，handler返回失败而密码已改变。cancel先清内存再删文件，删文件异常不被handler包装。

剩余静态缺口：官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:25565–25577；.data/research/lawbot-2026-10-13/readable/main.js:25347–25443；.data/research/lawbot-2026-10-13/readable/main.js:25446–25538；.data/research/lawbot-2026-10-13/readable/main.js:19761–19790；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:295–295；.data/research/lawbot-2026-10-13/readable/main.js:25446–25584

## auth:complete-recovery / IPC-3484537f3350

候选：S2；运行：R0。

- 申请绑定license/installation/device/recoverySlot与32字节challenge，最长7日；导出状态持久化后才允许导入官方恢复文件。导入限普通文件且<=64KiB。
- 恢复文件检查受信Ed25519公钥、排序payload签名、目的/版本、最长2日、未来时差60秒、申请绑定；complete再次验证，再调用redeemer和device slot重包新密码，最后清除申请。
- 打包代码实际注入Q_，redeem固定返回redeemed:true；虽payload要求maxUses=1，本客户端没有持久化已兑付token表。不能写成已证明远端一次性兑付。
- 完成恢复时device slot自检后写入password slot并锁CMK；若后续pending文件清理失败，handler返回失败而密码已改变。cancel先清内存再删文件，删文件异常不被handler包装。

剩余静态缺口：官方恢复凭证签发端不在发布包；其发放/撤销服务逻辑不可从客户端证明。；当前无许可证，未验证官方签发与合法恢复端到端。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:25578–25584；.data/research/lawbot-2026-10-13/readable/main.js:25347–25443；.data/research/lawbot-2026-10-13/readable/main.js:25446–25538；.data/research/lawbot-2026-10-13/readable/main.js:19761–19790；.data/research/lawbot-2026-10-13/readable/main.js:25496–25500；.data/research/lawbot-2026-10-13/readable/main.js:19567–19603；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26853；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:297–297；.data/research/lawbot-2026-10-13/readable/main.js:25446–25584

## app:consume-open-path / IPC-b67938c0cb2f

候选：S2；运行：R0。

- hS只选存在的.tmm路径；启动/second-instance/open-file写dS，本次调用读出并清空。单槽后到覆盖先到；不表示文件已成功打开。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27057–27061；.data/research/lawbot-2026-10-13/readable/main.js:26740–26772；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:20–20

## app:open-path / IPC-a11af873aa1a

候选：S2；运行：R0。

- 首个窗口恢复、聚焦；加载中等一次did-finish-load，否则立即send。路径在事件到达前仍可能改变；最终workspace处理见格式报告。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26740–26772；.data/research/lawbot-2026-10-13/readable/main.js:27057–27061；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:23–23；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:24–24

## app:write-clipboard-text / IPC-28d93302bd32

候选：S2；运行：R0。

- 只接受非空string，JS长度<=4096；writeText后readText完全相等才success，剪贴板竞争可能返回失败。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26773–26781；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:16–16

## app:get-env / IPC-a26e3c125cb6

候选：S2；运行：R0。

- 返回isPackaged对应mode、固定0.5.9、process.versions；开发label将控制字符替换为空格、trim后按码点截5，生产为空。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27071–27071；.data/research/lawbot-2026-10-13/readable/main.js:26323–26329；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:13–13

## app:get-version / IPC-611ab311c5f6

候选：S2；运行：R0。

- 读相对package.json并JSON.parse返回version；缺少version仍success:true，未验证类型。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27101–27107；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315

## app:read-legal-doc / IPC-5d7065a40d45

候选：S2；运行：R0。

- 仅agreement/product-intro/privacy-policy三个文件名；按打包/开发候选路径顺序access后read；捕获异常返回success:false。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27071–27085；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:68–68

## app:read-onboarding-sample / IPC-65f32fe31f76

候选：S2；运行：R0。

- 固定DOCX示例名；按候选路径逐一read，吞每次读异常，再返回Uint8Array或明确不存在。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27086–27098；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:69–69

## app:open-external / IPC-499bd8d4596b

候选：S2；运行：R0。

- 主进程on而非handle；truthy值直接shell.openExternal，无本地协议白名单、无返回值、无Promise catch。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27099–27100；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:14–14

## app:export-crash-log / IPC-7f4cfe68e159

候选：S2；运行：R0。

- 文件不存在、用户取消、复制成功、复制异常四分支；复制未脱敏日志内容，覆盖遵循系统保存框/Node行为。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27023–27031；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:232–232

## app:get-docx-safe-mode / IPC-f5725b5e0d8a

候选：S2；运行：R0。

- 标志存在读取detail并safeMode:true；不存在或任意读取异常safeMode:false。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27032–27041；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:226–226

## app:reset-docx-safe-mode / IPC-2e9ce1df9fec

候选：S2；运行：R0。

- 存在时unlink；不存在也ok:true；异常ok:false。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27042–27048；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:228–228

## app:set-docx-safe-mode / IPC-e25810712ab1

候选：S2；运行：R0。

- 直接JSON写time和reason，无reason模式校验；JSON或写异常返回ok:false。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27049–27056；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:230–230

## license:get-machine-id / IPC-a70191351664

候选：S2；运行：R0。

- 机器标识有磁盘缓存及进程缓存；Mac先IOPlatformUUID命令，再MAC，再固定fallback。getStatus缓存直到refresh或activate清空。
- 签名、机器绑定、版本范围、撤销表、授权类型和更新期限分别判断；activate与validateLicense的版本/到期分支不同，不能视为同一契约。
- clockRecord/maxVersion/机器缓存持久化异常被吞；activate写license.dat后生成cachedStatus，如后续日期转换抛错可报告未确认且文件已落盘。
- 撤销表是当前包内静态快照，不等价于已查询最新服务器撤销状态。

剩余静态缺口：Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26932–26937；.data/research/lawbot-2026-10-13/readable/main.js:13793–13870；.data/research/lawbot-2026-10-13/readable/main.js:13867–13928；.data/research/lawbot-2026-10-13/readable/main.js:13929–13984；.data/research/lawbot-2026-10-13/readable/main.js:13670–13695；.data/research/lawbot-2026-10-13/readable/main.js:18924–18926；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:13591–13669；.data/research/lawbot-2026-10-13/readable/main.js:13696–13791；.data/research/lawbot-2026-10-13/readable/main.js:13591–13668；.data/research/lawbot-2026-10-13/readable/main.js:13672–13791；.data/research/lawbot-2026-10-13/readable/main.js:13793–13984；.data/research/lawbot-2026-10-13/readable/main.js:26932–26965

## license:get-status / IPC-0dcec6bac9d5

候选：S2；运行：R0。

- 机器标识有磁盘缓存及进程缓存；Mac先IOPlatformUUID命令，再MAC，再固定fallback。getStatus缓存直到refresh或activate清空。
- 签名、机器绑定、版本范围、撤销表、授权类型和更新期限分别判断；activate与validateLicense的版本/到期分支不同，不能视为同一契约。
- clockRecord/maxVersion/机器缓存持久化异常被吞；activate写license.dat后生成cachedStatus，如后续日期转换抛错可报告未确认且文件已落盘。
- 撤销表是当前包内静态快照，不等价于已查询最新服务器撤销状态。

剩余静态缺口：Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26938–26944；.data/research/lawbot-2026-10-13/readable/main.js:13793–13870；.data/research/lawbot-2026-10-13/readable/main.js:13867–13928；.data/research/lawbot-2026-10-13/readable/main.js:13929–13984；.data/research/lawbot-2026-10-13/readable/main.js:13670–13695；.data/research/lawbot-2026-10-13/readable/main.js:18924–18926；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:13591–13669；.data/research/lawbot-2026-10-13/readable/main.js:13696–13791；.data/research/lawbot-2026-10-13/readable/main.js:13591–13668；.data/research/lawbot-2026-10-13/readable/main.js:13672–13791；.data/research/lawbot-2026-10-13/readable/main.js:13793–13984；.data/research/lawbot-2026-10-13/readable/main.js:26932–26965

## license:activate / IPC-d79e3892b954

候选：S2；运行：R0。

- 机器标识有磁盘缓存及进程缓存；Mac先IOPlatformUUID命令，再MAC，再固定fallback。getStatus缓存直到refresh或activate清空。
- 签名、机器绑定、版本范围、撤销表、授权类型和更新期限分别判断；activate与validateLicense的版本/到期分支不同，不能视为同一契约。
- clockRecord/maxVersion/机器缓存持久化异常被吞；activate写license.dat后生成cachedStatus，如后续日期转换抛错可报告未确认且文件已落盘。
- 撤销表是当前包内静态快照，不等价于已查询最新服务器撤销状态。

剩余静态缺口：Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26945–26952；.data/research/lawbot-2026-10-13/readable/main.js:13793–13870；.data/research/lawbot-2026-10-13/readable/main.js:13867–13928；.data/research/lawbot-2026-10-13/readable/main.js:13929–13984；.data/research/lawbot-2026-10-13/readable/main.js:13670–13695；.data/research/lawbot-2026-10-13/readable/main.js:18924–18926；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:13591–13669；.data/research/lawbot-2026-10-13/readable/main.js:13696–13791；.data/research/lawbot-2026-10-13/readable/main.js:13591–13668；.data/research/lawbot-2026-10-13/readable/main.js:13672–13791；.data/research/lawbot-2026-10-13/readable/main.js:13793–13984；.data/research/lawbot-2026-10-13/readable/main.js:26932–26965

## license:refresh / IPC-527f74c7a029

候选：S2；运行：R0。

- 机器标识有磁盘缓存及进程缓存；Mac先IOPlatformUUID命令，再MAC，再固定fallback。getStatus缓存直到refresh或activate清空。
- 签名、机器绑定、版本范围、撤销表、授权类型和更新期限分别判断；activate与validateLicense的版本/到期分支不同，不能视为同一契约。
- clockRecord/maxVersion/机器缓存持久化异常被吞；activate写license.dat后生成cachedStatus，如后续日期转换抛错可报告未确认且文件已落盘。
- 撤销表是当前包内静态快照，不等价于已查询最新服务器撤销状态。

剩余静态缺口：Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26953–26959；.data/research/lawbot-2026-10-13/readable/main.js:13793–13870；.data/research/lawbot-2026-10-13/readable/main.js:13867–13928；.data/research/lawbot-2026-10-13/readable/main.js:13929–13984；.data/research/lawbot-2026-10-13/readable/main.js:13670–13695；.data/research/lawbot-2026-10-13/readable/main.js:18924–18926；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:13591–13669；.data/research/lawbot-2026-10-13/readable/main.js:13696–13791；.data/research/lawbot-2026-10-13/readable/main.js:13591–13668；.data/research/lawbot-2026-10-13/readable/main.js:13672–13791；.data/research/lawbot-2026-10-13/readable/main.js:13793–13984；.data/research/lawbot-2026-10-13/readable/main.js:26932–26965

## license:get-summary / IPC-765d8b00f827

候选：S2；运行：R0。

- 机器标识有磁盘缓存及进程缓存；Mac先IOPlatformUUID命令，再MAC，再固定fallback。getStatus缓存直到refresh或activate清空。
- 签名、机器绑定、版本范围、撤销表、授权类型和更新期限分别判断；activate与validateLicense的版本/到期分支不同，不能视为同一契约。
- clockRecord/maxVersion/机器缓存持久化异常被吞；activate写license.dat后生成cachedStatus，如后续日期转换抛错可报告未确认且文件已落盘。
- 撤销表是当前包内静态快照，不等价于已查询最新服务器撤销状态。

剩余静态缺口：Windows WMI/PowerShell等辅助路径尚未逐段纳入本轮；Mac机器标识边界已阅读。；许可证签发私有服务未提供，激活成功链无运行证据；不修改或绕过验签。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26960–26965；.data/research/lawbot-2026-10-13/readable/main.js:13793–13870；.data/research/lawbot-2026-10-13/readable/main.js:13867–13928；.data/research/lawbot-2026-10-13/readable/main.js:13929–13984；.data/research/lawbot-2026-10-13/readable/main.js:13670–13695；.data/research/lawbot-2026-10-13/readable/main.js:18924–18926；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:13591–13669；.data/research/lawbot-2026-10-13/readable/main.js:13696–13791；.data/research/lawbot-2026-10-13/readable/main.js:13591–13668；.data/research/lawbot-2026-10-13/readable/main.js:13672–13791；.data/research/lawbot-2026-10-13/readable/main.js:13793–13984；.data/research/lawbot-2026-10-13/readable/main.js:26932–26965

## window:minimize / IPC-e436786bb1f7

候选：S2；运行：R0。

- fromWebContents查窗口，无窗口false，有窗口minimize并true；调用异常无catch。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26428–26430；.data/research/lawbot-2026-10-13/readable/main.js:26441–26466；.data/research/lawbot-2026-10-13/readable/main.js:25783–25802；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315

## window:toggle-maximize / IPC-b148b8418b82

候选：S2；运行：R0。

- 按isMaximized切换；返回true是已调用API，并非等候状态改变完成。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26431–26433；.data/research/lawbot-2026-10-13/readable/main.js:26441–26466；.data/research/lawbot-2026-10-13/readable/main.js:25783–25802；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315

## window:is-maximized / IPC-ed495037f8dc

候选：S2；运行：R0。

- 无窗口返回false，否则布尔化isMaximized。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26434–26436；.data/research/lawbot-2026-10-13/readable/main.js:26441–26466；.data/research/lawbot-2026-10-13/readable/main.js:25783–25802；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315

## window:close / IPC-3a73e0100026

候选：S2；运行：R0。

- hI状态idle/waiting-renderer/allow-once；重复close聚焦现有请求；resolve忽略旧requestId，allow只允许下一次close，cancel/failed保持窗口。
- resolve-close先标记会话clean再close，markSessionClean异常吞掉；关闭获准后Vp取消任务。无renderer答复超时，卡住时一直waiting-renderer。

剩余静态缺口：关闭前renderer保存/工作区恢复及Vp处理任务取消全链由处理/格式报告覆盖，不能仅以hI状态机声明整个退出流程完成。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26437–26440；.data/research/lawbot-2026-10-13/readable/main.js:26441–26466；.data/research/lawbot-2026-10-13/readable/main.js:25783–25802；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26428–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## window:before-close / IPC-ce03744a77ef

候选：S2；运行：R0。

- hI状态idle/waiting-renderer/allow-once；重复close聚焦现有请求；resolve忽略旧requestId，allow只允许下一次close，cancel/failed保持窗口。
- resolve-close先标记会话clean再close，markSessionClean异常吞掉；关闭获准后Vp取消任务。无renderer答复超时，卡住时一直waiting-renderer。

剩余静态缺口：关闭前renderer保存/工作区恢复及Vp处理任务取消全链由处理/格式报告覆盖，不能仅以hI状态机声明整个退出流程完成。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:25783–25802；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:116–116；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:117–117；.data/research/lawbot-2026-10-13/readable/main.js:26428–26466

## window:resolve-close / IPC-1e94f610b0e1

候选：S2；运行：R0。

- hI状态idle/waiting-renderer/allow-once；重复close聚焦现有请求；resolve忽略旧requestId，allow只允许下一次close，cancel/failed保持窗口。
- resolve-close先标记会话clean再close，markSessionClean异常吞掉；关闭获准后Vp取消任务。无renderer答复超时，卡住时一直waiting-renderer。

剩余静态缺口：关闭前renderer保存/工作区恢复及Vp处理任务取消全链由处理/格式报告覆盖，不能仅以hI状态机声明整个退出流程完成。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26702–26714；.data/research/lawbot-2026-10-13/readable/main.js:25783–25802；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:119–119；.data/research/lawbot-2026-10-13/readable/main.js:26428–26466

## net:set-offline / IPC-978012face0b

候选：S2；运行：R0。

- offline初始true，Boolean强制转换，getStats浅拷贝，reset归零4计数不改offline。
- 拦截范围是Electron defaultSession webRequest；file/data/devtools、开发host、活动更新feed例外。其余HTTP/HTTPS/WS/WSS按offline阻断；异常cancel:true。
- lu仅累加requests/blocked，bytesIn/bytesOut在此实现从不累加；不能把0字节统计或此拦截器解释为Node子进程/全应用没有外发。

剩余静态缺口：整个进程所有网络出入口的封闭性不由这三个UI统计接口保证；逐出口见HTTP报告。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26426–26428；.data/research/lawbot-2026-10-13/readable/main.js:12924–12931；.data/research/lawbot-2026-10-13/readable/main.js:26663–26700；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:135–135

## net:get-stats / IPC-f8d8e4c7c379

候选：S2；运行：R0。

- offline初始true，Boolean强制转换，getStats浅拷贝，reset归零4计数不改offline。
- 拦截范围是Electron defaultSession webRequest；file/data/devtools、开发host、活动更新feed例外。其余HTTP/HTTPS/WS/WSS按offline阻断；异常cancel:true。
- lu仅累加requests/blocked，bytesIn/bytesOut在此实现从不累加；不能把0字节统计或此拦截器解释为Node子进程/全应用没有外发。

剩余静态缺口：整个进程所有网络出入口的封闭性不由这三个UI统计接口保证；逐出口见HTTP报告。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26428–26428；.data/research/lawbot-2026-10-13/readable/main.js:12924–12931；.data/research/lawbot-2026-10-13/readable/main.js:26663–26700；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:136–136；.data/research/lawbot-2026-10-13/readable/main.js:26426–26428

## net:reset-stats / IPC-539465a49a9b

候选：S2；运行：R0。

- offline初始true，Boolean强制转换，getStats浅拷贝，reset归零4计数不改offline。
- 拦截范围是Electron defaultSession webRequest；file/data/devtools、开发host、活动更新feed例外。其余HTTP/HTTPS/WS/WSS按offline阻断；异常cancel:true。
- lu仅累加requests/blocked，bytesIn/bytesOut在此实现从不累加；不能把0字节统计或此拦截器解释为Node子进程/全应用没有外发。

剩余静态缺口：整个进程所有网络出入口的封闭性不由这三个UI统计接口保证；逐出口见HTTP报告。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26428–26428；.data/research/lawbot-2026-10-13/readable/main.js:12924–12931；.data/research/lawbot-2026-10-13/readable/main.js:26663–26700；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:137–137；.data/research/lawbot-2026-10-13/readable/main.js:26426–26428

## software-update:get-state / IPC-4e269deca69e

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26966–26966；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:122–122；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## software-update:set-preferences / IPC-a73b27802b39

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26966–26966；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:123–123；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## software-update:check / IPC-6099fda9db85

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26966–26966；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:124–124；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## software-update:download / IPC-1e8858b1ed43

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26966–26966；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:125–125；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## software-update:acknowledge-whats-new / IPC-1abcdf6d1a56

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26966–26966；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:127–127；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## software-update:restart-and-install / IPC-67a324d00c09

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26966–26969；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:126–126；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322

## software-update:state / IPC-6cb1afcdadfc

候选：S2；运行：R0。

- 仅darwin supported；打包feed要求HTTPS固定host/path、无端口/凭证/query/hash/百分号/回退路径，publisherName含Developer ID Application。开发localhost另有分支。
- preferences逐字段仅接受true；check/download各自用Promise去重。状态checking→available→downloading→ready；异常置error，finally清活动标记；网络放行仅活动期同host同feed子路径。
- update-available先走license entitlement，永久授权允许，其余要求releaseDate<=expiry；check监听处理Promise，但下载流程并非全局串行事务。
- writePersistedState先写固定.tmp，再unlink旧文件再rename，异常仅日志；不是原子替换保证。setPreferences在写失败时仍返回success。
- restart-and-install先检查窗口和ready，然后排队close；立刻success只代表接受关闭请求，后续renderer取消/安装失败不回写该响应。
- 成功检查后自动24小时调度；下载进度四舍五入并钳制0–100；错误消息对UI固定，详细异常进本地日志。

剩余静态缺口：electron-updater下载/签名校验/安装依赖另见协作HTTP报告；未完成跨平台安装或真实授权更新运行。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26318–26321；.data/research/lawbot-2026-10-13/readable/main.js:26082–26108；.data/research/lawbot-2026-10-13/readable/main.js:26143–26322；.data/research/lawbot-2026-10-13/readable/main.js:26966–26985；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:130–130；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:131–131；.data/research/lawbot-2026-10-13/readable/main.js:26082–26322；.data/research/lawbot-2026-10-13/readable/main.js:26449–26466；.data/research/lawbot-2026-10-13/readable/main.js:26702–26714

## task-power:get-state / IPC-6f5f29f520a1

候选：S2；运行：R0。

- snapshot浅拷贝{suspended,suspendedAt,totalSleepMs,revision}；不表示任务已保存。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26866–26875；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:6–6；.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js:1–1；.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:3–18

## task-power:state / IPC-cfbe72c62d81

候选：S2；运行：R0。

- darwin suspend/resume状态真实变更才广播；suspend暂停登记timer并从remaining扣除已运行时间；resume累计totalSleepMs后按保留的remaining重新arm，睡眠不消耗定时器预算；重复事件不增加revision。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26866–26875；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:9–9；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:10–10；.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js:1–1；.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:3–18

## debug:get-paths / IPC-73870d051b3f

候选：S2；运行：R0。

- 加载paths模块并返回应用/feedback/snapshot路径；setUserDataPath已在ready注入；fallback homedir/.lawbot-redaction-cat；纯路径查询无创建目录。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27108–27110；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/readable/main.js:26849–26851；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:236–236；.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js:1–1；.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:663–691

## electron:save-pdf-to-desensitized / IPC-429f13ae0835

候选：S2；运行：R0。

- outputDir truthy则使用，否则Documents/脱敏猫输出；建已脱敏/证明两目录，仅写传入buffer至已脱敏/filename；第五参数未用、不生成证明、不检验PDF、不做文件名包含检查。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27111–27121；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:312–312

## log:renderer-error / IPC-7c61ecffef61

候选：S2；运行：R0。

- 只写固定details omitted时间日志；不保存入参，append失败仍ok:true。专用preload的send与main.handle不匹配，renderer直接invoke才能命中。

剩余静态缺口：入口与renderer后续处理/生命周期完整业务链仍需逐段交叉核对；本体已读不提升S3。

运行缺口：未执行竞品接口；操作系统、文件故障及合法激活后的端到端结果未验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:27014–27022；.data/research/lawbot-2026-10-13/readable/main.js:26782–26790；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:320–324；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:331–335

