# 应用、认证、许可与系统契约静态核读（0.5.9）

本文件人工核读53项；与业务63项、协作/配置101项合计217项，通道集合无重叠、无遗漏。**全部 S2 / R0 / complete=false；完整业务契约为0。** 未执行竞品JS，也未进行授权绕过。

## 证据与范围

JSON保留canonical原始operation/handler/preload范围，另记录直接服务原文件行范围和切片SHA256。M为readable/main.js，P为extracted/dist/preload/index.js；完整路径和文件SHA256如下。

- `.data/research/lawbot-2026-10-13/readable/main.js`，SHA256 `40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba`。
- `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js`，SHA256 `f593a0d62dbfd6296faa683b314b9cebb745908d997acd297c183d9c3d225f3b`。
- `.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js`，SHA256 `8f67c6cacca517411e66daf6f6708cf1d6f8fea02cc7f95937064a4ebf229133`。
- `.data/research/lawbot-2026-10-13/extracted/dist/main/index.js`，SHA256 `621dbee5f25f5cb0755f156488739e6bdde436e23ef3d3fef942c9e76695f691`。
- `.data/research/lawbot-2026-10-13/ipc-static-contracts.json`，SHA256 `58881d1857b0d92cd0cfcbb5212188214b189004cc78a59a9ca6bbb46f785e60`。

## 跨接口边界

- 认证一次性token绑定sender，15分钟有效；消费函数先删除token再检查。密码check同样会解锁，不能当纯读。
- 密码恢复依赖签名、当前设备和当前申请绑定；本包Q_.redeem仅返回redeemed:true，未证实远程单次核销。这不构成绕过方案。
- 许可get-status的success表示IPC成功，activated才表示授权状态；状态读取可能更新本地时钟/版本记录。
- 更新重启成功返回只表示请求关闭，后面还要通过renderer保存确认及安装调用。偏好持久化失败可能仍返回success:true。
- 网络开关只覆盖观察到的Electron defaultSession拦截器；不能用其字节计数证明所有进程流量为零。
- preload日志兜底send与main handle类型不匹配，未证明这两条兜底错误能写入crash.log。
- 通用invoke桥存在，不将没有专用preload方法误记为不存在调用途径；本轮未全面定位renderer UI入口。

## SYS-001 · auth:get-capabilities

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.getCapabilities → M:18665–18671 → Promise.all(wf(),Nh())→Mac helper capabilities与Fg.status
- **输入与筛选：** 无参数；biometryType仅touch-id/face-id/none。
- **返回：** success及systemAuthentication/biometryAvailable/biometryType；configured映射hasPassword/applicationPassword/applicationPasswordConfigured，initialized映射deviceProtectionInitialized。
- **副作用：** 读取密钥文件/旧密码存在性；macOS helper --capabilities（静态观察，没有执行）；过期内存密钥会lock。
- **失败：** 异常返回success:false及认证能力false、biometryType:none、error；wf内部映射AUTH_*。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18665–18671` SHA256 `4886c7bbd35f82f69ec2d3a2b5860183428503d31d18c80b26d658b133db9b0c`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14788–14845` SHA256 `23f8e2e243f46d71b92e2378a0373b6c0189be17efa19fa2f1641a9a8c44323d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:15265–15335` SHA256 `b1dea40a4601432a5ddb486990e7997c8232e3256785a63bd0c53ff1cca5e99f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19650–19697` SHA256 `a67fcb53dc59f777ec8176f7b97660759b49ee482306ff0844726801feab9621`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:283–283` SHA256 `7dc9d4d0e0fb6c9a584df747481fa822b38b92b9e3eafab7f3a5d81427d5c52b`（专用preload桥/事件订阅）。

## SYS-002 · auth:request-system-grant

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.requestSystemGrant → M:18672–18699 → bf认证helper→hierarchy.status/unlockWithDeviceProtection→de/he
- **输入与筛选：** sender.id转Number；macOS限定，固定认证原因文字；无renderer指定命令。
- **返回：** 成功{success:true,method:mac-system,authToken}；失败{success:false,code,error}。
- **副作用：** 原生系统认证成功后尝试设备保护解锁（未初始化时不解锁）；记录sender会话并产生15分钟一次性令牌。
- **失败：** 非macOS AUTH_UNAVAILABLE；helper返回/异常映射AUTH_CANCELLED/UNAVAILABLE/LOCKED_OUT/FAILED/TIMEOUT/HELPER_ERROR；后续密钥解锁异常未由该handler捕获。
- **取消：** 同sender新请求abort旧请求；sender destroyed abort；helper 60秒超时SIGTERM；finally移除监听及对应controller。
- **通知：** 没有IPC进度；系统认证对话框由helper负责。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18672–18699` SHA256 `287b6a911562a1e36269d6326d18dbdac21e46c32d8dae76adfa0d205bd9f903`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:15265–15335` SHA256 `b1dea40a4601432a5ddb486990e7997c8232e3256785a63bd0c53ff1cca5e99f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19733–19742` SHA256 `6d73f0c282a4e42685aa278c035f8fe9a9b4ce44bd524448dec8bfa13d2a97cc`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:284–284` SHA256 `ecc995b1c78c2ab1d59306b753e415bc008f9060d519a1f1de7623a99c3d7ee3`（专用preload桥/事件订阅）。

## SYS-003 · auth:set-password

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.setPassword → M:18700–18709 → Nh→Fg.setup→km().migrateLegacy→de
- **输入与筛选：** String(value||空串)；Ng要求字符串长度至少4、UTF-8不超过1024字节、不可全空白；scrypt参数校验后派生。；已配置拒绝AUTH_ALREADY_CONFIGURED，旧密码存在拒绝AUTH_LEGACY_MIGRATION_REQUIRED。
- **返回：** {success:true}，不直接发authToken。
- **副作用：** 创建/更新密码槽与设备恢复槽，原子临时写入并解锁；migrateLegacy失败被吞；将sender标为已认证。 旧假名映射迁移逐个JSON校验/受保护写入并更新索引，成功后删除旧JSON；逐文件失败收集为failures，handler不展示这些失败。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18700–18709` SHA256 `ed0e3f634c0a635ae3146f69d377fbddbf1ae770c03765d9dedb2eb0d4883366`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14788–14845` SHA256 `23f8e2e243f46d71b92e2378a0373b6c0189be17efa19fa2f1641a9a8c44323d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19567–19603` SHA256 `7ebbc73db89f1a4ebe5a7bcd0405022d8bf3931151a6ed3150ee2d5e8dfc8902`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19650–19717` SHA256 `cd4b5ed28c04c48e847e1fb6b63c37b5bdab0e141da4a2cff73efd616cc51481`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:16623–16626` SHA256 `936970368949999b3c7dd7697c81f8b02c27e2e8f828354661f32d7d81e9c6f1`（km映射仓库构造）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:15152–15263` SHA256 `abc171f5e09233ca89bb04fc7f83edbc77a35c8d02ad9a0f30d2ff4c9eb6691d`（mf映射存储及migrateLegacy直接服务）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:285–285` SHA256 `212b016d63391f57a9195891de1f5125ed043079b3fffebdfbe13f4d9aa598d5`（专用preload桥/事件订阅）。

