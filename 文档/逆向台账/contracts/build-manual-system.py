from pathlib import Path
import json,hashlib,collections
BASE=Path(__file__).resolve().parents[3]; out=BASE/'文档/逆向台账/contracts'
M='.data/research/lawbot-2026-10-13/readable/main.js'; P='.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js'; C='.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js'
idx=json.loads((BASE/'.data/research/lawbot-2026-10-13/ipc-static-contracts.json').read_text()); canon={x['channel']:x for x in idx['channels']}
# All semantic prose below was manually written from the read-only source analysis.
records=[]
def ev(a,b,path=M,note=''):
 data=''.join((BASE/path).read_text().splitlines(keepends=True)[a-1:b]).encode(); return dict(path=path,start_line=a,end_line=b,slice_sha256=hashlib.sha256(data).hexdigest(),note=note)
def add(ch,hr,service,ranges,inp,ret,effect,fail,cancel='本接口没有独立取消协议；同步完成或等待Promise结束。',notify='本接口未观察到主动通知。',gap='直接服务以下的所有依赖、异常组合及跨平台运行尚未逐项验证。'):
 c=canon[ch]; n=len(records)+1
 records.append(dict(id=c['id'],channel=ch,manualContractRef=f'SYS-{n:03d}',staticDepth='S2',runtime='R0',complete=False,rawOperations=c['operations'],handlerRefs=c['handlers'],preloadExposures=c['preloadExposures'],chain={'preload':'; '.join(x['apiPath'] or 'preload异常兜底' for x in c['preloadExposures']) or '没有专用preload方法；通用window.ipc.invoke / window.electron.ipcRenderer.invoke转发（P307–315），并不等于UI已定位', 'handler':f'M:{hr[0]}–{hr[1]}', 'directService':service},evidence=[ev(*hr,note='handler或事件发射/生命周期注册')]+[ev(a,b,note='直接服务及共享控制逻辑') for a,b in ranges]+[ev(307,315,P,'通用invoke桥；无通道白名单')],input=inp,returns=ret,effects=effect,failures=fail,cancellation=cancel,notifications=notify,gaps=[gap,'未执行竞品JS、没有许可证激活或处理链运行验证；不是可发布源码授权结论。']))
