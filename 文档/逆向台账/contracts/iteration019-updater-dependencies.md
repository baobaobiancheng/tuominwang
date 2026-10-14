# ITER019 更新下载执行器与差分依赖补读

9节30范围，13份新提取源码及2份旧源码逐字回核原ASAR；S2/R0。
当前Mac配置明确禁用差分；差分代码是包内条件路径，未运行竞品。
原ASAR SHA256：`3a6ed78d23959ab310e56b83e412f0616e1d402767dcdbf910270a4c1aa3c9ae`。来源记录：`.data/research/lawbot-2026-10-14/updater-dependencies/extraction.json`。

## UD01 调用适用性：当前Mac完整下载，差分仅包内条件路径

适用性：`current-full-download-or-shared`。

- HI仅darwin supported；有配置时显式设置disableDifferentialDownload为process.platform===darwin，并注册download-progress。应用downloadUpdate不传取消token；available且有release才调用库，ready直接返回；应用和库各有downloadPromise去重。
- 库缺updateInfoAndProvider先dispatchError再拒绝；已有downloadPromise直接复用，后续调用的token不会替换活动下载token。新调用把requestHeaders/token/disableDifferentialDownload传MacUpdater，非CancellationError派发error，finally清promise。
- MacUpdater读取sysctl/uname（失败只日志），结合process.arch/Rosetta交给既有arch filter；选zip，缺失抛ERR_UPDATER_ZIP_FILE_NOT_FOUND。仅存在旧update.zip且未禁差分时进入差分，差分返回true才完整下载。当前应用配置会走完整下载，已有cache命中除外。
- 应用以update-downloaded事件写ready/pendingUpdate；await库返回后以snapshot.phase===ready判success。该事件和返回不是OS安装完成证明。

条件与边界：
- 差分节为随发布包可见的条件逻辑，未声称当前Mac运行过；未为此改变配置或调用竞品。既有feed/provider/arch filter/native updateDownloaded链引用旧报告，不重报成本轮逐行重审。

证据：
- `app-config`：`.data/research/lawbot-2026-10-13/readable/main.js`:26143–26188，range SHA256 `27c2a69c89bf8a08f4171e45a2a9c4620eb368a64e34ea45dd2dbed90b9fd7b7`。
- `app-download-events`：`.data/research/lawbot-2026-10-13/readable/main.js`:26224–26267，range SHA256 `9b3f58c20f240bbab5a1712a9861e82f57b88cb48f99a1d25fc5daa7cfd5fe24`。
- `updater-download`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/AppUpdater.js`:435–480，range SHA256 `759e04595059f984ed4de48545bba38d2f6f4127a2962ab36f0093764c663bc4`。
- `mac-download`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/MacUpdater.js`:52–122，range SHA256 `cca212e9aadb19ae419790d28248cc35ce576fa35403adc0d3cb78d01929974f`。

## UD02 临时文件、提交顺序与缓存输出

适用性：`current-full-download-or-shared`。

- executeDownload从URL pathname解码后按扩展名选basename，否则从metadata url取basename；建立pending目录。validateDownloadedPath命中直接done(false)，不下载。task输出临时文件后rename最终文件；仅Error且message以EBUSY:开头时最多追加60次、间隔500ms。
- retry在catch检查shouldRetry和自己的token后等待；调用rename retry没有传下载token，等待后递归task前无再次取消检查。createTempUpdateFile最多三次unlink尝试；ENOENT即采用该名，其他失败加编号，返回路径而非独占创建。
- done先setDownloadedFile（可写update-info.json），再taskOptions.done，最后如存在pending/current.blockmap就复制到cache，再返回[updateFile]或[updateFile,packageFile]。task/rename catch清pending和unlink final，清理错误吞掉；CancellationError另发update-cancelled。
- done(false/true)都位于task/rename的try/catch之外。cache写入、task.done或末尾blockmap复制失败可以在文件已经rename、甚至task.done已经通知后使调用拒绝；该catch不会回滚这些后置操作。

条件与边界：
- 新下载basename限制不能推广到磁盘cache记录；task.done交接native更新流程沿用COL-17/系统报告边界。重试最多61次task尝试并非固定30秒总时限。

