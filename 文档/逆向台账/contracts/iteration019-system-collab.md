# ITER019 系统与协作末端补读

只读公开发布包中的可见代码；DEP47/38/42 的应用编排与系统53入口消费。未改旧报告、应用或台账。

维持 S2 / R0；未运行竞品，无全业务闭合声明。

{"sections": 14, "newEvidenceRanges": 56, "systemInterfaces": 53, "inventoryStatusCounts": {"renderer-consumer-body-read": 41, "no-published-renderer-caller": 12}}

## SC01 Og2批量密码预检与解锁回执

- Og2逐件串行：先await In2，needsPassword进入待解锁；否则Dg2→detectRouteOnly，FILE_ENCRYPTED或密码保护/已加密/password protected字符串归加密。首次In2在局部try外，登记失败中止整批；预检普通失败保存到Map，解锁后Dg2的异常不再本地catch。
- 批量窗口同刻仅一个Zs2 resolver；第二次弹出抛错。Qs2要求每项已解锁或密码非空且非busy。Pg2串行解锁，成功项密码清空并保留unlocked，失败项留错误供重试；全部解锁才Ig2(true)。取消在Js2 busy时无效，非busy取消清UI并resolve false。已成功解锁的sourceRef不回滚。
- Eg2→In2→unlockSource(120秒Ln2)，要求success和sourceRef后Tn2只保留id/fileName/legacyOffice，清buffer/needsPassword并按Oh2同步Qe2/co2/nl2。Ln2只是超时reject，没有cancel/abort底层IPC；超时后main可能已替换并release旧source。
- main unlock-source限制非空密码<=4096、source存在、docx/pdf/doc/wps；DOCX解密验PK和大小，legacy验CFB后转换DOCX；PDF lp委托。S2注册新源后转存路径映射并release旧源再回执，跨调用失败非事务；readSource/解密库/原生转换沿既有规则与格式合同。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:31530–31570；.data/research/lawbot-2026-10-13/readable/renderer.js:31614–31624；.data/research/lawbot-2026-10-13/readable/renderer.js:32312–32312；.data/research/lawbot-2026-10-13/readable/renderer.js:36239–36327；.data/research/lawbot-2026-10-13/readable/main.js:17008–17046；.data/research/lawbot-2026-10-13/readable/main.js:17934–17949

余缺：DOCX/legacy第三方解密算法和PDF外部解密运行、timeout后原生进程真实存活均未验证；不是密码机制等价证明。

## SC02 Zg2首次路由与批量调度连接

- Zg2先阻止读取审查记录及未解决沿用假名冲突，再递增eh2，才检查空文件/Gn2；重复调用即便提前退出也已改变single代际。ensureSelected异常仅toast，仍继续EU/jc.set/fd2。
- batch重建co2要求>=2或secure_review，Ne2.resetEntities；Og2(null取消)只return内层匿名函数，外层secure_review仍执行documentType覆盖和Rm2。Rm2会把批次排队并调用Om2，所以不能声称密码取消等于协作批次停止。
- single需要>=1实体类型、路径/Uint8Array/sourceRef一种有效源；needsPassword先Ag2，最多两次Dg2，中间允许解锁；await路由后检查eh2代际，成功仅打开类型选择，不在这里完成检测。失败区分超时/内存/GPU/OCR初始化，其余通用失败。
- jg2新增批次复用Og2→zg2，失败撤回此次新增co2/Qe2但不回滚已登记或已解锁source；finally清busy。Rm2有只排新增和全批重置两支，Om2使用length:1串行worker与go2/xo2门，finally触发oe2；oe2 O2去重后xy2/Nv2，非所有状态都自动导出。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:36546–36629；.data/research/lawbot-2026-10-13/readable/renderer.js:36336–36385；.data/research/lawbot-2026-10-13/readable/renderer.js:34122–34141；.data/research/lawbot-2026-10-13/readable/renderer.js:34353–34400；.data/research/lawbot-2026-10-13/readable/renderer.js:30812–30828

