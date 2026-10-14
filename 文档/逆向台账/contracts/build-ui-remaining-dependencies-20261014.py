#!/usr/bin/env python3
"""Generate selected renderer dependency evidence. Never execute vendor code."""
from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[3]; OUT=Path(__file__).parent
SOURCE='.data/research/lawbot-2026-10-13/readable/renderer.js'
EXPECTED='4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc'
sha=lambda b:hashlib.sha256(b).hexdigest()
b=(ROOT/SOURCE).read_bytes();assert sha(b)==EXPECTED; lines=b.splitlines(keepends=True)
R={
'nu-snapshot':(32555,32609),'docx-snapshot':(30494,30500),'pdf-image-snapshot':(30617,30620),'md-snapshot':(30701,30704),'serialize':(3669,3701),
'save-store':(3733,3832),'open-store':(3721,3732),'open-recovery':(3838,3872),'close':(32744,32766),'window-close-consumer':(3945,4024),'formal-save-count':(32909,32919),'provider':(33133,33153),
'restore-batch':(33248,33290),'restore-single':(33291,33324),'restore-converter':(33325,33373),'restore-status':(30713,30728),
'file-kind':(30440,30446),'import-predicate':(36333,36345),'import-append':(36361,36445),'file-picker':(36449,36467),'register-source':(31552,31582),'file-id':(33556,33562),
'image-dataurl':(33691,33699),'pdf-worker-blob':(17534,17545),'pdf-worker-lifecycle':(17569,17615),'pdf-unmount':(25973,25994),
'entity-projection':(8810,8832),'image-projection':(26935,26955),'pdf-scroll':(24695,24704),'md-virtual':(6142,6169),'md-scroll':(6333,6356),'md-blocks':(5805,5866),
'pdf-guard-scale':(23396,23438),'pdf-transform':(23439,23499),'pdf-inverse':(23500,23506),'pdf-width-height':(23574,23593),'pdf-preview-height':(24528,24536),
'profile-alias':(4418,4482),'project-key':(29837,29860),'audit-producer':(34654,34743),'image-audit-producer':(35294,35299),
'local-docx-search':(6455,6477),'local-image-search':(26483,26496),'local-pdf-search':(23975,23998),'manual-docx':(8144,8151),'manual-image':(27246,27267),'same-position-geometry':(10649,10674),'same-position-build':(23688,23724),
'delete-flags':(4270,4286),'delete-index':(5779,5789),'delete-review-state':(32143,32153),'docx-refresh':(8287,8303),'docx-force-refresh':(8596,8598),'pdf-refresh':(25600,25623)
}
E=[dict(id=k,path=SOURCE,start_line=a,end_line=z,file_sha256=EXPECTED,slice_sha256=sha(b''.join(lines[a-1:z]))) for k,(a,z) in R.items()]
S=[]
def section(id,title,deps,ui,facts,failures,remaining,evidence):
 assert set(evidence)<=set(R)
 S.append(dict(id=id,title=title,dependencyIds=deps,uiIds=ui,staticDepth='S2',runtime='R0',completeBusinessContract=False,findings=facts,failureAndLifecycle=failures,remaining=remaining,evidenceIds=evidence))
