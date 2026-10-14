#!/usr/bin/env python3
"""Build a static, per-stable-ID collaboration audit. Never runs vendor code."""
from pathlib import Path
import json,hashlib,re,sys
ROOT=Path(__file__).resolve().parents[3]
BASE='.data/research/lawbot-2026-10-13'
OUT='文档/逆向台账/contracts'
def read(p):return json.loads((ROOT/p).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def ref(path,a,b):
 lines=(ROOT/path).read_text().splitlines(keepends=True)
 assert 0<a<=b<=len(lines),(path,a,b)
 return dict(path=path,start_line=a,end_line=b,slice_sha256=sha(''.join(lines[a-1:b]).encode()),range_unit='inclusive lines retaining original newline')
M=BASE+'/readable/main.js'; T=BASE+'/extracted/lawbot-mcp/tools.js'; C=BASE+'/extracted/lawbot-mcp/gatewayClient.js'; S=BASE+'/extracted/lawbot-mcp/server.js'; D=BASE+'/extracted/lawbot-mcp/aiDiagnostics.js'; B=BASE+'/extracted/lawbot-dsh/bridge.js'; H=BASE+'/website/home-1.js'; U=BASE+'/static-updater/node_modules/electron-updater/out/'
idx=read(OUT+'/deep-collaboration-source-index.json'); methods=idx['methods']; bykey={m['key']:m for m in methods}
def fn(name,cls='qw',path=M):
 return next(x for x in methods if x['name']==name and x['class']==cls and x['evidence']['path']==path)
def references(*specs):return [ref(p,a,b) for p,a,b in specs]
findings=[]
def finding(id,title,detail,ranges,boundary):
 findings.append(dict(id=id,title=title,observation=detail,evidence=references(*ranges),remaining_boundary=boundary))
finding('COL-01','导出回执为有界进程内 Map','回执以 resolve(exportPath) 为键，source 是规范原路径 SHA256（Windows 小写），hash 是输出 bytes SHA256；上限512，超限移除最早插入项。仅导出管线17893–17896在 Markdown 报告门槛及 textLayerNotDeleted=false 时 record。verify 不验证敏感信息识别完整性；重启丢失回执。',[(M,50,59),(M,17891,17898),(M,23470,23529),(M,24336,24336)],'格式转换/识别本身由文档组审查；回执不等于算法正确性。')
finding('COL-02','源快照回调并非已校验 bytes 的原子快照','attach 的 readRegularFile 先 lstat 后 readFile，随后 captureSourceSnapshot 传 path+bytes；27004回调调用 dp.register。dp 的有路径分支忽略 buffer、重新 stat/copyIntoManagedRoot；已登记同路径直接复用 sourceRef，不刷新新 bytes。路径检查/读取分离，未使用同一文件描述符绑定。',[(M,23013,23023),(M,23352,23377),(M,27002,27008),(M,15759,15787)],'文件竞态的实际触发未运行；不能宣称内容快照等价。')
finding('COL-03','批准 token 来源是受保护索引','mf.resolveId 限根目录直系 .lpm，文件名36位hex/hyphen；readApprovedTokensByPathForProtectedOperation 读取 readIndex(true).records[].meta.approvedTokens，要求1–5000个、字符串trim非空、<=256，trim去重；没有在该方法读取 .lpm 映射正文核对一一对应。',[(M,15208,15227),(M,27002,27008)],'mf 索引保护/CMK 容器由系统组闭合，索引tokens不证明正文映射可还原。')
finding('COL-04','任务索引恢复与文件归档分离','cx 串行队列读写 jobs-v1.laj；主索引限定恢复错误才尝试backup；保留损坏主文件，备份经 recover 临时文件 rename。写入先copy主文件到backup，再protected write；隔离修复保留主/备后写空索引。只校验job顶层id/state/caller/updatedAt/rounds数组，不逐个校验深层artifact/round路径。df读写绑定objectType/objectId、随机DEK及CMK slot，finally清DEK。无多文件事务/fsync保证。',[(M,23973,24120),(M,15074,15138),(M,24429,24431)],'加密容器/keyHierarchy算法由系统组处理；恢复旧索引不自动重建孤立导出文件。')
finding('COL-05','保存成功与通知/调用成功不同','withJobLock 为进程内job Promise队列，启动请求有进程内锁，并从持久store.listPending按caller/路径/选项/六种未终结状态查询5分钟内候选去重；不是requestId去重。save先持久化，再诊断/UI通知/changeWaiter；UI回调抛错可发生在持久化之后。releaseBuffer先存building，再写wx交换件，后保存ready；中途失败可能遗留building或孤立文件。',[(M,22938,23040),(M,23155,23196),(M,23537,23555)],'无崩溃注入实测；存储与OS故障组合不由静态检查证明。')
finding('COL-06','成果校验字段的真实含义','submitResultOnce 校验job/当前round/slot/来源artifact及reportSources、文件格式大小/非空/hash；Yw仅提取word/document/header/footer/comments/footnotes/endnotes XML并剥标签，Ww按子串计数。validation.valid 固定true，missing/unknown/malformed/declaredChangeCount 固定0；并非token完整性/新增敏感内容检查。重试若已有valid且提供sha只比较存储submittedSha256，无须重读slot。',[(M,22898,22915),(M,23627,23667)],'ZIP解析器/文档内容算法另组；不可把固定零值解释为全面扫描通过。')
finding('COL-07','持久交付与冻结还原输入','archiveSanitizedResult 保存至授权脱敏目录，安全stem+job尾号+round，10次wx重试；EEXIST且hash相同复用。freezeRestoreInput 写private-restore-input job/round_hash，wx同hash复用；hash不符拒绝。归档/冻结在最终job保存前，失败可留文件，重试有局部hash幂等，但无请求级exactly-once。',[(M,23611,23626),(M,23631,23679)],'无断电/磁盘满回归；外部AI输出质量不可由提交协议保证。')
finding('COL-08','还原完成通知不重新验证输出','restore-completed 信任renderer replacementCount并将residual设0；先存restoreCompletionPending，再验证冻结输入hash、把冻结的假名输入写为下一轮交换件、再存round_completed。异常写restore_failed/pending；retry-confirmation仅补确认。standalone两次保存但无相同catch。recoverInterruptedRestores只将restoring置restore_failed；building等不统一回滚。',[(M,23330,23351),(M,23726,23776)],'实际还原输出与renderer协议由格式组审查；完成通知不是独立残留检测。')
finding('COL-09','授权、取消、续接与长轮询','owned绑定sessionId+adapterId+displayName；resume需本机审批，按顺序锁父子任务并校验交换件/冻结稿/hash/token及授权后转移caller。cancel置状态且保留材料，不终止socket服务或文档worker；restoring不允许取消。wait为0–45秒、状态/更新时间通知+超时{timedOut,retry}；无传输AbortSignal。',[(M,22949,23012),(M,23052,23081),(M,23219,23258)],'renderer文档任务的独立cancel由格式组；客户端离线并不自动转client_disconnected。')
finding('COL-10','网关协议及传输不是请求事务','Unix socket 0600/runtime目录0700，secret64hex，caller3种固定display+session32hex，逐请求授权+已配置connector，14方法白名单。socket55秒，UTF8累计>65536字节destroy；按行并发async分发，不保证响应次序；requestId不建幂等表，socket关闭只移除连接，不取消已启动方法。',[(M,24122,24217),(M,24330,24375)],'授权状态内部/OS peer信任由系统组；未连接或调用真实vendor。')
finding('COL-11','客户端丢失回执会重新发送','GatewayClient.call仅对GatewayTransportError重试一次，复用requestId、重新发现；一般15秒，wait请求按等待时长+5秒。invoke累积响应无显式大小上限、读首行JSON、未核对response.id。discovery核schema/secret/pid存活并ping匹配pid。启动coalesced30秒100ms轮询；pipe关闭/超时销毁客户端socket而不取消服务。',[(C,1,250)],'远端客户端/操作系统运行时不可由本源码证明；不可把同requestId等同幂等。')
finding('COL-12','MCP声明schema与实际执行校验分层','12工具；stdio tools/call不调用JSON Schema校验器，normalize/defaults后依赖服务验证。initialize回传protocolVersion、仅WorkBuddy名称有匹配检查；tools/list等不需通过该匹配。输入>1MiB仅设exitCode=1并return，buffer未清且stdin仍恢复，无即时终止；无notifications/cancelled处理。',[(S,1,89),(T,1,312)],'外部MCP host是否按schema预验证未知；协议声明不是运行证明。')
finding('COL-13','DSH独立入口和受控落槽','原生插件注册11镜像工具并以submit_workspace_result替代submit_reviewed_document。caller来自execution.agent.session.id的SHA256前32位。工作区resolve/contains/lstat普通文件+格式，再向网关取slot，检查exchangeRoot及realpath目录，限定max20MiB/slot.maxSizeBytes，wx临时文件rename落槽，再提交hash。已确认状态重试不覆盖slot。取消只在入口及读取后检查，未传给gateway；validateConstraints只补scalar/array约束，结构约束依赖DSH宿主。',[(B,1,172),(BASE+'/extracted/lawbot-dsh/schema.js',1,38)],'DSH ctx.fs/工具宿主实际实现不在此包，包含检查/取消行为仅由其接口契约约束。')
finding('COL-14','诊断是尽力日志而非审计事务','main kw与MCP AiDiagnostics过滤枚举/ID/计数/错误码及裁剪stack，清洗后排队；所有写失败被吞。轮询相同签名30秒合并；journal>512KiB保留末128行；bundle只读<=1MiB单journal、共<=10MiB、最多近期事件，锁20次25ms，旧锁60秒清理；临时zip rename；保留30天/100MiB。未知错误归INTERNAL_ERROR，可丢失具体错误码。',[(M,22712,22858),(D,1,363)],'不能以无日志证明请求未发生；跨进程竞争/文件系统故障未实测。')
finding('COL-15','连接器配置保存及准备的部分副作用','settings JSON坏/缺失回落默认，selected仅3枚举、verifiedAt合法日期，shareRestorePassword恒false。队列临时rename，无fsync。目录更新先mkdir/W_OK再存settings，失败可留目录。copy-setup先生成DSH文件或配置JSON，再clipboard写回核对，再markSetupPrepared；任一步失败不回滚前序文件/剪贴板。verified只表示历史成功请求。open通过/usr/bin/open spawn成功不证明客户端完成初始化。',[(M,23793,23972),(M,24389,24418)],'客户端安装/剪贴板/文件系统OS实际行为未运行；prepareDshPlugin复制多文件非原子发布。')
finding('COL-16','网页付款状态机仅客户端可见','5路HTTP共用paymentFetch：15秒AbortController，只在fetch resolve后clearTimeout，读JSON失败退{}，非2xx取message抛错。订单本地缓存按sku/payment/ref/offer复用，无客户端幂等键/并发去重。优惠码错误后清码重试原价；contact成功paid+无batchUrl开始轮询，但try内return仍执行finally启用按钮（与注释不同）。每3秒setInterval可重叠15秒请求，无orderId新旧序号门槛；paid清轮询，batchUrl显示并清本地pending，否则补contact/引导。',[(H,120,215),(H,367,381),(H,396,480),(H,604,740)],'服务端创建、支付回调验签、订单权限、幂等、优惠/推荐码规则和batch生成不在公开JS中；不能升级为完整远端契约。')
finding('COL-17','更新源与下载元数据处理','GenericProvider按channel/platform拼YML，404专错，ECONNREFUSED最多3次追加重试(0/1/2秒)；Provider yaml.load无完整schema验证，files优先否则path，require sha2或sha512，resolve URL到feed。Mac先差分失败回退完整zip、下载缓存copy失败仅日志。完整性/安装最终由updater executor/native Squirrel接管。',[(U+'providers/GenericProvider.js',7,48),(U+'providers/Provider.js',14,145),(U+'MacUpdater.js',82,118)],'CDN实时内容/服务端发布与native安装不在可见JS；下载executor/differential深层见系统组。')
finding('COL-18','本地更新HTTP实际路由','绑定127.0.0.1动态port，/要求随机64bytes Basic密码，返回随机128hex.zip URL。zip分支使用startsWith(fileUrl)，未单独验证Basic或HTTP method；非前缀404。stream finish只代表响应结束，readStream error拒绝；autoInstallOnAppQuit=false提前resolve；最终Squirrel update-downloaded/quitAndInstall另一路。',[(U+'MacUpdater.js',118,255)],'不能把HTTP finish等同安装成功；native Squirrel/OS不可由路由JS证明。')
finding('COL-19','状态投影明确分隔本机与外部字段','Rw renderer=true才返回sourceRequest.paths、实体明文、mappingPath及restore输入；默认外部投影仍返回sanitizedExports与sanitizedResult.outputPath等脱敏产物路径。Pw只在exchangePath=true加入受控交换路径并递归attachments。completion residual缺省0，不是扫描。另c2先赋单槽s2再发事件，send成功与窗口closed均不清槽；closed仅删r2/调用pe。只有有效consume读取并置null，或新c2覆盖；进程内窗口重建可能消费旧快照。',[(M,22859,22869),(M,23041,23050),(M,24379,24388),(M,24448,24452)],'投影之外，外部AI自身文件权限不受MCP协议控制；严格隔离需OS权限。')
finding('COL-20','批量与槽位的局部幂等边界','finishBatch要求子项ready/completed/failed；combined读取每份MD并验进程回执，或哈希验证视觉附件；token须被项目映射索引覆盖，最大20MiB，wx写后releaseBuffer。getArtifact派生报告要求统一假名+同映射，记录reportSources供提交时查旧。allocateSlot复用当前未提交round，格式/用途冲突拒绝；replaceSlotId仅当前未提交，建新目录但不清旧槽；batchDelivery按artifact定位唯一child，不凭父ID猜测。',[(M,23378,23421),(M,23556,23610),(BASE+'/extracted/lawbot-mcp/batchDelivery.js',1,26),(T,273,296)],'批量处理不是所有文件事务；已失败child可以随成功child一起完成聚合状态。')
ledger=read('文档/逆向台账/ledger.json'); old=read(OUT+'/manual-collaboration-contracts.json'); oldmap={x['id']:x for x in old['interfaces']}
rows=[x for x in ledger['interfaces'] if x.get('namespace') in ['ai-collab','mcp-connectors'] or x['kind'] in ['MCP','GATEWAY','HTTP','LOCAL_HTTP']]
assert len(rows)==67
ipc={
'attach-source':('attachSelectedDocx','02,03,04,05,09','普通文件<=50MiB；单路径转数组。snapshot调用后持久任务，不保证字节快照原子性。'),
'attach-sources':('attachSelectedDocxPaths','02,03,04,05,09','数组1–100，各子项顺序读/登记/建任务；部分失败不回滚已保存子项。'),
'authorize':('authorizeFromRenderer','04,05,09','本机6必需布尔/2可选覆盖权限，reject未知；绑定批准输出目录。handler随后自动attach；失败回滚授权只在waiting_for_user_file_selection条件下。'),
'cancel':('cancelFromRenderer','04,05,09','当前状态门槛；父项及子项分次save，保留文件；子项只跳过restoring/round_completed，completed子项也会改cancelled_by_user。不是文档worker cancel。'),
'change-restore-directory':('changeRestoreDirectoryFromRenderer','04,08,15','仅restore_failed/waiting_for_restore_approval且无confirmationPending；本机选目录取消独立返回；mkdir/access后写批准目录。'),
'consume-open-job':(None,'19','单槽s2返回并清空；未授权sender返回null。新open覆盖尚未consume的旧值；事件发送成功和窗口closed均不清s2，进程内重建窗口仍可consume旧快照；非持久队列。'),
'diagnostic-event':('recordRendererDiagnostic','14','加载本机job后白名单诊断；日志失败吞掉，不改变业务状态。'),
'fail':('failFromRenderer','04,05','拒绝completed/round_completed/cancelled；允许错误码仅Ow键，否则删除说明，仅置failed不撤销已生成文件。'),
'finish-batch-export':('finishBatchExportFromRenderer','01,03,04,05,20','父任务聚合/合并路径精确见COL-20，失败项可以保留；combined重复已有artifact直接返回。'),
'list-pending':('listPendingForRenderer','04,19','读取store.listForRenderer再投影；无gateway或非主窗口[]。这与真正空列表不可从返回值区分。'),
'open-job':(None,'19','主窗口focus/show；loading时did-finish-load一次发送，s2先存。主窗口closed只清sender集合r2及pe，不清s2；事件发送成功也不清s2，重建窗口可能消费旧快照；事件无持久确认。'),
'open-task':('openTaskFromRenderer','04,05,19','读指定任务并生成renderer投影；该方法不发通知，实际文档重开后续renderer承担。'),
'prepare-export':('prepareExportFromRenderer','01,04,05','批准状态后规划安全名/受控私有输出目录，mkdir并unlink既有预备文件，unlink错误吞；不等于已脱敏。'),
'release-export':('releaseExportFromRenderer','01,03,04,05,06,20','精确prepared路径+安全名+映射索引+成功回执；视觉稿还核magic和统计；copy交换件持久化，不扫描图像/文档全部敏感内容。'),
'repair-task-storage':('repairTaskStorageFromRenderer','04','明确本机确认后isolateUnreadableIndex；保留损坏文件并写空索引；不恢复所有历史job。'),
'report-statistics':('recordStatisticsFromRenderer','04,05,06','只允许准备阶段；renderer统计数floor/max截断后保存，未重新计算识别结果。'),
'restart-preparation':('restartPreparationFromRenderer','02,04,05','仅failed；收集失败子项来源路径，调用startSecureReview建立或复用新任务，把旧任务resumedJobId指向新任务；不清旧结果、不在本方法核文件存在。'),
'restore-completed':('markRestoreCompletedFromRenderer','04,07,08','两阶段完成确认，交换件取冻结假名输入；residual固定0，计数来自renderer。'),
'restore-failed':('markRestoreFailedFromRenderer','04,08','最新valid round或standalone允许状态后置restore_failed；已生成文件不清除。'),
'restore-saved-task':('restoreSavedTaskFromRenderer','04,07,08','本机入口需最新valid成果；若已有authorization但allowRestorePath=false，先置true并store.update，然后requestRestoreOnce；后续失败不回滚新增还原授权。'),
'resume-local-restore':('resumeLocalRestoreFromRenderer','04,07,08','待批准先存restore_failed再retryRestoreOnce；成功触发UI。pending完成确认须走对应分支。'),
'retry-authorization':('rollbackAuthorizationAfterImportFailure','04,09','仅waiting_for_user_file_selection，清authorization/authorizedOutputDirectories回待授权；前序落盘文件不撤销。'),
'retry-confirmation':('retryRestoreConfirmationFromRenderer','04,08','已完成同轮直接返回；否则需restoreCompletionPending，调用完成确认，不重新执行替换。'),
'retry-restore':('retryRestoreFromRenderer','04,07,08','仅restore_failed且最新valid round；pending确认拒绝；hash核冻结输入，standalone清rounds。'),
'set-review-intent':('setReviewIntentFromRenderer','04,05','intent枚举/限长验证，在允许任务状态保存；用户需求元数据不等于外部AI执行证据。'),
'standalone-restore-completed':('markStandaloneRestoreCompletedFromRenderer','04,08','先pending+计数，再清私有原始路径/round_completed；第二次保存失败未使用secure分支相同catch。')}
gateway={
'gateway_ping':(None,'10,11','鉴权及已配置检查之后返回ready/uiReady/pid/schema；uiReady不是材料处理成功。'),
'get_configuration_catalog':('getConfigurationCatalog','03,10,15','回调仅读取profiles/ruleSets的id/name；服务侧去控制字符、name截120、每组限200，不返回规则正文。'),
'start_secure_review':('startSecureReview','02,04,05,09,10','启动时验证选项/规范请求路径/每文件覆盖；目录扫描在后续授权attach阶段。内存start锁与持久pending候选5分钟去重（含prepared/ready等六状态）；创建待授权job不立即处理正文。'),
'resume_secure_review':('requestSessionResume','04,07,09,10','仅jobId输入/挑可恢复任务；建立待本机授权的resume请求，不能凭远端请求立即换owner。'),
'start_local_restore':('startLocalRestore','03,04,07,08,09,10','优先原secure任务最新valid成果，来源hash去歧义；无匹配才建standalone，需要本机授权。'),
'get_review_status':('getReviewStatus','04,09,10,19','owned后服务投影含child状态；无大模型调用。'),
'wait_review_delivery':('waitForReviewDelivery','04,09,10,19','0–45秒状态等待，超时回retry；batch父状态不是每子件成功。'),
'get_sanitized_artifact':('getArtifact','01,03,04,07,10,19,20','可触发batch派生报告生成；读普通文件/hash/递归attachments后仅交付假名交换路径。'),
'allocate_result_slot':('allocateSlot','04,05,10,20','job lock+最新artifact；新round或复用/replace当前未提交slot；限定20MiB/格式用途。'),
'submit_pseudonymized_result':('submitResult','03,04,06,07,08,10','入口拒绝restorePassword；slot/round/hash等实际验证与固定token计数分离；归档+冻结后存状态。'),
'request_local_restore':('requestRestore','03,04,07,08,10','最新valid轮次+allowRestorePath+mapping，冻结输入后置restoring触发UI；已restoring/round_completed返回局部幂等状态。'),
'continue_review':('continueReview','04,08,10,19','round_completed/ready且有artifact置ready并save；此方法不重新读取artifacthash，领取时再核。'),
'get_completion_status':('completion','04,08,10,19','返回owned投影completion或仅job/status；无独立输出文件验证。'),
'wait_restore_completion':('waitForRestoreCompletion','04,08,09,10,19','waitForStates等待还原终态/轮次；超时可重试，不强制取消还原。')}
mcp={
'resume_lawbot_task':('resume_secure_review',271,272),'list_lawbot_saved_settings':('get_configuration_catalog',204,205),
'start_lawbot_redaction':('start_secure_review',219,238),'start_lawbot_redaction_for_user_manual_review':('start_secure_review',219,238),
'start_lawbot_restoration':('start_local_restore',239,255),'check_document_delivery':('wait_review_delivery',256,270),
'receive_sanitized_document':('get_sanitized_artifact',273,297),'submit_reviewed_document':('submit_pseudonymized_result',298,304),
'open_lawbot_restore':('request_local_restore',305,306),'continue_current_document_review':('continue_review',307,308),
'get_lawbot_capabilities':(None,206,218),'check_restore_completion':('wait_restore_completion',309,310)}
connector={
'choose-folder':(['getAutomationSettings','updateAutomationSettings'],[(24396,24401)],'本机目录对话框取消不写；无catch包住更新，FS错误会reject。'),
'copy-setup':(['getSetupText','prepareDshPlugin','markSetupPrepared'],[(24402,24410)],'DSH返回插件目录，另2客户端返回JSON；clipboard写回匹配后才selected；copy成功不证明客户端安装。'),
'get-status':(['getSnapshot'],[(24381,24389)],'状态按getAccess、历史verifiedAt、installed路径拼；不是在线探活，返回含taskStorage。'),
'open':(['openConnector'],[(24411,24418)],'macOS查应用、PlistBuddy读可执行名，再/usr/bin/open；spawn回执不是初始化成功。'),
'retry':(['getSnapshot'],[(24389,24389)],'px.start可coalesce；创建成功只ready，publish等待UI；失败清runtime/discovery。'),
'update-automation':(['updateAutomationSettings'],[(24389,24395)],'仅2目录+shareRestorePassword false；超过1024/非绝对路径拒绝，未知对象字段忽略；先mkdir/access再settings。')}
http={
'HTTP-39c99fc0f49b':([(120,175)],'优惠码trim/uppercase并携sku；响应valid/discountedPrice等只用于页面与下一次建单。'),
'HTTP-5b15967de5d7':([(177,225)],'URL ref优先有效缓存；成功后存refCode/channelName/到期，URL清理；失败保留本地归因。'),
'HTTP-c7b17225ac88':([(396,480)],'POST sku/paymentMethod及可选referralCode/offerCode，复用同参数本地order；无码失败不自动重试，有优惠码错误清码再一次POST。'),
'HTTP-d01c26128e34':([(604,656),(665,689)],'POST buyerName/buyerEmail；自动补联系信息分支吞错；paid+batchUrl才展示激活链接，未生成则轮询/提示。'),
'HTTP-5b5f45240232':([(554,603),(659,740)],'GET编码orderId；3秒轮询，paid停poll并进入联系方式/batch路径；查询错仅UI文案，不终止所有后续poll。')}

def deps(seed):
 """Exact this-method/store dispatch only; external calls remain explicit boundaries."""
 found={};todo=list(seed)
 while todo:
  x=todo.pop();k=x['key']
  if k in found:continue
  found[k]=x
  for c in x['calls']:
   cal=c['callee'];target=None
   if cal.startswith('this.') and cal.count('.')==1:
    target=next((m for m in methods if m['class']==x['class'] and m['name']==cal[5:] and m['evidence']['path']==x['evidence']['path']),None)
   elif x['class']=='qw' and cal.startswith('this.store.') and cal.count('.')==2:
    target=next((m for m in methods if m['class']=='cx' and m['name']==cal.split('.')[-1]),None)
   elif re.fullmatch(r'[A-Za-z_$][\w$]*',cal):
    matches=[m for m in methods if not m['class'] and m['name']==cal and m['evidence']['path']==x['evidence']['path']]
    if len(matches)==1:target=matches[0]
   if target:todo.append(target)
 return list(found.values())
contracts=[]
for row in rows:
 name=row['name'];kind=row['kind'];seed=[];evidence=[];notes=[];fids=[];candidates=False;reason='本地服务分支已深入；下游格式/保护存储/许可实现需对应专项证据汇合，不能单独认定全链S3。';unknown=[]
 if kind=='IPC':
  oldrow=oldmap[row['id']];evidence+=oldrow['raw_handler_evidence']+oldrow['raw_event_evidence']
  evidence+=oldrow['manual_handler_service_evidence']
  if name.startswith('ai-collab:'):
   method,ids,note=ipc[name.split(':')[1]];seed=[fn(method)] if method else []
   fids=ids.split(',');notes=[note]
   evidence+=references((M,24381,24388),(M,24419,24428))
   if name=='ai-collab:consume-open-job':
    candidates=False;reason='撤回此前窄handler S3候选：主窗口身份检查与读/清单槽可穷尽，但完整入口还含preload→renderer le2消费及服务生产状态，未在本专项完成全业务静态契约；保持S2。';unknown=['Electron sender/mainFrame身份及事件时序运行验证R0；服务生产与renderer le2业务消费需对应完整契约。'];evidence+=references((M,24379,24388),(M,24448,24452))
  else:
   names,ranges,note=connector[name.split(':')[1]];seed=[fn(n,'ax') for n in names];evidence += [ref(M,a,b) for a,b in ranges];notes=[note];fids=['15']
   if name.endswith(':retry'): seed += [fn('start','px')];fids+=['10']
   if name.endswith(':copy-setup'):fids+=['13'];evidence+=references((B,1,172))
  if name=='ai-collab:open-job':evidence+=references((M,24379,24388),(M,24448,24452))
  input_contract=oldrow['input_contract'];success_contract=oldrow['success_contract']
 elif kind=='GATEWAY':
  method,ids,note=gateway[name];seed=[fn(method)] if method else [];fids=ids.split(',');notes=[note];evidence+=references((M,24122,24168),(M,24371,24375));input_contract='request {id,sessionSecret,caller:{adapterId,displayName,sessionId},method,params}; params逐方法见source-method参数/分支与旧AST契约';success_contract='JSON-line {id,ok:true,result}; failure {id,ok:false,error:{code,message}}'
 elif kind=='MCP':
  g,a,b=mcp[name];evidence+=references((T,a,b),(S,1,89));input_contract='tools.js声明inputSchema（见mcp-expanded-schemas.json）；服务端stdio未通用校验schema';success_contract='tools/call result.content文本JSON + structuredContent；业务错误isError:true'
  fids=['11','12','13','14'];notes=['normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。']
  if g:
   method,ids,note=gateway[g];seed=[fn(method)] if method else [];fids+=ids.split(',');notes += [f'转发 {g}：{note}']
  else:
   notes=['纯本地常量对象：interfaces/reviewModes/inputFormats/taskModes/documentTypes/maskingModes/outputFormats/batch/file/safetyBoundary；这只是能力声明，不调用识别或文件处理。'];candidates=True;reason='启动仍依赖GatewayClient环境adapterIdentity，runTool diagnostics为尽力包装（COL-11/COL-14）；常量返回及stdio tools/call包装代码已展开，参数不影响常量结果；S3候选仅能力声明端点，不能推导被声明能力真实实现。';unknown=['外部MCP/DSH宿主运行未验证R0；声明内容的业务正确性由对应方法单独验证。']
  if name=='receive_sanitized_document':
   seed += [fn('getReviewStatus'),fn('allocateSlot')];fids+=['20'];notes+=['get_status→按artifact解析child→get_artifact→allocate_slot不是原子调用；DSH删slotPath，改由submit_workspace_result落槽。']
 elif row['id'] in http:
  ranges,note=http[row['id']];evidence+=[ref(H,a,b) for a,b in ranges]+references((H,367,381));notes=[note];fids=['16'];input_contract='浏览器fetch路径/JSON body如evidence，不推断服务端schema';success_contract='页面消费的JSON字段，仅客户端条件分支';reason='只有公开客户端，远端业务实现未公开，无法全链S3。';unknown=['支付回调验签/订单读写权限/远端幂等与退款、激活batch创建和许可证生成不可见。']
 elif kind=='HTTP':
  fids=['17'];notes=['发布包electron-updater的HTTP消费者边界；不请求远端、不下载/安装。'];evidence+=references((U+'providers/GenericProvider.js',7,48),(U+'providers/Provider.js',91,145),(U+'MacUpdater.js',82,118));input_contract='feed URL/channel/cache参数或解析updateInfo.files/path后的URL';success_contract='YAML updateInfo或下载zip文件；网络/校验错误由executor传播';reason='下载executor深层及Squirrel与服务端边界待合并系统组，不能以路由级证据认定S3。';unknown=['feed与CDN当前内容不可见；native updater安装/回滚及宿主signature校验由系统组单独验证。']
 else:
  fids=['18'];evidence+=references((U+'MacUpdater.js',118,255));notes=['实际按URL分支，任何method均未被显式拒绝。' + (' / 检查Basic。' if row['id'].endswith('74413f3c6e71') else ' 随机zip路径startsWith接受，无独立Basic校验。')];input_contract='localhost动态port；根路径Basic或随机zip前缀';success_contract='根JSON {url}，zip stream Content-Length/zip MIME；401/404/streamerror';reason='请求handler本地分支可闭合，但其完整业务链到native安装不在JS中，不提升全链S3。';unknown=['HTTP完成不代表Squirrel完成安装；native与OS仍为外部边界。']
 closure=deps(seed)
 if not unknown:unknown=['竞品许可环境逐项运行R0；未把静态源码核读视为运行通过。','若依赖文档格式/NER/受保护容器，需合并对应专项逐段证据；本报告已明确注入函数真实目标及剩余边界。']
 contracts.append(dict(id=row['id'],kind=kind,name=name,input_contract=input_contract,success_contract=success_contract,new_observations=notes,finding_ids=sorted(set('COL-'+x.zfill(2) for x in fids)),direct_service_methods=[x['key'] for x in seed],expanded_service_methods=[x['key'] for x in closure],direct_evidence=evidence,explicit_throw_inventory=[dict(method=x['key'],throws=x['throws']) for x in closure if x['throws']],persistence_cancellation_recovery='见finding_ids的逐层说明；可重跑source-index保留所有call及throw精确范围，未将外部call计为已闭合。',s3_candidate=candidates,s3_reason=reason,remaining_unknown=unknown,runtime_status='R0',implementation_status_action='unchanged'))
report=dict(schema_version=1,date='2026-10-14',reference_version='0.5.9',mode='public-release-visible-code-static-only',scope=dict(total=67,ipc_ai_collab=26,ipc_mcp_connectors=6,mcp=12,gateway=14,http=7,local_http=2),summary=dict(reviewed=67,s3_candidates=sum(x['s3_candidate'] for x in contracts),runtime_executions=0,private_service_requests=0,vendor_execution=False),methodology=['逐方法静态核读→真实依赖注入→服务/队列/文件副作用→异常/恢复→外部边界；不执行发布代码。','exact this.method及this.store.method递归列为expanded_service_methods；动态回调和外部依赖用findings显式追踪，不把语法调用清单当作完整调用图。','所有方法带UTF-16 offsets+UTF-8 slice hash；手工关键证据是原始换行inclusive lines hash；旧AST定位随旧合同保留。','本轮不改ledger/static_depth/runtime/implementation；仅保留1项能力声明窄端点S3候选，consume-open-job已撤回供独立审查。'],source_files=idx['sources'],source_index=OUT+'/deep-collaboration-source-index.json',prior_contracts=[OUT+'/manual-collaboration-contracts.json',OUT+'/gateway-service-contracts.json',OUT+'/mcp-expanded-schemas.json'],findings=findings,interfaces=contracts)
for p in report['prior_contracts']+[report['source_index']]:report.setdefault('supporting_hashes',[]).append(dict(path=p,sha256=sha((ROOT/p).read_bytes())))
dest=ROOT/OUT/'deep-collaboration-20261014.json';data=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
md=['# 协作与外部边界深层静态合同 · 2026-10-14','',f'公开发布包 0.5.9 中的可见代码，共 **67 条稳定 ID**：AI IPC26、连接器 IPC6、MCP12、Gateway14、HTTP7、LOCAL_HTTP2。本轮未执行竞品、未访问私有服务，R0/I状态不变。','', '## 本轮推进与结论','', '此前 receipt、snapshot、token index、任务存储/诊断/传输回执等抽象依赖已追到真实本地实现。输出每条ID的实际服务方法及递归依赖、输入/返回、异常、持久化、取消和恢复边界。只保留1条能力常量声明S3候选；consume-open-job因未完成renderer生产消费全链已撤回，其余保留需要与格式/系统组汇合的证据或明确的远端不可见边界；不宣称完整产品等价。','', '## 深层发现','']
for f in findings:
 md += ['### '+f['id']+' '+f['title'],'',f['observation'],'','边界：'+f['remaining_boundary'],'','证据：'+ '；'.join(f"`{e['path']}:{e['start_line']}–{e['end_line']}`" for e in f['evidence']), '']
md+=['## 逐稳定 ID 合同','', '| ID | 入口 | 新核验与依赖 | S3候选 |','|---|---|---|---|']
for x in contracts:md.append('| '+x['id']+' | '+x['name'].replace('|','\\|')+' | '+ '；'.join(x['new_observations']).replace('|','\\|')+' '+','.join(x['finding_ids'])+' | '+('是（窄端点）' if x['s3_candidate'] else '否')+' |')
md+=['','## S3候选与真正剩余项','']
for x in contracts:
 if x['s3_candidate']:md+=['- '+x['id']+' '+x['name']+'：'+x['s3_reason']]
md+=['','- 本地可见已深入：receipt、源登记、token索引、cx/df保护存储调用、diag写盘/裁剪、socket及MCP/DSH适配；保护容器、CMK、格式处理实现与其他专项交叉汇合后再决定全链S3。','- 不可见远端：支付服务的数据库/鉴权/回调验签/订单幂等/激活邀请生成；CDN生产发布；外部MCP/DSH宿主内部。','- 运行缺口：许可证、平台依赖、真实客户端与崩溃/断网/磁盘满等运行验证；静态已知行为不重复标作“未知”。','- 我方对齐：未在本轮修改应用或认定I4。接口同名、固定valid/零计数、HTTP回执均不构成脱敏规则/算法或执行结果等价证据。','','## 复核','', '```sh','node 文档/逆向台账/contracts/deep-collaboration-index.mjs --check','python3 文档/逆向台账/contracts/build-deep-collaboration.py --check','```','', 'JSON保留各源码完整SHA256、精确范围sliceSHA256；source-index保留315个可见函数/方法范围及所有语法call/throw。脚本只解析或读取文本，不加载竞品模块。','']
mddata='\n'.join(md)
if '--check' in sys.argv:
 assert dest.read_text()==data,'contract drift'
 assert dest.with_suffix('.md').read_text()==mddata,'markdown drift'
 print('PASS: 67 stable IDs, 20 deep findings, exact source ranges/hashes, 1 narrow capability S3 candidate; consume-open-job withdrawn; R0/I unchanged')
else:
 dest.write_text(data);dest.with_suffix('.md').write_text(mddata);print('Wrote',dest)