余缺：Dm2具体逐格式检测/Om2底层pause分类的完整余缺继续按ITER019其他processing报告，不把本节调度读完算检测模型完成。

## SC03 Nv2导出入口分流与识别完成门

- Ql2印章补检时拒绝；batch Mm2后将partial通过Lh2处理，Ev2重算模式，只取ready；无ready警告，manualSealReviewRequired需人工确认，再Tv2图片文字提醒和kh2门，协作走xy2否则gh2。
- single Markdown/PDF/image委托各child triggerConfirm；DOCX还需qn2完成及Tv2。缺方法给尚未就绪提示。并未在Nv2直接写文件。
- iy2按exportMode重建假名entries并Zh2赋reviewDraft；ry2对当前活跃文件应用draft，DOCX/MD未await child返回，PDF/image在jd2已于finally复位后await，再Yt，故jd2不是覆盖异步apply全过程的门。
- Gc仅对pdf/image强制非空documentText和canonical units，streamTotalPages时要求已处理数覆盖，PDF还要求OCR状态complete及每target已完成；DOCX/Markdown直接ready。qc将非有限/越0..1分数归unknown，<0.8归low。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:35445–35488；.data/research/lawbot-2026-10-13/readable/renderer.js:4519–4537；.data/research/lawbot-2026-10-13/readable/renderer.js:36746–36792

余缺：child确认的几何/策略由UI/规则合同支撑；不以Gc计数门证明页内容完整或识别正确。

## SC04 xy2准备阶段和取消的副作用界线

- 入口Ql2/Io2/Co2/Sp2拦截，++To2作为准备代际；vy2用awakeNow判断30秒slow/120秒stalled，等确认时不计。by2只增加代际清准备状态，yy2在若干await后检查，未中止已经开始的外部操作。
- 协作先Gc筛ready并要求ai_process_restore的模式含pseudonym，给不完整文档逐job diagnostic(吞错)+fail(要求success)。零可用时finishBatch或最后失败job送le2；其他情况se2统计。
- await Yt/zm2后检查代际、导出集合ready/存在；非协作检查vh2快照和图片/kh2/失败文档提示。统一假名先注册所有ready并Um2，再lr2未解析计数门。
- 输出目录取协作配置、文件夹createFolderOutput或Ui2；需非空字符串。统一项目假名表saveMapping先于qa2解锁与正式started，检查success但不回滚目录/假名表；取消可保留准备副作用。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:36866–37030；.data/research/lawbot-2026-10-13/readable/renderer.js:30795–30803；.data/research/lawbot-2026-10-13/readable/renderer.js:31900–31924

余缺：真实重复事件/取消时序R0；Um2、lr2、vh2语义复用政策/UI合同，本节不重新宣称全部策略分支闭合。

## SC05 xy2逐文件写入、失败分类、交付回执

- 固定o3顺序逐件，Rp2/N3停止后续；每件重查ready/vh2，unsafeEmptyMarkdownExport拒绝。Am2读源，folder gg2定位，协作reportStatistics后prepareExport。该两步在局部apply try之外，transport异常直接落整批catch。
- 主apply构造source/temp/canonical/PDF旋转删除/模式/人工项，协作非交互指定prepare回执路径；automatic强制移页眉页脚/批注。Hc对普通异常或Wc报告不通过尝试visual fallback，cancel和APPLY_RESULT_UNCONFIRMED绝不fallback。Wc仅允许success或MD-W101/102/103且coverage>=1、无四类内容issue的degraded。
- 主apply cancel停止；主apply RESULT_UNCONFIRMED记录Io2(requestId)并停止；其他主apply失败保留Markdown draft并继续。附加MD catch只特判Kn2取消，APPLY_RESULT_UNCONFIRMED落普通失败分支，记C3后仍可入i3并继续下一件，不设置Io2/I3停止；所以未知写入保护并非覆盖所有输出。附加MD失败可留下主文件，失败并不等于未写文件。
- 协作缺必要mapping时fail；其余入i3交付候选。MD失败仍可能入i3，而最终先按C3逐项fail，再releaseExport；主服务failed不在允许release状态，因此这条条件分支会被INVALID_STATE拒绝，不能声称部分失败稿仍交付成功。
- 未知结果分支保存审查/提示勿重复，不release；取消分支写foldermanifest(若有)后返回审查，已写文件保留，未执行后续协作fail/release。正常协作自动模式先Du2+saveTo私有TMM，仅第一i3的reviewOutputPath；失败中止交付。
- 逐件release回执success+job才计数，否则fail；最终finishBatch或最后成功job，要求success+job，再le2与可选G2。内层catch U2只按传入快照允许态标fail且吞transport错；finally Sp2=false/Lp2，外层同样收尾，不是跨文件事务或exactly-once证明。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:37031–37164；.data/research/lawbot-2026-10-13/readable/renderer.js:4505–4518；.data/research/lawbot-2026-10-13/readable/renderer.js:36182–36185

