# 协作与外部边界深层静态合同 · 2026-10-14

公开发布包 0.5.9 中的可见代码，共 **67 条稳定 ID**：AI IPC26、连接器 IPC6、MCP12、Gateway14、HTTP7、LOCAL_HTTP2。本轮未执行竞品、未访问私有服务，R0/I状态不变。

## 本轮推进与结论

此前 receipt、snapshot、token index、任务存储/诊断/传输回执等抽象依赖已追到真实本地实现。输出每条ID的实际服务方法及递归依赖、输入/返回、异常、持久化、取消和恢复边界。只保留1条能力常量声明S3候选；consume-open-job因未完成renderer生产消费全链已撤回，其余保留需要与格式/系统组汇合的证据或明确的远端不可见边界；不宣称完整产品等价。

## 深层发现

### COL-01 导出回执为有界进程内 Map

回执以 resolve(exportPath) 为键，source 是规范原路径 SHA256（Windows 小写），hash 是输出 bytes SHA256；上限512，超限移除最早插入项。仅导出管线17893–17896在 Markdown 报告门槛及 textLayerNotDeleted=false 时 record。verify 不验证敏感信息识别完整性；重启丢失回执。

边界：格式转换/识别本身由文档组审查；回执不等于算法正确性。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:50–59`；`.data/research/lawbot-2026-10-13/readable/main.js:17891–17898`；`.data/research/lawbot-2026-10-13/readable/main.js:23470–23529`；`.data/research/lawbot-2026-10-13/readable/main.js:24336–24336`

### COL-02 源快照回调并非已校验 bytes 的原子快照

attach 的 readRegularFile 先 lstat 后 readFile，随后 captureSourceSnapshot 传 path+bytes；27004回调调用 dp.register。dp 的有路径分支忽略 buffer、重新 stat/copyIntoManagedRoot；已登记同路径直接复用 sourceRef，不刷新新 bytes。路径检查/读取分离，未使用同一文件描述符绑定。

边界：文件竞态的实际触发未运行；不能宣称内容快照等价。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:23013–23023`；`.data/research/lawbot-2026-10-13/readable/main.js:23352–23377`；`.data/research/lawbot-2026-10-13/readable/main.js:27002–27008`；`.data/research/lawbot-2026-10-13/readable/main.js:15759–15787`

### COL-03 批准 token 来源是受保护索引

mf.resolveId 限根目录直系 .lpm，文件名36位hex/hyphen；readApprovedTokensByPathForProtectedOperation 读取 readIndex(true).records[].meta.approvedTokens，要求1–5000个、字符串trim非空、<=256，trim去重；没有在该方法读取 .lpm 映射正文核对一一对应。

边界：mf 索引保护/CMK 容器由系统组闭合，索引tokens不证明正文映射可还原。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:15208–15227`；`.data/research/lawbot-2026-10-13/readable/main.js:27002–27008`

### COL-04 任务索引恢复与文件归档分离

cx 串行队列读写 jobs-v1.laj；主索引限定恢复错误才尝试backup；保留损坏主文件，备份经 recover 临时文件 rename。写入先copy主文件到backup，再protected write；隔离修复保留主/备后写空索引。只校验job顶层id/state/caller/updatedAt/rounds数组，不逐个校验深层artifact/round路径。df读写绑定objectType/objectId、随机DEK及CMK slot，finally清DEK。无多文件事务/fsync保证。

边界：加密容器/keyHierarchy算法由系统组处理；恢复旧索引不自动重建孤立导出文件。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:23973–24120`；`.data/research/lawbot-2026-10-13/readable/main.js:15074–15138`；`.data/research/lawbot-2026-10-13/readable/main.js:24429–24431`

### COL-05 保存成功与通知/调用成功不同

withJobLock 为进程内job Promise队列，启动请求有进程内锁，并从持久store.listPending按caller/路径/选项/六种未终结状态查询5分钟内候选去重；不是requestId去重。save先持久化，再诊断/UI通知/changeWaiter；UI回调抛错可发生在持久化之后。releaseBuffer先存building，再写wx交换件，后保存ready；中途失败可能遗留building或孤立文件。