## SYS-004 · auth:has-password

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.hasPassword → M:18710–18716 → Nh→Fg.status/旧密码stat
- **输入与筛选：** 无参数。
- **返回：** {hasPassword:configured,...status,legacyPasswordPresent,needsLegacyMigration}，成功无success字段。
- **副作用：** 读取状态；过期内存密钥清空。
- **失败：** 异常{hasPassword:false,error}。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18710–18716` SHA256 `46e35e128d0023de660b30733a04d097c2ab88245aae8b22f3669a2367d6048a`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14788–14845` SHA256 `23f8e2e243f46d71b92e2378a0373b6c0189be17efa19fa2f1641a9a8c44323d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19650–19697` SHA256 `a67fcb53dc59f777ec8176f7b97660759b49ee482306ff0844726801feab9621`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:286–286` SHA256 `71b5cbed03aa309fea703c46ed6a74eab7c5e4ed4b78ea419db7ac100d00f72f`（专用preload桥/事件订阅）。

## SYS-005 · auth:verify-password

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.verifyPassword → M:18717–18724 → Ah→Fg.unlock或Eh旧密码比对→km.migrateLegacy→de/he
- **输入与筛选：** String(value||空串)；Ng要求字符串长度至少4、UTF-8不超过1024字节、不可全空白；scrypt参数校验后派生。；未配置且旧密码有效允许旧路径；其余要求完成迁移/设置。
- **返回：** {success:true,authToken}。
- **副作用：** 解锁内存密钥，尝试旧映射迁移（迁移异常吞掉），sender会话及一次性15分钟token。 旧假名映射迁移逐个JSON校验/受保护写入并更新索引，成功后删除旧JSON；逐文件失败收集为failures，handler不展示这些失败。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 AUTH_NOT_CONFIGURED错误文案映射NEED_SET_PASSWORD。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18717–18724` SHA256 `f25840794c45db86255320005f53d5790aad371b6ca0f746f9874cfea9ac8801`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14788–14845` SHA256 `23f8e2e243f46d71b92e2378a0373b6c0189be17efa19fa2f1641a9a8c44323d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19567–19603` SHA256 `7ebbc73db89f1a4ebe5a7bcd0405022d8bf3931151a6ed3150ee2d5e8dfc8902`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19718–19732` SHA256 `aaebdeea840ed1a1d3c423517798acaf0612f463c1a5a6068fb29598acc54e5c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:16623–16626` SHA256 `936970368949999b3c7dd7697c81f8b02c27e2e8f828354661f32d7d81e9c6f1`（km映射仓库构造）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:15152–15263` SHA256 `abc171f5e09233ca89bb04fc7f83edbc77a35c8d02ad9a0f30d2ff4c9eb6691d`（mf映射存储及migrateLegacy直接服务）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:287–287` SHA256 `6bca3188a001964fc4d8adc5b3ba883da930afe7d4eab746dd71d0d3ca5623d4`（专用preload桥/事件订阅）。

## SYS-006 · auth:check-password

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.checkPassword → M:18725–18731 → Ah→Fg.unlock或Eh→de
- **输入与筛选：** String(value||空串)；Ng要求字符串长度至少4、UTF-8不超过1024字节、不可全空白；scrypt参数校验后派生。
- **返回：** {success:true}，不发token。
- **副作用：** 同样会解锁和登记sender；名称check不表示纯读。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 AUTH_NOT_CONFIGURED映射NEED_SET_PASSWORD。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18725–18731` SHA256 `787263b14aca02ec23c198d926f6bb91e4fc266281332389f61b25798baf3269`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14788–14845` SHA256 `23f8e2e243f46d71b92e2378a0373b6c0189be17efa19fa2f1641a9a8c44323d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19567–19603` SHA256 `7ebbc73db89f1a4ebe5a7bcd0405022d8bf3931151a6ed3150ee2d5e8dfc8902`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19718–19732` SHA256 `aaebdeea840ed1a1d3c423517798acaf0612f463c1a5a6068fb29598acc54e5c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:289–289` SHA256 `e786654d25a50739be157e4586a7dee323fbc7585e356110164abd1c3a89f8dc`（专用preload桥/事件订阅）。

## SYS-007 · auth:migrate-legacy-password

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.migrateLegacyPassword → M:18732–18741 → Nh→Eh→vh→Fg.setup→km.migrateLegacy→de/he
- **输入与筛选：** currentPassword/nextPassword均String(...||空串)；必须未配置新密码且旧密码存在、旧密码timingSafeEqual通过；新密码遵循Ng。
- **返回：** {success:true,authToken}。
- **副作用：** 旧密码文件先rename临时；setup成功后删临时，失败尝试回滚rename；映射迁移失败吞掉；建立会话。 旧假名映射迁移逐个JSON校验/受保护写入并更新索引，成功后删除旧JSON；逐文件失败收集为failures，handler不展示这些失败。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18732–18741` SHA256 `c7bb9030f7c487584813a94015a78b2eb309ce33401d6f5118f443c3d37f3fe7`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14788–14845` SHA256 `23f8e2e243f46d71b92e2378a0373b6c0189be17efa19fa2f1641a9a8c44323d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19567–19603` SHA256 `7ebbc73db89f1a4ebe5a7bcd0405022d8bf3931151a6ed3150ee2d5e8dfc8902`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19698–19717` SHA256 `80fc6d1da2d40507e4d4c1a87c4195814aaa5ad06fd810a6f83c52aa2f0129f5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:16623–16626` SHA256 `936970368949999b3c7dd7697c81f8b02c27e2e8f828354661f32d7d81e9c6f1`（km映射仓库构造）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:15152–15263` SHA256 `abc171f5e09233ca89bb04fc7f83edbc77a35c8d02ad9a0f30d2ff4c9eb6691d`（mf映射存储及migrateLegacy直接服务）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:290–290` SHA256 `a3eb647a9e59e8f98f189ecfc0c92ad1271d08c0681a35e4e73c7b67e1091efe`（专用preload桥/事件订阅）。

## SYS-008 · auth:change-password

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.changePassword → M:18742–18750 → Fg.changePassword→me→de
- **输入与筛选：** currentPassword/nextPassword String(...||空串)；Fg须已配置；验证旧密码，再派生新密码。
- **返回：** {success:true}。
- **副作用：** 重包装同一CMK的新passwordSlot并原子写，解锁；清全部token/sender会话，仅登记当前sender。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18742–18750` SHA256 `fa73776e435bd3e446ed338d87683f9e64ca730c1dddeb109c77c70a8165a6c9`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19567–19603` SHA256 `7ebbc73db89f1a4ebe5a7bcd0405022d8bf3931151a6ed3150ee2d5e8dfc8902`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19743–19760` SHA256 `773044cd31f8225abdc3c359e734ce4acd9e13e6bbe07894c163d595604bd5c2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:291–291` SHA256 `a5faa0956a2248cd6a2840032d06f6606d8222cb7d0775b3dfa28b71d7364f4c`（专用preload桥/事件订阅）。

## SYS-009 · auth:lock

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.lock → M:18751–18751 → kh→Fg.lock；me
- **输入与筛选：** 无参数。
- **返回：** {success:true}。
- **副作用：** 清零并移除内存CMK，清所有token及会话。
- **失败：** handler无catch；没有独立错误结果形状。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18751–18751` SHA256 `e6e84866c29d1fba0be36bc513c67f8b479c5f4af04a4805d00cb7ef03ce94b1`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14843–14845` SHA256 `9bea8c09d106254f1ef4ce2199a9b17f090ab340e06624b28285b861561a02e5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19788–19790` SHA256 `e0fa8c14589e6c26d8df9ea0174de001addc4ae71de17ec0964b6065f66c8b27`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:292–292` SHA256 `37efd24716cc26d5838bf435f19900ba70d7ea421b64954605737523fa748db8`（专用preload桥/事件订阅）。

## SYS-010 · auth:restore-session-token

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.restoreSessionToken → M:18751–18760 → 主frame检查→Nh→ue集合→he
- **输入与筛选：** 必须senderFrame===sender.mainFrame，hierarchy当前unlocked且sender已登记ue。
- **返回：** 成功{success:true,authToken}；否则{success:false,error_type:AUTH_REQUIRED}。
- **副作用：** 锁定时pe移除sender及其token；合格会话签发新一次性15分钟token。
- **失败：** 状态读取失败返回AUTH_REQUIRED；不能凭renderer缓存token重新解锁。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:18751–18760` SHA256 `bac79397a296ebc4bc0ce8b05a2d21afeb405edb773b330e6b0b3e191901c15c`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:29–48` SHA256 `57c916abd85501e2f5c2c55f551499576b139d87c35fc6e66dcf4f67b751fa12`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:14831–14845` SHA256 `2903467ec5187400773f28d1248e6df3a51c139b2e6224b26024d1cdc4e3f089`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19694–19697` SHA256 `7e4630522a4e591197dcd3e93df446597b70613e65566466f0eca9bd3bc90619`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:288–288` SHA256 `8026c7719ed162a16fd410e3c3b3668ed448caa93df397a25111de716d436a08`（专用preload桥/事件订阅）。

## SYS-011 · auth:create-recovery-request

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.createRecoveryRequest → M:25539–25547 → c2恢复pending→q_.resumeRequest/createRequest→X_.write
- **输入与筛选：** 无参数；必须有效本机许可、设备/installation/recoverySlot绑定、已配置密钥。
- **返回：** {success:true,request,exported:boolean}；已有有效pending复用。
- **副作用：** 首次生成installation-id/32字节challenge/UUID；pending-recovery.v1.json以0600临时写rename；申请7天，恢复文件策略48小时。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 已损坏/过期/绑定不符pending可清理重建；其他异常继续失败。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:25539–25547` SHA256 `93b5bda8f17267129d17e430d0329e679794ef552e62a7a23ac3215abb9ee706`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25347–25443` SHA256 `0db555d04cc4eb8461d6aed25632578ae42e0549cd18d1cd9bb8bdf015e783c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25446–25538` SHA256 `c6b2d0bb84f08a7a8620f3b2e897e59897c38ce68b4d6d34069def4d5e19d30c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19761–19790` SHA256 `ec8589f641b5f515b3aff5a74cf8f6af1a5be3d640bb0036942770c87a341145`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:293–293` SHA256 `80a8e38f5e1a46fd7828980325e3a914006a28740545749b22c68b5908d8e3bf`（专用preload桥/事件订阅）。

