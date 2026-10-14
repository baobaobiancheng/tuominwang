# 协作 renderer、诊断与事件生命周期补读

只读公开发布包中的可见代码；补DEP34/41的renderer协作调度、诊断、事件解绑与缓存身份；不执行竞品

维持 S2 / R0；无提级候选。

## CE01 open-job生产、单槽及两个renderer消费者

- 主进程c2先覆盖s2单槽；找绑定主窗口并restore/show/focus；loading时once did-finish-load，否则立即send。发送不清s2；consume仅认可主frame且绑定窗口后取出清槽。closed仅删r2/pe。窗口重建或consume与event交错可收到旧/重复快照，未有事件序号去重。
- preload回调转发job并返回精确listener的removeListener；Dashboard mount先发consume异步请求，再装onOpenJob。两个回调都调用le2但不return/await，因此consume promise的catch不覆盖le2异步reject。卸载try调用Oc2并置null；已开始的le2没有unmount abort。
- 第二消费者协作任务列表mount listPending，openJob再刷新，unmount取消监听；i2自己catch错误但无请求版本，晚返回列表可覆盖新列表。

证据：.data/research/lawbot-2026-10-13/readable/main.js:24358–24388；.data/research/lawbot-2026-10-13/readable/main.js:24436–24452；.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:28–41；.data/research/lawbot-2026-10-13/readable/renderer.js:32858–32876；.data/research/lawbot-2026-10-13/readable/renderer.js:33134–33152；.data/research/lawbot-2026-10-13/readable/renderer.js:28405–28422


## CE02 AF/Kc两队列与le2状态变更

- AF只在busy且当前job存在且不同job时延后；同job不串行。Map按job更新值保留插入顺序；completed/round_completed/cancelled会删waiting项。take取最早项。Kc按job:round/standalone管理active，另一key入Map；同key立即接受；finish只匹配active后取下一项，discard仅删waiting。均非互斥锁。
- le2 defer先于diagnostic；diagnostic调用fire-and-forget且catch空。restore相关状态先offer；round_completed在活跃restore面板时直接忽略；cancelled/completed执行A2恢复enabled备份、清y2/b2/w2再K2。A2仅还原We2、清x2/k2，未恢复Ne2.isUnifiedMode等全部设置。
- waiting_human_review首次应用profile/ruleset(大小写无关id/name)、entityTypes、batch统一假名。w2在成功后登记；失败toast后await fail，fail transport rejection可外冒。异步refresh/import之后不统一复核当前job，也未全面序列化le2。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:4483–4507；.data/research/lawbot-2026-10-13/readable/renderer.js:28424–28433；.data/research/lawbot-2026-10-13/readable/renderer.js:30775–30810；.data/research/lawbot-2026-10-13/readable/renderer.js:30829–30873


## CE03 le2材料导入/停放审查/还原通知

- 还原key首次先B2.add，再尝试Jc2→saveTo/Ec2；保存失败仅warning，仍parkReview并打开还原面板。B2意味着该轮不会自动再次停放。
- 有sourceRequest.paths且waiting_human_review首次P2.add，映射文件后Kg2(replace)，验证每个路径在Qe2中存在sourceRef.id；失败P2.delete并U2逐子/父fail，U2吞transport错误。autoEnterReview调用Zg2不await，其异步失败不在此import catch内。
- 授权ue2设置T2 finally复位，固定allowRedactionPath/RestorePath/SanitizedDelivery/autoEnterReview/createExchangeFolder=true，自动还原限secure_review；override是UI两开关。拒绝ce2成功恢复设置/清当前，不直接K2。
- 统计qc计总数、未知分数(非有限/超0..1)、低分<0.8；ready文档按文档N.docx安全名。自动导出O2先add再xy2/Nv2；本函数没有失败时删O2，U2删。
- de2区分round/standalone回执；transport失败提示重试确认而非再次还原。round_completed仅当前job+round匹配才关面板/finish下一项；旧回执discard等待项。he2没有本地transport catch；pe2要restoreFailed确认为失败后才关并推进队列。