边界：无崩溃注入实测；存储与OS故障组合不由静态检查证明。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:22938–23040`；`.data/research/lawbot-2026-10-13/readable/main.js:23155–23196`；`.data/research/lawbot-2026-10-13/readable/main.js:23537–23555`

### COL-06 成果校验字段的真实含义

submitResultOnce 校验job/当前round/slot/来源artifact及reportSources、文件格式大小/非空/hash；Yw仅提取word/document/header/footer/comments/footnotes/endnotes XML并剥标签，Ww按子串计数。validation.valid 固定true，missing/unknown/malformed/declaredChangeCount 固定0；并非token完整性/新增敏感内容检查。重试若已有valid且提供sha只比较存储submittedSha256，无须重读slot。

边界：ZIP解析器/文档内容算法另组；不可把固定零值解释为全面扫描通过。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:22898–22915`；`.data/research/lawbot-2026-10-13/readable/main.js:23627–23667`

### COL-07 持久交付与冻结还原输入

archiveSanitizedResult 保存至授权脱敏目录，安全stem+job尾号+round，10次wx重试；EEXIST且hash相同复用。freezeRestoreInput 写private-restore-input job/round_hash，wx同hash复用；hash不符拒绝。归档/冻结在最终job保存前，失败可留文件，重试有局部hash幂等，但无请求级exactly-once。

边界：无断电/磁盘满回归；外部AI输出质量不可由提交协议保证。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:23611–23626`；`.data/research/lawbot-2026-10-13/readable/main.js:23631–23679`

### COL-08 还原完成通知不重新验证输出

restore-completed 信任renderer replacementCount并将residual设0；先存restoreCompletionPending，再验证冻结输入hash、把冻结的假名输入写为下一轮交换件、再存round_completed。异常写restore_failed/pending；retry-confirmation仅补确认。standalone两次保存但无相同catch。recoverInterruptedRestores只将restoring置restore_failed；building等不统一回滚。

边界：实际还原输出与renderer协议由格式组审查；完成通知不是独立残留检测。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:23330–23351`；`.data/research/lawbot-2026-10-13/readable/main.js:23726–23776`

### COL-09 授权、取消、续接与长轮询

owned绑定sessionId+adapterId+displayName；resume需本机审批，按顺序锁父子任务并校验交换件/冻结稿/hash/token及授权后转移caller。cancel置状态且保留材料，不终止socket服务或文档worker；restoring不允许取消。wait为0–45秒、状态/更新时间通知+超时{timedOut,retry}；无传输AbortSignal。

边界：renderer文档任务的独立cancel由格式组；客户端离线并不自动转client_disconnected。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:22949–23012`；`.data/research/lawbot-2026-10-13/readable/main.js:23052–23081`；`.data/research/lawbot-2026-10-13/readable/main.js:23219–23258`

### COL-10 网关协议及传输不是请求事务

Unix socket 0600/runtime目录0700，secret64hex，caller3种固定display+session32hex，逐请求授权+已配置connector，14方法白名单。socket55秒，UTF8累计>65536字节destroy；按行并发async分发，不保证响应次序；requestId不建幂等表，socket关闭只移除连接，不取消已启动方法。

边界：授权状态内部/OS peer信任由系统组；未连接或调用真实vendor。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:24122–24217`；`.data/research/lawbot-2026-10-13/readable/main.js:24330–24375`

### COL-11 客户端丢失回执会重新发送

GatewayClient.call仅对GatewayTransportError重试一次，复用requestId、重新发现；一般15秒，wait请求按等待时长+5秒。invoke累积响应无显式大小上限、读首行JSON、未核对response.id。discovery核schema/secret/pid存活并ping匹配pid。启动coalesced30秒100ms轮询；pipe关闭/超时销毁客户端socket而不取消服务。

边界：远端客户端/操作系统运行时不可由本源码证明；不可把同requestId等同幂等。

证据：`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/gatewayClient.js:1–250`

### COL-12 MCP声明schema与实际执行校验分层

12工具；stdio tools/call不调用JSON Schema校验器，normalize/defaults后依赖服务验证。initialize回传protocolVersion、仅WorkBuddy名称有匹配检查；tools/list等不需通过该匹配。输入>1MiB仅设exitCode=1并return，buffer未清且stdin仍恢复，无即时终止；无notifications/cancelled处理。

边界：外部MCP host是否按schema预验证未知；协议声明不是运行证明。

