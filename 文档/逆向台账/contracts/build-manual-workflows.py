#!/usr/bin/env python3
"""Serialize manually read contracts; source code is read as data, never executed.

Run --check before regeneration. This checks evidence/structure, not semantic truth.
"""
import hashlib
import json
import runpy
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = '.data/research/lawbot-2026-10-13'
OUT = ROOT / '文档/逆向台账/contracts'
INDEX = json.loads((OUT / 'ipc-contract-index.json').read_text())
CHANNELS = {x['channel']: x for x in INDEX['channels']}
SOURCES = {'main': f'{BASE}/readable/main.js', 'ui': f'{BASE}/readable/renderer.js', 'preload': f'{BASE}/extracted/dist/preload/index.js'}
sha = lambda b: hashlib.sha256(b).hexdigest()
EVIDENCE = {}

def ev(key, source, start, end):
    path = SOURCES[source]
    data = (ROOT / path).read_bytes()
    lines = data.splitlines(keepends=True)
    assert 1 <= start <= end <= len(lines)
    EVIDENCE[key] = {'path': path, 'startLine': start, 'endLine': end,
        'fileSha256': sha(data), 'sliceSha256': sha(b''.join(lines[start-1:end])),
        'coordinateSystem': '1-based inclusive whole lines; UTF-8 bytes including newline'}

for row in [
    ('registry','main',15718,15912), ('source-handler','main',16981,17072),
    ('import-ui','ui',31552,31640), ('pick-ui','ui',36449,36468),
    ('drop-ui','ui',36511,36544), ('scan','main',16633,16732),
    ('pick-handler','main',16876,16901), ('validate-folder','main',16912,16927),
    ('unlock-ui','ui',36250,36274), ('preview-ui','ui',34071,34095),
    ('workspace-ui','ui',3733,3887), ('autosave-ui','ui',3888,3918),
    ('workspace-handler','main',25616,25745), ('workspace-service','main',22560,22693),
    ('workspace-injection','main',26848,26883), ('recents','main',19505,19570),
    ('recovery','main',19894,20092), ('protected-store','main',15074,15120),
    ('workspace-container','main',25190,25276), ('key-read','main',19688,19696),
    ('key-write','main',19791,19840), ('detect-handler','main',17196,17368),
    ('detect-ui','ui',35912,35962), ('detect-service-docx','main',10236,10292),
    ('detect-service-pdf','main',10647,10675), ('detect-service-image','main',12390,12476),
    ('docx-images','main',17368,17409), ('docx-images-ui','ui',35502,35553),
    ('ocr-search','main',18186,18273), ('ocr-region','main',18273,18308),
    ('ocr-page','main',18308,18342), ('ocr-ui-search','ui',22975,22999),
    ('ocr-ui-region','ui',24171,24200), ('ocr-ui-page','ui',25622,25655),
    ('ocr-cache','main',15335,15375), ('apply-filter','main',14537,14549),
    ('apply-start','main',17409,17462), ('apply-markdown','main',17463,17526),
    ('apply-format','main',17527,17789), ('apply-write','main',17790,17934),
    ('apply-ui','ui',32063,32082), ('apply-receipts-ui','ui',33795,33889),
    ('apply-cancel-ui','ui',33889,33908), ('write-helper','main',16759,16789),
    ('task-controls','main',17158,17183), ('pause-ui','ui',31236,31254),
    ('mapping','main',16586,16638), ('secure-pdf','main',14599,14777),
    ('aux-files','main',17073,17107), ('aux-draft','main',17117,17132),
    ('forget-ui','ui',37465,37485), ('preload-generic','preload',303,323),
]: ev(*row)

RECORDS = []
def add(channel, flow, title, refs, inp, output, pre, effects, failure, gaps, ui='tracked'):
    c = CHANNELS[channel]
    RECORDS.append({'id': c['id'], 'channel': channel, 'title': title, 'flowId': flow,
        'inputAndFiltering': inp, 'outputContract': output, 'preconditions': pre,
        'persistentAndMemoryEffects': effects, 'failureAndCancellation': failure,
        'uiRelation': ui, 'evidenceIds': refs.split(),
        'originalHandlerEvidence': [h['evidence'] for h in c['handlers']],
        'originalOperationEvidence': [o['evidence'] for o in c['operations']],
        'preloadEvidence': c['preloadExposures'],
        'unresolvedDependencies': gaps.split('|'),
        'recommendation': {'staticDepth': 'S2', 'runtimeState': 'R0',
            'flowMapping': 'manually-traced-partial', 'completeBusinessContract': False,
            'manualContractRef': {'path': '文档/逆向台账/contracts/manual-workflow-contracts.json', 'channel': channel}}})

add('desensitization:select-files','MANUAL-IMPORT','系统选择文件','pick-ui pick-handler',
    '无参数；系统选择器 openFile/multiSelections，扩展名过滤；renderer 再以 Fg2(name) 过滤。',
    '取消返回 canceled:true,filePaths:[]；成功返回 filePaths 和 fileInfos(path,name,size,ext)。',
    '需要 Electron 文件选择器；本 handler 无直接授权码断言。',
    '只选择并 stat；UI 转成 pending 文件项，不等于已经检测。',
    'UI 将取消返回 null；选择/stat 抛错由 UI catch 显示失败；不更改已有审查。',
    'Fg2 全部格式白名单尚未逐分支展开|OS 文件授权/可达性未运行')