A='handler捕获并返回{success:false,code:error.code,error:error.message或String(error)}；底层KEY_HIERARCHY/PASSWORD/AUTH错误保留。'
PW='String(value||空串)；Ng要求字符串长度至少4、UTF-8不超过1024字节、不可全空白；scrypt参数校验后派生。'
add('auth:get-capabilities',(18665,18671),'Promise.all(wf(),Nh())→Mac helper capabilities与Fg.status',[ (14788,14845),(15265,15335),(19650,19697)],'无参数；biometryType仅touch-id/face-id/none。','success及systemAuthentication/biometryAvailable/biometryType；configured映射hasPassword/applicationPassword/applicationPasswordConfigured，initialized映射deviceProtectionInitialized。','读取密钥文件/旧密码存在性；macOS helper --capabilities（静态观察，没有执行）；过期内存密钥会lock。','异常返回success:false及认证能力false、biometryType:none、error；wf内部映射AUTH_*。')
add('auth:request-system-grant',(18672,18699),'bf认证helper→hierarchy.status/unlockWithDeviceProtection→de/he',[(29,48),(15265,15335),(19733,19742)],'sender.id转Number；macOS限定，固定认证原因文字；无renderer指定命令。','成功{success:true,method:mac-system,authToken}；失败{success:false,code,error}。','原生系统认证成功后尝试设备保护解锁（未初始化时不解锁）；记录sender会话并产生15分钟一次性令牌。','非macOS AUTH_UNAVAILABLE；helper返回/异常映射AUTH_CANCELLED/UNAVAILABLE/LOCKED_OUT/FAILED/TIMEOUT/HELPER_ERROR；后续密钥解锁异常未由该handler捕获。','同sender新请求abort旧请求；sender destroyed abort；helper 60秒超时SIGTERM；finally移除监听及对应controller。','没有IPC进度；系统认证对话框由helper负责。')
add('auth:set-password',(18700,18709),'Nh→Fg.setup→km().migrateLegacy→de',[(14788,14845),(19567,19603),(19650,19717),(29,48)],PW+'；已配置拒绝AUTH_ALREADY_CONFIGURED，旧密码存在拒绝AUTH_LEGACY_MIGRATION_REQUIRED。','{success:true}，不直接发authToken。','创建/更新密码槽与设备恢复槽，原子临时写入并解锁；migrateLegacy失败被吞；将sender标为已认证。',A)
add('auth:has-password',(18710,18716),'Nh→Fg.status/旧密码stat',[(14788,14845),(19650,19697)],'无参数。','{hasPassword:configured,...status,legacyPasswordPresent,needsLegacyMigration}，成功无success字段。','读取状态；过期内存密钥清空。','异常{hasPassword:false,error}。')
add('auth:verify-password',(18717,18724),'Ah→Fg.unlock或Eh旧密码比对→km.migrateLegacy→de/he',[(14788,14845),(19567,19603),(19718,19732),(29,48)],PW+'；未配置且旧密码有效允许旧路径；其余要求完成迁移/设置。','{success:true,authToken}。','解锁内存密钥，尝试旧映射迁移（迁移异常吞掉），sender会话及一次性15分钟token。',A+' AUTH_NOT_CONFIGURED错误文案映射NEED_SET_PASSWORD。')
add('auth:check-password',(18725,18731),'Ah→Fg.unlock或Eh→de',[(14788,14845),(19567,19603),(19718,19732),(29,48)],PW,'{success:true}，不发token。','同样会解锁和登记sender；名称check不表示纯读。',A+' AUTH_NOT_CONFIGURED映射NEED_SET_PASSWORD。')
add('auth:migrate-legacy-password',(18732,18741),'Nh→Eh→vh→Fg.setup→km.migrateLegacy→de/he',[(14788,14845),(19567,19603),(19698,19717),(29,48)],'currentPassword/nextPassword均String(...||空串)；必须未配置新密码且旧密码存在、旧密码timingSafeEqual通过；新密码遵循Ng。','{success:true,authToken}。','旧密码文件先rename临时；setup成功后删临时，失败尝试回滚rename；映射迁移失败吞掉；建立会话。',A)
add('auth:change-password',(18742,18750),'Fg.changePassword→me→de',[(19567,19603),(19743,19760),(29,48)],'currentPassword/nextPassword String(...||空串)；Fg须已配置；验证旧密码，再派生新密码。','{success:true}。','重包装同一CMK的新passwordSlot并原子写，解锁；清全部token/sender会话，仅登记当前sender。',A)
add('auth:lock',(18751,18751),'kh→Fg.lock；me',[(14843,14845),(19788,19790),(29,48)],'无参数。','{success:true}。','清零并移除内存CMK，清所有token及会话。','handler无catch；没有独立错误结果形状。')
add('auth:restore-session-token',(18751,18760),'主frame检查→Nh→ue集合→he',[(29,48),(14831,14845),(19694,19697)],'必须senderFrame===sender.mainFrame，hierarchy当前unlocked且sender已登记ue。','成功{success:true,authToken}；否则{success:false,error_type:AUTH_REQUIRED}。','锁定时pe移除sender及其token；合格会话签发新一次性15分钟token。','状态读取失败返回AUTH_REQUIRED；不能凭renderer缓存token重新解锁。')
rec=[(25347,25443),(25446,25538),(19761,19790)]
add('auth:create-recovery-request',(25539,25547),'c2恢复pending→q_.resumeRequest/createRequest→X_.write',rec,'无参数；必须有效本机许可、设备/installation/recoverySlot绑定、已配置密钥。','{success:true,request,exported:boolean}；已有有效pending复用。','首次生成installation-id/32字节challenge/UUID；pending-recovery.v1.json以0600临时写rename；申请7天，恢复文件策略48小时。',A+' 已损坏/过期/绑定不符pending可清理重建；其他异常继续失败。')
add('auth:save-recovery-request',(25548,25564),'c2→q_.getActiveRequest→saveDialog→原子写→X_.write',rec,'无renderer路径；由系统保存对话框选.lbrq位置；先恢复有效申请。','成功{success:true,filePath}。','导出申请JSON，0600 wx临时文件+rename，finally删临时；随后pending写exportedAt。',A+' 文件导出与pending更新并非整体事务，后一步失败可能已写申请文件。','对话框取消/无filePath返回{success:false,canceled:true}。')
add('auth:cancel-recovery',(25565,25565),'q_.cancel→X_.clear',rec,'无参数。','{success:true}。','清内存activeSession/preparedToken并删除pending文件。','clear失败Promise拒绝；内存已清，handler无catch。','此方法本身取消恢复会话；不会回滚已导出的申请文件。')
add('auth:import-recovery-file',(25565,25577),'c2→openDialog→stat/read/JSON→q_.prepare/verifyToken',rec,'必须pending.exportedAt存在；选.lbr普通文件≤65536字节；签名可信公钥Ed25519，schema/purpose/maxUses/UUID/时间窗与申请设备挑战绑定校验。','{success:true,expiresAt}。','准备并保留已验证token于内存；此步不修改密码。',A+' RECOVERY_SESSION_REQUIRED/TOKEN_INVALID及签名/过期/绑定错误。','对话框取消返回{success:false,canceled:true,error:用户取消}；cancel-recovery可清准备状态。')
add('auth:complete-recovery',(25578,25584),'q_.completePrepared→verifyToken→redeemer→Fg.recoverPasswordFromDeviceSlot→X_.clear',rec+[(25496,25500),(19567,19603)],'nextPassword String(...||空串)，须activeSession和已准备token，再验证签名/有效期/绑定；新密码遵循Ng。','{success:true}，不发authToken。','设备恢复槽解包并重写密码槽，自检后lock；清内存恢复状态和pending。',A+' 当前Q_.redeem直接返回redeemed:true，因此本链未证实服务端单次核销；签名和绑定检查仍在。','无中途取消协议；cancel-recovery为独立操作，并发行为未验证。')
# App utilities
add('app:consume-open-path',(27057,27061),'dS一次读取清空',[(26740,26772)],'无参数；dS来自存在的.tmm命令行/系统open-file。','string路径或null。','消费pending路径，置null。','无catch；路径此前exists，使用时可能已变动。')
add('app:open-path',(26740,26772),'open-file/second-instance→hS/fS→webContents.send',[(27057,27061)],'事件型；只处理string且扩展.tmm且exists；选择第一个窗口。','preload onOpenPath(handler)回调收到filePath；返回取消订阅函数，不是invoke结果。','恢复最小化/聚焦；窗口loading时待did-finish-load再发；pending仍可冷启动consume。','不存在路径被忽略；无窗口不发；fs exists异常忽略。','preload removeListener取消订阅；无取消OS打开文件请求。','主进程向renderer发app:open-path；有冷启动主动消费和热启动推送两条路径。')
add('app:write-clipboard-text',(26773,26781),'electron.clipboard.writeText/readText',[],'必须string，非空且JS length≤4096，否则失败。','{success:true}或{success:false,error}。','写系统剪贴板并读回精确比较。','空/过长、系统未接受写入、clipboard异常明确失败。')
add('app:get-env',(27071,27071),'app.isPackaged/process.versions/GI',[(26323,26329)],'无参数；devTaskLabel仅非packaged，移控制字符trim并截5个码点。','{mode:production或development,devTaskLabel,appVersion:0.5.9,versions}。','读取运行环境。','无catch，无专门失败包装。')
add('app:get-version',(27101,27107),'fs.readFile package.json→JSON.parse',[],'无参数；路径固定YI/../../package.json。','{success:true,version}。','读取本地包版本，与get-env硬编码来源不同。','读文件/JSON失败{success:false,error:message}。')
add('app:read-legal-doc',(27071,27085),'白名单→候选路径access→readFile',[],'docName仅agreement.md/product-intro.md/privacy-policy.md；packaged查dist，dev另查src/public。','{success:true,content:string}。','读取首个可访问的内置法律文档。','非法名称、找不到或读取异常{success:false,error}。')
add('app:read-onboarding-sample',(27086,27098),'固定样例候选路径→readFile→Uint8Array',[],'无参数；固定法律服务委托协议_体验示例.docx，不接任意文件名。','{success:true,fileName,data:Uint8Array}。','读取内置样例。','逐路径失败继续；全部失败{success:false,fileName,error}。')
add('app:open-external',(27099,27100),'ipcMain.on→shell.openExternal',[],'preload send(url)；handler只做truthy判断，未观察到协议/域名过滤。','send没有Promise业务结果。','交给操作系统默认应用/浏览器打开URL。','无catch且不await；本层不返回失败。',gap='仅记录此层缺少URL过滤，未对Electron/系统协议实现作安全证明或测试。')
add('app:export-crash-log',(27023,27031),'exists→showSaveDialog→copyFileSync',[],'无参数；userData/crash.log→用户选择.log/.txt。','{ok:true,filePath,errorCode:DOCX_CRASH_LOG_EXPORTED}。','复制完整crash.log到选定位置。','不存在DOCX_CRASH_LOG_NOT_FOUND；复制/对话框异常DOCX_CRASH_LOG_EXPORT_FAILED。','取消返回{ok:false,canceled:true,errorCode:DOCX_CRASH_LOG_EXPORT_CANCELED}。')
add('app:get-docx-safe-mode',(27032,27041),'exists/readFileSync .docx-preview-crash',[],'无参数。','存在{safeMode:true,detail:原始字符串}；否则{safeMode:false}。','读取安全模式标志。','所有读取异常降级safeMode:false，不区分缺失和损坏。')
add('app:reset-docx-safe-mode',(27042,27048),'exists→unlinkSync .docx-preview-crash',[],'无参数。','{ok:true}。','存在则删除本地安全模式标志。','异常{ok:false,error:message}。')
add('app:set-docx-safe-mode',(27049,27056),'writeFileSync .docx-preview-crash',[],'reason原样写JSON，未观察到类型/大小过滤。','{ok:true}。','覆盖写入{time:ISO,reason}。','异常{ok:false,error:message}，非原子写。')
# License: describe validation requirements without executing or changing them.
lic=[(13793,13870),(13867,13928),(13929,13984),(13670,13695),(18924,18926)]
add('license:get-machine-id',(26932,26937),'nd.getStatus→getMachineIdCached/Ku',lic,'无参数。','{success:true,machineId}，即使未激活也可能成功读取设备码。','缓存设备码和状态；getStatus可能读许可、验证时钟/版本记录。','异常统一{success:false,error,errorCode:LICENSE_IPC_FAILED}。')
add('license:get-status',(26938,26944),'nd.getStatus→validateLicense',lic,'无参数；先用cachedStatus，否则读取license.dat并验证签名、设备（含别名）、撤销、版本、类型、期限与时钟。','success:true并投影activated/customer/type/versionRange/issuedAt/expiresAt/machineId/appVersion/error/errorCode/realExpiryDate/remainingDays/originalPurchasedAt。','状态缓存；时钟最大值记录、合格更新授权最大版本记录可写入；不是纯只读。','未激活仍success:true+activated:false/error；IPC异常才LICENSE_IPC_FAILED。')
add('license:activate',(26945,26952),'nd.activate→Gu签名解码→设备/撤销/版本/期限→write license.dat',lic,'必须非空string；Gu去空白并验证payload.signature和必要字段；必须本机设备码、许可类型和版本适配；非permanent要求未过期expiresAt。','通过{success:true,activated:true,customer,type,versionRange,issuedAt,expiresAt}；不通过{success:false,error,errorCode?}。','先清cachedStatus；验证后写license.dat并缓存。没有运行、修改或绕过此链。','签名、机器、撤销REFUNDED_LICENSE、早期版本LEGACY_UPGRADE_NEEDED、类型/过期/IO失败。')
add('license:refresh',(26953,26959),'nd.refresh→cachedStatus=null→getStatus',lic,'无参数。','{success:true,activated,customer,versionRange,error}，字段少于get-status。','清内存状态并重读验证本地许可；此方法本身不是远程续期接口。','IPC异常LICENSE_IPC_FAILED；无效许可表现activated:false。')
add('license:get-summary',(26960,26965),'nd.getSummary→getStatus',lic,'无参数。','{success:true,customer,issuedAt,versionRange,machineId,activated}。','复用状态缓存/本地验证副作用。','IPC异常LICENSE_IPC_FAILED。')
# Window lifecycle
for ch,hr,service,ret in [('window:minimize',(26428,26430),'BrowserWindow.fromWebContents→minimize','有窗口true，否则false'),('window:toggle-maximize',(26431,26433),'fromWebContents→isMaximized→unmaximize/maximize','有窗口true，否则false'),('window:is-maximized',(26434,26436),'fromWebContents→isMaximized','布尔；无窗口false'),('window:close',(26437,26440),'fromWebContents→close→hI.onCloseAttempt','有窗口true表示已请求关闭，不代表已实际关闭；否则false')]:
 add(ch,hr,service,[(26441,26466),(25783,25802)],'无业务参数；窗口绑定调用sender。',ret+'。','查询或对应窗口动作；close经过保存确认状态机。','没有窗口返回false；handler未包装Electron异常。','close可由renderer取消/failed，其他动作无取消协议。','close可能发window:before-close，其余未观察到本接口通知。')