证据：`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/server.js:1–89`；`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/tools.js:1–312`

### COL-13 DSH独立入口和受控落槽

原生插件注册11镜像工具并以submit_workspace_result替代submit_reviewed_document。caller来自execution.agent.session.id的SHA256前32位。工作区resolve/contains/lstat普通文件+格式，再向网关取slot，检查exchangeRoot及realpath目录，限定max20MiB/slot.maxSizeBytes，wx临时文件rename落槽，再提交hash。已确认状态重试不覆盖slot。取消只在入口及读取后检查，未传给gateway；validateConstraints只补scalar/array约束，结构约束依赖DSH宿主。

边界：DSH ctx.fs/工具宿主实际实现不在此包，包含检查/取消行为仅由其接口契约约束。

证据：`.data/research/lawbot-2026-10-13/extracted/lawbot-dsh/bridge.js:1–172`；`.data/research/lawbot-2026-10-13/extracted/lawbot-dsh/schema.js:1–38`

### COL-14 诊断是尽力日志而非审计事务

main kw与MCP AiDiagnostics过滤枚举/ID/计数/错误码及裁剪stack，清洗后排队；所有写失败被吞。轮询相同签名30秒合并；journal>512KiB保留末128行；bundle只读<=1MiB单journal、共<=10MiB、最多近期事件，锁20次25ms，旧锁60秒清理；临时zip rename；保留30天/100MiB。未知错误归INTERNAL_ERROR，可丢失具体错误码。

边界：不能以无日志证明请求未发生；跨进程竞争/文件系统故障未实测。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:22712–22858`；`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/aiDiagnostics.js:1–363`

### COL-15 连接器配置保存及准备的部分副作用

settings JSON坏/缺失回落默认，selected仅3枚举、verifiedAt合法日期，shareRestorePassword恒false。队列临时rename，无fsync。目录更新先mkdir/W_OK再存settings，失败可留目录。copy-setup先生成DSH文件或配置JSON，再clipboard写回核对，再markSetupPrepared；任一步失败不回滚前序文件/剪贴板。verified只表示历史成功请求。open通过/usr/bin/open spawn成功不证明客户端完成初始化。

边界：客户端安装/剪贴板/文件系统OS实际行为未运行；prepareDshPlugin复制多文件非原子发布。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:23793–23972`；`.data/research/lawbot-2026-10-13/readable/main.js:24389–24418`

### COL-16 网页付款状态机仅客户端可见

5路HTTP共用paymentFetch：15秒AbortController，只在fetch resolve后clearTimeout，读JSON失败退{}，非2xx取message抛错。订单本地缓存按sku/payment/ref/offer复用，无客户端幂等键/并发去重。优惠码错误后清码重试原价；contact成功paid+无batchUrl开始轮询，但try内return仍执行finally启用按钮（与注释不同）。每3秒setInterval可重叠15秒请求，无orderId新旧序号门槛；paid清轮询，batchUrl显示并清本地pending，否则补contact/引导。

边界：服务端创建、支付回调验签、订单权限、幂等、优惠/推荐码规则和batch生成不在公开JS中；不能升级为完整远端契约。

证据：`.data/research/lawbot-2026-10-13/website/home-1.js:120–215`；`.data/research/lawbot-2026-10-13/website/home-1.js:367–381`；`.data/research/lawbot-2026-10-13/website/home-1.js:396–480`；`.data/research/lawbot-2026-10-13/website/home-1.js:604–740`

### COL-17 更新源与下载元数据处理

GenericProvider按channel/platform拼YML，404专错，ECONNREFUSED最多3次追加重试(0/1/2秒)；Provider yaml.load无完整schema验证，files优先否则path，require sha2或sha512，resolve URL到feed。Mac先差分失败回退完整zip、下载缓存copy失败仅日志。完整性/安装最终由updater executor/native Squirrel接管。

边界：CDN实时内容/服务端发布与native安装不在可见JS；下载executor/differential深层见系统组。