证据：
- `execute-download`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/AppUpdater.js`:559–642，range SHA256 `1fec2b132963a94269fb5cd28977d537d2b2c7e04481d158308e5b6469b56262`。
- `temp-file`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/DownloadedUpdateHelper.js`:150–168，range SHA256 `66d7db124a4fdafa190f0b232fc0c208f9b94a51614e8ccb3ce3b0d225a9c921`。
- `rename-retry`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/retry.js`:5–20，range SHA256 `9a5136c81a8400854fe80decc18e9f26d1e5d36de5297bf5078ca365fd550e02`。
- `mac-download`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/MacUpdater.js`:52–122，range SHA256 `cca212e9aadb19ae419790d28248cc35ce576fa35403adc0d3cb78d01929974f`。

## UD03 完整HTTP下载、重定向与缓存session

适用性：`current-full-download-or-shared`。

- ElectronHttpExecutor用electron-updater partition且cache:false，复用session；createRequest遇Host header移到options.host并删除header，可绑定proxy login callback。download通过token.createPromise包装，manual redirect，成功resolve目标路径。
- doDownload拒绝HTTP>=400，监听response error；否则交configurePipes或responseHandler。request装error/aborted及socket timeout；默认60秒是socket事件设置的超时，超时abort，不是整个下载总预算或已验证Electron socket行为。
- Electron redirect事件先abort旧request再调用prepareRedirectUrlOptions。该helper按主机/协议/端口剥离登记的敏感header，同主机标准端口http→https例外；普通非敏感header保留。
- doDownload两处递归传redirectCount++，下层收到旧值；API重定向同样传原redirectCount。虽有maxRedirects=10及比较，不能据此声称可靠递增的重定向次数上限。

条件与边界：
- 只能确认可见JS的header策略；Electron网络策略、代理、TLS、CDN真实重定向和超时行为未运行。差分直接followRedirect路径并不调用同一个敏感header helper，不把两条路径混为同一保障。

证据：
- `electron-executor`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/electronHttpExecutor.js`:1–78，range SHA256 `2701e686fc5123bef489aa0d57894257fe8a7337ba537d042e18bb6ea6e22569`。
- `http-download`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:204–281，range SHA256 `32d322d4399cb256593e56cac2be1bae553b3d8076ec07eadf0ef01f6abe5c5a`。
- `http-api-cancel`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:92–203，range SHA256 `fca33520942024105819a376446400443c5efb45326d61a474ac4a6f34bd5b9f`。
- `http-redirect`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:282–345，range SHA256 `372a165be88dd9e8045b2a32ea723c64a3b3dd00bd041a43fce87aee405ef521`。
- `http-url`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:366–392，range SHA256 `eb51b7e52019dfba9c4365d1d42c487e8edecc9e144723f4ae33ab5d1f6e5d4d`。
- `http-config`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:500–513，range SHA256 `beba0dd5d470eccf6fdc467588f745195dded3ff19d9e04a83ea3036c3c641e1`。
- `http-sensitive-headers`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:24–50，range SHA256 `b881f44013280a54a193874b8498317cbe50194197307426a5e5bdf89dbe9eb3`。
- `diff-stream`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js`:95–226，range SHA256 `5ccb2bab946031e2360b7137e1287d0725caaaa0d22df817898169731439e166`。

## UD04 取消协议与进度：Promise拒绝不等于底层停止

适用性：`current-full-download-or-shared`。

- CancellationToken支持parent传播，已取消createPromise立即拒绝；活动token取消时先执行可选onCancel回调，finally以CancellationError拒绝，结算后移除listener。dispose解绑并清listeners。
- API doApiRequest把onCancel连接request.abort；完整文件download与downloadToBuffer把onCancel传给doDownload，但doDownload没有使用该字段，也未连接abort。token可拒绝包装Promise，不能从这些函数保证网络/写盘即时停止。
- 完整下载只有onProgress存在且响应content-length非null时装ProgressCallbackTransform；transform在chunk/flush检查cancelled并报普通Error。configurePipes stream error会close fileOut，但token已取消时不再callback该error。没有progress或content-length时没有这条流级取消检查。
- 应用已经注册download-progress，因此onProgress在正常配置下存在；content-length仍由响应决定。HI本次调用未传token，也未从这些入口观察到用户取消按钮协议，不能把库条件取消风险说成已复现用户操作。
- 差分只有单range模式且onProgress存在时装取消感知transform；多range的DataSplitter无token，差分函数没有token.createPromise或取消abort。progress统计远程字节不含COPY；100%进度发生在digest/最终提交完成之前，非验证完成证明。