add('desensitization:scan-dropped-folder','MANUAL-IMPORT','拖入文件夹扫描','drop-ui scan pick-handler',
    'folderPath 非空字符串；UI 限单一文件夹且不能与文件混拖。服务 lstat/realpath 检查普通目录、跳过符号链接/目录环/根外路径和不支持文件。',
    'canceled:false、sessionId、sourceRootName/scannedAt、files（包含 sourceRef）、skipped、totalDiscovered/supportedBytes/counts；失败 canceled:false,error。没有 success 字段。',
    '可访问本地普通目录；没有激活前置调用。',
    'b2 内存记录扫描结果，12 小时按访问清理；末尾逐文件再次 lstat 检查后调用 S2 登记并复制受管源，返回 sourceRef。UI 用扫描清单构造批量项目。',
    '扫描报错 UI 保留当前审查；已登记的部分 sourceRefs 未见此处成组回滚。_2 调用未传 AbortSignal，不能归为可取消检测任务。',
    '目录扫描中 TOCTOU 竞态未运行|UI folder registration 的完整边界仍需补审')
add('desensitization:validate-folder-source','MANUAL-IMPORT','扫描后登记前校验','validate-folder import-ui scan',
    'scanSessionId、relativePath（反斜线转 /）；须是该扫描结果已有相对路径。',
    'success:true 或 success:false,error。',
    '扫描会话有效；普通文件非符号链接，size 相同、mtimeMs 差不超过 1ms。',
    '只读元信息；没有内容 hash 比对。UI Nn2 仅无 sourceRef 且有 path/relativePath/scanSessionId 时在 registerSource 前调用；已有 sourceRef 会先返回，正常扫描已登记文件不一定再走此校验。',
    '会话失效/文件变动/删除返回失败并阻止本次登记；不恢复原文件。',
    '元信息相同但内容变化不在本校验覆盖范围|validate 与 register 间竞态未证明封闭')
add('desensitization:register-source','MANUAL-IMPORT','登记受管源文件','import-ui source-handler registry',
    'filePath 或非空 fileBuffer，fileName；路径 normalize；bytes 支持 Buffer/ArrayBuffer/view/array。legacy .doc/.wps 可转换为内部 DOCX。',
    'success:true,sourceRef；可带 needsPassword/legacyOffice/internalDocxReused；失败 error 与可选 errorCode。',
    '路径必须 stat.isFile；buffer 必须非空；本 handler 无直接激活断言。',
    '普通路径复制进 safeTemp/lawbot-source-registry/<pid-uuid>；bytes 写临时文件并 SHA256；路径重复登记复用 Map 引用，并不重新复制。legacy 元信息另存 Map。',
    '异常包装失败；resolve 时临时文件缺失可从原路径重复制并清空旧 hash，因此 sourceRef 不等同永久内容寻址。登记中途 I/O 失败的孤立临时文件清理未证闭合。',
    'Dp/Sp legacy 转换和格式探测内部未完整审计|来源路径授权/registry 跨窗口隔离未见本层约束')
add('desensitization:unlock-source','MANUAL-IMPORT','加密源文件解锁并替换引用','unlock-ui source-handler registry',
    'sourceRef.id；password 非空、长度不超过 4096；格式限 docx/pdf/doc/wps。',
    '新 sourceRef（可含 legacyOffice）；失败 DOCUMENT_PASSWORD_INVALID/DOCUMENT_UNLOCK_FAILED/DOCUMENT_ENCRYPTION_UNSUPPORTED 等。',
    '旧引用有效；内容解密/魔数/大小约束必须通过。无直接产品激活断言。',
    '登记解密后受管副本，保存 originalSourcePath，再 release 旧引用；UI 同步当前项、单批文件列表和 active ref。',
    'UI 120 秒超时仅拒绝等待，未中止主进程解密；新引用创建后旧引用释放失败可能使 UI 收不到新引用，未见事务回滚。',
    'officecrypto/lp PDF 密码解密和大小限制具体实现未闭合|密码内存清理未审')
add('desensitization:read-source','MANUAL-PREVIEW','按引用加载预览原件','preview-ui workspace-ui source-handler registry',
    'sourceRef.id 必填；可指定展示用 fileName；registry 不接受裸路径作为 resolve 替代。',
    'success:true,fileName,data:Uint8Array（独立 buffer slice）；失败 success:false,error。',
    'registry 记录有效；provider 流读取必须恰好满足登记 size；受保护 provider 下游可能要求解锁。',
    'UI 单/批预览缓存 originalBuffer；registry 更新时间/hash；缺临时源时可能重新复制原路径。',
    'UI 30 秒 readSource timeout 未取消文件读取；错误不应被解释为空文档。',
    'PDF/Word 浏览器渲染器完整坐标/分页链路未展开|preview blob 生命周期未全部追踪')