证据：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/providers/GenericProvider.js:7–48`；`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/providers/Provider.js:14–145`；`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/MacUpdater.js:82–118`

### COL-18 本地更新HTTP实际路由

绑定127.0.0.1动态port，/要求随机64bytes Basic密码，返回随机128hex.zip URL。zip分支使用startsWith(fileUrl)，未单独验证Basic或HTTP method；非前缀404。stream finish只代表响应结束，readStream error拒绝；autoInstallOnAppQuit=false提前resolve；最终Squirrel update-downloaded/quitAndInstall另一路。

边界：不能把HTTP finish等同安装成功；native Squirrel/OS不可由路由JS证明。

证据：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/MacUpdater.js:118–255`

### COL-19 状态投影明确分隔本机与外部字段

Rw renderer=true才返回sourceRequest.paths、实体明文、mappingPath及restore输入；默认外部投影仍返回sanitizedExports与sanitizedResult.outputPath等脱敏产物路径。Pw只在exchangePath=true加入受控交换路径并递归attachments。completion residual缺省0，不是扫描。另c2先赋单槽s2再发事件，send成功与窗口closed均不清槽；closed仅删r2/调用pe。只有有效consume读取并置null，或新c2覆盖；进程内窗口重建可能消费旧快照。

边界：投影之外，外部AI自身文件权限不受MCP协议控制；严格隔离需OS权限。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:22859–22869`；`.data/research/lawbot-2026-10-13/readable/main.js:23041–23050`；`.data/research/lawbot-2026-10-13/readable/main.js:24379–24388`；`.data/research/lawbot-2026-10-13/readable/main.js:24448–24452`

### COL-20 批量与槽位的局部幂等边界

finishBatch要求子项ready/completed/failed；combined读取每份MD并验进程回执，或哈希验证视觉附件；token须被项目映射索引覆盖，最大20MiB，wx写后releaseBuffer。getArtifact派生报告要求统一假名+同映射，记录reportSources供提交时查旧。allocateSlot复用当前未提交round，格式/用途冲突拒绝；replaceSlotId仅当前未提交，建新目录但不清旧槽；batchDelivery按artifact定位唯一child，不凭父ID猜测。

边界：批量处理不是所有文件事务；已失败child可以随成功child一起完成聚合状态。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:23378–23421`；`.data/research/lawbot-2026-10-13/readable/main.js:23556–23610`；`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/batchDelivery.js:1–26`；`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/tools.js:273–296`

## 逐稳定 ID 合同