add('window:before-close',(26449,26466),'close event→hI.onCloseAttempt→send',[(25783,25802),(26702,26714)],'事件payload {requestId:string}；每窗口状态机生成非空请求ID。','preload onBeforeClose(handler)回调并返回取消订阅函数。','第一次preventDefault并请求renderer；等待中重复close仅聚焦；allow-once下次关闭放行。','无自动超时分支；renderer未回可能保持waiting-renderer。','renderer resolve-close可cancel/failed保持窗口；unsubscribe不等于批准关闭。','window:before-close。')
add('window:resolve-close',(26702,26714),'fromWebContents→sS.get→hI.resolve→markSessionClean→close',[(25783,25802),(26449,26466)],'必须有sender窗口和状态、data、string requestId；精确匹配当前请求；decision只allow触发retry，failed失败，其余当cancel。','false无效/陈旧/重复；true接受当前决策。','allow尽力markSessionClean（错误吞）再close；非allow清该窗口安装标记KI；allow-once只放行一次。','无效请求false；markSessionClean异常不阻止close；其他异常未catch。','cancel/failed保持窗口；过期requestId ignore。','与before-close成对；更新重启也经过此链。')
# Network
for ch,hr,service,inp,ret,effect in [('net:set-offline',(26426,26428),'Boolean→iu→cu','任意值Boolean()转换，字符串false仍为true。','{success:true,offline:boolean}','修改进程内offline开关，不持久化'),('net:get-stats',(26428,26428),'cu复制ou并加offline','无参数。','{bytesOut,bytesIn,requests,blocked,offline}','读取计数'),('net:reset-stats',(26428,26428),'清零ou四字段','无参数。','{success:true}','重置四个计数字段，保留offline')]:
 add(ch,hr,service,[(12924,12931),(26663,26700)],inp,ret+'。',effect+'；网络拦截只在defaultSession webRequest，file/data/devtools放行，开发host和激活更新操作允许的feed路径例外。','拦截器异常cancel:true；IPC本体无错误包装。',gap='未证明整个进程所有网络路径离线；这里只统计requests/blocked，bytesIn/Out在所读路径不累计，不能当流量审计。')