## SYS-012 · auth:save-recovery-request

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.saveRecoveryRequest → M:25548–25564 → c2→q_.getActiveRequest→saveDialog→原子写→X_.write
- **输入与筛选：** 无renderer路径；由系统保存对话框选.lbrq位置；先恢复有效申请。
- **返回：** 成功{success:true,filePath}。
- **副作用：** 导出申请JSON，0600 wx临时文件+rename，finally删临时；随后pending写exportedAt。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 文件导出与pending更新并非整体事务，后一步失败可能已写申请文件。
- **取消：** 对话框取消/无filePath返回{success:false,canceled:true}。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:25548–25564` SHA256 `4890f9c4ee3c7435248eb41e8cbd00668da65ef7992099d830d948d4f46e7fb6`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25347–25443` SHA256 `0db555d04cc4eb8461d6aed25632578ae42e0549cd18d1cd9bb8bdf015e783c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25446–25538` SHA256 `c6b2d0bb84f08a7a8620f3b2e897e59897c38ce68b4d6d34069def4d5e19d30c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19761–19790` SHA256 `ec8589f641b5f515b3aff5a74cf8f6af1a5be3d640bb0036942770c87a341145`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:294–294` SHA256 `c092c617c2db90856acc89fbfe90cfa78b1bd06fdf7502bcd6a03fb4e062088e`（专用preload桥/事件订阅）。

## SYS-013 · auth:cancel-recovery

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.cancelRecovery → M:25565–25565 → q_.cancel→X_.clear
- **输入与筛选：** 无参数。
- **返回：** {success:true}。
- **副作用：** 清内存activeSession/preparedToken并删除pending文件。
- **失败：** clear失败Promise拒绝；内存已清，handler无catch。
- **取消：** 此方法本身取消恢复会话；不会回滚已导出的申请文件。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:25565–25565` SHA256 `3dc02db32371c95f172f74b6f7683904e0329f62a9f8de3f55ee560473fb35f0`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25347–25443` SHA256 `0db555d04cc4eb8461d6aed25632578ae42e0549cd18d1cd9bb8bdf015e783c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25446–25538` SHA256 `c6b2d0bb84f08a7a8620f3b2e897e59897c38ce68b4d6d34069def4d5e19d30c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19761–19790` SHA256 `ec8589f641b5f515b3aff5a74cf8f6af1a5be3d640bb0036942770c87a341145`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:296–296` SHA256 `ad53b7ad9ea4d5963e045feeb1b14beca6718c16c71c1b30dd339624a3ce1ac9`（专用preload桥/事件订阅）。

## SYS-014 · auth:import-recovery-file

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.importRecoveryFile → M:25565–25577 → c2→openDialog→stat/read/JSON→q_.prepare/verifyToken
- **输入与筛选：** 必须pending.exportedAt存在；选.lbr普通文件≤65536字节；签名可信公钥Ed25519，schema/purpose/maxUses/UUID/时间窗与申请设备挑战绑定校验。
- **返回：** {success:true,expiresAt}。
- **副作用：** 准备并保留已验证token于内存；此步不修改密码。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 RECOVERY_SESSION_REQUIRED/TOKEN_INVALID及签名/过期/绑定错误。
- **取消：** 对话框取消返回{success:false,canceled:true,error:用户取消}；cancel-recovery可清准备状态。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:25565–25577` SHA256 `6f45df0ef58ba51dd9f0548bfe02969d470fb3c9a06d02d9a15dcce88ac8cf3b`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25347–25443` SHA256 `0db555d04cc4eb8461d6aed25632578ae42e0549cd18d1cd9bb8bdf015e783c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25446–25538` SHA256 `c6b2d0bb84f08a7a8620f3b2e897e59897c38ce68b4d6d34069def4d5e19d30c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19761–19790` SHA256 `ec8589f641b5f515b3aff5a74cf8f6af1a5be3d640bb0036942770c87a341145`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:295–295` SHA256 `135f3f8c0197f604f2485eb6279ff2b938bbbc5a385efa57e715cf78bc84f3d3`（专用preload桥/事件订阅）。

## SYS-015 · auth:complete-recovery

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** auth.completeRecovery → M:25578–25584 → q_.completePrepared→verifyToken→redeemer→Fg.recoverPasswordFromDeviceSlot→X_.clear
- **输入与筛选：** nextPassword String(...||空串)，须activeSession和已准备token，再验证签名/有效期/绑定；新密码遵循Ng。
- **返回：** {success:true}，不发authToken。
- **副作用：** 设备恢复槽解包并重写密码槽，自检后lock；清内存恢复状态和pending。
- **失败：** handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。 当前Q_.redeem直接返回redeemed:true，因此本链未证实服务端单次核销；签名和绑定检查仍在。
- **取消：** 无中途取消协议；cancel-recovery为独立操作，并发行为未验证。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:25578–25584` SHA256 `4a46dac84f6aea302f45dd98ca84cf68b4a3fb49b3a8ea7af7d364c1f6aa071f`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25347–25443` SHA256 `0db555d04cc4eb8461d6aed25632578ae42e0549cd18d1cd9bb8bdf015e783c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25446–25538` SHA256 `c6b2d0bb84f08a7a8620f3b2e897e59897c38ce68b4d6d34069def4d5e19d30c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19761–19790` SHA256 `ec8589f641b5f515b3aff5a74cf8f6af1a5be3d640bb0036942770c87a341145`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25496–25500` SHA256 `3852c869c3f88c968f40ca78391ee5412a8eb77c8fc35d1e70f5d01bc91b8044`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:19567–19603` SHA256 `7ebbc73db89f1a4ebe5a7bcd0405022d8bf3931151a6ed3150ee2d5e8dfc8902`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26853` SHA256 `c58382dfa110d9b47f2c327f19cb58d66b2cf1550290992f6a8d73d16a053f60`（实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:297–297` SHA256 `42b461c992b144550f17f97d50f8acec2f6bd80563950e530716c423a1e19c91`（专用preload桥/事件订阅）。

## SYS-016 · app:consume-open-path

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** appRuntime.consumeOpenPath → M:27057–27061 → dS一次读取清空
- **输入与筛选：** 无参数；dS来自存在的.tmm命令行/系统open-file。
- **返回：** string路径或null。
- **副作用：** 消费pending路径，置null。
- **失败：** 无catch；路径此前exists，使用时可能已变动。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27057–27061` SHA256 `56e82dc184b0ace85a3846cb03932a48b398097a06c437edb9e5e4bf4915296d`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26740–26772` SHA256 `8031763279c1819581d48686e1414d3558fca9f0397fa8b404bc0e0c1b243aee`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:20–20` SHA256 `2ab37d83850633a6803737554aa7101d4493786a2e9dcaa582e228786f0f4570`（专用preload桥/事件订阅）。