条件与边界：
- 库取消条件、底层请求继续写入、竞态清理均为源码条件，不是动态缺陷复现。Node流/Electron调度结果仍R0。

证据：
- `cancel-token`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/CancellationToken.js`:5–107，range SHA256 `b051fe393f6eb9312b4e3bdfb4fca969c0a7f422a47c2f21030cc1126e086d8e`。
- `http-api-cancel`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:92–203，range SHA256 `fca33520942024105819a376446400443c5efb45326d61a474ac4a6f34bd5b9f`。
- `electron-executor`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/electronHttpExecutor.js`:1–78，range SHA256 `2701e686fc5123bef489aa0d57894257fe8a7337ba537d042e18bb6ea6e22569`。
- `http-download`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:204–281，range SHA256 `32d322d4399cb256593e56cac2be1bae553b3d8076ec07eadf0ef01f6abe5c5a`。
- `http-digest-pipes`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:393–499，range SHA256 `30b9ecc528aa17e4b5789a7507a55cc121fb6cb438854286c14e1d69cf553fa0`。
- `full-progress`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/ProgressCallbackTransform.js`:5–53，range SHA256 `c8e674cd4395ede4e075055b3e8976544c89aa8505e938a8e2a6f016c764332e`。
- `diff-progress`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/ProgressDifferentialDownloadCallbackTransform.js`:5–89，range SHA256 `ad360223aa60e69cfeb9dddc80cd2ec338b9773d168505646ef3181522676fa4`。
- `diff-stream`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js`:95–226，range SHA256 `5ccb2bab946031e2360b7137e1287d0725caaaa0d22df817898169731439e166`。
- `multi-range`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/multipleRangeDownloader.js`:1–113，range SHA256 `7d7bc1790367dab937aed92dd36bdb61f2c8ff260ad94d7399a8a4bf9dad3524`。
- `splitter-copy`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js`:1–83，range SHA256 `7f10574bb76d69c3b26c677e8e1c37a242991f8cc5b32728a29ab23a9b9388e5`。
- `app-download-events`：`.data/research/lawbot-2026-10-13/readable/main.js`:26224–26267，range SHA256 `9b3f58c20f240bbab5a1712a9861e82f57b88cb48f99a1d25fc5daa7cfd5fe24`。

## UD05 完整性校验与跨启动缓存

适用性：`current-full-download-or-shared`。

- configurePipes优先sha512；长度128且不含+/Z/=时按hex，否则base64；没有sha512而有sha2则SHA256 hex。DigestTransform逐chunk计算，flush得到actual并严格比expected，缺结果或不一致报错。X-Checksum-Sha2只在响应取到该键且双方非null时比较；safeGetHeader直接按传入键索引，不自行规范大小写。
- 完整流错误close fileOut并在token未取消时callback；finish后close callback决定完成。无digest metadata时该函数不自行要求必须有摘要，此前Provider的metadata门槛见COL-17。
- 同进程cache要求同path、versionInfo/fileInfo.info深相等且文件存在，不重新hash。跨启动读update-info.json：读取/解析异常按ENOENT区别清pending；metadata sha512相等、文件存在且整文件sha512 base64一致才采用。
- 磁盘cache fileName只判!==null，不验证字符串/undefined/basename；cachedInfo为null、无filename或非字符串在后续属性/path操作可能抛，含路径成分也未在此归一。这个读取门不能继承新下载文件名basename保护。setDownloadedFile先写内存再可选JSON，clear不复位_downloadedFileInfo，emptyDir失败吞掉。

条件与边界：
- 摘要相等只证明与提供metadata的一致性，不证明发行者身份/签名信任、OS安装或密码学实现正确。cache篡改需有实际本地写入前提，未宣称远端可利用或已运行。

证据：
- `http-digest-pipes`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:393–499，range SHA256 `30b9ecc528aa17e4b5789a7507a55cc121fb6cb438854286c14e1d69cf553fa0`。
- `cache`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/DownloadedUpdateHelper.js`:12–149，range SHA256 `a34b291918104462491286133ea9eb36462d1ce5bb9f47f08d5999ccf92f2d65`。
- `execute-download`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/AppUpdater.js`:559–642，range SHA256 `1fec2b132963a94269fb5cd28977d537d2b2c7e04481d158308e5b6469b56262`。

## UD06 差分blockmap取得、缓存及失败回退

适用性：`bundled-conditional-differential-disabled-in-current-mac-config`。

- 从provider取得旧/新blockmap URL；先下载新blockmap，经非空检查、gunzip+JSON.parse，再gzip写pending/current.blockmap。旧图优先cache，读取/解析失败日志后再远程下载。
- downloadToBuffer用token Promise、收集chunk并Buffer.concat；单次receivedLength>524288000会callback错误，不直接abort，后续end仍callback(null)，Promise只认首次结算。每个回调超过限制的chunk不push，但网络不因此自动终止。
- GenericDifferentialDownloader薄封装doDownload；差分成功返回false（无需fallback）。任何差分错误通常日志后返回true，包括取消引发错误；testOnlyOptions存在时抛。完整fallback仍接收原token，若已取消会立即拒绝，但此前网络未必停止。

条件与边界：
- blockmap只JSON解析及后续结构使用，没有在这些函数中完整schema验证；单个压缩响应500MB限制不等于解压大小限制。该差分路径当前Mac配置禁用。

证据：
- `diff-fallback`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/AppUpdater.js`:643–712，range SHA256 `99f615efe780bb71847fc5486596d5e160826cb34028503938c4e5676b829215`。
- `http-download`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:204–281，range SHA256 `32d322d4399cb256593e56cac2be1bae553b3d8076ec07eadf0ef01f6abe5c5a`。
- `generic-diff`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/GenericDifferentialDownloader.js`:1–10，range SHA256 `d7aeb6e82dfe4830cfb4eeeebad515b9a4a2055ae5bb3c46e03a2804c524a3a2`。
- `mac-download`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/MacUpdater.js`:52–122，range SHA256 `cca212e9aadb19ae419790d28248cc35ce576fa35403adc0d3cb78d01929974f`。