# Software update
up=[(26082,26108),(26143,26322),(26966,26985)]
add('software-update:get-state',(26966,26966),'HI.snapshot',up,'无参数。','JSON深复制state：supported/configured/currentVersion/phase/preferences，按阶段可有release/progress/error/lastCheckedAt等。','读取状态；不发起检查/下载。','snapshot无catch，初始化不支持系统phase unavailable、未配置phase unconfigured。')
add('software-update:set-preferences',(26966,26966),'HI.setPreferences→$I→writePersistedState/scheduleCheck',up,'只保留setupCompleted/checkAutomatically/downloadAutomatically/installAutomatically且严格true；遗漏字段变false，非patch合并。','{success:true,state}。','持久化software-update-state.json，更新autoInstallOnAppQuit；开自动检查1秒后检查，关则清定时；开启自动下载且available可立即下载。','持久化错误仅日志，调用仍可能success:true；自动下载异步结果不作为当前返回。','关闭自动检查只清未来timer；无取消已在进行下载/检查API。','software-update:state广播。')
add('software-update:check',(26966,26966),'HI.checkForUpdates→preflight→electron-updater→entitlementProvider',up,'无参数；平台supported且feed已配置；并发复用checkPromise；feed生产限配置的HTTPS host/path/publisher。','{success:!state.error,state,error?}。','checking→available/idle/error；自动下载依偏好；记录lastCheckedAt；定时检查下一次24小时。','UPDATE_CHECK_UNAVAILABLE/UPDATE_CHECK_FAILED/UPDATER_ERROR；可用更新还需当前许可和发布时间权益，失败UPDATE_ENTITLEMENT_EXPIRED。','无显式取消接口；finally释放checkPromise/networkOperationActive（下载中保留）。','checking、available、idle、error等software-update:state。')
add('software-update:download',(26966,26966),'HI.downloadUpdate→preflight→electron-updater.downloadUpdate',up,'无参数；并发复用downloadPromise；ready直接成功；仅available且availableRelease存在才下载。','{success:phase===ready,state,error?}。','downloading/progress→ready；保存pendingUpdate；autoUpdater负责下载校验，未执行依赖内部。','UPDATE_DOWNLOAD_UNAVAILABLE/UPDATE_NOT_AVAILABLE/UPDATE_DOWNLOAD_FAILED/UPDATER_ERROR。','本桥无download cancel方法；finally释放promise/network标记。','进度取round且限制0..100；downloaded/error状态广播。')
add('software-update:acknowledge-whats-new',(26966,26966),'HI.acknowledgeWhatsNew',up,'无参数。','{success:true,state}。','有whatsNew则记录lastIntroducedVersion、删除whatsNew/whatsNewRelease、写状态。','写盘失败被记录，返回仍可能success:true。',notify='有状态变更时software-update:state。')
add('software-update:restart-and-install',(26966,26969),'sender窗口→HI.isReadyToInstall→KI.add→close→HI.quitAndInstall',up+[(26449,26466),(26702,26714)],'当前sender必须有窗口；phase ready且downloadedRelease存在。','{success:true,state}仅表示发出关闭请求；无窗口WINDOW_NOT_FOUND/未就绪UPDATE_NOT_READY。','设置窗口安装意图，经过renderer关闭确认才调用autoUpdater.quitAndInstall(true,true)。','安装阶段UPDATE_INSTALL_FAILED；关闭取消不应当成安装成功。','resolve-close非allow清KI；用户可以取消关闭。','关闭前window:before-close；更新失败software-update:state。')
add('software-update:state',(26318,26321),'HI.emitState→所有存活BrowserWindow.send',up,'事件payload为snapshot深复制状态。','onState(handler)收到state，返回removeListener函数。','广播给所有未destroyed窗口；不为订阅自动发送首个状态，应另调getState。','send未独立try/catch；失败行为未运行。','取消订阅仅移除listener，不取消下载/检查。','此项本身为software-update:state推送。')
# Miscellaneous
add('task-power:get-state',(26866,26875),'a.taskPowerState.snapshot（chunk D9V2C_Ir）',[],'无参数。','{suspended,suspendedAt,totalSleepMs,revision}的浅拷贝。','读取电源/任务计时状态。','无catch；get-state跨平台注册，系统suspend/resume监听仅macOS。',gap='chunk静态读到暂停/恢复计时器机制；未测试真实睡眠/恢复或长任务。')
add('task-power:state',(26866,26875),'powerMonitor suspend/resume→taskPowerState→send',[],'事件payload状态同get-state。','onState回调并返回removeListener函数。','仅macOS状态实际改变才广播；suspend清原生timer保留remainingMs，resume重arm并累计睡眠毫秒revision+1。','重复suspend/resume返回false不广播；本层未包装send异常。','取消订阅不停止任务，suspend是冻结计时，非业务取消。','所有webContents未destroyed窗口收到task-power:state。')
add('debug:get-paths',(27108,27110),'动态加载D9V2C_Ir.paths→getFeedbackPath/getSnapshotPath',[],'无参数。','cwd/__dirname/userDataPath/appPath/feedbackPath/snapshotPath/yamlPath/oldFeedbackPath/oldSnapshotPath。','读取路径；paths.getUserDataPath采用已设置Le或homedir/.lawbot-redaction-cat。','动态require/路径服务异常会拒绝，handler无catch。')
add('electron:save-pdf-to-desensitized',(27111,27121),'mkdirSync→Buffer.from→writeFileSync',[],'preload四位置参数pdfBuffer,fileName,outputDir,originalFilePath；outputDir缺省Documents/脱敏猫输出；originalFilePath在handler未使用；本层未验证PDF类型/体积/fileName路径。','{success:true,path,outputDir}。','创建已脱敏和证明子目录，仅写已脱敏/fileName；本接口不生成证明或内容安全校验。','Buffer转换/目录/写文件异常{success:false,error:message}；同步写，失败可能留目录/部分文件。')
add('log:renderer-error',(27014,27022),'ipcMain.handle→appendFileSync crash.log',[(26782,26790)],'handler忽略传入error细节，只写时间戳+RENDERER JS ERROR(details omitted)。','invoke路径返回{ok:true}。','追加固定文本，异常吞掉；不上传日志。','重要：preload两处兜底使用ipcRenderer.send，但此通道登记handle而不是on；静态路由类型不匹配，不能声称兜底send已写盘。','无取消协议。','无通知；只观察到preload send两处，不等于被handle消费。')
# Additional directly read service evidence; no target code execution.
for r in records:
 if r['channel'].startswith('auth:'):
  r['evidence'].append(ev(26849,26853,note='实际注入Fg与auth/key-hierarchy.v1.json及restore_pwd.enc路径'))
 if r['channel'] in {'auth:set-password','auth:verify-password','auth:migrate-legacy-password'}:
  r['evidence'] += [ev(16623,16626,note='km映射仓库构造'),ev(15152,15263,note='mf映射存储及migrateLegacy直接服务')]
  r['effects'] += ' 旧假名映射迁移逐个JSON校验/受保护写入并更新索引，成功后删除旧JSON；逐文件失败收集为failures，handler不展示这些失败。'
 if r['channel'].startswith('license:'):
  r['evidence'] += [ev(13591,13669,note='Ku设备指纹读取/探测/缓存直接服务'),ev(13696,13791,note='最大版本与时钟记录服务；未复制撤销名单')]
 if r['channel']=='debug:get-paths':
  r['evidence'].append(ev(26849,26851,note='启动时paths.setUserDataPath注入Electron userData'))