## SYS-017 · app:open-path

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** appRuntime.onOpenPath; appRuntime.onOpenPath → M:26740–26772 → open-file/second-instance→hS/fS→webContents.send
- **输入与筛选：** 事件型；只处理string且扩展.tmm且exists；选择第一个窗口。
- **返回：** preload onOpenPath(handler)回调收到filePath；返回取消订阅函数，不是invoke结果。
- **副作用：** 恢复最小化/聚焦；窗口loading时待did-finish-load再发；pending仍可冷启动consume。
- **失败：** 不存在路径被忽略；无窗口不发；fs exists异常忽略。
- **取消：** preload removeListener取消订阅；无取消OS打开文件请求。
- **通知：** 主进程向renderer发app:open-path；有冷启动主动消费和热启动推送两条路径。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26740–26772` SHA256 `8031763279c1819581d48686e1414d3558fca9f0397fa8b404bc0e0c1b243aee`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:27057–27061` SHA256 `56e82dc184b0ace85a3846cb03932a48b398097a06c437edb9e5e4bf4915296d`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:23–23` SHA256 `cebc92c8abc758152f6670685bcb3f08fda03acf062f296f0f0836dac0dc855e`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:24–24` SHA256 `ffb03badb8deeb88c78643bf59385ea3fa9f6ec85721c0abd8a3e2af47f4b313`（专用preload桥/事件订阅）。

## SYS-018 · app:write-clipboard-text

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** clipboard.writeText → M:26773–26781 → electron.clipboard.writeText/readText
- **输入与筛选：** 必须string，非空且JS length≤4096，否则失败。
- **返回：** {success:true}或{success:false,error}。
- **副作用：** 写系统剪贴板并读回精确比较。
- **失败：** 空/过长、系统未接受写入、clipboard异常明确失败。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26773–26781` SHA256 `1fa033a3c34968678ac39c815b80b0e1569c2c7d1e26552180a0ac4f6c72e826`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:16–16` SHA256 `42fa184be9fc104ad0ec906678407a2be40d080fcfbd1f54130ced8b23064731`（专用preload桥/事件订阅）。

## SYS-019 · app:get-env

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** getEnv → M:27071–27071 → app.isPackaged/process.versions/GI
- **输入与筛选：** 无参数；devTaskLabel仅非packaged，移控制字符trim并截5个码点。
- **返回：** {mode:production或development,devTaskLabel,appVersion:0.5.9,versions}。
- **副作用：** 读取运行环境。
- **失败：** 无catch，无专门失败包装。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27071–27071` SHA256 `aa7ded630b980474ebae1bb3b09c31c47bda8107b110dfec890f30e32fdd4432`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26323–26329` SHA256 `ab4f258ba44c4321ee71f147f52a159793c76a137c5d4980beb047b742053a13`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:13–13` SHA256 `477596a34ce26505203f1329680ea45eff3a44319b826f5acf43a31b5aca9f9f`（专用preload桥/事件订阅）。

## SYS-020 · app:get-version

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:27101–27107 → fs.readFile package.json→JSON.parse
- **输入与筛选：** 无参数；路径固定YI/../../package.json。
- **返回：** {success:true,version}。
- **副作用：** 读取本地包版本，与get-env硬编码来源不同。
- **失败：** 读文件/JSON失败{success:false,error:message}。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27101–27107` SHA256 `5a762341ce05e1075cd1fd5fb63a71492101e65276920ad9e702a32244a4e58d`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。

## SYS-021 · app:read-legal-doc

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** readLegalDoc → M:27071–27085 → 白名单→候选路径access→readFile
- **输入与筛选：** docName仅agreement.md/product-intro.md/privacy-policy.md；packaged查dist，dev另查src/public。
- **返回：** {success:true,content:string}。
- **副作用：** 读取首个可访问的内置法律文档。
- **失败：** 非法名称、找不到或读取异常{success:false,error}。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27071–27085` SHA256 `0d0fb0327d717b2896dac56be7a120c0cfc6d0fb302d5f7b72360e38002bb585`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:68–68` SHA256 `729e5f39f267b350a1763913c8a2c006644f73d6ca51ec7694533135aa08e7b1`（专用preload桥/事件订阅）。

## SYS-022 · app:read-onboarding-sample

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** readOnboardingSample → M:27086–27098 → 固定样例候选路径→readFile→Uint8Array
- **输入与筛选：** 无参数；固定法律服务委托协议_体验示例.docx，不接任意文件名。
- **返回：** {success:true,fileName,data:Uint8Array}。
- **副作用：** 读取内置样例。
- **失败：** 逐路径失败继续；全部失败{success:false,fileName,error}。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27086–27098` SHA256 `ea0dce1d627e1765379fb13d68abf90a4c817bbf33c38e7e8521435465780f2b`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:69–69` SHA256 `cbb0a9b7032d7e26f426c6dea521937fd86f65f006aa0cf54d0b9d9a00679362`（专用preload桥/事件订阅）。

## SYS-023 · app:open-external

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** openExternal → M:27099–27100 → ipcMain.on→shell.openExternal
- **输入与筛选：** preload send(url)；handler只做truthy判断，未观察到协议/域名过滤。
- **返回：** send没有Promise业务结果。
- **副作用：** 交给操作系统默认应用/浏览器打开URL。
- **失败：** 无catch且不await；本层不返回失败。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 仅记录此层缺少URL过滤，未对Electron/系统协议实现作安全证明或测试。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27099–27100` SHA256 `862c5dabdc850e0f7dcda4a1a0ed3b1261de13d707587159d66371f0e3ccddf3`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:14–14` SHA256 `2a2c36936281ca3cface68c9df45c34e120a014e47e590298331d4fcea9cc818`（专用preload桥/事件订阅）。

## SYS-024 · app:export-crash-log

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** docxSafeMode.exportCrashLog → M:27023–27031 → exists→showSaveDialog→copyFileSync
- **输入与筛选：** 无参数；userData/crash.log→用户选择.log/.txt。
- **返回：** {ok:true,filePath,errorCode:DOCX_CRASH_LOG_EXPORTED}。
- **副作用：** 复制完整crash.log到选定位置。
- **失败：** 不存在DOCX_CRASH_LOG_NOT_FOUND；复制/对话框异常DOCX_CRASH_LOG_EXPORT_FAILED。
- **取消：** 取消返回{ok:false,canceled:true,errorCode:DOCX_CRASH_LOG_EXPORT_CANCELED}。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27023–27031` SHA256 `5ea62e09fb84c0f99a283acb310b1c9e3ce50574efa76f9937345ed4283e8a58`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:232–232` SHA256 `a3c14cbbd3c81e719ed5b12bf66b2fbb910b4c0d0fe8e6ef386d875eeaec5f26`（专用preload桥/事件订阅）。

## SYS-025 · app:get-docx-safe-mode

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** docxSafeMode.get → M:27032–27041 → exists/readFileSync .docx-preview-crash
- **输入与筛选：** 无参数。
- **返回：** 存在{safeMode:true,detail:原始字符串}；否则{safeMode:false}。
- **副作用：** 读取安全模式标志。
- **失败：** 所有读取异常降级safeMode:false，不区分缺失和损坏。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27032–27041` SHA256 `de7374f995165008dec3d046f8f4467ac482f18036b4f7632d44479149507965`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:226–226` SHA256 `bc8237a95188d6f1434baa9eafe58fc34c59c7e6270a2fec9ba97d7cbba92d30`（专用preload桥/事件订阅）。

## SYS-026 · app:reset-docx-safe-mode

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** docxSafeMode.reset → M:27042–27048 → exists→unlinkSync .docx-preview-crash
- **输入与筛选：** 无参数。
- **返回：** {ok:true}。
- **副作用：** 存在则删除本地安全模式标志。
- **失败：** 异常{ok:false,error:message}。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27042–27048` SHA256 `7a22aaa0a22104cc5eee485d945118abb0e4d650df3e952e3df3059701e58c59`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:228–228` SHA256 `d529a557398dc1672a0d28661d7eaf0143f8ff14cd0faa1dc61fa3567636c9d7`（专用preload桥/事件订阅）。