| ID | 入口 | 新核验与依赖 | S3候选 |
|---|---|---|---|
| IPC-540edc231d28 | ai-collab:attach-source | 普通文件<=50MiB；单路径转数组。snapshot调用后持久任务，不保证字节快照原子性。 COL-02,COL-03,COL-04,COL-05,COL-09 | 否 |
| IPC-77baf8b1932c | ai-collab:attach-sources | 数组1–100，各子项顺序读/登记/建任务；部分失败不回滚已保存子项。 COL-02,COL-03,COL-04,COL-05,COL-09 | 否 |
| IPC-9f9f62ce116e | ai-collab:authorize | 本机6必需布尔/2可选覆盖权限，reject未知；绑定批准输出目录。handler随后自动attach；失败回滚授权只在waiting_for_user_file_selection条件下。 COL-04,COL-05,COL-09 | 否 |
| IPC-224e4065477a | ai-collab:cancel | 当前状态门槛；父项及子项分次save，保留文件；子项只跳过restoring/round_completed，completed子项也会改cancelled_by_user。不是文档worker cancel。 COL-04,COL-05,COL-09 | 否 |
| IPC-7bc84b77bbab | ai-collab:change-restore-directory | 仅restore_failed/waiting_for_restore_approval且无confirmationPending；本机选目录取消独立返回；mkdir/access后写批准目录。 COL-04,COL-08,COL-15 | 否 |
| IPC-0e93232c5223 | ai-collab:consume-open-job | 单槽s2返回并清空；未授权sender返回null。新open覆盖尚未consume的旧值；事件发送成功和窗口closed均不清s2，进程内重建窗口仍可consume旧快照；非持久队列。 COL-19 | 否 |
| IPC-91a4aa41d44c | ai-collab:diagnostic-event | 加载本机job后白名单诊断；日志失败吞掉，不改变业务状态。 COL-14 | 否 |
| IPC-3218ff56854c | ai-collab:fail | 拒绝completed/round_completed/cancelled；允许错误码仅Ow键，否则删除说明，仅置failed不撤销已生成文件。 COL-04,COL-05 | 否 |
| IPC-2c93659b71ad | ai-collab:finish-batch-export | 父任务聚合/合并路径精确见COL-20，失败项可以保留；combined重复已有artifact直接返回。 COL-01,COL-03,COL-04,COL-05,COL-20 | 否 |
| IPC-0ee2339f025f | ai-collab:list-pending | 读取store.listForRenderer再投影；无gateway或非主窗口[]。这与真正空列表不可从返回值区分。 COL-04,COL-19 | 否 |
| IPC-03b436a7c1b1 | ai-collab:open-job | 主窗口focus/show；loading时did-finish-load一次发送，s2先存。主窗口closed只清sender集合r2及pe，不清s2；事件发送成功也不清s2，重建窗口可能消费旧快照；事件无持久确认。 COL-19 | 否 |
| IPC-d0d9bb1ba45b | ai-collab:open-task | 读指定任务并生成renderer投影；该方法不发通知，实际文档重开后续renderer承担。 COL-04,COL-05,COL-19 | 否 |
| IPC-208d016e6972 | ai-collab:prepare-export | 批准状态后规划安全名/受控私有输出目录，mkdir并unlink既有预备文件，unlink错误吞；不等于已脱敏。 COL-01,COL-04,COL-05 | 否 |
| IPC-40128ac5fccf | ai-collab:release-export | 精确prepared路径+安全名+映射索引+成功回执；视觉稿还核magic和统计；copy交换件持久化，不扫描图像/文档全部敏感内容。 COL-01,COL-03,COL-04,COL-05,COL-06,COL-20 | 否 |
| IPC-121d180be5d8 | ai-collab:repair-task-storage | 明确本机确认后isolateUnreadableIndex；保留损坏文件并写空索引；不恢复所有历史job。 COL-04 | 否 |
| IPC-412cb770febe | ai-collab:report-statistics | 只允许准备阶段；renderer统计数floor/max截断后保存，未重新计算识别结果。 COL-04,COL-05,COL-06 | 否 |
| IPC-fe44165e30fd | ai-collab:restart-preparation | 仅failed；收集失败子项来源路径，调用startSecureReview建立或复用新任务，把旧任务resumedJobId指向新任务；不清旧结果、不在本方法核文件存在。 COL-02,COL-04,COL-05 | 否 |
| IPC-0a8de5567b3c | ai-collab:restore-completed | 两阶段完成确认，交换件取冻结假名输入；residual固定0，计数来自renderer。 COL-04,COL-07,COL-08 | 否 |
| IPC-8b4556ee60d4 | ai-collab:restore-failed | 最新valid round或standalone允许状态后置restore_failed；已生成文件不清除。 COL-04,COL-08 | 否 |
| IPC-21f5af67811a | ai-collab:restore-saved-task | 本机入口需最新valid成果；若已有authorization但allowRestorePath=false，先置true并store.update，然后requestRestoreOnce；后续失败不回滚新增还原授权。 COL-04,COL-07,COL-08 | 否 |
| IPC-b3931f25eb79 | ai-collab:resume-local-restore | 待批准先存restore_failed再retryRestoreOnce；成功触发UI。pending完成确认须走对应分支。 COL-04,COL-07,COL-08 | 否 |
| IPC-eceef0e6cff3 | ai-collab:retry-authorization | 仅waiting_for_user_file_selection，清authorization/authorizedOutputDirectories回待授权；前序落盘文件不撤销。 COL-04,COL-09 | 否 |
| IPC-6c981281c999 | ai-collab:retry-confirmation | 已完成同轮直接返回；否则需restoreCompletionPending，调用完成确认，不重新执行替换。 COL-04,COL-08 | 否 |
| IPC-2f0db8546650 | ai-collab:retry-restore | 仅restore_failed且最新valid round；pending确认拒绝；hash核冻结输入，standalone清rounds。 COL-04,COL-07,COL-08 | 否 |
| IPC-3b4c9f7c2b97 | ai-collab:set-review-intent | intent枚举/限长验证，在允许任务状态保存；用户需求元数据不等于外部AI执行证据。 COL-04,COL-05 | 否 |
| IPC-a3eee81b75d4 | ai-collab:standalone-restore-completed | 先pending+计数，再清私有原始路径/round_completed；第二次保存失败未使用secure分支相同catch。 COL-04,COL-08 | 否 |
| IPC-29896d043df3 | mcp-connectors:choose-folder | 本机目录对话框取消不写；无catch包住更新，FS错误会reject。 COL-15 | 否 |
| IPC-cf6cc425333d | mcp-connectors:copy-setup | DSH返回插件目录，另2客户端返回JSON；clipboard写回匹配后才selected；copy成功不证明客户端安装。 COL-13,COL-15 | 否 |
| IPC-d70108ef71d7 | mcp-connectors:get-status | 状态按getAccess、历史verifiedAt、installed路径拼；不是在线探活，返回含taskStorage。 COL-15 | 否 |
| IPC-1c4d31759888 | mcp-connectors:open | macOS查应用、PlistBuddy读可执行名，再/usr/bin/open；spawn回执不是初始化成功。 COL-15 | 否 |
| IPC-13b1b9cd954f | mcp-connectors:retry | px.start可coalesce；创建成功只ready，publish等待UI；失败清runtime/discovery。 COL-10,COL-15 | 否 |
| IPC-7a1832cb9fe9 | mcp-connectors:update-automation | 仅2目录+shareRestorePassword false；超过1024/非绝对路径拒绝，未知对象字段忽略；先mkdir/access再settings。 COL-15 | 否 |
| MCP-104bba767f9b | resume_lawbot_task | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 resume_secure_review：仅jobId输入/挑可恢复任务；建立待本机授权的resume请求，不能凭远端请求立即换owner。 COL-04,COL-07,COL-09,COL-10,COL-11,COL-12,COL-13,COL-14 | 否 |
| MCP-125a85961c76 | list_lawbot_saved_settings | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 get_configuration_catalog：回调仅读取profiles/ruleSets的id/name；服务侧去控制字符、name截120、每组限200，不返回规则正文。 COL-03,COL-10,COL-11,COL-12,COL-13,COL-14,COL-15 | 否 |
| MCP-08b4aa88f5db | start_lawbot_redaction | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 start_secure_review：启动时验证选项/规范请求路径/每文件覆盖；目录扫描在后续授权attach阶段。内存start锁与持久pending候选5分钟去重（含prepared/ready等六状态）；创建待授权job不立即处理正文。 COL-02,COL-04,COL-05,COL-09,COL-10,COL-11,COL-12,COL-13,COL-14 | 否 |
| MCP-c498f8766b24 | start_lawbot_redaction_for_user_manual_review | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 start_secure_review：启动时验证选项/规范请求路径/每文件覆盖；目录扫描在后续授权attach阶段。内存start锁与持久pending候选5分钟去重（含prepared/ready等六状态）；创建待授权job不立即处理正文。 COL-02,COL-04,COL-05,COL-09,COL-10,COL-11,COL-12,COL-13,COL-14 | 否 |
| MCP-7b2d5f82cf39 | start_lawbot_restoration | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 start_local_restore：优先原secure任务最新valid成果，来源hash去歧义；无匹配才建standalone，需要本机授权。 COL-03,COL-04,COL-07,COL-08,COL-09,COL-10,COL-11,COL-12,COL-13,COL-14 | 否 |
| MCP-9a4e24e9a1c0 | check_document_delivery | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 wait_review_delivery：0–45秒状态等待，超时回retry；batch父状态不是每子件成功。 COL-04,COL-09,COL-10,COL-11,COL-12,COL-13,COL-14,COL-19 | 否 |
| MCP-dc810d5ca01a | receive_sanitized_document | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 get_sanitized_artifact：可触发batch派生报告生成；读普通文件/hash/递归attachments后仅交付假名交换路径。；get_status→按artifact解析child→get_artifact→allocate_slot不是原子调用；DSH删slotPath，改由submit_workspace_result落槽。 COL-01,COL-03,COL-04,COL-07,COL-10,COL-11,COL-12,COL-13,COL-14,COL-19,COL-20 | 否 |
| MCP-1e302c2392c3 | submit_reviewed_document | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 submit_pseudonymized_result：入口拒绝restorePassword；slot/round/hash等实际验证与固定token计数分离；归档+冻结后存状态。 COL-03,COL-04,COL-06,COL-07,COL-08,COL-10,COL-11,COL-12,COL-13,COL-14 | 否 |
| MCP-a3d4f76a1a28 | open_lawbot_restore | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 request_local_restore：最新valid轮次+allowRestorePath+mapping，冻结输入后置restoring触发UI；已restoring/round_completed返回局部幂等状态。 COL-03,COL-04,COL-07,COL-08,COL-10,COL-11,COL-12,COL-13,COL-14 | 否 |
| MCP-8e8e605f0d93 | continue_current_document_review | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 continue_review：round_completed/ready且有artifact置ready并save；此方法不重新读取artifacthash，领取时再核。 COL-04,COL-08,COL-10,COL-11,COL-12,COL-13,COL-14,COL-19 | 否 |
| MCP-8fb696cd0f36 | get_lawbot_capabilities | 纯本地常量对象：interfaces/reviewModes/inputFormats/taskModes/documentTypes/maskingModes/outputFormats/batch/file/safetyBoundary；这只是能力声明，不调用识别或文件处理。 COL-11,COL-12,COL-13,COL-14 | 是（窄端点） |
| MCP-924f29e7e21d | check_restore_completion | normalize映射snake_case→camelCase；缺省值必须以实际tools.js为准。；转发 wait_restore_completion：waitForStates等待还原终态/轮次；超时可重试，不强制取消还原。 COL-04,COL-08,COL-09,COL-10,COL-11,COL-12,COL-13,COL-14,COL-19 | 否 |
| HTTP-39c99fc0f49b | GET https://lis.lawbotai.cn/api/order/offer-{code}?sku={sku} | 优惠码trim/uppercase并携sku；响应valid/discountedPrice等只用于页面与下一次建单。 COL-16 | 否 |
| HTTP-5b15967de5d7 | GET https://lis.lawbotai.cn/api/order/referral-{code} | URL ref优先有效缓存；成功后存refCode/channelName/到期，URL清理；失败保留本地归因。 COL-16 | 否 |
| HTTP-c7b17225ac88 | POST https://lis.lawbotai.cn/api/order/create | POST sku/paymentMethod及可选referralCode/offerCode，复用同参数本地order；无码失败不自动重试，有优惠码错误清码再一次POST。 COL-16 | 否 |
| HTTP-d01c26128e34 | POST https://lis.lawbotai.cn/api/order/{orderId}/contact | POST buyerName/buyerEmail；自动补联系信息分支吞错；paid+batchUrl才展示激活链接，未生成则轮询/提示。 COL-16 | 否 |
| HTTP-5b5f45240232 | GET https://lis.lawbotai.cn/api/order/{orderId} | GET编码orderId；3秒轮询，paid停poll并进入联系方式/batch路径；查询错仅UI文案，不终止所有后续poll。 COL-16 | 否 |
| GATEWAY-f21aa5c5dc19 | gateway_ping | 鉴权及已配置检查之后返回ready/uiReady/pid/schema；uiReady不是材料处理成功。 COL-10,COL-11 | 否 |
| GATEWAY-191fc60f0036 | get_configuration_catalog | 回调仅读取profiles/ruleSets的id/name；服务侧去控制字符、name截120、每组限200，不返回规则正文。 COL-03,COL-10,COL-15 | 否 |
| GATEWAY-cbd9ff60189a | start_secure_review | 启动时验证选项/规范请求路径/每文件覆盖；目录扫描在后续授权attach阶段。内存start锁与持久pending候选5分钟去重（含prepared/ready等六状态）；创建待授权job不立即处理正文。 COL-02,COL-04,COL-05,COL-09,COL-10 | 否 |
| GATEWAY-95f7eda76ec2 | resume_secure_review | 仅jobId输入/挑可恢复任务；建立待本机授权的resume请求，不能凭远端请求立即换owner。 COL-04,COL-07,COL-09,COL-10 | 否 |
| GATEWAY-325df91336a6 | start_local_restore | 优先原secure任务最新valid成果，来源hash去歧义；无匹配才建standalone，需要本机授权。 COL-03,COL-04,COL-07,COL-08,COL-09,COL-10 | 否 |
| GATEWAY-257145c95a18 | get_review_status | owned后服务投影含child状态；无大模型调用。 COL-04,COL-09,COL-10,COL-19 | 否 |
| GATEWAY-f41647c2a851 | wait_review_delivery | 0–45秒状态等待，超时回retry；batch父状态不是每子件成功。 COL-04,COL-09,COL-10,COL-19 | 否 |
| GATEWAY-678e012848a8 | get_sanitized_artifact | 可触发batch派生报告生成；读普通文件/hash/递归attachments后仅交付假名交换路径。 COL-01,COL-03,COL-04,COL-07,COL-10,COL-19,COL-20 | 否 |
| GATEWAY-1abec6ed4302 | allocate_result_slot | job lock+最新artifact；新round或复用/replace当前未提交slot；限定20MiB/格式用途。 COL-04,COL-05,COL-10,COL-20 | 否 |
| GATEWAY-9550960e5004 | submit_pseudonymized_result | 入口拒绝restorePassword；slot/round/hash等实际验证与固定token计数分离；归档+冻结后存状态。 COL-03,COL-04,COL-06,COL-07,COL-08,COL-10 | 否 |
| GATEWAY-269ba55489c6 | request_local_restore | 最新valid轮次+allowRestorePath+mapping，冻结输入后置restoring触发UI；已restoring/round_completed返回局部幂等状态。 COL-03,COL-04,COL-07,COL-08,COL-10 | 否 |
| GATEWAY-c67325f03fc7 | continue_review | round_completed/ready且有artifact置ready并save；此方法不重新读取artifacthash，领取时再核。 COL-04,COL-08,COL-10,COL-19 | 否 |
| GATEWAY-32e1f2fdcacd | get_completion_status | 返回owned投影completion或仅job/status；无独立输出文件验证。 COL-04,COL-08,COL-10,COL-19 | 否 |
| GATEWAY-8f9ae82e2106 | wait_restore_completion | waitForStates等待还原终态/轮次；超时可重试，不强制取消还原。 COL-04,COL-08,COL-09,COL-10,COL-19 | 否 |
| HTTP-a71a256b3205 | GET https://downloading.lawbotai.cn/main/mac/stable/latest-mac.yml | 发布包electron-updater的HTTP消费者边界；不请求远端、不下载/安装。 COL-17 | 否 |
| HTTP-6d3c7c84fc7d | GET {updateInfo.files[].url \| updateInfo.path} resolved against update feed | 发布包electron-updater的HTTP消费者边界；不请求远端、不下载/安装。 COL-17 | 否 |
| LOCAL_HTTP-74413f3c6e71 | expected GET http://127.0.0.1:{port}/ | 实际按URL分支，任何method均未被显式拒绝。 / 检查Basic。 COL-18 | 否 |
| LOCAL_HTTP-c7d0bee37342 | expected GET http://127.0.0.1:{port}/{128hex}.zip | 实际按URL分支，任何method均未被显式拒绝。 随机zip路径startsWith接受，无独立Basic校验。 COL-18 | 否 |