add('desensitization:release-sources','MANUAL-IMPORT','释放临时源及缓存','import-ui source-handler registry',
    'sourceIds 数组，经字符串归一化。',
    'success:true,released,removedEngineCaches；provider.close 抛错可直接 reject（handler 无统一 catch）。',
    '按 registry ID；本层未显示 sender 归属检查。',
    '移除 registry/path Map，关闭 provider、删除 managedPath；清理 canonical/legacy/originalPath、source OCR 和相应 engine 缓存；不会删除原始路径。',
    'registry 先移除再 provider.close；close 失败可中断后续清理；临时文件 rm 失败仅 warn。UI Bn2 catch 返回 0，不能据 0 判断已恢复原状态。',
    '所有 provider 的 close 语义|UI 所有离开/销毁入口覆盖未全部审')

for ch,title in [('workspace:open','按路径打开审查项目'),('workspace:open-dialog','选择打开审查项目')]:
    add(ch,'MANUAL-WORKSPACE',title,'workspace-ui workspace-handler workspace-service workspace-container key-read key-write workspace-injection registry',
        'open 接收 filePath；open-dialog 无参数，Electron .tmm 文件选择。',
        'success:true,data:{filePath,snapshot,sources,sourceRefs?,format}；选择取消 data:null；错误为 success:false,error:{code,message}。',
        'TMM v2/v3 的唯一 local-cmk 槽必须属于本机密钥体系；读取解包 requireUnlockedCmk；v1 为单独 archive 路径，不能一概说所有格式加密。',
        'sw.open→nw/L_.openCompatible→Tx/Yb reader→registerSources；从 snapshot 恢复 source OCR 缓存；recents.remember 写最近列表。',
        'registerSources 失败关闭 reader；最近列表写失败在 open 路径可传播，不能说报错即完全无内存副作用。v1 容量超限可弹另存 v2 提示，取消 TMM_V2_MIGRATION_CANCELED。',
        'nw/Tx/Yb/xg 容器目录/流校验未穷尽|大文件迁移 R_ 与原子替换未全部核读')
add('workspace:save','MANUAL-WORKSPACE','保存项目及源引用换代','workspace-ui workspace-handler workspace-service workspace-container key-write workspace-injection',
    'requestId 可选；projectId/revision 必须与 snapshot.projectId/contentRevision 相同；filePath、sourceFilePath、sources/sourceRefs、format。',
    'success:true,data:{projectId,filePath,savedRevision,savedAt,format,sourceRefs?}；错误标准 workspace error。',
    '本机 protected write 可通过已解锁 CMK 或设备恢复槽；不等同每次弹密码。旧 v1 原地写、v2 原地升 v3 可要求另存。',
    'sw.saveV2 从 supplied bytes、旧 archive、registry stream 取源；L_.saveSnapshot 创建新 DEK 和 local-cmk 槽，保存 snapshot+source+OCR segments+rules+decision/audit 数据；重开文件登记新 sourceRefs，释放旧引用，最近列表更新失败被忽略。',
    '同 requestId 同 sender 复用 Promise（不比较 payload），异 sender 冲突；回执为内存且限容量/时间。UI 传输失败轮询而非盲重写；旧 project receipt 不覆盖当前项目，较旧 revision 不覆盖新引用。提交后重开或登记失败是否已落盘需核对，非事务回滚保证。',
    'vx/Fb/cf 原子替换/崩溃中断一致性未完整审|所有 schema tg/ig 和 source provider 未穷尽')
add('workspace:save-result','MANUAL-WORKSPACE','保存回执查询','workspace-ui workspace-handler',
    'requestId 字符串。','state:running/completed(receipt)/missing。',
    '仅同 sender 能获取 nI 条目。','只查主进程内存回执，不重新保存；进程重启不保留。',
    'UI 6 次、间隔 500ms；仍无结果则 WORKSPACE_SAVE_UNCONFIRMED，阻止重复保存。missing 不能证明磁盘未写。',
    '跨进程重启后的磁盘对账机制未找到')
add('workspace:save-recovery','MANUAL-WORKSPACE','自动恢复快照','autosave-ui workspace-handler recovery protected-store key-write workspace-injection',
    'projectId/revision/snapshot/sources/sourceRefs/formalFilePath/format；revision 与 snapshot 必须一致。',
    'success:true,data:{projectId,savedRevision,savedAt,stale}；旧 revision 可返回 stale:true 和已有 revision。',
    '恢复服务存在，源数据有效；protected write 使用本机 key hierarchy。',
    '先按 fingerprint 写 sources/<docId>.lrs，随后 workspace.lrs；删过期源/旧 plaintext workspace.json，prune 超过 20 条；移除 .discarded 标记。',
    '无 task cancel；UI 失效 sourceRef 可重登记再重试。源文件先写、快照后写，未证明多文件事务；失败可留源文件，不能说完整回滚。',
    'df/cf 原子提交完整审计|自动保存节流与所有离开入口未全部核读')
add('workspace:open-recovery','MANUAL-WORKSPACE','打开自动恢复','workspace-ui workspace-handler recovery protected-store key-read',
    'projectId。','snapshot,sources:{},sourceRefs,format；失败标准 workspace error。',
    'workspace.lrs 存在且 schema/project 匹配；读取需解锁；旧明文 workspace.json 返回迁移必需错误。',
    '读取受保护 snapshot；释放该恢复旧打开引用；验证 source 长度，Markdown 重新解析比对 sidecar；给源创建惰性解密 provider。',
    '登记一半失败 release 本次 refs；UI KEY_HIERARCHY_LOCKED 提示解锁后重试。无单独取消入口。',
    '所有格式来源哈希校验不等同 Markdown sidecar 校验|provider 读取中途损坏语义未全部审')