## SYS-027 · app:set-docx-safe-mode

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** docxSafeMode.set → M:27049–27056 → writeFileSync .docx-preview-crash
- **输入与筛选：** reason原样写JSON，未观察到类型/大小过滤。
- **返回：** {ok:true}。
- **副作用：** 覆盖写入{time:ISO,reason}。
- **失败：** 异常{ok:false,error:message}，非原子写。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27049–27056` SHA256 `4cfbe847dfcaac41e77621ef7b87a4fcc704a863e6d392e9d1680276d309cc8a`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:230–230` SHA256 `04849dee0fd500642a26bd48959a2136948592e343e37bc1ab35d19b53ca4813`（专用preload桥/事件订阅）。

## SYS-028 · license:get-machine-id

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26932–26937 → nd.getStatus→getMachineIdCached/Ku
- **输入与筛选：** 无参数。
- **返回：** {success:true,machineId}，即使未激活也可能成功读取设备码。
- **副作用：** 缓存设备码和状态；getStatus可能读许可、验证时钟/版本记录。
- **失败：** 异常统一{success:false,error,errorCode:LICENSE_IPC_FAILED}。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26932–26937` SHA256 `1e2577b520f4cd8959768def7d21d8ba9c2148790efc4211227f44b0e5521a47`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13793–13870` SHA256 `a443bcd02bab2d9463a15a64e2f680920b04086a6ea37d9164f8ed658b21183a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13867–13928` SHA256 `856a918077d7927bfefcb776efce25bfde8e35bc726442c298dcc5ddf2b5a79c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13929–13984` SHA256 `11441dd6d604bf458a9d3732b007e73857318f9ddee1c0777c9f0b3f21e9516a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13670–13695` SHA256 `d467646b0f95f96824e938d0a0943c094da89fa12fd970c3e0ef80a9824d0e78`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:18924–18926` SHA256 `401e9f9f4b42156d7bab5d1cefb02e1377af494a7e7767c20608d45aa74b49fb`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13591–13669` SHA256 `abd4569bc743865af592926640b382c7eae1ba4d29adca4567d47ce28caa36f1`（Ku设备指纹读取/探测/缓存直接服务）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13696–13791` SHA256 `70d7ec1b480eb0cbf1678fc4b58fdc535d93d21b6446d123f1ba336e5350800c`（最大版本与时钟记录服务；未复制撤销名单）。

## SYS-029 · license:get-status

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26938–26944 → nd.getStatus→validateLicense
- **输入与筛选：** 无参数；先用cachedStatus，否则读取license.dat并验证签名、设备（含别名）、撤销、版本、类型、期限与时钟。
- **返回：** success:true并投影activated/customer/type/versionRange/issuedAt/expiresAt/machineId/appVersion/error/errorCode/realExpiryDate/remainingDays/originalPurchasedAt。
- **副作用：** 状态缓存；时钟最大值记录、合格更新授权最大版本记录可写入；不是纯只读。
- **失败：** 未激活仍success:true+activated:false/error；IPC异常才LICENSE_IPC_FAILED。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26938–26944` SHA256 `71698b23867604c9b4b8460abacb3112257a5cfd73a6a44f0b541d9dadc9850d`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13793–13870` SHA256 `a443bcd02bab2d9463a15a64e2f680920b04086a6ea37d9164f8ed658b21183a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13867–13928` SHA256 `856a918077d7927bfefcb776efce25bfde8e35bc726442c298dcc5ddf2b5a79c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13929–13984` SHA256 `11441dd6d604bf458a9d3732b007e73857318f9ddee1c0777c9f0b3f21e9516a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13670–13695` SHA256 `d467646b0f95f96824e938d0a0943c094da89fa12fd970c3e0ef80a9824d0e78`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:18924–18926` SHA256 `401e9f9f4b42156d7bab5d1cefb02e1377af494a7e7767c20608d45aa74b49fb`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13591–13669` SHA256 `abd4569bc743865af592926640b382c7eae1ba4d29adca4567d47ce28caa36f1`（Ku设备指纹读取/探测/缓存直接服务）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13696–13791` SHA256 `70d7ec1b480eb0cbf1678fc4b58fdc535d93d21b6446d123f1ba336e5350800c`（最大版本与时钟记录服务；未复制撤销名单）。

## SYS-030 · license:activate

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26945–26952 → nd.activate→Gu签名解码→设备/撤销/版本/期限→write license.dat
- **输入与筛选：** 必须非空string；Gu去空白并验证payload.signature和必要字段；必须本机设备码、许可类型和版本适配；非permanent要求未过期expiresAt。
- **返回：** 通过{success:true,activated:true,customer,type,versionRange,issuedAt,expiresAt}；不通过{success:false,error,errorCode?}。
- **副作用：** 先清cachedStatus；验证后写license.dat并缓存。没有运行、修改或绕过此链。
- **失败：** 签名、机器、撤销REFUNDED_LICENSE、早期版本LEGACY_UPGRADE_NEEDED、类型/过期/IO失败。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26945–26952` SHA256 `8874453a46955c635f006c74715b343d89979e7406f8d37ab2280268ff9dc5f5`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13793–13870` SHA256 `a443bcd02bab2d9463a15a64e2f680920b04086a6ea37d9164f8ed658b21183a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13867–13928` SHA256 `856a918077d7927bfefcb776efce25bfde8e35bc726442c298dcc5ddf2b5a79c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13929–13984` SHA256 `11441dd6d604bf458a9d3732b007e73857318f9ddee1c0777c9f0b3f21e9516a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13670–13695` SHA256 `d467646b0f95f96824e938d0a0943c094da89fa12fd970c3e0ef80a9824d0e78`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:18924–18926` SHA256 `401e9f9f4b42156d7bab5d1cefb02e1377af494a7e7767c20608d45aa74b49fb`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13591–13669` SHA256 `abd4569bc743865af592926640b382c7eae1ba4d29adca4567d47ce28caa36f1`（Ku设备指纹读取/探测/缓存直接服务）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13696–13791` SHA256 `70d7ec1b480eb0cbf1678fc4b58fdc535d93d21b6446d123f1ba336e5350800c`（最大版本与时钟记录服务；未复制撤销名单）。

## SYS-031 · license:refresh

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26953–26959 → nd.refresh→cachedStatus=null→getStatus
- **输入与筛选：** 无参数。
- **返回：** {success:true,activated,customer,versionRange,error}，字段少于get-status。
- **副作用：** 清内存状态并重读验证本地许可；此方法本身不是远程续期接口。
- **失败：** IPC异常LICENSE_IPC_FAILED；无效许可表现activated:false。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26953–26959` SHA256 `13f66b2b6aadff605466a7079b4cae094f5b1606abaf01867b130bc19e64d55e`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13793–13870` SHA256 `a443bcd02bab2d9463a15a64e2f680920b04086a6ea37d9164f8ed658b21183a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13867–13928` SHA256 `856a918077d7927bfefcb776efce25bfde8e35bc726442c298dcc5ddf2b5a79c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13929–13984` SHA256 `11441dd6d604bf458a9d3732b007e73857318f9ddee1c0777c9f0b3f21e9516a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13670–13695` SHA256 `d467646b0f95f96824e938d0a0943c094da89fa12fd970c3e0ef80a9824d0e78`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:18924–18926` SHA256 `401e9f9f4b42156d7bab5d1cefb02e1377af494a7e7767c20608d45aa74b49fb`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13591–13669` SHA256 `abd4569bc743865af592926640b382c7eae1ba4d29adca4567d47ce28caa36f1`（Ku设备指纹读取/探测/缓存直接服务）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13696–13791` SHA256 `70d7ec1b480eb0cbf1678fc4b58fdc535d93d21b6446d123f1ba336e5350800c`（最大版本与时钟记录服务；未复制撤销名单）。