GROUP='UI-2c1712d35460';SEARCH='UI-3f01047e6b59';PREVIEW='UI-339d8e53408d';POLICY='UI-ad41d13c4a2d';AUDIT='UI-67e30cf66ad0';CORRECT='UI-32ce2fb60c5f'
section('UIR01','Nu2各格式序列化与源数据条件',['DEP18','DEP29'],[PREVIEW],[
'Nu2优先originalBuffer，回退workspace sources；sourceRef来自文件或workspace。既无有效bytes又无sourceRef.id返回null。',
'Markdown要求sidecar；source使用已有markdownSource或fatal UTF8解码，xV建立source/scan双锚点并调用wV及gV。DOCX调用YU；PDF调用oV/dV，复用旧detection遇Markdown锚点throw；Image调用uV/dV。各格式写relativePath、recognitionProgress和exportState。',
'YU/dV先形成schemaVersion1单文档结构，批量Du2再组合schemaVersion2项目；xV保留哈希/长度匹配的persisted sidecar，否则clone。不能把helper schema版本与文件容器v1/v2/v3等同。',
'mu递归去Vue代理/toJSON，拒绝BigInt、循环对象、深度>64；非有限数变null。sources仅Object.fromEntries浅拷贝对象，Uint8Array内容未深拷贝。'],[
'Nu2可能跳过缺源或缺sidecar文档。正式Jc2比较snapshot.documents.length与co2.length，不等则取消保存；自动暂存和关闭路径不应推定具有同一计数门。'],[
'已读Nu2和YU/dV/xV直接组装；WU/oV/uV/wV/gV完整实体子归一化、所有格式schema校验由其他报告或后续具体范围承接，不宣称全部序列化闭合。'],['nu-snapshot','docx-snapshot','pdf-image-snapshot','md-snapshot','serialize','formal-save-count'])
section('UIR02','保存回执、关闭与recovery provider拥有者',['DEP18','DEP29','DEP38'],[PREVIEW],[
'workspace store S2合并同类在途保存，不同保存类型等待前一次。正式save在v1或无路径时转saveAs；等待在途recovery完成，之后生成snapshot和requestId。',
'N2调用workspace.save发生throw时保存requestId，T2最多6次查询结果、间隔500ms；未确认时后续保存先核对同requestId，不立即重新提交。P2核对projectId，revision不同时保留新sourceRefs优先、避免清当前sources。',
'根组件显式给Ie2注入recovery source provider：projectId必须匹配，单文档返回Zr2，批量由Ru2找originalBuffer或fileBuffer；卸载设null。保护提示handler亦显式绑定/解绑。',
'Zu2关窗先await取消检测。批量非v2才先flush统一映射并逐文件Am2补source；随后单PDF走Ac2，否则!Ou2()||Ec2()，Promise经detail.setCompletion返回。根卸载清回调、定时器、协调器及open-path订阅。',
'AppWindowControls订阅onBeforeClose，派发workspace:prepare-close；setCompletion覆盖单一Promise槽，await仅捕获reject，不检查resolved false。等待后按isDirty直接allow或显示保存/放弃对话框，卸载解绑。保存按钮await save成功再await discardCurrentRecovery成功才allow；放弃按钮亦要求discard回执。'],[
'flush/补source失败return false；!Ou2()分支表达式返回true，表示未生成快照时该处理器本身没有要求Ec2成功。不可将关窗所有路径写成已保存。',
'回执project mismatch报告已保存旧项目但不写当前页面；revision mismatch仍可返回true。AppWindowControls只在prepare-close后及保存按钮进入时检查isDirty；save完成后未再次检查isDirty，不能宣称所有并发新编辑都被退出门覆盖。',
'prepare-close resolved false本身不会触发failed；是否退出取决于后续isDirty，只有reject走WORKSPACE_PREPARE_CLOSE_FAILED。多个同步setCompletion调用仅等待最后一次赋值，不是Promise.all。'],[
'已读renderer provider拥有者、回执语义与AppWindowControls消费端；主进程窗口关闭状态机复用既有main报告，系统shutdown强杀、磁盘fsync/权限/断电和IPC丢包真实时序仍R0。底层保存/容器证据应复用formats报告。'],['save-store','provider','close','window-close-consumer','formal-save-count'])
section('UIR03','open/recovery到Nd2/Pd2重新构造四格式状态',['DEP18','DEP29'],[PREVIEW],[
'openDialog/openRecent使用store _2设置snapshot/sources/sourceRefs/format及lastSavedRevision；openRecovery成功设置activeRecoveryProjectId并清formal path/revision，锁定时可经密码handler重试。Dd2/Od2成功后调用Nd2。',
'Nd2多文档，或DOCX识别未完成，走批量：读取active源，逐项Pd2，再Nn2登记source，未激活文档释放originalBuffer；重建projectModeSnapshot，兼容旧假名consumer后Um2，并对queued材料启动Om2。',
'单文档分别恢复Markdown raw source和映射、PDF entities/旋转删除页/OCR进度、Image active/deleted框/DataURL、DOCX draft结构；调用对应child.applyReviewDraft，随后恢复snapshot signature并安排暂存。',
'Pd2保留文件id/relativePath/sourceRef、识别进度及exportMode；CV将user-cancel映射canceled，paused/skipped PDF映射ready，其余未complete映射queued。单PDF Ed2续识别调度在原父链外围继续，非本节完整OCR证明。'],[
'批量缺bytes且缺sourceRef或不支持格式会Ie2.clear返回false；单文档缺源亦clear。批量逐文件await Nn2，前面已登记的source在该范围未见统一回滚。',
'字段恢复不等于成功重绘或可导出；以ready恢复的paused/skipped OCR仍可能不完整。'],[
'本文补齐renderer open→Nd2→Pd2连接；Nn2主进程资源注册所有权、Om2/kd2/Ed2完整识别运行链、各child大文档渲染的动态结果尚未等价验收。'],['open-store','open-recovery','restore-batch','restore-single','restore-converter','restore-status','register-source'])
section('UIR04','Fg2实际为格式predicate；导入producer与source注册',['DEP42'],[PREVIEW],[
'Fg2仅返回$U(name)!==unsupported，不是完整导入函数。$U将docx/doc/wps归DOCX、pdf、BU图片扩展、md/markdown分类。Ug2使用系统selectFiles，回退filePaths组装fileInfos；没有浏览器选择器降级。',
'Kg2支持append/replace，按Oh2去重。Oh2优先合法workspaceDocumentId，否则对path-or-name:size:type做32bit FNV风格哈希；这不是文件内容哈希。',
'Kg2逐文件Nn2登记source，失败项从候选移除并释放本次新sourceId，允许其余继续。replace在准备之后取消旧任务/Hg2；$g2复用已有id状态或初始化新批量实体。jg2接入失败撤销本次新增，保留原材料。',
'Nn2已有sourceRef直接使用；否则要求path或bytes，目录来源若relativePath+scanSessionId则先validateFolderSource，再registerSource并校验success/sourceRef。Pn2、Dn2把source:id用作OCR缓存键。'],[
'文件predicate与id去重不验证内容合法；注册/检测服务承担其他门。Kg2 catch中的releaseSources错误被吞，不证明资源已释放。',
'jg2是异步但Kg2尾部调用未await；准备成功提示可能先于新增批量识别接入结果。该静态控制流不等于运行重现。'],[
'未递归BU全集/FU名称解析、文件picker主进程窗口授权、Og2密码/批量detect完整链；已读caller不能替代主进程授权或内容检测。'],['file-kind','import-predicate','import-append','file-picker','register-source','file-id'])
section('UIR05','预览DataURL与PDF worker Blob分开核验',['DEP42','DEP29'],[PREVIEW],[
'rp2图片预览new Blob→FileReader.readAsDataURL→Image.onload读取尺寸并写imageDataUrl。该路径不调用URL.createObjectURL，所以不存在与该DataURL对应的revokeObjectURL义务。',
'当前renderer全文createObjectURL仅17545，位于内嵌PDFWorker CDN wrapper：跨origin workerSrc时生成JS Blob URL，Worker失败终止并转fakeWorker。destroy终止worker和messageHandler；全文revokeObjectURL命中0。',
'PDF组件卸载提升渲染generation，cancel在途render任务、清timer/cache/listener、canvas尺寸归零并remove、清textLayer，然后异步cleanup/destroy加载任务或document。'],[
'PDFWorker跨origin分支的BlobURL未见revoke；实际worker origin/触发次数未运行，不宣称实际内存泄漏规模。图片FileReader只接onloadend，Image.onerror会reject；该范围没有统一取消信号。'],[
'DataURL引用由组件/文件状态生命周期与GC管理，不是显式释放证明；DOCX动态导入的第三方渲染器内部URL/资源池未在本发布renderer词法搜索结论中覆盖。'],['image-dataurl','pdf-worker-blob','pdf-worker-lifecycle','pdf-unmount'])
section('UIR06','侧栏投影与Markdown窗口定位',['DEP27','DEP28'],[GROUP,SEARCH],[
'Eo2从Markdown To2或DOCX S2.filter(k2)取实体，叠加类型、文本lowercase和评分百分比范围筛选，无该computed内分页。To2仅在非Markdown大于等于5万字符且xs2有范围时按可见segment过滤；Markdown To2()返回Ao2全集。',
'Image Pa2将G2按y/x排序，再按type/text过滤；同组上一处下一处从完整Ia2取规范化type/text，循环跳转，不局限当前Pa2过滤结果。',
'PDF Il2设置选择索引，只在实体pageNumber、有bbox、容器与该页pt2存在时，按ir2(y)-100滚动；不负责加载不存在的页面。',
'Markdown W2仅当无tables、搜索A2.trim()为空、文本>=100000才启用虚拟窗口；trim后非空查询关闭该虚拟化，纯空白不关闭。因此上轮“可能只搜虚拟窗口”剩余需限定：此开关已排除trim后非空查询时仍启用W2的推断。',
'Kf约4096字符分block，避开CRLF/高代理项边界，并延展跨边界实体/链接；按字体测宽估算24px行高，可用实测height重算prefix tops。St2先定位block并nextTick，再找source-range节点或text Range滚动。'],[
'列表仍受S2/k2/Ao2上游活跃/重叠处理影响；不等于包含全部检测原始条目。St2无DOM即return，preview/table直接scrollIntoView；没有加载成功回执。'],[
'S2/k2/Ao2与DOCX xs2所有生产者、布局测量observer回写完整链仍未在本节全部展开；浏览器字体/Range几何、emoji和大文档响应仍R0。'],['entity-projection','image-projection','pdf-scroll','md-virtual','md-scroll','md-blocks'])
section('UIR07','PDF有效框、单位推断、旋转与预览高度',['DEP28'],[SEARCH,CORRECT],[
'Ji2隐藏未调整且anchorStatus=approximate、reason含回退默认框的实体，bbox编辑模式例外；再检查框形态及页面阈值。页面尺寸未知时Xi2通过即可返回true。',
'Zi2优先用ocrImageWidth/Height与旋转后的viewport尺寸求独立sx/sy；否则Qi2用尺寸阈值推断viewport单位并写meta.__bboxUnits，未命中回Ge2比例。',
'nr2乘比例后按90/180/270旋转；ar2/ir2加页布局偏移和native修正。fr2/vr2反向映射；Ar2/Tr2优先对应框旋转尺寸，否则缩放并按page尺寸clamp。',
'rl2仅preview且单行实体时可将高度调整为页估算行高；sl2作半差居中。坐标源、旋转与preview高度调整是不同阶段。'],[
'Xi2只isNaN/正宽高检查不完整排除Infinity，Ji2页面尺寸已知时额外finite门会拒绝；尺寸未知时不会走该门。不得宣称每路径均有限数校验。'],[
'Yi2/mt2/pt2页面布局更新、Li2/vE native heuristics、al2/il2行高producer及pdf.js真实viewports未全部递归；已读算式不证明视觉真值。'],['pdf-guard-scale','pdf-transform','pdf-inverse','pdf-width-height','pdf-preview-height'])
section('UIR08','继承假名jc及项目规范化UK',['DEP30'],[POLICY],[
'jc.set规范化key/canonicalKey，建立保留token/counter/aliases；snapshot仅active时返回。canonicalKey是一次映射lookup，不递归追任意alias链。',
'tokenFor先查自身或canonical继承token，否则生成不在reserved中的编号/后缀并写entries和reserve。apply保留已有locked currentValue，autoValue来自继承或分配结果；补alias键可共享同一entry对象。',
'UK用cc类型、HK去空白与中文括号规范化；org_name调用of/sf判断fullName归组，否则自成key。VK依据reviewState rejected及deleted过滤。'],[
'jc.active取entries是否非空，只有reservedTokens而无entries时不激活；不得推定所有保留号都总能生效。'],[
'Lc/cc/of/sf以及地域/品牌列表与主进程对照未全面闭合；逐格式entry→导出/LPM/还原消费者另有链路，不能用jc完成等价证明。'],['profile-alias','project-key'])
section('UIR09','审计native全文与候选建实体',['DEP31'],[AUDIT],[
'vf2经Am2取bytes、配置pdf.js worker、逐页getTextContent。每文本item结合transform/ascent构建等宽码点框，去空白/转括号后拼字符串找匹配，按item拆分并of2合框，finally销毁PDF document。',
'vf2没有过滤项目pdfDeletedPageNumbers；上层Pf2给native命中加审计记录。该路径使用Array.from码点数组，却以UTF16 indexOf位置slice，非BMP前缀可能造成命中框偏移。',
'pf2 OCR候选保存OCR尺寸、bbox/bboxes、textSource=pdf_image_ocr；ff2 native候选标rangeAdjusted/page-top/textLayerBbox；xv2 Image合成manual框。无法of2合框则返回null。'],[
'加载promise在try/finally外await，若其reject未进入该document.destroy finally；加载失败如何由loadingTask自身释放仍需pdf.js语义。'],[
'Am2所有源获取分支、mC文本异常过滤、of2/rf2几何聚合和pdf.js字体数值待独立具体阅读或复用；本节不把page遍历称全部页面审计有效。'],['audit-producer','image-audit-producer'])
section('UIR10','本地OCR匹配与人工建框',['DEP32'],[CORRECT,AUDIT],[
'DOCX sn2合并body xl2/kl2与图片OCR nv命中；图片offset按documentText.length+1+命中序号合成，以path/line/occurrence去重。',
'PDF so2按native/OCR启用态调用Vn2(false)/Fa2(false)，转换display/native框并ro2去重。Image Xe2优先OCR非空结果，失败/空结果回退当前G2文本包含的整实体框；fallback不能等价于完整图像搜索。',
'DOCX hs2要求text/bbox/imagePath，生成image_ocr人工实体、记录source和比例框并刷新；Image yi2生成单/多框，支持regionOnly，插入后清对应deleted框记录。'],[
'Image Xe2 IPC error被吞并用已有实体回退；上层summary可能不显示OCR失败。人工build是内存push，后续持久化由事件链承担。'],[
'DOCX同图重复位置批量、PDF Ul2→Zs2内部建框、sn2依赖xl2/kl2/nv全部边界、mi2/Ye2/ro2等几何匹配仍需分项范围；不再把已读sn2/Xe2/so2本体列为完全未读。'],['local-docx-search','local-image-search','local-pdf-search','manual-docx','manual-image'])
section('UIR11','PDF跨页相对框helpers',['DEP32'],[CORRECT],[
'Ib要求rotation完全相同且页宽高正数，宽高比相对差<=2.5%；Pb简单乘目标页宽高，不额外clamp。Rb用x方向扫描带+合并y区间计算已有框覆盖的面积并归一化，避免把重叠框面积重复相加。',
'Es2以3s Promise.race取getPage与viewport，失败返回null并清timer；并不取消原getPage Promise。As2优先OCR尺寸比例，否则Ge2，再旋转；Ts2逆旋转并除Ge2、位置至少0尺寸至少1。',
'Is2记录samePositionBatchId/sourcePage/manual_region以及可选regionOnly元数据。父Rs2的单次收集再提交控制流沿用上轮已审证据。'],[
'页rotation不兼容直接跳过；尺寸适配允许比例变化，不是像素相同。3s仅本helper等待限制，不能改写为取消底层PDF任务。'],[
'Es2 tn2旋转来源和所有页集合生产者、最终parent add-entities/导出渲染几何需要相关原报告及实样本共同验证。'],['same-position-geometry','same-position-build'])
section('UIR12','删除底层标志与child refresh/卸载',['DEP27','DEP29'],[GROUP,PREVIEW],[
'zf只对有效整数索引且未deleted项clone并标deleted；_c额外hiddenByType/原userAdded标记及rejected，Sc解除type-hidden并恢复pending或user-added。根er2写rejected/user/note，不直接落盘。',
'forceRefreshReviewHighlights=$s2：nextTick后视DOCX DOM就绪调gs2，否则更新计数。gs2按指定IDs拆除mark/overlay并normalize，或全量Xr2/ps2；preview重做bs2，有查询时重做搜索。',
'PDF zu2提升Eu2、cancel旧render任务、串行Tu2执行Xu2；virtual遇忙可复用当前promise；full开始15s慢渲染提示。catch为空。卸载cancel并cleanup/destroy见UIR05。'],[
'forceRefresh成功返回没有校验每实体DOM highlight；PDF队列catch吞异常，因此await zu2完成不单独证明重绘成功。'],[
'Xr2/ps2全部DOM/图片图层算法、DOCX动态renderer加载与unmount完整清理、Xu2全部viewport虚拟render细节未递归完；仅将上述已读dispatcher及删除helpers销去本体未读。'],['delete-flags','delete-index','delete-review-state','docx-refresh','docx-force-refresh','pdf-refresh','pdf-unmount'])
inputs=[dict(path='文档/逆向台账/contracts/remaining-dependencies-20261014.json',role='historical-discovery-reference',discovery_sha256='a3bb0a99648819e528943011775d97448d4a5223392c23e3d1d735bd9df436f0',note='Discovery matrix hash captured before this supplement; intentionally not a current pin or regeneration dependency. Matrix may later reference this report without a hash cycle.')]
for name in ['deep-ui-parents-20261014.json']:
 p=OUT/name;inputs.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(p.read_bytes())))