add('workspace:discard-recovery','MANUAL-WORKSPACE','丢弃恢复记录','workspace-ui workspace-handler recovery',
    'projectId。','success:true,data:null；否则标准 workspace error。',
    '恢复服务可用；无直接激活断言。','先 release 打开的源，写 .discarded，再递归删除恢复目录；不删除正式 .tmm/原件。',
    'EPERM/EBUSY/ENOTEMPTY/EACCES 删除失败被转换 false，discard 未要求必须删除成功；标记让列表隐藏，后续启动 prune 重试。成功回执不是物理目录已删除证明。',
    '文件锁/崩溃后的真实恢复未运行')
add('workspace:list-recent','MANUAL-WORKSPACE','最近项目列表','workspace-ui workspace-handler workspace-service recents workspace-injection',
    '无参数。','success:true,data:recent[]；附 fileExists/reusable 信息。',
    'recent index 使用 protected write 读取通道，可通过设备恢复槽。',
    '过滤磁盘不存在项目并回写 recent.lri；首次旧 recent.json 迁移可删除旧文件。不是纯无副作用 list。',
    '读取/迁移失败可返回空列表；空不等于没有历史项目；不删除 tmm。',
    'UI 列表所有操作/恢复提示不同筛选语义仍需全量审')
add('workspace:forget-recent','MANUAL-WORKSPACE','移除最近记录','forget-ui workspace-handler workspace-service recents',
    'filePath；按 resolve 路径比较。','success:true,data:null 或 workspace error。',
    '可读写最近索引；无产品授权断言。','只从 recent.lri 项移除并重写；没有 rm 原 .tmm。',
    'UI success 后更新列表；失败提示原审查文件未删除。无取消任务。',
    'protected store 提交失败恢复未闭合')

add('desensitization:detect-only','MANUAL-DETECT','检测候选并增量预览','detect-ui detect-handler detect-service-docx detect-service-pdf detect-service-image registry ocr-cache',
    'sourceRef、enabledRules 数组、requestId/sessionId、route/hint/overrideDocType、ruleSetSnapshot/workspaceCorrections；可选 pageNumbers/manualPageRotations/sealsOnly/completedSealPages。打包版删除 debug 字段。',
    'success、originalText、matches、route、canonicalDocument、format sidecars；PDF 可含 pdfOcrOutcome/sealProgress；事件 progress/page-processed 以 requestId 关联。debug only fields 打包时省略。',
    '先 assertActivatedOrThrow；sourceRef 必须可 resolve；格式限 DOCX/legacy 已转换、PDF、jpg/jpeg/png、Markdown；sealsOnly 限 PDF。enabledRules 未提供会在 forEach 抛错。',
    'n2 注册 AbortController；su 分派 DOCX/text-PDF/scanned-PDF/image/Markdown；OCR 页缓存、canonical Map、DOCX temp path、部分 engine sidecars/日志可落盘。成功只表示候选检测，不是脱敏文件交付。',
    '传播到 handler 的 Kp 取消异常返回 success:false,canceled:true，finally 删除 task；processImage 底层 catch 会把异常转换 success:false/error，不能保证各格式取消都透传 canceled 标志。已发送页/缓存未 rollback。PDF OCR 部分失败有 failures；UI 可保留 incomplete 进度，不能按 done 认定每页成功。',
    'su 内全部识别策略/NER/OCR Python 子进程、Markdown adapters 未逐层闭合|ruleset 冲突/去重/offset 修正规则 Wd/lm 未完全展开')
add('desensitization:recognize-docx-images','MANUAL-DETECT','DOCX 图片补充 OCR','docx-images-ui docx-images registry',
    'sourceRef、requestId/sessionId、enabledRules、route/hint、workspaceCorrections/ruleSetSnapshot、tempDocxPath。',
    'success/matches（过滤 meta.region=image_ocr）、ocrImageInfos/canonicalDocument 等；取消 canceled:true。',
    '产品激活，输入转换后 DOCX；使用 processDocx skipImageOcr:false,imageOcrOnly:true。',
    'n2 注册 docx-image-ocr task，补 canonical reviewSource SHA256/缓存；不保存用户导出。',
    'finally 删除 task；catch 取消异常才返回 canceled:true，其他错误字符串。正常返回分支未检查 b3.success 而硬编码 success:true，底层若把失败序列化而不 throw，可能形成空候选成功；不能把成功回执作为图片全部识别完成证明。底层缓存不自动撤回。',
    'Iu 临时 DOCX 与重复图片映射完整生命周期|所有 DOCX 图片/嵌入对象格式支持未运行')
add('image-review:batch-search','MANUAL-OCR','缓存内批量搜索','ocr-ui-search ocr-search ocr-cache preload-generic',
    'fileName/searchText 必须 truthy，ocrCacheKey 默认 fileName；pageIndex 可选零基，仅筛对应 pageNumber=pageIndex+1。',
    'success:true,results:几何命中[],checkedPageNumbers；没有缓存返回 error；结果含页、OCR尺寸、匹配行、可选跨行 bboxes。',
    'q2 已有 OCR 页；本 handler 无直接激活断言。','只查询缓存和几何计算，不扫描原图、不持久保存审查决定。charBoxes 优先，缺失按字符宽度估计；跨相邻最多 4 行组合。',
    'UI 15 秒 timeout 是等待超时，无任务 cancel；成功 results:[] 只证明所查缓存页无命中，不证明整份文档没有该词。',
    'wm/xm 文本归一化和 dd 去重全部边界|非 BMP 文本与几何精度待运行')