## SYS-032 · license:get-summary

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26960–26965 → nd.getSummary→getStatus
- **输入与筛选：** 无参数。
- **返回：** {success:true,customer,issuedAt,versionRange,machineId,activated}。
- **副作用：** 复用状态缓存/本地验证副作用。
- **失败：** IPC异常LICENSE_IPC_FAILED。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26960–26965` SHA256 `a392df969fb703fa799071b333776e7b681ea62bd3321ddc4be11a4919fc71dd`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13793–13870` SHA256 `a443bcd02bab2d9463a15a64e2f680920b04086a6ea37d9164f8ed658b21183a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13867–13928` SHA256 `856a918077d7927bfefcb776efce25bfde8e35bc726442c298dcc5ddf2b5a79c`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13929–13984` SHA256 `11441dd6d604bf458a9d3732b007e73857318f9ddee1c0777c9f0b3f21e9516a`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13670–13695` SHA256 `d467646b0f95f96824e938d0a0943c094da89fa12fd970c3e0ef80a9824d0e78`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:18924–18926` SHA256 `401e9f9f4b42156d7bab5d1cefb02e1377af494a7e7767c20608d45aa74b49fb`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13591–13669` SHA256 `abd4569bc743865af592926640b382c7eae1ba4d29adca4567d47ce28caa36f1`（Ku设备指纹读取/探测/缓存直接服务）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:13696–13791` SHA256 `70d7ec1b480eb0cbf1678fc4b58fdc535d93d21b6446d123f1ba336e5350800c`（最大版本与时钟记录服务；未复制撤销名单）。

## SYS-033 · window:minimize

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26428–26430 → BrowserWindow.fromWebContents→minimize
- **输入与筛选：** 无业务参数；窗口绑定调用sender。
- **返回：** 有窗口true，否则false。
- **副作用：** 查询或对应窗口动作；close经过保存确认状态机。
- **失败：** 没有窗口返回false；handler未包装Electron异常。
- **取消：** close可由renderer取消/failed，其他动作无取消协议。
- **通知：** close可能发window:before-close，其余未观察到本接口通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26428–26430` SHA256 `2927c857d350e4979cbffacae7fc0c1853362139cca8a4ba1d624d459d906bcc`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26441–26466` SHA256 `f13daa7a140b5cd29b9e445a4a17f969d3e13e3696c92f08c53a32627b13e4e7`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25783–25802` SHA256 `3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。

## SYS-034 · window:toggle-maximize

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26431–26433 → fromWebContents→isMaximized→unmaximize/maximize
- **输入与筛选：** 无业务参数；窗口绑定调用sender。
- **返回：** 有窗口true，否则false。
- **副作用：** 查询或对应窗口动作；close经过保存确认状态机。
- **失败：** 没有窗口返回false；handler未包装Electron异常。
- **取消：** close可由renderer取消/failed，其他动作无取消协议。
- **通知：** close可能发window:before-close，其余未观察到本接口通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26431–26433` SHA256 `c2d1099b40efcb7a2fe07292ce88ac978b6ef4e550b44ec1a971a1274ca98312`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26441–26466` SHA256 `f13daa7a140b5cd29b9e445a4a17f969d3e13e3696c92f08c53a32627b13e4e7`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25783–25802` SHA256 `3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。

## SYS-035 · window:is-maximized

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26434–26436 → fromWebContents→isMaximized
- **输入与筛选：** 无业务参数；窗口绑定调用sender。
- **返回：** 布尔；无窗口false。
- **副作用：** 查询或对应窗口动作；close经过保存确认状态机。
- **失败：** 没有窗口返回false；handler未包装Electron异常。
- **取消：** close可由renderer取消/failed，其他动作无取消协议。
- **通知：** close可能发window:before-close，其余未观察到本接口通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26434–26436` SHA256 `171272e39cb152996071c8e14f500644774598307b0d8a3609c3990d37e24b55`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26441–26466` SHA256 `f13daa7a140b5cd29b9e445a4a17f969d3e13e3696c92f08c53a32627b13e4e7`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25783–25802` SHA256 `3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。

## SYS-036 · window:close

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** 没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位 → M:26437–26440 → fromWebContents→close→hI.onCloseAttempt
- **输入与筛选：** 无业务参数；窗口绑定调用sender。
- **返回：** 有窗口true表示已请求关闭，不代表已实际关闭；否则false。
- **副作用：** 查询或对应窗口动作；close经过保存确认状态机。
- **失败：** 没有窗口返回false；handler未包装Electron异常。
- **取消：** close可由renderer取消/failed，其他动作无取消协议。
- **通知：** close可能发window:before-close，其余未观察到本接口通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26437–26440` SHA256 `28c8f85b458e2ffb57bd35f77fcc909f8fd3a8c97c3f5f4dbd1f341a68753cd5`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26441–26466` SHA256 `f13daa7a140b5cd29b9e445a4a17f969d3e13e3696c92f08c53a32627b13e4e7`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25783–25802` SHA256 `3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。

## SYS-037 · window:before-close

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** windowLifecycle.onBeforeClose; windowLifecycle.onBeforeClose → M:26449–26466 → close event→hI.onCloseAttempt→send
- **输入与筛选：** 事件payload {requestId:string}；每窗口状态机生成非空请求ID。
- **返回：** preload onBeforeClose(handler)回调并返回取消订阅函数。
- **副作用：** 第一次preventDefault并请求renderer；等待中重复close仅聚焦；allow-once下次关闭放行。
- **失败：** 无自动超时分支；renderer未回可能保持waiting-renderer。
- **取消：** renderer resolve-close可cancel/failed保持窗口；unsubscribe不等于批准关闭。
- **通知：** window:before-close。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26449–26466` SHA256 `4b04b9f7121fd495bc003002cc03bedd59dbfde4d04511e0a0f25301782e6fa0`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25783–25802` SHA256 `3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26702–26714` SHA256 `d3098dbbddbe1414e52c413ca51f7a0b79a4b2aea571dd957e959b4154f0e3c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:116–116` SHA256 `bee30e66f20dcd62ca682d49b9a6e0b4d3c7e426bd08eabef2bf2b1e8e537ed0`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:117–117` SHA256 `61e35ef3868d85476e015ca4baef0f291f7d8ba1a5b3779b543c1bbcab6a237a`（专用preload桥/事件订阅）。

## SYS-038 · window:resolve-close

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** windowLifecycle.resolveClose → M:26702–26714 → fromWebContents→sS.get→hI.resolve→markSessionClean→close
- **输入与筛选：** 必须有sender窗口和状态、data、string requestId；精确匹配当前请求；decision只allow触发retry，failed失败，其余当cancel。
- **返回：** false无效/陈旧/重复；true接受当前决策。
- **副作用：** allow尽力markSessionClean（错误吞）再close；非allow清该窗口安装标记KI；allow-once只放行一次。
- **失败：** 无效请求false；markSessionClean异常不阻止close；其他异常未catch。
- **取消：** cancel/failed保持窗口；过期requestId ignore。
- **通知：** 与before-close成对；更新重启也经过此链。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26702–26714` SHA256 `d3098dbbddbe1414e52c413ca51f7a0b79a4b2aea571dd957e959b4154f0e3c5`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:25783–25802` SHA256 `3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26449–26466` SHA256 `4b04b9f7121fd495bc003002cc03bedd59dbfde4d04511e0a0f25301782e6fa0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:119–119` SHA256 `c289c99b482975ceb673c4792ebdc633766d8d1cd158b8bc4856732eb14253d7`（专用preload桥/事件订阅）。

## SYS-039 · net:set-offline

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** net.setOffline → M:26426–26428 → Boolean→iu→cu
- **输入与筛选：** 任意值Boolean()转换，字符串false仍为true。
- **返回：** {success:true,offline:boolean}。
- **副作用：** 修改进程内offline开关，不持久化；网络拦截只在defaultSession webRequest，file/data/devtools放行，开发host和激活更新操作允许的feed路径例外。
- **失败：** 拦截器异常cancel:true；IPC本体无错误包装。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 未证明整个进程所有网络路径离线；这里只统计requests/blocked，bytesIn/Out在所读路径不累计，不能当流量审计。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26426–26428` SHA256 `95a1d1366124184399dad1f191c3480724e1c9ce2cfa08d9046c80b5c6098e7b`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:12924–12931` SHA256 `19020185f632c01c80ddfd0b97a1b03983722c4619d146aeff76b10af79de9d0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26663–26700` SHA256 `dc565e230e3bbb4056caa74910430b6e0294a5bff3305f2142f6567089294b93`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:135–135` SHA256 `abead830cced26a78e74709039071f3143ce84392b4d3652598007e176f846cf`（专用preload桥/事件订阅）。

## SYS-040 · net:get-stats

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** net.getStats → M:26428–26428 → cu复制ou并加offline
- **输入与筛选：** 无参数。
- **返回：** {bytesOut,bytesIn,requests,blocked,offline}。
- **副作用：** 读取计数；网络拦截只在defaultSession webRequest，file/data/devtools放行，开发host和激活更新操作允许的feed路径例外。
- **失败：** 拦截器异常cancel:true；IPC本体无错误包装。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 未证明整个进程所有网络路径离线；这里只统计requests/blocked，bytesIn/Out在所读路径不累计，不能当流量审计。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26428–26428` SHA256 `ad97d5fbf860a7c6360ab9ddff292d3f43c062aa28f6f8179c3057a43cac8858`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:12924–12931` SHA256 `19020185f632c01c80ddfd0b97a1b03983722c4619d146aeff76b10af79de9d0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26663–26700` SHA256 `dc565e230e3bbb4056caa74910430b6e0294a5bff3305f2142f6567089294b93`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:136–136` SHA256 `0156fb0563d851c1ebb171d8ed7e9674459e745883736c9bfaa6e1f31fe7dad6`（专用preload桥/事件订阅）。