余缺：Jp2逐格式写入叶子沿既有format/policy/EC合同；Io2后续人工确认交互需应用运行验证，尚不能证明磁盘与renderer计数永远一致。

## SC06 主服务prepare/release/finish门与写入顺序

- prepare/release/finish以job锁串行，prepare允许human_review/ready/analyzing/rejected，按artifactVersion+1生成固定受控路径；创建目录并unlink output/md/fallback旧路径，不设置building状态，也不验证前一次renderer是否仍持同版本准备票据。
- release要求当前状态允许、路径等于重新preparedExport，receipt绑定sourceIdentity+输出字节；仅maskingMode（默认pseudonym）为pseudonym且statistics.entityCount!==0时，要求受保护lpm、非空批准token且<=5000、文本稿实际包含批准token；其余分支h2=[]。safeName敏感比较只包含trim后长度>=2的原名/实体；要求的original/MD均验普通非symlink非空及receipt。
- visual fallback验受控路径、receipt、PDF/PNG/JPEG头及lpm索引，无法在此从视觉像素证明token出现。releaseBuffer先save building，再wx写交换件，删除原路径/原名/entities，再存SHA/approved counts/version与ready/completed；失败可能遗留building或交换文件，无全局回滚。
- finish所有child必须ready/completed/failed；combined校验子artifact或MD receipt，合并token必须由项目lpm覆盖，wx写MD并releaseBuffer；已有父artifact直接返回。普通批次按子状态汇总，fail不允许completed/round_completed/cancelled但允许其它改failed。
- 据此交付完成不由前端toast单独决定；同job prepare与release各自有锁，但跨renderer整段prepare→apply→release没有一个锁覆盖，版本交错的运行可达性未测。

证据：.data/research/lawbot-2026-10-13/readable/main.js:23378–23451；.data/research/lawbot-2026-10-13/readable/main.js:23452–23546

余缺：receipt生产/内存持久边界见export-cancel-invariants；底层ZIP解析/native写入和外部AI读取不在此证明。

## SC07 还原面板认证、批量选择与执行

- ee2仅并发复用一次restoreSessionToken promise，finally清m2；success且非空token才d2=true。ae2读取mapping区分locked/未配置与读取失败；协作从pendingRestore路径和mapping绑定，restore_failed不自动重跑，非standalone且输入/mapping齐全才ie2自动开始。
- 单文档mapping名推荐剥离扩展名及多个已脱敏/假名化/已回填后缀，包含关系匹配，并非内容身份校验；批量仅显示project mapping，Word/Markdown混合仅UI禁用下一步。
- de2每次先ee2，再仅当mapping路径改变时inspect；inspect成功缓存x2=path。开始后批量需输出目录，取消清token/回第二步；还原前又ee2，选择markdown/office单个或batchAPI。单个协作传preserveExistingOutput；路径使用斜杠拼接。
- success置UI成功并emit restored计数/residualTokenCount:0；partial保留结果并emit failed；canceled回步骤2要求重新认证；catch错误emit failed。没有在本函数扫描回填输出算residual；onRestoreProgress不按job/request过滤，卸载只解绑不取消在途restore。
- 确认待保存(i2由completionError前缀或job.pending标志)时ae2阻止重跑；重试有本地stats则重新emit restored，无stats才retryConfirmation。普通失败retryRestore成功后ie2，standalone回步骤2。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:28606–28797；.data/research/lawbot-2026-10-13/readable/renderer.js:28798–28803；.data/research/lawbot-2026-10-13/readable/renderer.js:28809–28827