## UD07 差分计划、重建文件与最终摘要

适用性：`bundled-conditional-differential-disabled-in-current-mac-config`。

- computeOperations用新blockmap.files[0]，按filename寻找旧表；旧checksum→offset/size保留首次出现，重复不覆盖。新块只有checksum及size均匹配才COPY，否则DOWNLOAD；相邻连续同kind区间合并，end为不含端点。
- 可选DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES仅在环境变量为true时运行有限同类相邻范围检查，不是完整blockmap schema/范围验证。doDownload要求版本一致，计划download+copy+metadata字节总量严格等于目标size。
- 打开旧文件r、新文件w，COPY按start到end-1读旧fd并pipe；远程和本地字节统一经过SHA512 DigestTransform。差分关闭自动flush验证，fileOut finish→close回调后显式validate，失败reject；fdList在成功或异常清理，close失败只日志。
- 单range逐任务下载，response error/aborted及HTTP>=400拒绝；>=400后没有return，仍接pipe/end逻辑。该直接分支不要求206或Accept-Ranges；每100次下载任务延迟1秒。重定向更新URL后followRedirect，没有本地count递增限制。最终digest用于发现输出不一致。

条件与边界：
- 计划总大小等于目标不保证每个实际响应范围正确；COPY不逐块重新计算block checksum，依靠最终摘要。关闭fileOut回调未检查传入close错误；文件系统真实故障未运行。