## SYS-041 · net:reset-stats

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** net.resetStats → M:26428–26428 → 清零ou四字段
- **输入与筛选：** 无参数。
- **返回：** {success:true}。
- **副作用：** 重置四个计数字段，保留offline；网络拦截只在defaultSession webRequest，file/data/devtools放行，开发host和激活更新操作允许的feed路径例外。
- **失败：** 拦截器异常cancel:true；IPC本体无错误包装。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 未证明整个进程所有网络路径离线；这里只统计requests/blocked，bytesIn/Out在所读路径不累计，不能当流量审计。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26428–26428` SHA256 `ad97d5fbf860a7c6360ab9ddff292d3f43c062aa28f6f8179c3057a43cac8858`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:12924–12931` SHA256 `19020185f632c01c80ddfd0b97a1b03983722c4619d146aeff76b10af79de9d0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26663–26700` SHA256 `dc565e230e3bbb4056caa74910430b6e0294a5bff3305f2142f6567089294b93`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:137–137` SHA256 `dcccb43fd8a87dd69b56c00e2d2a8d421e196431e6295ebec3f6c6389bddcfc7`（专用preload桥/事件订阅）。

## SYS-042 · software-update:get-state

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.getState → M:26966–26966 → HI.snapshot
- **输入与筛选：** 无参数。
- **返回：** JSON深复制state：supported/configured/currentVersion/phase/preferences，按阶段可有release/progress/error/lastCheckedAt等。
- **副作用：** 读取状态；不发起检查/下载。
- **失败：** snapshot无catch，初始化不支持系统phase unavailable、未配置phase unconfigured。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26966` SHA256 `83cbde1cc1aec7ba591a76b354300cf9390e39fe92808ded5b15ffcc15acd8f8`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:122–122` SHA256 `a9bdcb365a253f66236bf975454bf90c31fed4dab568f9b7ca73ff1d363296a2`（专用preload桥/事件订阅）。

## SYS-043 · software-update:set-preferences

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.setPreferences → M:26966–26966 → HI.setPreferences→$I→writePersistedState/scheduleCheck
- **输入与筛选：** 只保留setupCompleted/checkAutomatically/downloadAutomatically/installAutomatically且严格true；遗漏字段变false，非patch合并。
- **返回：** {success:true,state}。
- **副作用：** 持久化software-update-state.json，更新autoInstallOnAppQuit；开自动检查1秒后检查，关则清定时；开启自动下载且available可立即下载。
- **失败：** 持久化错误仅日志，调用仍可能success:true；自动下载异步结果不作为当前返回。
- **取消：** 关闭自动检查只清未来timer；无取消已在进行下载/检查API。
- **通知：** software-update:state广播。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26966` SHA256 `83cbde1cc1aec7ba591a76b354300cf9390e39fe92808ded5b15ffcc15acd8f8`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:123–123` SHA256 `0a533a33912dafc09c3013f81fc55ad73599f6f5d41c96ed00b5c33d15e8ddc4`（专用preload桥/事件订阅）。

## SYS-044 · software-update:check

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.check → M:26966–26966 → HI.checkForUpdates→preflight→electron-updater→entitlementProvider
- **输入与筛选：** 无参数；平台supported且feed已配置；并发复用checkPromise；feed生产限配置的HTTPS host/path/publisher。
- **返回：** {success:!state.error,state,error?}。
- **副作用：** checking→available/idle/error；自动下载依偏好；记录lastCheckedAt；定时检查下一次24小时。
- **失败：** UPDATE_CHECK_UNAVAILABLE/UPDATE_CHECK_FAILED/UPDATER_ERROR；可用更新还需当前许可和发布时间权益，失败UPDATE_ENTITLEMENT_EXPIRED。
- **取消：** 无显式取消接口；finally释放checkPromise/networkOperationActive（下载中保留）。
- **通知：** checking、available、idle、error等software-update:state。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26966` SHA256 `83cbde1cc1aec7ba591a76b354300cf9390e39fe92808ded5b15ffcc15acd8f8`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:124–124` SHA256 `1d6e5375649efa72da7131807541fa639364831b58a030b3124d6a167c3f98b9`（专用preload桥/事件订阅）。

## SYS-045 · software-update:download

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.download → M:26966–26966 → HI.downloadUpdate→preflight→electron-updater.downloadUpdate
- **输入与筛选：** 无参数；并发复用downloadPromise；ready直接成功；仅available且availableRelease存在才下载。
- **返回：** {success:phase===ready,state,error?}。
- **副作用：** downloading/progress→ready；保存pendingUpdate；autoUpdater负责下载校验，未执行依赖内部。
- **失败：** UPDATE_DOWNLOAD_UNAVAILABLE/UPDATE_NOT_AVAILABLE/UPDATE_DOWNLOAD_FAILED/UPDATER_ERROR。
- **取消：** 本桥无download cancel方法；finally释放promise/network标记。
- **通知：** 进度取round且限制0..100；downloaded/error状态广播。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26966` SHA256 `83cbde1cc1aec7ba591a76b354300cf9390e39fe92808ded5b15ffcc15acd8f8`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:125–125` SHA256 `b3e14388bea5fea7750de05e3e85c19b273dcba22efc23cd44543325b3020a59`（专用preload桥/事件订阅）。

## SYS-046 · software-update:acknowledge-whats-new

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.acknowledgeWhatsNew → M:26966–26966 → HI.acknowledgeWhatsNew
- **输入与筛选：** 无参数。
- **返回：** {success:true,state}。
- **副作用：** 有whatsNew则记录lastIntroducedVersion、删除whatsNew/whatsNewRelease、写状态。
- **失败：** 写盘失败被记录，返回仍可能success:true。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 有状态变更时software-update:state。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26966` SHA256 `83cbde1cc1aec7ba591a76b354300cf9390e39fe92808ded5b15ffcc15acd8f8`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:127–127` SHA256 `58db12fcd9131a4220fa645f6c00b158033e74c4c9aaf3f52e2ea822990802f0`（专用preload桥/事件订阅）。

## SYS-047 · software-update:restart-and-install

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.restartAndInstall → M:26966–26969 → sender窗口→HI.isReadyToInstall→KI.add→close→HI.quitAndInstall
- **输入与筛选：** 当前sender必须有窗口；phase ready且downloadedRelease存在。
- **返回：** {success:true,state}仅表示发出关闭请求；无窗口WINDOW_NOT_FOUND/未就绪UPDATE_NOT_READY。
- **副作用：** 设置窗口安装意图，经过renderer关闭确认才调用autoUpdater.quitAndInstall(true,true)。
- **失败：** 安装阶段UPDATE_INSTALL_FAILED；关闭取消不应当成安装成功。
- **取消：** resolve-close非allow清KI；用户可以取消关闭。
- **通知：** 关闭前window:before-close；更新失败software-update:state。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26969` SHA256 `7d3d7fb860481adead7bdcaaf08b9c008143f2eadd5ca356bd26041dc56aa511`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26449–26466` SHA256 `4b04b9f7121fd495bc003002cc03bedd59dbfde4d04511e0a0f25301782e6fa0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26702–26714` SHA256 `d3098dbbddbe1414e52c413ca51f7a0b79a4b2aea571dd957e959b4154f0e3c5`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:126–126` SHA256 `a469fd744ff09acd6426a717d95ecc4706ea412b9410519415b5da7ceedba787`（专用preload桥/事件订阅）。