余缺：第三方Office写回/真实文件残余token必须运行验收；多个window共享progress真实交错R0，不能由本地列表推荐证明mapping正确。

## SC08 还原完成父消费与主服务重试

- 父de2按roundId分restoreCompleted/standalone，transport失败仅F2提示不要重跑；success+job后只匹配当前job:round才关面板和finish队列，过期回执discard等待项。he2没有catch transport；pe2在无job或当前状态非waiting_for_restore_approval/restoring时直接关闭/finish；仅这两个状态先await he2并要求当前job确为restore_failed后关闭。
- main retryRestore要求restore_failed、非standalone需有效最后round且id匹配，pending确认禁止重跑；重读已校验输入hash再变restoring。changeRestoreDirectory只在failed/waitapproval且非pending，normalize/mkdir/access后save。
- markComplete先保存replacementCount和pending=true，再校验输入hash，复制的是仍假名化的已校验输入到新交换件，生成approvedTokenCounts/artifact并round_completed；不是重读原文回填输出验证。异常持久restore_failed/pending，重试confirmation复用完成流程。standalone无该输入hash复制，保存计数并清requestedSource后完成。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:30932–30964；.data/research/lawbot-2026-10-13/readable/main.js:23322–23335；.data/research/lawbot-2026-10-13/readable/main.js:23734–23777

余缺：本轮闭合的是回执编排条件；真实回填输出、磁盘失败、远端消费均R0；服务save/store恢复机制复用deep-collaboration而非重审。

## SC09 AuthDialog完整phase与恢复消费

- capabilities规范化系统认证/密码/初始化/已解锁，legacy优先；setup已有密码直接100ms成功；已初始化未解锁只能系统认证后添加密码，无system则unavailable。getCapabilities失败回退hasPassword，错误默认false可显示setup，main仍需验证。
- O2 requestSystemGrant成功需token；setup流程只转set-password不向外emittoken，其余600ms emit。B2 verify只检查success就emit token，F2 set在verify-or-setup追加verify并要求token；该后半失败明确密码已设置。legacy迁移成功emit，无本层全程busy锁。
- 恢复createRequest可resume exported，save取消不推进，import成功才f2允许complete，complete清密码回verify。退出恢复只清UI不调用cancelRecovery；unmount清三密码但不清100/600ms setTimeout，无pending请求代际，晚回执/晚emit需运行验证。
- qa2并发共用Ka2，已初始化且unlocked直接true，否则等待AuthDialog；父只依据认证方式字符串判true，不携带token用于workspace。workspace openDialog读hasPassword、按锁定状态prompt；openRecent先试open，仅locked才prompt后再试。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:28438–28601；.data/research/lawbot-2026-10-13/readable/renderer.js:31886–31924；.data/research/lawbot-2026-10-13/readable/renderer.js:3705–3720；.data/research/lawbot-2026-10-13/readable/renderer.js:3844–3872

余缺：系统helper/OS安全存储/官方恢复签发服务仅旧静态边界与外部运行，未激活或执行。

## SC10 应用菜单/密码更改/法律文档展示

- 菜单打开刷新capabilities，挂载Promise.all许可和capabilities后才绑pointerdown/keydown，卸载清submenu timer及监听。密码旧值watch失效验证状态；check成功后才允许>=4的新密码，change匹配后submit，异常提示结果未知，成功清所有输入。
- 法律文档只映射agreement/product-intro/privacy-policy三个文件；watch发异步读取，无请求代际/取消，快速切换晚响应可覆盖d2。格式器先escape &<>双单引号，再有限粗体/行内代码/heading/quote/列表，不运行原HTML。列表自编号及缩进；非完整Markdown解析器。
- clipboard传输密码调用writeText且验证success；receiveTransfer需当前非dirty，success有data才applyReceivedWorkspace+emit，取消无data直接return。窗口关闭会清传输密码/修改密码UI。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:28089–28382

