#!/usr/bin/env python3
# coding: utf-8
"""Read source bytes and generate static notes; never imports or executes vendor code."""
from pathlib import Path
import json,hashlib,sys,struct
R=Path(__file__).resolve().parents[3]; C=Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest()
M='.data/research/lawbot-2026-10-14/updater-dependencies/extraction.json'
manifest=json.loads((R/M).read_text())
assert manifest['archiveSha256']=='3a6ed78d23959ab310e56b83e412f0616e1d402767dcdbf910270a4c1aa3c9ae'
files={Path(x['path']).name:x for x in manifest['files']+manifest['existingSourceReadbacks']}
for x in files.values():assert sha((R/x['path']).read_bytes())==x['sha256'],x['path']
# Recheck extraction against original ASAR byte offsets. No npm/network or JS execution.
with (R/manifest['archive']).open('rb') as f:
 h=hashlib.sha256()
 for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 assert h.hexdigest()==manifest['archiveSha256']
 f.seek(0);header=struct.unpack('<4I',f.read(16));tree=json.loads(f.read(header[3]));base=8+header[1]
 assert base==manifest['payloadOffset']
 for x in files.values():
  node=tree
  for part in x['asarPath'].split('/'):node=node['files'][part]
  assert int(node['offset'])==x['archiveOffset'] and node['size']==x['size']
  f.seek(base+int(node['offset']));assert f.read(node['size'])==(R/x['path']).read_bytes()
main='.data/research/lawbot-2026-10-13/readable/main.js'
files['main.js']=dict(path=main,sha256='40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba')
assert sha((R/main).read_bytes())==files['main.js']['sha256']
evidence=[]
def ev(id,name,a,z):
 x=files[name]; b=(R/x['path']).read_bytes();ls=b.splitlines(keepends=True);assert 1<=a<=z<=len(ls)
 evidence.append(dict(id=id,path=x['path'],startLine=a,endLine=z,fileSha256=x['sha256'],rangeSha256=sha(b''.join(ls[a-1:z]))))
ev('app-config','main.js',26143,26188);ev('app-download-events','main.js',26224,26267)
ev('updater-download','AppUpdater.js',435,480);ev('execute-download','AppUpdater.js',559,642);ev('diff-fallback','AppUpdater.js',643,712);ev('mac-download','MacUpdater.js',52,122)
ev('electron-executor','electronHttpExecutor.js',1,78)
ev('http-api-cancel','httpExecutor.js',92,203);ev('http-download','httpExecutor.js',204,281);ev('http-redirect','httpExecutor.js',282,345);ev('http-url','httpExecutor.js',366,392);ev('http-digest-pipes','httpExecutor.js',393,499);ev('http-config','httpExecutor.js',500,513);ev('http-sensitive-headers','httpExecutor.js',24,50)
ev('cancel-token','CancellationToken.js',5,107);ev('full-progress','ProgressCallbackTransform.js',5,53);ev('diff-progress','ProgressDifferentialDownloadCallbackTransform.js',5,89);ev('rename-retry','retry.js',5,20)
ev('cache','DownloadedUpdateHelper.js',12,149);ev('temp-file','DownloadedUpdateHelper.js',150,168)
ev('generic-diff','GenericDifferentialDownloader.js',1,10);ev('plan','downloadPlanBuilder.js',1,112);ev('diff-plan-fds','DifferentialDownloader.js',1,94);ev('diff-stream','DifferentialDownloader.js',95,226);ev('diff-remote','DifferentialDownloader.js',227,267)
ev('multi-range','multipleRangeDownloader.js',1,113);ev('splitter-copy','DataSplitter.js',1,83);ev('splitter-state','DataSplitter.js',84,180);ev('splitter-header-body','DataSplitter.js',181,228);ev('embedded-diff','FileWithEmbeddedBlockMapDifferentialDownloader.js',1,36)
sections=[]
def add(id,title,observations,limits,refs,applicability='current-full-download-or-shared'):
 sections.append(dict(id=id,title=title,dependencyIds=['DEP37'],staticDepth='S2',runtime='R0',completeBusinessContract=False,applicability=applicability,observations=observations,conditionalRisks=limits,evidenceIds=refs))