## SYS-048 · software-update:state

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** softwareUpdate.onState; softwareUpdate.onState → M:26318–26321 → HI.emitState→所有存活BrowserWindow.send
- **输入与筛选：** 事件payload为snapshot深复制状态。
- **返回：** onState(handler)收到state，返回removeListener函数。
- **副作用：** 广播给所有未destroyed窗口；不为订阅自动发送首个状态，应另调getState。
- **失败：** send未独立try/catch；失败行为未运行。
- **取消：** 取消订阅仅移除listener，不取消下载/检查。
- **通知：** 此项本身为software-update:state推送。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26318–26321` SHA256 `8f6cbbf4f9551b193e4a09121416fd1e956f43d29ea2d34475a50710ac696953`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26082–26108` SHA256 `15cd74a4077dceb2b8c8e67ce8b45720d976c29d141e409c44b5ad21cd96b805`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26143–26322` SHA256 `8b0ceb1422e549e25f027751938f192b166da1fa2dabcb504d259e4772e7359f`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26966–26985` SHA256 `bd4b45145c814493f19d41669afedadc3cd3ce2e44515a1ff54c5174f2ad6ee0`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:130–130` SHA256 `eae4ca2ac20e5d835b035c62fefef614a9cdb3901d798291c13a8c3a9cd6bed8`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:131–131` SHA256 `3ab94c7a54ab4eb0cb2046fc11803d4a342fc5c66107eceec87c5f7d6bf879b6`（专用preload桥/事件订阅）。

## SYS-049 · task-power:get-state

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** taskPower.getState → M:26866–26875 → a.taskPowerState.snapshot（chunk D9V2C_Ir）
- **输入与筛选：** 无参数。
- **返回：** {suspended,suspendedAt,totalSleepMs,revision}的浅拷贝。
- **副作用：** 读取电源/任务计时状态。
- **失败：** 无catch；get-state跨平台注册，系统suspend/resume监听仅macOS。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** chunk静态读到暂停/恢复计时器机制；未测试真实睡眠/恢复或长任务。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26866–26875` SHA256 `8d7bd184f1cc5801cbdff12c885eea64f2f75c5e150e0444bff32dd99af7f617`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:6–6` SHA256 `ea1f7f2ef70233a935eaf9b6866e61c1b0b3f0e052749ca042a2ec0860e4472a`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js:1–1` SHA256 `8f67c6cacca517411e66daf6f6708cf1d6f8fea02cc7f95937064a4ebf229133`（压缩chunk原文件第1行；taskPowerState=c，paths使用Oe/Pe，全文文件哈希同时登记）。

## SYS-050 · task-power:state

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** taskPower.onState; taskPower.onState → M:26866–26875 → powerMonitor suspend/resume→taskPowerState→send
- **输入与筛选：** 事件payload状态同get-state。
- **返回：** onState回调并返回removeListener函数。
- **副作用：** 仅macOS状态实际改变才广播；suspend清原生timer保留remainingMs，resume重arm并累计睡眠毫秒revision+1。
- **失败：** 重复suspend/resume返回false不广播；本层未包装send异常。
- **取消：** 取消订阅不停止任务，suspend是冻结计时，非业务取消。
- **通知：** 所有webContents未destroyed窗口收到task-power:state。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:26866–26875` SHA256 `8d7bd184f1cc5801cbdff12c885eea64f2f75c5e150e0444bff32dd99af7f617`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:9–9` SHA256 `b63d72af2e2b72cc15b093907c303097ae77971d1bd3a45e8fc5667b2c8d3daa`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:10–10` SHA256 `27a8de55425285b5040e47e0fb5758a204808961e119d1675465fefafc45a9cf`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js:1–1` SHA256 `8f67c6cacca517411e66daf6f6708cf1d6f8fea02cc7f95937064a4ebf229133`（压缩chunk原文件第1行；taskPowerState=c，paths使用Oe/Pe，全文文件哈希同时登记）。

## SYS-051 · debug:get-paths

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** debug.getPaths → M:27108–27110 → 动态加载D9V2C_Ir.paths→getFeedbackPath/getSnapshotPath
- **输入与筛选：** 无参数。
- **返回：** cwd/__dirname/userDataPath/appPath/feedbackPath/snapshotPath/yamlPath/oldFeedbackPath/oldSnapshotPath。
- **副作用：** 读取路径；paths.getUserDataPath采用已设置Le或homedir/.lawbot-redaction-cat。
- **失败：** 动态require/路径服务异常会拒绝，handler无catch。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27108–27110` SHA256 `dfb6bd8597a7baa36355dac87fb3ecedc605052d3530c33fec9af0163e06adeb`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26849–26851` SHA256 `729d57212af1a9af1666de461728556870abd5d2165adb72e42d35900b9566d6`（启动时paths.setUserDataPath注入Electron userData）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:236–236` SHA256 `c8a018a5165d10c4629da73d7edff3858ede0faa4c2eb07040418a997f017474`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js:1–1` SHA256 `8f67c6cacca517411e66daf6f6708cf1d6f8fea02cc7f95937064a4ebf229133`（压缩chunk原文件第1行；taskPowerState=c，paths使用Oe/Pe，全文文件哈希同时登记）。

## SYS-052 · electron:save-pdf-to-desensitized

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** savePdfToDesensitized → M:27111–27121 → mkdirSync→Buffer.from→writeFileSync
- **输入与筛选：** preload四位置参数pdfBuffer,fileName,outputDir,originalFilePath；outputDir缺省Documents/脱敏猫输出；originalFilePath在handler未使用；本层未验证PDF类型/体积/fileName路径。
- **返回：** {success:true,path,outputDir}。
- **副作用：** 创建已脱敏和证明子目录，仅写已脱敏/fileName；本接口不生成证明或内容安全校验。
- **失败：** Buffer转换/目录/写文件异常{success:false,error:message}；同步写，失败可能留目录/部分文件。
- **取消：** 本接口没有独立取消协议；同步完成或等待Promise结束。
- **通知：** 本接口未观察到主动通知。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27111–27121` SHA256 `1b2518a05cbe506e228098e91e85b98ba3c8bbe5aa017240986305d5e2286750`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:312–312` SHA256 `92e83080ee47e0d2057dd8ae571ded13d025613bdbc1c7fd1776ab0823572716`（专用preload桥/事件订阅）。

## SYS-053 · log:renderer-error

**状态：S2 / R0 / complete=false。**

- **preload → handler → 服务：** preload异常兜底; preload异常兜底 → M:27014–27022 → ipcMain.handle→appendFileSync crash.log
- **输入与筛选：** handler忽略传入error细节，只写时间戳+RENDERER JS ERROR(details omitted)。
- **返回：** invoke路径返回{ok:true}。
- **副作用：** 追加固定文本，异常吞掉；不上传日志。
- **失败：** 重要：preload两处兜底使用ipcRenderer.send，但此通道登记handle而不是on；静态路由类型不匹配，不能声称兜底send已写盘。
- **取消：** 无取消协议。
- **通知：** 无通知；只观察到preload send两处，不等于被handle消费。
- **尚未闭合：** 直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。；未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。
- **来源范围与切片哈希：**
  - `.data/research/lawbot-2026-10-13/readable/main.js:27014–27022` SHA256 `f53ebf9b030264d6549eb9ba270733ece8ff6048ec27b17eb8197da9ab5219b2`（handler或事件发射/生命周期注册）。
  - `.data/research/lawbot-2026-10-13/readable/main.js:26782–26790` SHA256 `6ecddcc2ab458a9a5826a9e01559f20606892ccf0a451ccb18ef1ab29e536c58`（直接服务及共享控制逻辑）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:307–315` SHA256 `e1d300f143ef7348428a2b0561b7f3628878ce558e011e790d5bbee1dea93460`（通用invoke桥；无通道白名单）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:320–324` SHA256 `a936fdca41e385d77bb460d1b2e4a0c0513fbcd6d23cef0533e0de2c9e71a2d8`（专用preload桥/事件订阅）。
  - `.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:331–335` SHA256 `28241c81bd03afa0f41fcac942caaca916e04057c73f72ae9cb3a4f781f714a1`（专用preload桥/事件订阅）。