余缺：接收副本后重开逐格式消费者由workspace报告；DOM实际渲染与悬浮计时交错R0。

## SC11 软件升级store/dialog/root生命周期

- Ru initialize标initialized后订阅再getState，失败保持initialized并error；dispose解绑置false。onState无revision，getState晚回复可覆盖刚收到的新state；只有check回执checking遇available/downloading/ready保留较新state。
- 偏好manual全false/notify仅check/automatic全true，custom保持各项；save设置setupCompleted，成功关对话框，失败或transport给未确认。download先关窗口，失败再开status；restart/ack分别展示未知状态，不把异常当成功。
- App挂载get-env不await，绑online/offline；get-status已激活才initialize否则license路由；watch离开license也initialize。卸载online/offline与update.dispose。路由beforeEach对requiresLicense每次get-status，失败或未激活跳license。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:4027–4180；.data/research/lawbot-2026-10-13/readable/renderer.js:3574–3580；.data/research/lawbot-2026-10-13/readable/renderer.js:37826–37836

余缺：electron-updater真实下载/签名安装/退出行为未运行；不能把菜单状态等同升级成功。

## SC12 授权页与导出署名消费

- 授权页get-status成功取machine/version/customer/到期，remainingDays缺失则date差；activated且production安排0或3000ms导航dashboard；失败再getMachineID。激活trim密钥→activate，success再b2(true)回读，并清输入；异常提示结果未确认。
- 挂载先app:get-env再status，fallback mode development/version0.3.0；copy机器码走navigator.clipboard，异常alert。定时导航/复制标记/200mscontextmenu probe未见unmount清理。
- Wv2导出署名race1.5秒status，仅字符串customer否则空；finally清timer，不取消IPC。app.getVersion/get-summary/refresh当前无published renderer调用，不能凭接口存在发明按钮。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:37559–37636；.data/research/lawbot-2026-10-13/readable/renderer.js:35675–35686

余缺：授权状态真实性/外部吊销服务/激活流程本轮仅只读；未获取或伪造许可。

## SC13 窗口、网络、系统事件的实际消费

- Window controls最小化/最大化捕获异常；toggle后重读isMaximized；三个review组件resize更新dimensions并查maximized，失败false。beforeClose异步prepare-close await但不检查false；save后不复核isDirty即discard/allow（ITER018已指出）。
- net sn2直接把统计对象写He2并以!offline更新online，2秒轮询可重叠、无请求代际；visibility隐藏停timer，卸载清timer/监听，已发IPC不取消；错误保留旧值。
- app openPath consume/event均调用Od2不await，因此外层catch不覆盖openRecent/后续Nd2全部reject；Od2先openRecent后Nd2恢复，失败显示recent UI；卸载try解绑Dc2，不取消在途open。
- taskPower仅darwin订阅；wc按revision严格增加更新，awakeNow扣累计睡眠；每次新event uc2清debounce→snapshot→Ec2(true)，初次getState只update不触发save。监听可重入多次uc2，存储串行责任在workspace；卸载解绑。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:3945–4026；.data/research/lawbot-2026-10-13/readable/renderer.js:6641–6650；.data/research/lawbot-2026-10-13/readable/renderer.js:22408–22417；.data/research/lawbot-2026-10-13/readable/renderer.js:27063–27072；.data/research/lawbot-2026-10-13/readable/renderer.js:31394–31413；.data/research/lawbot-2026-10-13/readable/renderer.js:31510–31512；.data/research/lawbot-2026-10-13/readable/renderer.js:32859–32876；.data/research/lawbot-2026-10-13/readable/renderer.js:33364–33373；.data/research/lawbot-2026-10-13/readable/renderer.js:33133–33148；.data/research/lawbot-2026-10-13/readable/renderer.js:4255–4269；.data/research/lawbot-2026-10-13/readable/renderer.js:32799–32819