lex={term:[n+1 for n,l in enumerate(lines) if term.encode() in l] for term in ['createObjectURL','revokeObjectURL']}
report=dict(schemaVersion=1,date='2026-10-14',kind='ui-readable-dependencies-supplement',inputs=inputs,scope=dict(sections=len(S),evidenceRanges=len(E),staticDepth='S2',runtime='R0',candidateS3=0,completeBusinessContracts=0),method=['Read-only static source reading; no competitor runtime/activation bypass.','Exact inclusive ranges and raw-byte SHA-256; builder validates data only and does not execute vendor modules.','Focused dependency sections; completedReading means named helper body/control flow, never full recursive business or runtime closure.','Original ITER017 pins and prior reports untouched; independent review pending.'],lexicalChecks=dict(path=SOURCE,file_sha256=EXPECTED,occurrences=lex,scope='Single published renderer file; excludes other chunks and native implementation.'),sections=S,evidence=E,remainingSummary=[{'area':'export and source ownership','items':['逐格式假名entry到最终导出/LPM/还原消费者','主进程跨window授权/原子持久化及真实关窗时序；复用既有main证据，不重复宣称其从未读']},{'area':'renderer algorithm children','items':['WU/oV/uV/wV/gV全部子归一化','DOCX Xr2/ps2/动态renderer load/unmount及同图批量','PDF Xu2/Yi2/行高生产者、Am2/of2/rf2及manual Ul2→Zs2','UK的of/sf和地域/品牌表逐项对照']},{'area':'runtime','items':['合法激活后的大文件、字体、旋转/非BMP、保存重开、取消/异常和导出真值对照仍R0']}])
md=['# UI可读剩余依赖补证（2026-10-14）','','12节、54个精确范围，S2/R0；候选S3=0，完整业务闭合=0。只新增本报告与builder，旧报告/pins不变。计数/hash不代表完整静态链或运行正确。','']
md[2]=f'{len(S)}节、{len(E)}个精确范围，S2/R0；候选S3=0，完整业务闭合=0。只新增本报告与builder，旧报告/pins不变。计数/hash不代表完整静态链或运行正确。'
for x in S:
 md += [f"## {x['id']} {x['title']}",'',f"关联：{', '.join(x['dependencyIds'])}；{', '.join(x['uiIds'])}。",'']
 for k,t in [('findings','已读结论'),('failureAndLifecycle','失败及生命周期'),('remaining','仍未闭合')]:md += [f'### {t}','']+[f'- {v}' for v in x[k]]+['']
 md += ['### 精确证据','']
 for k in x['evidenceIds']:
  e=next(v for v in E if v['id']==k);md += [f"- `{k}`：renderer.js:{e['start_line']}-{e['end_line']}，slice SHA-256 `{e['slice_sha256']}`。"]
 md += ['']
md += ['## 全文检索边界','',f'当前 renderer SHA-256 `{EXPECTED}`。createObjectURL：{lex["createObjectURL"]}；revokeObjectURL：{lex["revokeObjectURL"]}。该检索不覆盖其他动态模块。','']
files={OUT/'ui-remaining-dependencies-20261014.json':json.dumps(report,ensure_ascii=False,indent=2)+'\n',OUT/'ui-remaining-dependencies-20261014.md':'\n'.join(md)+'\n'}
if '--check' in sys.argv:
 for p,text in files.items():assert p.read_text()==text,p
 print(json.dumps(dict(result='passed',sections=len(S),evidenceRanges=len(E),mode='structural-hash-only'),ensure_ascii=False))
else:
 for p,text in files.items():p.write_text(text)
 print(json.dumps(dict(result='written',sections=len(S),evidenceRanges=len(E)),ensure_ascii=False))