证据：.data/research/lawbot-2026-10-13/readable/renderer.js:30814–30828；.data/research/lawbot-2026-10-13/readable/renderer.js:30874–30982；.data/research/lawbot-2026-10-13/readable/renderer.js:4521–4530

未闭合：Kg2、Zg2和逐格式xy2/Nv2的完整导出生命周期仍需相应UI/导入报告；此节读的是协作调度分支，不代替全部格式实现。

## CE04 OCR诊断真实输出及健康检查

- cs按平台一次缓存adapter：darwin Vision仅reason/engine/available/version/platform/arch摘要，不写诊断文件也不返回filePath；Paddle委托processor。IPC直接返回summary/filePath；无字段脱敏层。
- Paddle摘要含python/script/model/fallback绝对路径、版本stdout、错误状态，版本错误stderr限500/message300，import paddleocr stderr全文，传入原stderr全文；Windows检查5 DLL/4 pyd。execSync分别10s/30s timeout。
- Paddle写userData/ocr_diagnostics/ocr_diagnostic_ISO.log，fallback APPDATA或相对lawbot-redaction-cat。mkdir/write失败吞掉；filePath在write前赋值，返回路径不证明文件写成功。
- checkAvailability spawn import探针未配置timeout，stdout累积；primary失败再fallback；全失败触发不await诊断，checkAvailabilityWithDiagnostic又收集一次。renderer mount Promise.race 5秒超时分支直接return，未杀后台探针，re2可保持undefined，不等于available已确认。
- 复制按钮只把四个路径存在布尔、收集状态、受限errorCode、mode和时间写clipboard，不复制原始摘要/路径。Vision摘要不匹配Paddle正则因而显示未确认。3秒idle计时器无局部unmount取消。

证据：.data/research/lawbot-2026-10-13/readable/main.js:4599–4661；.data/research/lawbot-2026-10-13/readable/main.js:7954–8034；.data/research/lawbot-2026-10-13/readable/main.js:18761–18776；.data/research/lawbot-2026-10-13/readable/renderer.js:29298–29329；.data/research/lawbot-2026-10-13/readable/renderer.js:31982–31993


## CE05 两处应用progress监听与生产端

- 应用IPC onProgress静态调用点两处：seal补检31261和Dashboard Ra2 31804；PDF.js onProgress不属该IPC。seal要求eu2及payload.requestId都匹配，finally局部d3解绑，再匹配request清busy。
- Ra2只装一次ya2，卸载ya2/ba2并wa2；apply要求活跃Sp2与requestId=_p2，有限sequence<=旧序号则忽略，其余刷新heartbeatAt并阶段；detect必须非空requestId=pa2，可选fileName匹配。markdown-source-ready/matches、PDF阶段/百分比、image bbox分别更新。
- main detect/docx-image payload先requestId再spread上游对象，若上游有同名可覆盖；apply反过来最终写requestId/递增sequence/heartbeatAt，5秒heartbeat并finally clearInterval。取消发canceled进度。旧单文件PDF处理取第一个BrowserWindow发送，无requestId，故Ra2将忽略旧式progress。

证据：.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:174–189；.data/research/lawbot-2026-10-13/readable/renderer.js:31249–31284；.data/research/lawbot-2026-10-13/readable/renderer.js:31803–31887；.data/research/lawbot-2026-10-13/readable/main.js:17154–17181；.data/research/lawbot-2026-10-13/readable/main.js:17198–17221；.data/research/lawbot-2026-10-13/readable/main.js:17389–17401；.data/research/lawbot-2026-10-13/readable/main.js:17435–17444；.data/research/lawbot-2026-10-13/readable/main.js:17917–17931；.data/research/lawbot-2026-10-13/readable/main.js:17991–18007


## CE06 三处page监听：身份、旧事件及解绑