余缺：Nd2逐格式恢复见ITER019 workspace组；本节不扩大为全部workspace关闭/恢复完成。

## SC14 样例、DOCX恢复、外链及日志

- 内置样例read成功要求字节>=1024，然后Kg2 replace，才进onboarding step2；失败统一提示，finally释放busy。恢复DOCX安全模式先删localStorage，IPC失败吞掉，仍显示已恢复且清Fe2，因此UI提示不证明主进程已reset。
- DOCX点击a[href]阻止默认和传播，仅http(s)才openExternal，无await/catch回执；真正shell策略在main合同。日志7个invoke点都fire-and-forget，try只捕获同步错，async reject不在本地catch。global error/unhandledrejection监听不卸载；preload独立send日志与main.handle传输不匹配保留旧结论。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:31453–31467；.data/research/lawbot-2026-10-13/readable/renderer.js:7447–7467；.data/research/lawbot-2026-10-13/readable/renderer.js:10058–10065；.data/research/lawbot-2026-10-13/readable/renderer.js:7583–7593；.data/research/lawbot-2026-10-13/readable/renderer.js:10329–10335；.data/research/lawbot-2026-10-13/readable/renderer.js:31971–31981；.data/research/lawbot-2026-10-13/readable/renderer.js:37856–37870

余缺：未把无效send日志计为成功接收；外部浏览器/剪贴板/磁盘log实际结果R0。

## 系统 53 入口逐项 inventory