add('image-review:ocr-region','MANUAL-OCR','框选读取缓存文字','ocr-ui-region ocr-region preload-generic',
    'fileName/cacheKey、pageNumber、canvasX/Y/W/H、canvasWidth/Height；框坐标按页像素比例换算。',
    'success:true,text,ocrBbox 或 success:false,text:""；text 可为空且 success:true。',
    '缓存页和 pageWidth/Height 有效；不是对区域重新运行 OCR。',
    'charBox 中心点在框内时取字；缺 charBoxes 时按行宽均分近似。UI 检查当前框/请求序号防止旧结果覆盖新框。',
    'UI 5 秒超时提示手输；没有 AbortController。handler 未验证 canvasWidth/Height 正数有限数，调用者约束与零尺寸行为未闭合。',
    '旋转/裁切坐标各 UI 分支未逐个证明|字框 Unicode 索引一致性未运行')
add('image-review:get-ocr-page','MANUAL-OCR','按页读取并按需补 OCR','ocr-ui-page ocr-page ocr-cache preload-generic',
    'fileName/cacheKey、正数有限 pageNumber；可选 pdfBuffer、totalPages/pageNumbers。',
    'success:true,page:{pageNumber,pageWidth,pageHeight,lines[text,confidence,bbox,charBoxes]}；无页 success:false,page:null。',
    '缓存缺失且有可转换 bytes 才启动 su.processPdfWithForcedOcr；没有直接激活断言。',
    'J2 按 cacheKey 合并并行 forced OCR Promise，Af/Nf 回填缓存；候选页来自 pageNumbers 或 1..totalPages 或当前页。',
    '每 250ms 等待目标页或后台结束；J2 finally 清理。未进 n2 任务 Map/未传 cancelSignal，因此不能承诺 desensitization:cancel 会取消此补 OCR。',
    'forced OCR 内部识别/子进程停机/页号上界未完整审')

add('desensitization:apply','MANUAL-EXPORT','应用已审查候选并导出','apply-ui apply-receipts-ui apply-filter apply-start apply-markdown apply-format apply-write write-helper mapping secure-pdf registry',
    'sourceRef、matches、outputPath/outputDir、requestId；格式选项/假名/遮罩/删除页/旋转/approvedConflicts/Markdown reviewSnapshot。th 先过滤 signature/handwriting/handwritten_signature；不等于每个输入匹配均执行。exportMapping/mappingOutputPath 被拒绝。',
    'success:true,result,outputPath,pseudonymMappingPath?,textPath?；result 含 matches、格式保留/文本层/Markdown报告、preserveOnCancel 等。失败含 error/errorCode、reviewTargets/draft 可能存在；canceled 是失败分支。',
    '产品激活；有效 sourceRef；Markdown 快照源 hash 一致；格式和候选定位满足对应写回条件。自定义/default 假名 MD 要全部成功应用；保存映射失败阻断文档导出。',
    'requestId/sender 回执去重；进度带 sequence/heartbeatAt，5秒心跳。PDF→gh.renderSecure 逐页画布遮罩后 JPEG 嵌入新 PDF；DOCX 优先 preserved buffer，允许生成式降级（legacy 有更严拒绝）；MD source writer 或 Gf exporter。假名 .lpm 先写，最终输出后记录 receipt。',
    '重复 running 返回 APPLY_ALREADY_RUNNING，completed 返回旧 receipt；不是 compare-payload 幂等。取消触发 finally rm cleanupPaths（错误吞掉）；普通失败不执行同样全部输出清理，映射不随文档失败回滚。普通 A2 writeFile 可覆盖同名；MD 单独冲突策略，UI _nonInteractiveSave:true 时拒绝已存目标。成功/失败回执只在内存。',
    'DOCX preserved 修复完整规则/legacy 转换/PDF bbox 推导/全部 MD worker 与 writer 未闭合|所有异常发生点是否已写文件/部分写字节未穷尽|保护原件的调用者路径校验及非 MD 覆盖取消删除风险需专项审计')
add('desensitization:get-apply-result','MANUAL-EXPORT','导出结果对账','apply-receipts-ui task-controls apply-start',
    'requestId trim。','state:running/completed(receipt)/unknown。',
    'receipt senderId 必须等于调用窗口 senderId。','仅内存回执查询，无写入；完成回执在后续写入时清理超15分钟/超过100项记录。',
    'UI 传输中断匹配错误后 4 次500ms查询；未知则 APPLY_RESULT_UNCONFIRMED，锁住重复导出，可人工核对后解除。unknown 不代表无产物。',
    '重启后无持久任务对账|IPC其他错误类别是否进入核对路径未穷尽')