- preload onPageProcessed只传(_event,result)，三处应用注册33068/34203/35818。三处都接受缺requestId的旧payload；提供requestId时才比较。resume比pa2和可选fileName后处理；batch先go2 session/文档仍在/pa2，再可选request；single先eh2代际/pa2，再可选request。
- batch/single的docx_progress分支在fileName检查之前return；故缺requestId的旧DOCX progress并不由filename隔离。PDF旧处理向首窗口发fileName且无requestId，文件名相同的旧事件不能由这些可选守卫保证排除。没有宣称所有事件按request隔离。
- resume先解绑旧ba2，finally无条件解绑当时全局ba2并清Gn2（pa2仅同id才清）；batch finally仅pa2相同才清共享ba2；single finally仅eh2代际相同才清。均把解绑当时保存的函数或全局函数调用，未给事件队列做序号去重。
- 成功、暂停、打开workspace、退出审查及组件卸载各有显式解绑；卸载不是后端任务自动取消证明。resume finally无条件共享槽解绑存在重入时误解绑后一个监听的静态条件，未运行复现。
- page消息分text_ready/plan/table/control/OCR，维护有序page文本、去重实体、完成页/目标页/cache；完成状态由target coverage和最终failures回执修正，不以最后page号等同全部OCR成功。

证据：.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js:182–189；.data/research/lawbot-2026-10-13/readable/renderer.js:33054–33131；.data/research/lawbot-2026-10-13/readable/renderer.js:34175–34281；.data/research/lawbot-2026-10-13/readable/renderer.js:35755–35927；.data/research/lawbot-2026-10-13/readable/renderer.js:35972–36016；.data/research/lawbot-2026-10-13/readable/renderer.js:33260–33271；.data/research/lawbot-2026-10-13/readable/renderer.js:36136–36148；.data/research/lawbot-2026-10-13/readable/renderer.js:37326–37341

未闭合：事件union上游全部嵌套数据字段/第三方模型输出未穷尽；真实时序与重入可达性R0。

## CE07 缓存三层与release键不一致

- engine su cache key是SHA256前16hex，key生成原样返回；get刷新Map顺序，lookup不刷新；max10和128MiB估算。set先驱逐旧项，若单条>128MiB且缓存已空仍会插入，非硬内存上限。clear按bufferHash或fileName相等匹配；传空对象不等于清空。
- main _f/If源缓存key source:id或filename，Nf写入后按>50或>128MiB循环淘汰，可把超大新项自身淘汰；Af页号只finite Number，并非正整数限制。vf读不刷新顺序。Tf/Of仅结构转换，无bbox强校验。
- renderer xu2需正整数page，Number||0转换尺寸/bbox但不限制负/Infinity；cache页覆盖同页排序，无本层数量/字节上限；single Fr2、batch pdfOcrCachePages分别维护。
- sourceRegistry无路径buffer登记立即完整64hex SHA256；source release按其完整bufferHash调用su.clearOcrCache且未传fileNames。已观察engine正常set输入来自16hex calculateBufferHash，因此这种源登记/识别路径释放时64hex!=16hex，removedEngineCaches可为0而engine项保留待淘汰。source _f缓存仍被删。未运行vendor，不能说所有源在所有识别路径都命中此条件。

证据：.data/research/lawbot-2026-10-13/readable/main.js:9039–9064；.data/research/lawbot-2026-10-13/readable/main.js:9400–9405；.data/research/lawbot-2026-10-13/readable/main.js:9421–9438；.data/research/lawbot-2026-10-13/readable/main.js:15335–15382；.data/research/lawbot-2026-10-13/readable/main.js:15762–15774；.data/research/lawbot-2026-10-13/readable/main.js:17047–17064；.data/research/lawbot-2026-10-13/readable/main.js:11060–11065；.data/research/lawbot-2026-10-13/readable/main.js:11591–11597；.data/research/lawbot-2026-10-13/readable/main.js:11285–11292；.data/research/lawbot-2026-10-13/readable/main.js:12311–12318；.data/research/lawbot-2026-10-13/readable/main.js:12449–12456；.data/research/lawbot-2026-10-13/readable/renderer.js:32526–32539

未闭合：模型缓存之外的GPU/native/第三方对象释放、所有sourceRef重开恢复消费者不在本节；不证明进程内全部文本缓存清零。