| 稳定 ID | 通道 | 当前发布调用 | 本轮语义节 |
|---|---|---|---|
| IPC-ba48a535d0b1 | auth:get-capabilities | renderer-consumer-body-read | SC04,SC09,SC10 |
| IPC-5634886c31f2 | auth:request-system-grant | renderer-consumer-body-read | SC09 |
| IPC-f96c39b98bc8 | auth:set-password | renderer-consumer-body-read | SC09 |
| IPC-5f5d0e7e7171 | auth:has-password | renderer-consumer-body-read | SC09 |
| IPC-251d99e85000 | auth:verify-password | renderer-consumer-body-read | SC09 |
| IPC-4567d2cc2f1d | auth:check-password | renderer-consumer-body-read | SC10 |
| IPC-1a2923d565e2 | auth:migrate-legacy-password | renderer-consumer-body-read | SC09 |
| IPC-69f3f32b9683 | auth:change-password | renderer-consumer-body-read | SC10 |
| IPC-9ac7b5cfa48e | auth:lock | no-published-renderer-caller | 无发布调用 |
| IPC-82ace6842a00 | auth:restore-session-token | renderer-consumer-body-read | SC07 |
| IPC-8f0322abb8b8 | auth:create-recovery-request | renderer-consumer-body-read | SC09 |
| IPC-34a47a0ff8e1 | auth:save-recovery-request | renderer-consumer-body-read | SC09 |
| IPC-243bf096202b | auth:cancel-recovery | no-published-renderer-caller | 无发布调用 |
| IPC-2a09a00cba17 | auth:import-recovery-file | renderer-consumer-body-read | SC09 |
| IPC-3484537f3350 | auth:complete-recovery | renderer-consumer-body-read | SC09 |
| IPC-b67938c0cb2f | app:consume-open-path | renderer-consumer-body-read | SC13 |
| IPC-a11af873aa1a | app:open-path | renderer-consumer-body-read | SC13 |
| IPC-28d93302bd32 | app:write-clipboard-text | renderer-consumer-body-read | SC10 |
| IPC-a26e3c125cb6 | app:get-env | renderer-consumer-body-read | SC11,SC12 |
| IPC-611ab311c5f6 | app:get-version | no-published-renderer-caller | 无发布调用 |
| IPC-5d7065a40d45 | app:read-legal-doc | renderer-consumer-body-read | SC10 |
| IPC-65f32fe31f76 | app:read-onboarding-sample | renderer-consumer-body-read | SC14 |
| IPC-499bd8d4596b | app:open-external | renderer-consumer-body-read | SC14 |
| IPC-7f4cfe68e159 | app:export-crash-log | no-published-renderer-caller | 无发布调用 |
| IPC-f5725b5e0d8a | app:get-docx-safe-mode | no-published-renderer-caller | 无发布调用 |
| IPC-2e9ce1df9fec | app:reset-docx-safe-mode | renderer-consumer-body-read | SC14 |
| IPC-e25810712ab1 | app:set-docx-safe-mode | no-published-renderer-caller | 无发布调用 |
| IPC-a70191351664 | license:get-machine-id | renderer-consumer-body-read | SC12 |
| IPC-0dcec6bac9d5 | license:get-status | renderer-consumer-body-read | SC10,SC11,SC12 |
| IPC-d79e3892b954 | license:activate | renderer-consumer-body-read | SC12 |
| IPC-527f74c7a029 | license:refresh | no-published-renderer-caller | 无发布调用 |
| IPC-765d8b00f827 | license:get-summary | no-published-renderer-caller | 无发布调用 |
| IPC-e436786bb1f7 | window:minimize | renderer-consumer-body-read | SC11,SC13 |
| IPC-b148b8418b82 | window:toggle-maximize | renderer-consumer-body-read | SC11,SC13 |
| IPC-ed495037f8dc | window:is-maximized | renderer-consumer-body-read | SC13 |
| IPC-3a73e0100026 | window:close | renderer-consumer-body-read | SC13 |
| IPC-ce03744a77ef | window:before-close | renderer-consumer-body-read | SC11,SC13 |
| IPC-1e94f610b0e1 | window:resolve-close | renderer-consumer-body-read | SC13 |
| IPC-978012face0b | net:set-offline | no-published-renderer-caller | 无发布调用 |
| IPC-f8d8e4c7c379 | net:get-stats | renderer-consumer-body-read | SC13 |
| IPC-539465a49a9b | net:reset-stats | no-published-renderer-caller | 无发布调用 |
| IPC-4e269deca69e | software-update:get-state | renderer-consumer-body-read | SC11 |
| IPC-a73b27802b39 | software-update:set-preferences | renderer-consumer-body-read | SC11 |
| IPC-6099fda9db85 | software-update:check | renderer-consumer-body-read | SC11 |
| IPC-1e8858b1ed43 | software-update:download | renderer-consumer-body-read | SC11 |
| IPC-1abcdf6d1a56 | software-update:acknowledge-whats-new | renderer-consumer-body-read | SC11 |
| IPC-67a324d00c09 | software-update:restart-and-install | renderer-consumer-body-read | SC11 |
| IPC-6cb1afcdadfc | software-update:state | renderer-consumer-body-read | SC11 |
| IPC-6f5f29f520a1 | task-power:get-state | renderer-consumer-body-read | SC13 |
| IPC-cfbe72c62d81 | task-power:state | renderer-consumer-body-read | SC13 |
| IPC-73870d051b3f | debug:get-paths | no-published-renderer-caller | 无发布调用 |
| IPC-429f13ae0835 | electron:save-pdf-to-desensitized | no-published-renderer-caller | 无发布调用 |
| IPC-7c61ecffef61 | log:renderer-error | renderer-consumer-body-read | SC14 |

## 未覆盖层

- Zg2/Nv2/xy2与restore面板/父回执/主prepare-release-finish均实际读；逐格式Jp2/receipt/策略沿已命名报告，不等于全业务等价。
- 第三方DOCX动态资源装载与多窗口源身份消费者仍需各自范围；本轮Og2密码连接已经逐分支读。
- 53 inventory中有调用者的消费体已读，无调用者保留静态无引用；workspace Nd2/Ec2/存储叶子接专门报告，不能用inventory替代全文语义。
- 真实事件重入、磁盘write/abort/timeout、许可/系统认证/升级安装、模型/Office库与AI远端均没有执行验证。