add('desensitization:cancel','MANUAL-EXPORT','取消注册任务','import-ui apply-receipts-ui task-controls apply-write detect-handler',
    '非空 requestId。','success:true,canceled:true 表示已 abort；不存在返回 canceled:false；空ID失败。',
    '任务存在 n2；该 handler 没有 pause-seals/get-apply-result 的 sender 校验，需单列待审，不据此推断可利用。',
    'AbortController.abort(Hp())；向原任务 sender 发 canceled progress；实际停止/清理要等底层检查 signal 与 finally。',
    'abort 回执不是所有文件已删除/子进程已停止；detect 已发布缓存保留；apply aborted 删除登记 cleanupPaths 且 rm 错误吞掉。未注册 forced OCR 不受此入口管理。',
    'sender 信任边界/多窗口可达性|各底层 signal 检查点及取消延迟未运行')
add('desensitization:pause-seals','MANUAL-DETECT','暂停印章子任务','pause-ui task-controls detect-handler',
    'requestId。','success:true 或 success:false,error。',
    '任务 kind=detect-only、同 sender、有 engine。','调用 engine.pauseSealDetection→sealTask.pause，非整个 OCR/检测取消。',
    '完成/窗口不匹配报错；已完成印章页保留，后续 detect 可传 completedSealPages。',
    'sealTask.pause 与底层模型实际协作终止未运行')
add('desensitization:cleanup-paths','MANUAL-EXPORT','取消后清理已生成输出','apply-cancel-ui task-controls apply-write',
    'paths 数组，trim/filter；每条 resolve 后匹配成功 receipt.outputPath（小写比较）。',
    'success:true,cleaned；rm 抛错可 reject。',
    '同 sender、completed success、15分钟内、非 preserveOnCancel、未 cleanupUsed 的 receipt。',
    'fs.rm(force:true) 删除匹配输出并标 cleanupUsed；不会接受任意没有回执的路径。',
    'UI 报告 cleaned/requested 并提示人工核对未清理输出；不删除假名映射。路径大小写比较在大小写敏感文件系统行为未验证。',
    '原路径已被其他进程替换时 inode/content 未再核对|非 MD 覆盖与保护源路径一致性待审')
add('desensitization:process-files','MANUAL-AUX','旧批量读入辅助接口','aux-files',
    'filePaths,options.outputDir；解构在内层处理 try 外。','success:true,outputDir,results[fileName,fileType,filePath,buffer或error]；可部分失败。',
    '直接激活断言；本地文件可读。','创建时间戳输出目录与已脱敏子目录，只 readFile 并返回字节；这里没有执行检测/脱敏。',
    '逐文件失败被收集；建目录后读取失败不会删除目录；无 requestId/cancel。',
    '当前 UI 主链调用尚未找到；仅 preload 暴露，不能强行挂到现行导出按钮',ui='not-established')
add('desensitization:save-file','MANUAL-AUX','直接写内容辅助接口','aux-files write-helper',
    'outputDir,fileName,content,type(buffer/text)。','success:true,outputPath 或 false,error。',
    '直接激活断言。','A2 写 outputDir/已脱敏/fileName；不自己核验输入 content 已脱敏。','写入失败返回错误；默认 writeFile 可覆盖同名，无取消/回执。',
    '现行 UI 调用未找到|路径/内容安全检查依赖调用者，不能当安全导出完成契约',ui='not-established')
add('desensitization:save-markdown-draft','MANUAL-AUX','保存待人工处理 Markdown','aux-draft write-helper',
    'outputPath 需 .md，content 字符串非空；重命名 _待人工处理稿.md。','success:true,outputPath 或 false,error。',
    '直接激活断言。','prepend 未通过自动脱敏检查警告，A2 写文件，Cp 记录 degraded/manual-draft。','若写后日志失败可回失败而文件已存在；这份草稿不等同安全脱敏结果，无 task cancel。',
    '报告弹窗到该入口的全 UI 调用尚未本轮核读|Cp 具体日志落盘/失败处理',ui='not-established')

runpy.run_path(str(OUT/'manual-workflow-supplement.py'))['populate'](add, ev)