add('UD01','调用适用性：当前Mac完整下载，差分仅包内条件路径',[
'HI仅darwin supported；有配置时显式设置disableDifferentialDownload为process.platform===darwin，并注册download-progress。应用downloadUpdate不传取消token；available且有release才调用库，ready直接返回；应用和库各有downloadPromise去重。',
'库缺updateInfoAndProvider先dispatchError再拒绝；已有downloadPromise直接复用，后续调用的token不会替换活动下载token。新调用把requestHeaders/token/disableDifferentialDownload传MacUpdater，非CancellationError派发error，finally清promise。',
'MacUpdater读取sysctl/uname（失败只日志），结合process.arch/Rosetta交给既有arch filter；选zip，缺失抛ERR_UPDATER_ZIP_FILE_NOT_FOUND。仅存在旧update.zip且未禁差分时进入差分，差分返回true才完整下载。当前应用配置会走完整下载，已有cache命中除外。',
'应用以update-downloaded事件写ready/pendingUpdate；await库返回后以snapshot.phase===ready判success。该事件和返回不是OS安装完成证明。'
],['差分节为随发布包可见的条件逻辑，未声称当前Mac运行过；未为此改变配置或调用竞品。既有feed/provider/arch filter/native updateDownloaded链引用旧报告，不重报成本轮逐行重审。'],['app-config','app-download-events','updater-download','mac-download'])
add('UD02','临时文件、提交顺序与缓存输出',[
'executeDownload从URL pathname解码后按扩展名选basename，否则从metadata url取basename；建立pending目录。validateDownloadedPath命中直接done(false)，不下载。task输出临时文件后rename最终文件；仅Error且message以EBUSY:开头时最多追加60次、间隔500ms。',
'retry在catch检查shouldRetry和自己的token后等待；调用rename retry没有传下载token，等待后递归task前无再次取消检查。createTempUpdateFile最多三次unlink尝试；ENOENT即采用该名，其他失败加编号，返回路径而非独占创建。',
'done先setDownloadedFile（可写update-info.json），再taskOptions.done，最后如存在pending/current.blockmap就复制到cache，再返回[updateFile]或[updateFile,packageFile]。task/rename catch清pending和unlink final，清理错误吞掉；CancellationError另发update-cancelled。',
'done(false/true)都位于task/rename的try/catch之外。cache写入、task.done或末尾blockmap复制失败可以在文件已经rename、甚至task.done已经通知后使调用拒绝；该catch不会回滚这些后置操作。'
],['新下载basename限制不能推广到磁盘cache记录；task.done交接native更新流程沿用COL-17/系统报告边界。重试最多61次task尝试并非固定30秒总时限。'],['execute-download','temp-file','rename-retry','mac-download'])
add('UD03','完整HTTP下载、重定向与缓存session',[
'ElectronHttpExecutor用electron-updater partition且cache:false，复用session；createRequest遇Host header移到options.host并删除header，可绑定proxy login callback。download通过token.createPromise包装，manual redirect，成功resolve目标路径。',
'doDownload拒绝HTTP>=400，监听response error；否则交configurePipes或responseHandler。request装error/aborted及socket timeout；默认60秒是socket事件设置的超时，超时abort，不是整个下载总预算或已验证Electron socket行为。',
'Electron redirect事件先abort旧request再调用prepareRedirectUrlOptions。该helper按主机/协议/端口剥离登记的敏感header，同主机标准端口http→https例外；普通非敏感header保留。',
'doDownload两处递归传redirectCount++，下层收到旧值；API重定向同样传原redirectCount。虽有maxRedirects=10及比较，不能据此声称可靠递增的重定向次数上限。'
],['只能确认可见JS的header策略；Electron网络策略、代理、TLS、CDN真实重定向和超时行为未运行。差分直接followRedirect路径并不调用同一个敏感header helper，不把两条路径混为同一保障。'],['electron-executor','http-download','http-api-cancel','http-redirect','http-url','http-config','http-sensitive-headers','diff-stream'])
add('UD04','取消协议与进度：Promise拒绝不等于底层停止',[
'CancellationToken支持parent传播，已取消createPromise立即拒绝；活动token取消时先执行可选onCancel回调，finally以CancellationError拒绝，结算后移除listener。dispose解绑并清listeners。',
'API doApiRequest把onCancel连接request.abort；完整文件download与downloadToBuffer把onCancel传给doDownload，但doDownload没有使用该字段，也未连接abort。token可拒绝包装Promise，不能从这些函数保证网络/写盘即时停止。',
'完整下载只有onProgress存在且响应content-length非null时装ProgressCallbackTransform；transform在chunk/flush检查cancelled并报普通Error。configurePipes stream error会close fileOut，但token已取消时不再callback该error。没有progress或content-length时没有这条流级取消检查。',
'应用已经注册download-progress，因此onProgress在正常配置下存在；content-length仍由响应决定。HI本次调用未传token，也未从这些入口观察到用户取消按钮协议，不能把库条件取消风险说成已复现用户操作。',
'差分只有单range模式且onProgress存在时装取消感知transform；多range的DataSplitter无token，差分函数没有token.createPromise或取消abort。progress统计远程字节不含COPY；100%进度发生在digest/最终提交完成之前，非验证完成证明。'
],['库取消条件、底层请求继续写入、竞态清理均为源码条件，不是动态缺陷复现。Node流/Electron调度结果仍R0。'],['cancel-token','http-api-cancel','electron-executor','http-download','http-digest-pipes','full-progress','diff-progress','diff-stream','multi-range','splitter-copy','app-download-events'])
add('UD05','完整性校验与跨启动缓存',[
'configurePipes优先sha512；长度128且不含+/Z/=时按hex，否则base64；没有sha512而有sha2则SHA256 hex。DigestTransform逐chunk计算，flush得到actual并严格比expected，缺结果或不一致报错。X-Checksum-Sha2只在响应取到该键且双方非null时比较；safeGetHeader直接按传入键索引，不自行规范大小写。',
'完整流错误close fileOut并在token未取消时callback；finish后close callback决定完成。无digest metadata时该函数不自行要求必须有摘要，此前Provider的metadata门槛见COL-17。',
'同进程cache要求同path、versionInfo/fileInfo.info深相等且文件存在，不重新hash。跨启动读update-info.json：读取/解析异常按ENOENT区别清pending；metadata sha512相等、文件存在且整文件sha512 base64一致才采用。',
'磁盘cache fileName只判!==null，不验证字符串/undefined/basename；cachedInfo为null、无filename或非字符串在后续属性/path操作可能抛，含路径成分也未在此归一。这个读取门不能继承新下载文件名basename保护。setDownloadedFile先写内存再可选JSON，clear不复位_downloadedFileInfo，emptyDir失败吞掉。'
],['摘要相等只证明与提供metadata的一致性，不证明发行者身份/签名信任、OS安装或密码学实现正确。cache篡改需有实际本地写入前提，未宣称远端可利用或已运行。'],['http-digest-pipes','cache','execute-download'])
add('UD06','差分blockmap取得、缓存及失败回退',[
'从provider取得旧/新blockmap URL；先下载新blockmap，经非空检查、gunzip+JSON.parse，再gzip写pending/current.blockmap。旧图优先cache，读取/解析失败日志后再远程下载。',
'downloadToBuffer用token Promise、收集chunk并Buffer.concat；单次receivedLength>524288000会callback错误，不直接abort，后续end仍callback(null)，Promise只认首次结算。每个回调超过限制的chunk不push，但网络不因此自动终止。',
'GenericDifferentialDownloader薄封装doDownload；差分成功返回false（无需fallback）。任何差分错误通常日志后返回true，包括取消引发错误；testOnlyOptions存在时抛。完整fallback仍接收原token，若已取消会立即拒绝，但此前网络未必停止。'
],['blockmap只JSON解析及后续结构使用，没有在这些函数中完整schema验证；单个压缩响应500MB限制不等于解压大小限制。该差分路径当前Mac配置禁用。'],['diff-fallback','http-download','generic-diff','mac-download'],'bundled-conditional-differential-disabled-in-current-mac-config')
add('UD07','差分计划、重建文件与最终摘要',[
'computeOperations用新blockmap.files[0]，按filename寻找旧表；旧checksum→offset/size保留首次出现，重复不覆盖。新块只有checksum及size均匹配才COPY，否则DOWNLOAD；相邻连续同kind区间合并，end为不含端点。',
'可选DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES仅在环境变量为true时运行有限同类相邻范围检查，不是完整blockmap schema/范围验证。doDownload要求版本一致，计划download+copy+metadata字节总量严格等于目标size。',
'打开旧文件r、新文件w，COPY按start到end-1读旧fd并pipe；远程和本地字节统一经过SHA512 DigestTransform。差分关闭自动flush验证，fileOut finish→close回调后显式validate，失败reject；fdList在成功或异常清理，close失败只日志。',
'单range逐任务下载，response error/aborted及HTTP>=400拒绝；>=400后没有return，仍接pipe/end逻辑。该直接分支不要求206或Accept-Ranges；每100次下载任务延迟1秒。重定向更新URL后followRedirect，没有本地count递增限制。最终digest用于发现输出不一致。'
],['计划总大小等于目标不保证每个实际响应范围正确；COPY不逐块重新计算block checksum，依靠最终摘要。关闭fileOut回调未检查传入close错误；文件系统真实故障未运行。'],['plan','diff-plan-fds','diff-stream','splitter-copy','http-digest-pipes'],'bundled-conditional-differential-disabled-in-current-mac-config')
add('UD08','多range请求与multipart重组',[
'任务每1000条一组；组内远程块<=1时依序COPY/单Range，否则发合并Range并要求multipart content-type可解析boundary。checkIsRangesSupported拒绝>=400；非206仅在accept-ranges缺失或等于none时拒绝，不能称严格要求206。',
'DataSplitter按预期partIndex→task、预期块长度重组，间隙只允许COPY；错序/缺task/块长不符报错。boundary按长度跳过，header正文忽略，并不据每part Content-Range独立核对范围；写出处理backpressure。',
'searchHeaderListEnd只在当前chunk查CRLFCRLF；找不到时保存/拼接headerListBuffer，却不在拼接buffer搜索。若分隔符跨chunk拆开且之后没有完整分隔符，会继续等header而不能正常识别该次边界。此为分块条件推断，无网络复现。',
'multipart响应end无条件设10秒计时器abort并reject，成功回调没有清理该timer。若外层Promise已成功，晚reject不改该Promise结果，但不能说成功时timer被取消；若外层仍处理其他组，晚reject仍可能影响未结算下载。'
],['multipart分支只给dicer装error，未在本段给response装error/aborted；实际Node/Electron错误传播未验证。_write已finished时忽略尾数据且不callback，也仅为包内静态边界。当前Mac禁用差分。'],['multi-range','splitter-copy','splitter-state','splitter-header-body'],'bundled-conditional-differential-disabled-in-current-mac-config')
add('UD09','嵌入blockmap兄弟类及远程字节辅助边界',[
'FileWithEmbeddedBlockMapDifferentialDownloader按fileSize-(blockMapSize+4)读取末尾，inflateRaw+JSON.parse新图；旧文件尾4字节BE长度决定分配/读取，再进入相同doDownload，metadata尾附回输出。try/catch均close旧fd。',
'readRemoteBytes按请求长度分配并逐块copy，end后检查position===buffer.length；request要求checkIsRangesSupported，error/aborted拒绝，沿用默认request timeout；无token abort绑定。',
'本轮Mac调用明确为GenericDifferentialDownloader，未发现本次链调用嵌入类；读取该兄弟类是为了辨明readRemoteBytes调用者，不能将其算作当前Mac应用入口。'
],['不扩展NSIS/AppImage/其他平台安装器；压缩器、Buffer实现和恶意尺寸输入运行表现未审为完整算法。'],['embedded-diff','diff-remote','generic-diff','diff-fallback'],'bundled-sibling-not-current-mac-caller')
D=dict(schemaVersion=1,date='2026-10-14',iteration='ITER-019',scope=['DEP37'],staticDepth='S2',runtime='R0',executedVendor=False,candidateS3=0,completeBusinessContracts=0,sourceProvenance=dict(manifest=M,manifestSha256=sha((R/M).read_bytes()),archive=manifest['archive'],archiveSha256=manifest['archiveSha256'],archiveSize=manifest['archiveSize'],newExtractedFiles=13,existingSourceReadbacks=2,method='existing local ASAR exact header+offset bytes; no network/npm/vendor execution'),sections=sections,evidence=evidence,evidenceCount=len(evidence),crossReportConnections=[dict(report='deep-system-20261014.json',ids=['IPC-4e269deca69e','IPC-a73b27802b39','IPC-6099fda9db85','IPC-1e8858b1ed43'],meaning='HI controls/feed/native lifecycle previously read; this report adds actual executor sources, not per-interface full-chain closure'),dict(report='deep-collaboration-20261014.json',ids=['COL-17'],meaning='GenericProvider/Provider and Mac native handoff prior scope; mutual see-other-group TODO superseded only for explicitly read executor/differential/cache code')],remaining=[dict(kind='external-runtime',detail='Electron net/session/TLS/proxy/CDN live metadata and archives, OS permissions/file errors, signature verification and native Squirrel install completion remain unverified.'),dict(kind='third-party-algorithm-not-audit',detail='Node crypto/hash, zlib compression, streams/fs-extra/URL/lodash internals are external library primitives; reading their call sites does not claim algorithm correctness.'),dict(kind='bounded-source-scope',detail='Listed executor, differential, multipart, cancellation, progress, cache and retry function bodies are read; not an audit of every updater provider/platform/install implementation. Embedded class is sibling-only; current Mac config disables differential. No additional named readable function body in this bounded executor chain remains deferred.')],verificationMeaning='--check pins exact ASAR/file/range bytes and deterministic output only; semantic review is independent and runtime stays R0.')
md=['# ITER019 更新下载执行器与差分依赖补读','','9节30范围，13份新提取源码及2份旧源码逐字回核原ASAR；S2/R0。','当前Mac配置明确禁用差分；差分代码是包内条件路径，未运行竞品。',f'原ASAR SHA256：`{manifest["archiveSha256"]}`。来源记录：`{M}`。','']
for s in sections:
 md+=['## '+s['id']+' '+s['title'],'','适用性：`'+s['applicability']+'`。','']+['- '+x for x in s['observations']]+['','条件与边界：']+['- '+x for x in s['conditionalRisks']]+['','证据：']
 for ref in s['evidenceIds']:
  v=next(v for v in evidence if v['id']==ref);md.append(f'- `{ref}`：`{v["path"]}`:{v["startLine"]}–{v["endLine"]}，range SHA256 `{v["rangeSha256"]}`。')
 md+=['']
md+=['## 剩余边界','']+['- '+x['kind']+'：'+x['detail']for x in D['remaining']]+['','--check只验证来源、范围和生成一致性，不是语义或运行验收。','']
for p,t in {C/'iteration019-updater-dependencies.json':json.dumps(D,ensure_ascii=False,indent=2)+'\n',C/'iteration019-updater-dependencies.md':'\n'.join(md)}.items():
 if '--check' in sys.argv:assert p.read_text()==t,p
 else:p.write_text(t)
print(json.dumps(dict(result='passed' if '--check' in sys.argv else 'written',sections=len(sections),ranges=len(evidence),mode='source-hash-only')))