证据：
- `plan`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js`:1–112，range SHA256 `9bcd210c05b67bf4a16df3eb94f84e795fcce2010ae8fd044b70de05c570e23f`。
- `diff-plan-fds`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js`:1–94，range SHA256 `b3d105910627af9a1dc1dcca6da387be4a43f254edb62cfff4ec30859edcb848`。
- `diff-stream`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js`:95–226，range SHA256 `5ccb2bab946031e2360b7137e1287d0725caaaa0d22df817898169731439e166`。
- `splitter-copy`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js`:1–83，range SHA256 `7f10574bb76d69c3b26c677e8e1c37a242991f8cc5b32728a29ab23a9b9388e5`。
- `http-digest-pipes`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js`:393–499，range SHA256 `30b9ecc528aa17e4b5789a7507a55cc121fb6cb438854286c14e1d69cf553fa0`。

## UD08 多range请求与multipart重组

适用性：`bundled-conditional-differential-disabled-in-current-mac-config`。

- 任务每1000条一组；组内远程块<=1时依序COPY/单Range，否则发合并Range并要求multipart content-type可解析boundary。checkIsRangesSupported拒绝>=400；非206仅在accept-ranges缺失或等于none时拒绝，不能称严格要求206。
- DataSplitter按预期partIndex→task、预期块长度重组，间隙只允许COPY；错序/缺task/块长不符报错。boundary按长度跳过，header正文忽略，并不据每part Content-Range独立核对范围；写出处理backpressure。
- searchHeaderListEnd只在当前chunk查CRLFCRLF；找不到时保存/拼接headerListBuffer，却不在拼接buffer搜索。若分隔符跨chunk拆开且之后没有完整分隔符，会继续等header而不能正常识别该次边界。此为分块条件推断，无网络复现。
- multipart响应end无条件设10秒计时器abort并reject，成功回调没有清理该timer。若外层Promise已成功，晚reject不改该Promise结果，但不能说成功时timer被取消；若外层仍处理其他组，晚reject仍可能影响未结算下载。

条件与边界：
- multipart分支只给dicer装error，未在本段给response装error/aborted；实际Node/Electron错误传播未验证。_write已finished时忽略尾数据且不callback，也仅为包内静态边界。当前Mac禁用差分。

证据：
- `multi-range`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/multipleRangeDownloader.js`:1–113，range SHA256 `7d7bc1790367dab937aed92dd36bdb61f2c8ff260ad94d7399a8a4bf9dad3524`。
- `splitter-copy`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js`:1–83，range SHA256 `7f10574bb76d69c3b26c677e8e1c37a242991f8cc5b32728a29ab23a9b9388e5`。
- `splitter-state`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js`:84–180，range SHA256 `5d7fb53fa9dc37b9934c57ccb246d4516976be0a5c564c00a806c3b096936fe3`。
- `splitter-header-body`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js`:181–228，range SHA256 `e07ad981d8cf5958cd0cfb99e4de9af46aee1fada47e3c791f584dc62d6bb1cf`。

## UD09 嵌入blockmap兄弟类及远程字节辅助边界

适用性：`bundled-sibling-not-current-mac-caller`。

- FileWithEmbeddedBlockMapDifferentialDownloader按fileSize-(blockMapSize+4)读取末尾，inflateRaw+JSON.parse新图；旧文件尾4字节BE长度决定分配/读取，再进入相同doDownload，metadata尾附回输出。try/catch均close旧fd。
- readRemoteBytes按请求长度分配并逐块copy，end后检查position===buffer.length；request要求checkIsRangesSupported，error/aborted拒绝，沿用默认request timeout；无token abort绑定。
- 本轮Mac调用明确为GenericDifferentialDownloader，未发现本次链调用嵌入类；读取该兄弟类是为了辨明readRemoteBytes调用者，不能将其算作当前Mac应用入口。

条件与边界：
- 不扩展NSIS/AppImage/其他平台安装器；压缩器、Buffer实现和恶意尺寸输入运行表现未审为完整算法。

证据：
- `embedded-diff`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js`:1–36，range SHA256 `58c77166d6752dd7c7ea2c6f43ed8181cad31b366838626b3d3f20dfe04c2502`。
- `diff-remote`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js`:227–267，range SHA256 `0cb44206f9742a83606e7323998c4b46fe20cf51bcf98501c0ef22900201a3d1`。
- `generic-diff`：`.data/research/lawbot-2026-10-14/updater-dependencies/node_modules/electron-updater/out/differentialDownloader/GenericDifferentialDownloader.js`:1–10，range SHA256 `d7aeb6e82dfe4830cfb4eeeebad515b9a4a2055ae5bb3c46e03a2804c524a3a2`。
- `diff-fallback`：`.data/research/lawbot-2026-10-13/static-updater/node_modules/electron-updater/out/AppUpdater.js`:643–712，range SHA256 `99f615efe780bb71847fc5486596d5e160826cb34028503938c4e5676b829215`。

## 剩余边界

- external-runtime：Electron net/session/TLS/proxy/CDN live metadata and archives, OS permissions/file errors, signature verification and native Squirrel install completion remain unverified.
- third-party-algorithm-not-audit：Node crypto/hash, zlib compression, streams/fs-extra/URL/lodash internals are external library primitives; reading their call sites does not claim algorithm correctness.
- bounded-source-scope：Listed executor, differential, multipart, cancellation, progress, cache and retry function bodies are read; not an audit of every updater provider/platform/install implementation. Embedded class is sibling-only; current Mac config disables differential. No additional named readable function body in this bounded executor chain remains deferred.

--check只验证来源、范围和生成一致性，不是语义或运行验收。