FLOWS = [
    {'id':'MANUAL-IMPORT','title':'导入与源文件生命周期','edges':[
        ['UI Ug2/Jg2','preload selectFiles/scanDroppedFolder','pick-ui','drop-ui'],
        ['UI Nn2（无已有 sourceRef）','条件 validateFolderSource → registerSource','import-ui'],
        ['folder _2 完成扫描','逐文件复核元信息 → S2 登记 sourceRef','scan'],
        ['registerSource handler S2','shared fp() registry.register','source-handler','registry'],
        ['registry.register','managed temp bytes / path Map','registry'],
        ['UI $n2','cancel await → releaseSources','import-ui']]},
    {'id':'MANUAL-WORKSPACE','title':'项目保存、重开与恢复','edges':[
        ['UI C2/M2/N2','preload workspace.save/getSaveResult','workspace-ui'],
        ['dI handler n2/r2','startup injected sw/Hg','workspace-handler','workspace-injection'],
        ['sw.saveV2/open','L_ → Tx/Yb/vx/Fb and fp source registry','workspace-service','workspace-container'],
        ['Hg.save/open/discard','df protected store → .lrs files','recovery','protected-store'],
        ['sw recents','_g → recent.lri','workspace-injection','recents']]},
    {'id':'MANUAL-PREVIEW','title':'预览源加载','edges':[
        ['UI Am2/Tm2 / workspace.loadSource','preload readSource','preview-ui','workspace-ui'],
        ['read-source → M2','registry.resolve → temp/provider bytes','source-handler','registry']]},
    {'id':'MANUAL-DETECT','title':'检测与增量候选','edges':[
        ['UI request/session + listeners','preload detectOnly','detect-ui'],
        ['detect-only handler','su processDocx/processPdf/processImage/processTextInput','detect-handler'],
        ['su result/page callback','q2 OCR + y2 canonical + renderer result','detect-handler','detect-ui'],
        ['UI pauseSeals','n2 sender checked → engine.sealTask.pause','pause-ui','task-controls']]},
    {'id':'MANUAL-OCR','title':'OCR 缓存搜索与按页补识别','edges':[
        ['review UI invoke','generic preload ipcRenderer.invoke','ocr-ui-search','ocr-ui-region','ocr-ui-page','preload-generic'],
        ['batch-search/ocr-region','q2 cached pages geometry','ocr-search','ocr-region'],
        ['get-ocr-page missing cache','J2 shared promise → su.processPdfWithForcedOcr → q2','ocr-page']]},
    {'id':'MANUAL-EXPORT','title':'导出与回执核对/取消','edges':[
        ['UI Gi2','preload apply with sourceRef/review payload','apply-ui'],
        ['apply handler','th filters → per-format masker → optional Mm mapping','apply-filter','apply-start','apply-format','mapping'],
        ['PDF branch','gh.renderSecure → canvas JPEG → new PDF bytes','apply-format','secure-pdf'],
        ['format buffer/result','A2 / MarkdownSourceWriter / commitMarkdownBuffer → file','apply-markdown','apply-write','write-helper'],
        ['receipt r2','UI Yp2/Up2 query / tm2 cleanup','apply-receipts-ui','apply-cancel-ui','task-controls']]},
    {'id':'MANUAL-AUX','title':'已解析 handler 但未确立现行 UI 主链的辅助接口','edges':[]}]

def provenance():
    archive = ROOT / BASE / 'runtime-mount/Lawbot脱敏猫.app/Contents/Resources/app.asar'
    names = ['dist/main/index.js', 'dist/preload/index.js', 'dist/renderer/assets/BMcdb0OZ.js']
    with archive.open('rb') as f:
        prefix=f.read(16); header_size=struct.unpack_from('<I',prefix,4)[0]; text_size=struct.unpack_from('<I',prefix,12)[0]
        header=json.loads(f.read(text_size)); members=[]
        for name in names:
            entry=header
            for part in name.split('/'): entry=entry['files'][part]
            assert not entry.get('unpacked'), name
            f.seek(8+header_size+int(entry['offset'])); data=f.read(entry['size'])
            extracted=(ROOT/BASE/'extracted'/name).read_bytes()
            digest=sha(data)
            assert data==extracted and digest==entry['integrity']['hash'], name
            members.append({'member':name,'bytes':len(data),'sha256':digest,'asarMemberIntegrityPassed':True,'extractedBytesEqual':True})
    return {'archivePath':str(archive.relative_to(ROOT)), 'archiveSha256':sha(archive.read_bytes()), 'members':members,
        'boundary':'仅把 ASAR 成员字节与已有 extracted 文件及 ASAR 内建摘要比对；未执行包内 JS。readable 为人工阅读派生产物，独立固定当前 hash，原始 handler 另有 UTF-16 offset 引用。'}