## S3候选与真正剩余项

- MCP-8fb696cd0f36 get_lawbot_capabilities：启动仍依赖GatewayClient环境adapterIdentity，runTool diagnostics为尽力包装（COL-11/COL-14）；常量返回及stdio tools/call包装代码已展开，参数不影响常量结果；S3候选仅能力声明端点，不能推导被声明能力真实实现。

- 本地可见已深入：receipt、源登记、token索引、cx/df保护存储调用、diag写盘/裁剪、socket及MCP/DSH适配；保护容器、CMK、格式处理实现与其他专项交叉汇合后再决定全链S3。
- 不可见远端：支付服务的数据库/鉴权/回调验签/订单幂等/激活邀请生成；CDN生产发布；外部MCP/DSH宿主内部。
- 运行缺口：许可证、平台依赖、真实客户端与崩溃/断网/磁盘满等运行验证；静态已知行为不重复标作“未知”。
- 我方对齐：未在本轮修改应用或认定I4。接口同名、固定valid/零计数、HTTP回执均不构成脱敏规则/算法或执行结果等价证据。

## 复核

```sh
node 文档/逆向台账/contracts/deep-collaboration-index.mjs --check
python3 文档/逆向台账/contracts/build-deep-collaboration.py --check
```

JSON保留各源码完整SHA256、精确范围sliceSHA256；source-index保留315个可见函数/方法范围及所有语法call/throw。脚本只解析或读取文本，不加载竞品模块。