# Attach exact preload evidence plus chunk source pointer where required.
for r in records:
 for p in r['preloadExposures']:
  e=p['evidence']; r['evidence'].append(ev(e['startLine'],e['endLine'],P,'专用preload桥/事件订阅'))
 if r['channel'].startswith('task-power:') or r['channel']=='debug:get-paths':
  r['evidence'].append(ev(1,1,C,'压缩chunk原文件第1行；taskPowerState=c，paths使用Oe/Pe，全文文件哈希同时登记'))
ns={'auth','app','license','debug','electron','window','task-power','net','software-update','log'}
expected={c for c in canon if c.split(':')[0] in ns}; actual={r['channel'] for r in records}
assert len(records)==53 and actual==expected,(len(records),expected-actual,actual-expected)
others=[]
for file,key in [('manual-workflow-contracts.json','contracts'),('manual-collaboration-contracts.json','interfaces')]:
 other=json.loads((out/file).read_text()); others += [r['channel'] for r in other[key]]
assert len(others)==164 and not actual.intersection(others) and set(others)|actual==set(canon)
files=[]
for path in [M,P,C,'.data/research/lawbot-2026-10-13/extracted/dist/main/index.js','.data/research/lawbot-2026-10-13/ipc-static-contracts.json']:
 b=(BASE/path).read_bytes(); files.append(dict(path=path,bytes=len(b),sha256=hashlib.sha256(b).hexdigest()))