def build():
    namespaces = {'desensitization', 'workspace', 'image-review', 'image', 'ocr', 'get-pdfjs-worker-path'}
    expected = {name for name in CHANNELS if name.split(':')[0] in namespaces}
    observed = {row['channel'] for row in RECORDS}
    assert len(RECORDS) == len(observed), 'duplicate manual channel'
    assert observed == expected, f'manual scope mismatch: {expected ^ observed}'
    for row in RECORDS:
        assert row['originalHandlerEvidence'] or row['originalOperationEvidence']
        assert all(x in EVIDENCE for x in row['evidenceIds'])
        for ref in row['originalHandlerEvidence'] + row['originalOperationEvidence'] + [p['evidence'] for p in row['preloadEvidence']]:
            text=(ROOT/ref['path']).read_text()
            snippet=text.encode('utf-16-le')[ref['start']*2:ref['end']*2].decode('utf-16-le')
            assert sha(snippet.encode())==ref['sliceSha256']
    result={'schemaVersion':1, 'scope':'人工逐段核读的业务契约补充；不是全量接口完成声明',
        'analysisDate':'2026-10-13','runtime':'R0：未激活、未执行竞品处理链',
        'coverage':{'manualChannels':len(RECORDS),'knownIpcChannels':len(CHANNELS),'completeBusinessContracts':0,
                    'selectedNamespaces':sorted(namespaces),'selectedNamespaceInventoryCovered':True,
                    'unreadHere':[x for x in CHANNELS if x not in {r['channel'] for r in RECORDS}]},
        'provenance':provenance(), 'evidence':EVIDENCE,'flows':FLOWS,'contracts':RECORDS,
        'remaining':[
            'UI→handler→直接服务→存储/缓存的局部连线已人工证实；第三方 codec/OCR/NER、全部错误状态、崩溃恢复和授权运行未全部闭合，因此无 S3。',
            '优先补审 apply 非 Markdown 同名写入、取消删除与原件保护；th 过滤签名类别的 UI 提示与最终选中计数。',
            '优先补审 workspace vx/Fb/cf 提交后重开失败、恢复多文件写入失败、close 失败及旧 sourceRef 释放时序。',
            'OCR get-page 缺取消登记、批量搜索缓存完整性/Unicode坐标、PDF rotated/deleted page 边界需合法运行样本。',
            '项目组统一策略、规则集、报告/审计、假名恢复/传输等未覆盖接口保持既有单项静态深度；不得从本轮关联推导完成。']}
    md=['# 人工业务契约追踪（公开包静态分析）','',
        f'本轮核读 **{len(RECORDS)} / {len(CHANNELS)} 个已知 IPC**，建立 6 条局部业务关系；另列辅助接口。**完整业务契约 0；全部建议维持 S2，竞品运行维持 R0。** 没有许可证，没有执行包内代码。','',
        '每条 IPC 的 JSON 同时保留原始包 handler 的精确 UTF-16 offset/hash、preload 暴露位置及下方人工行级证据。行号属于固定 hash 的 readable 派生快照，不能当作原始压缩文件行号。ASAR 成员对照结果见 JSON provenance。','',
        '## 关系图与依赖边界','']
    for flow in FLOWS:
        md += [f"### {flow['id']} · {flow['title']}",'']
        for edge in flow['edges']: md += [f"- `{edge[0]}` → `{edge[1]}`。证据：{', '.join(edge[2:])}。"]
        if not flow['edges']: md += ['只有 handler/preload 已核读；现行 UI 调用关系未确立。']
        md += ['']
    md += ['## 逐项契约','']
    fields=[('inputAndFiltering','输入与过滤'),('outputContract','输出类型'),('preconditions','前置条件'),('persistentAndMemoryEffects','内存和持久副作用'),('failureAndCancellation','失败、取消与恢复')]
    for row in RECORDS:
        md += [f"### {row['channel']} · {row['title']}",'',f"`{row['id']}` · {row['flowId']} · UI 关系：{row['uiRelation']} · S2/R0",'']
        for key,label in fields: md += [f"- **{label}**：{row[key]}"]
        md += [f"- **尚未闭合**：{'；'.join(row['unresolvedDependencies'])}。",f"- **证据**：{', '.join(row['evidenceIds'])}；原始 handler/preload 精确范围在 JSON 同名条目。",'']
    md += ['## 高风险结论的限定','',
        '- handler 内缺少直接 activation/sender 检查，只能证明这一层没有该断言；不能据此宣称整条链无权限控制或可以绕过授权。',
        '- `apply` 的非 Markdown 输出使用默认 `writeFile`。编号备选路径由 EPERM/EACCES/EBUSY 触发，并非重名检测。是否覆盖原件还需核读调用者路径选择；本轮不作漏洞可利用性结论。',
        '- `cancel` 返回已发 abort；`cleanupPaths` 的删除错误可能被吞掉。普通失败、进程崩溃、超时和取消不是同一结果。',
        '- 假名映射可先持久化，输出后续失败不会自动撤销映射。回执 `unknown/missing` 也不能反推文件不存在。',
        '- PDF 分支静态展示“渲染页→JPEG→新 PDF”的实现，不能替代实际输出的文本层/页面/视觉验收。OCR 搜索/选框大部分读取已有缓存；不能描述为完整漏标检测。',
        '- 审查打开需解锁；protected write 可以使用设备槽。二者的权限语义不同，不能统一表述为保存前必须密码解锁。','',
        '## 尚未完成的明确范围','']
    md += [f'- {x}' for x in result['remaining']]
    md += ['', '## 可追溯行级证据','', '| ID | 派生/原始文件与行范围 | 切片 SHA256 |','|---|---|---|']
    for key,ref in EVIDENCE.items(): md += [f"| {key} | `{ref['path']}:{ref['startLine']}–{ref['endLine']}` | `{ref['sliceSha256']}` |"]
    md += ['', '## 核验与重新生成','',
        '先运行 `python3 文档/逆向台账/contracts/build-manual-workflows.py --check`。它只读验证 ASAR/源切片及两份现有人工产物是否一致；不证明文字结论正确。人工审查变更后显式移除 `--check` 重生成。原始完整契约核验仍单独使用 `verify-contracts.mjs`。','']
    return json.dumps(result,ensure_ascii=False,indent=2)+'\n', '\n'.join(md)

if __name__=='__main__':
    js,md=build()
    products={'manual-workflow-contracts.json':js,'manual-workflow-contracts.md':md}
    if '--check' in sys.argv:
        for name,text in products.items():
            if not (OUT/name).exists() or (OUT/name).read_text()!=text: raise SystemExit(f'DRIFT: {name}')
        print(json.dumps({'passed':True,'manualChannels':len(RECORDS),'evidenceRanges':len(EVIDENCE),'completeBusinessContracts':0,'runtime':'R0','artifacts':{n:sha(t.encode()) for n,t in products.items()}},ensure_ascii=False))
    else:
        for name,text in products.items(): (OUT/name).write_text(text)
        print(f'Generated {len(RECORDS)} manually read channel contracts; S2/R0, complete=0')