x=dict(schemaVersion=1,sourceVersion='0.5.9',analysisDate='2026-10-13',mode='manual-static-only-never-executed-target',summary=dict(manualChannels=53,namespaceCounts=dict(sorted(collections.Counter(r['channel'].split(':')[0] for r in records).items())),unionChannels=217,overlap=0,completeContracts=0,S2=53,R0=53),sourceFiles=files,methodology=['逐项核读preload、handler及本文件记录的直接服务；摘要不是对全部递归依赖的证明。','rawOperations/handlerRefs/preloadExposures直接保留canonical索引原始范围；evidence为原文件保留换行的闭区间行范围SHA256。','没有执行竞品JS、调用远程接口、生成许可或绕过授权；仅本地合法持有发布包静态分析。','所有条目S2/R0/complete=false；事件通道与invoke/send明确区分。','未修改ledger或旧审查/使用指南。'],contracts=records)
(out/'manual-system-contracts.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
md=['# 应用、认证、许可与系统契约静态核读（0.5.9）','', '本文件人工核读53项；与业务63项、协作/配置101项合计217项，通道集合无重叠、无遗漏。**全部 S2 / R0 / complete=false；完整业务契约为0。** 未执行竞品JS，也未进行授权绕过。','', '## 证据与范围','', 'JSON保留canonical原始operation/handler/preload范围，另记录直接服务原文件行范围和切片SHA256。M为readable/main.js，P为extracted/dist/preload/index.js；完整路径和文件SHA256如下。','']
for f in files: md.append(f"- `{f['path']}`，SHA256 `{f['sha256']}`。")
md+=['','## 跨接口边界','', '- 认证一次性token绑定sender，15分钟有效；消费函数先删除token再检查。密码check同样会解锁，不能当纯读。','- 密码恢复依赖签名、当前设备和当前申请绑定；本包Q_.redeem仅返回redeemed:true，未证实远程单次核销。这不构成绕过方案。','- 许可get-status的success表示IPC成功，activated才表示授权状态；状态读取可能更新本地时钟/版本记录。','- 更新重启成功返回只表示请求关闭，后面还要通过renderer保存确认及安装调用。偏好持久化失败可能仍返回success:true。','- 网络开关只覆盖观察到的Electron defaultSession拦截器；不能用其字节计数证明所有进程流量为零。','- preload日志兜底send与main handle类型不匹配，未证明这两条兜底错误能写入crash.log。','- 通用invoke桥存在，不将没有专用preload方法误记为不存在调用途径；本轮未全面定位renderer UI入口。','']
for r in records:
 md += [f"## {r['manualContractRef']} · {r['channel']}",'', '**状态：S2 / R0 / complete=false。**','',f"- **preload → handler → 服务：** {r['chain']['preload']} → {r['chain']['handler']} → {r['chain']['directService']}"]
 for k,label in [('input','输入与筛选'),('returns','返回'),('effects','副作用'),('failures','失败'),('cancellation','取消'),('notifications','通知')]: md.append(f"- **{label}：** {r[k]}")
 md.append('- **尚未闭合：** '+'；'.join(r['gaps']))
 md.append('- **来源范围与切片哈希：**')
 for e in r['evidence']: md.append(f"  - `{e['path']}:{e['start_line']}–{e['end_line']}` SHA256 `{e['slice_sha256']}`（{e['note']}）。")
 md.append('')
(out/'manual-system-contracts.md').write_text('\n'.join(md))
print(json.dumps(x['summary'],ensure_ascii=False)); print('wrote',out/'manual-system-contracts.json')
