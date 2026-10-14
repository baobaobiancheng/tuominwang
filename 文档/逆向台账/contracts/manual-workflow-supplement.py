"""Additional individually read IPC contracts. Imported only by our serializer."""
def populate(add, ev):
    for row in [
        ('folder-output','main',16900,16911),('folder-path','main',15385,15438),
        ('folder-manifest','main',16926,16974),('output-dialog','main',16975,16980),
        ('misc-read','main',17059,17117),('misc-write','main',17132,17157),
        ('runtime-rule','main',17183,17195),('route-handler','main',17934,17949),
        ('route-service','main',10569,10600),('old-process','main',17950,18043),
        ('report-generator','main',18044,18092),('workspace-extra','main',25740,25786),
        ('transfer-service','main',25283,25352),('ocr-diagnostic','main',18761,18776),
        ('ocr-platform','main',4599,4659),('ocr-paddle-diagnostic','main',7954,8034),
        ('pdf-worker','main',26715,26740),('annotation','main',26985,27005),
        ('ui-progress','ui',31803,31835),('ui-page','ui',34203,34226),
        ('ui-runtime-rule','ui',6185,6193),('ui-ocr-health','ui',31983,31994),
        ('ui-ocr-diagnostic','ui',29301,29318),('ui-output-path','ui',36636,36670),
        ('ui-folder-path','ui',36182,36186),('ui-folder-output','ui',36986,37001),
        ('ui-folder-manifest','ui',37101,37111),('ui-profile-pick','ui',32425,32435),
        ('ui-profile-read','ui',33001,33020),('ui-transfer-receive','ui',28310,28325),
        ('ui-annotation','ui',37534,37546),
    ]: ev(*row)

    add('desensitization:select-folder','MANUAL-IMPORT','选择文件夹并登记源','pick-handler scan registry',
        '无参数；Electron openDirectory。','选择取消 canceled:true；成功 canceled:false,sessionId,files[sourceRef],skipped/counts；失败 canceled:false,error。',
        '普通目录可读，scan 服务校验链接/根路径；无直接激活断言。','复用 _2 全扫描+逐文件再次检查并 S2 登记受管副本；b2 保存扫描会话。',
        '取消选择没有扫描；扫描中途失败可能已登记部分源，无任务取消/成组回滚。','select-folder 现行独立按钮调用未定位；与拖放同服务不等于同UI入口',ui='not-established')
    add('desensitization:create-folder-output','MANUAL-EXPORT','创建独立结果目录','folder-output folder-path ui-folder-output scan',
        'scanSessionId 可选、sourceRootName 可覆盖来自扫描的根名；只要名字存在并非强制会话存在。',
        'success:true,exportSessionId,outputRoot；选择取消 success:false,canceled:true；失败 error。',
        '选择普通本地输出目录非符号链接，Wf realpath；有扫描 sourceRootPath 时检查源/目标不能互为祖先。',
        'sanitize 根名并 mkdir(recursive:false) 创建 <name>_已脱敏；EEXIST 用时间/序号最多999，w2内存登记12小时会话。',
        '无 cancel task；创建后调用者失败不会自动删新目录。缺扫描会话时源目录嵌套检查缺少 sourceRootPath。',
        '扫描失效而手传rootName时的UI约束|目录创建到写文件期间符号链接替换竞态')
    add('desensitization:resolve-folder-output-path','MANUAL-EXPORT','结果相对路径解析','folder-manifest folder-path ui-folder-path',
        'exportSessionId,relativePath；Uf拒绝空/NUL/绝对路径/盘符、空组件/./../非法字符和根外解析。',
        'success:true,outputPath；会话过期或路径非法 success:false,error。','w2 中12小时内输出会话。',
        '仅字符串路径解析，无创建目录或写文件。','没有任务取消；会话失效提示重选保存位置。',
        'Uf 是路径词法约束，未在这里验证每级真实路径/链接')
    add('desensitization:write-folder-manifest','MANUAL-EXPORT','写文件夹处理清单','folder-manifest folder-path ui-folder-manifest',
        'exportSessionId,batchName,entries；每项 sourceRelativePath 必须字符串；存在 outputRelativePath 则 Uf 校验。status 等枚举未在 handler 全部验证。',
        'success:true,manifestPath,outputRoot；失败 success:false,error。','有效w2会话；目标清单文件不能已存在（wx）。',
        'Hf转义单元格，生成 脱敏处理清单.html；统计来自调用者entries，不重新检查输出文件。',
        '重复写EEXIST返回失败；部分写失败未见删除半成品。无检测任务取消；清单说明本身明确不是质量证明。',
        '非法status计数及源相对路径信息约束未完全验证|清单与实际产物一致性要运行核对')
    add('desensitization:select-output-dir','MANUAL-EXPORT','选择导出目录','output-dialog ui-output-path',
        '无参数；openDirectory/createDirectory。','canceled:true,outputDir:null 或 canceled:false,outputDir。',
        'Electron OS对话框；无产品激活断言。','返回路径；对话框允许用户新建目录；不导出文件。',
        '对话框拒绝可IPC reject；没有handler统一catch。','文件系统授权结果未运行')
    add('desensitization:select-save-path','MANUAL-EXPORT','选择文件保存路径','output-dialog ui-output-path',
        'defaultFileName；按扩展名选DOC/DOCX/WPS/PDF/MD/图片filter，均允许全部文件。',
        'canceled:true,filePath:null 或 canceled:false,filePath。','Electron保存对话框；filter不是强制扩展名校验。',
        '返回建议路径，不写内容。','没有catch；空payload访问defaultFileName可能reject。取消只取消选择。',
        '各格式后续路径/源文件保护必须在apply服务另审')
    add('desensitization:read-file','MANUAL-PREVIEW','按裸路径读取文件','misc-read',
        '裸 filePath 字符串。','success:true,data:Uint8Array,fileName,fileType；失败success:false,error。',
        'fs.readFile可访问；无sourceRef/直接激活/本handler sender检查。','读整个文件进内存，复制buffer给renderer；无持久写。',
        'fs异常包装；无大小上限/取消任务见于此handler。','当前UI裸路径调用未本轮定位|上游路径授权和多窗口边界',ui='not-established')
    add('desensitization:get-resource-diagnostics','MANUAL-AUX','开发态资源统计','misc-read registry ocr-cache',
        '无参数。','sourceRefs/canonicalDocuments数量、managedSourcePaths、engineOcrCache、ocrDataCache(files/estimatedBytes/maxBytes)裸对象。',
        '仅 !app.isPackaged 时注册；preload可暴露不代表生产可调用。','读内存统计，无持久写。',
        '打包版没有handler，调用可能reject；无取消。','开发UI入口未定位|估算内存不是实测RSS',ui='not-established')
    add('desensitization:get-markdown-export-stats','MANUAL-AUX','Markdown导出日志统计','misc-read',
        '无参数。','Zf统计对象；读取缺失文件返回Zf([])，其他错误throw。',
        '读userData/markdown-export.log，尾部最多2MiB；有截断时弃首条可能不完整行。','打开/关闭文件并聚合，不重新审查文档。',
        'ENOENT不是故障；finally关闭handle，无取消。','Zf全部统计字段/过滤器未展开|UI调用未本轮定位',ui='not-established')
    add('desensitization:get-default-output-dir','MANUAL-EXPORT','取得默认输出目录','misc-write ui-output-path',
        '无参数。','success:true,outputDir；创建失败success:false,error,outputDir:home。','本地 Documents 路径可创建。',
        'mkdir Documents/脱敏猫输出 recursive；名称get仍有写副作用。','失败返回home只是fallback字段，不保证home可写或成功；无取消。',
        'UI所有fallback分支对success的使用需运行核对')
    add('desensitization:open-output-dir','MANUAL-EXPORT','在系统打开输出位置','misc-write',
        '目录路径字符串。','success:true 或 false,error。','shell.openPath可处理本地路径；无直接激活断言。',
        '委托OS打开路径，不验证脱敏结果。','openPath非空错误字符串和异常都转通用失败；无取消。',
        'OS打开效果/文件内容不在静态证据范围|本轮UI直接调用位置未定位',ui='not-established')
    add('desensitization:save-report','MANUAL-AUX','保存调用者报告文本','misc-write write-helper',
        'outputDir,fileName,content。','success:true,reportPath 或 false,error/requiresActivation。',
        'assertActivatedOrThrow。','A2写outputDir/fileName UTF8；不验证报告对应真实运行结果。',
        'catch包装；默认writeFile可覆盖，失败可留下部分文件，无任务cancel。','现行UI调用未定位|输入路径和内容格式依赖调用者',ui='not-established')
    add('desensitization:detect-route-only','MANUAL-DETECT','仅预估材料类型','route-handler route-service registry drop-ui',
        'sourceRef,fileName,overrideDocType；打包删除debug字段。','success,route,error,errorCode；不返回matches/脱敏输出。',
        '有效sourceRef；本handler无直接激活断言。DOCX取Fe文字；纯文字PDF仅前1页/6000字符，MD scanText前6000；图片和非纯文字PDF用空文本+文件名/override选策略。',
        '仅粗路由结果；异常可写crash.log；不会为了图片路由重新OCR。UI批量失败时可退general/screenshot。',
        '无n2 task注册/取消；服务区分FILE_ENCRYPTED/TEXT_EMPTY/FILE_INVALID/FILE_READ_FAILED等。','router策略及classifier判据未全面穷尽|路由不是实体识别准确率')
    add('desensitization:update-runtime-rules','MANUAL-DETECT','当前任务运行时规则','runtime-rule ui-runtime-rule',
        'requestId/sessionId,entityType,pattern必非空；scope project/spot/否则file；ruleType blacklist/否则whitelist。',
        'success和appliedToTasks/added/whitelistApplied；blacklist返回deprecated:true,0；spot返回immediateOnly:true,0。',
        'project用sessionId筛detect-only且有engine；file按requestId；handler没按sender再筛。','调用engine.applyRuntimeRuleUpdate，修改现有任务内存规则；不写规则集库。',
        'UI调用catch吞异常，不代表已更新；0可能无任务或降级分支。无额外取消。','engine applyRuntimeRuleUpdate完整去重/模式含义|sender信任边界未运行')
    add('desensitization:process-file-main','MANUAL-AUX','旧单文件整链辅助处理','old-process apply-filter write-helper',
        'filePath、enabledRules、enableOCR/outputDir/mode/matches、可选假名/route/fullRedactRules；th过滤签名类。','success:true,result 或 false,error,result?；不保证提供实际outputPath。',
        '直接激活断言；裸路径读取；仅docx/pdf/jpg/jpeg/png；enabledRules需forEach。','su处理；PDF事件发getAllWindows()[0]而非当前sender且无requestId；有desensitizedText/outputDir时尝试生成并写文件。',
        '最终输出写入catch为空，仍可success:true；无n2注册/cancelSignal；不能用成功结果推断已生成文件。','现行renderer调用未定位，不挂到正式apply按钮|旧流程安全PDF策略与新apply不能混同',ui='not-established')
    add('desensitization:generate-reports','MANUAL-AUX','生成报告/处理证明','report-generator write-helper',
        'results[],outputDir。','success:true,report,outputDir；catch success:false,error。','本handler无直接激活断言；输出目录可写。',
        'su.generateReport/HtmlReport/ProcessingProof写JSON/HTML/MD；append userData/support/validation_log.csv。copy_export_test=blocked、page_continuity_check=pass、manual_ops_count=0为固定字段；OCR均值只来自输入results。',
        '多文件顺序写，无事务；后一个失败前面的可能已存在；CSV错误吞掉。无任务取消。','generateReport内部统计schema未全量展开|这些固定元数据不是实际验收证明',ui='not-established')
    add('desensitization:progress','MANUAL-DETECT','进度通知通道','ui-progress detect-handler apply-start old-process',
        'main→renderer事件，不是invoke请求；payload格式随检测/导出/旧单文件流程变化。','preload listener转发(_event,update)，返回unsubscribe移除listener。',
        'renderer注册监听；UI常按requestId/fileName筛选，apply按sequence去重。','更新UI进度、Markdown增量候选、心跳；无通道自身持久写。',
        '发送异常多数吞掉；done不是最终落盘回执；旧process-file-main无requestId会被现行过滤忽略。','全部事件union尚未完整类型化|断流/重连运行未验证',ui='tracked-event')
    add('desensitization:page-processed','MANUAL-DETECT','增量页结果通知','ui-page detect-handler old-process',
        'main→renderer；requestId/fileName/pageNumber、phase/matches/ocrCachePage等随格式变化。','preload onPageProcessed 转发并提供unsubscribe。','订阅存在；正式检测以任务ID匹配，旧处理未附ID。',
        '主进程Af保存OCR页后发送；UI逐页合并检测结果供提前审查。','发送失败不撤销cache；取消可能已保留页结果；回调异常存在吞掉分支。','全部单/批监听解绑和旧事件兼容未穷尽',ui='tracked-event')
    add('image-review:clear-ocr-cache','MANUAL-OCR','删除展示OCR缓存键','ocr-page ocr-cache preload-generic',
        '参数为缓存key字符串，直接q2.delete(t2)。','始终success:true（含不存在key）。','无产品激活或sender验证见于本handler。','仅删q2一个key；没有同步清理J2 forcedOCR或su engine cache。','并发forcedOCR可之后重填；不代表取消或全量缓存释放。','renderer生命周期调用/完整缓存层一致性未本轮核读',ui='not-established')
    add('ocr:health-check','MANUAL-OCR','OCR可用性预检','ocr-diagnostic ocr-platform ocr-paddle-diagnostic ui-ocr-health',
        '无参数。','available及可选diagnosticSummary；异常available:false。','cs按darwin取Apple Vision适配器，否则Paddle；非单一通用OCR依赖。',
        'mac调用helper getInfo；非mac调用Paddle可用性测试，失败可收集诊断/写日志。UI 5秒超时构造available:true,timeout:true后直接return，不是实测可用。','无n2任务取消；预检异常UI部分吞掉。','helper/Python实际依赖与模型运行未验证|available不是识别准确率')
    add('ocr:collect-diagnostic','MANUAL-OCR','OCR诊断材料','ocr-diagnostic ocr-platform ocr-paddle-diagnostic ui-ocr-diagnostic',
        '原因字符串或缺省user_requested。','success:true,summary,filePath?；mac适配器只返回summary，filePath可缺。','cs平台适配器可创建。','mac系统信息；Paddle记录Python/model路径、Python版本/import等并可能保存诊断文件；不是外发网络上传接口。','catch success:false,error；UI复制诊断；无取消任务。','诊断信息最终文件路径/脱敏策略未穷尽|实际程序执行被本轮禁止')
    add('get-pdfjs-worker-path','MANUAL-PREVIEW','PDF worker地址','pdf-worker',
        '无参数。','{type:"fileUrl",fileUrl}；找不到打包资源时throw。','打包需app.asar.unpacked/node_modules/pdfjs-dist/build/pdf.worker.mjs；开发用相对node_modules路径。','必要时复制到temp/lawbot-pdf-worker.mjs；大小相同且mtime较新则复用，未比较内容hash。','复制失败返回原资源URL；没有任务取消。','renderer PDF worker加载/跨协议行为未本轮关联|资源依赖未实际运行',ui='not-established')
    add('image:save-annotations','MANUAL-AUX','保存图片标注JSON','annotation ui-annotation',
        'imagePath,bboxes；本handler不校验bbox schema。','success:true,path,entityCount 或 false,error。','目录需可写；无直接激活断言。','写图片同目录/同basename.json，含imagePath,imageSize:{},bboxes,savedAt,version；覆盖同名。','UI随后仍调用exportLabels，两笔非原子；任一失败提示核对；无取消任务。','ImageReviewWindow实际路由可达性和数据来源未全量核读')
    add('image:export-labels','MANUAL-AUX','导出图片训练标注','annotation ui-annotation',
        'imagePath,imageWidth/imageHeight,bboxes；bbox除以宽高归一化，未校验非零；confidence||1使0变1。','success:true,outputPath,entityCount 或 false,error。','本地home目录可创建/写；无直接激活断言。','写home/脱敏猫标注数据/datasets/images/labels/<basename>.json；含原imagePath及绝对/归一化框，未复制脱敏图片。','覆盖同名；UI先save后export但没有事务。无task取消。','不是脱敏交付接口|无效维度JSON序列化结果和同名来源冲突待运行')

    add('workspace:list-recoveries','MANUAL-WORKSPACE','列恢复快照','workspace-ui workspace-handler recovery',
        '无参数。','success:true,data:recovery[]；服务缺失data:[]；失败workspace error。','Hg.list/readCurrent可能需解锁；锁定保护数据可退匿名临时审查条目。','mkdir根目录，扫描隐藏.discarded，按更新时间倒序取最多20条。','读取损坏部分跳过，空列表不证明磁盘为空；无取消。','Hg/Wg错误分类全分支未穷尽')
    add('workspace:list-recovery-prompts','MANUAL-WORKSPACE','启动恢复提示候选','workspace-ui workspace-handler recovery',
        '无参数。','success:true,data:候选[]；服务不存在[]。','Hg.previousUncleanSessionId来自.active-session.json；保护读取仍受key体系约束。','筛PDF OCR incomplete或上次非正常session，最多20；与list-recoveries不等价。','读取特定保护错误也可能加入提示；无取消。','Wg错误范围/所有session clean时序未全部审')
    add('workspace:select-save-path','MANUAL-WORKSPACE','项目另存路径选择','workspace-ui workspace-handler',
        'suggestedName可选，oI/cI清理文件名。','success:true,data:{filePath} 或取消data:null；失败workspace error。','Electron保存对话框。','iI补.tmm扩展名，只选路径不保存。','catch包装；选择取消不写项目。','oI/cI/iI全部路径大小写规范未穷尽')
    add('workspace:save-as','MANUAL-WORKSPACE','带对话框的旧另存入口','workspace-handler workspace-service workspace-container',
        'suggestedName及完整保存payload(projectId/revision/snapshot等)。','success:true,data:保存回执；取消data:null；失败workspace error。','n2.save同revision/key/source约束。','对话框选path后rI计活跃写并sw.save；该入口未使用workspace:save requestId回执Map。','取消只限选择阶段；已开始保存无取消；路径写入/后续读取失败状态同sw.save。','当前UI store另存走select-save-path+save，此save-as现行调用未定位',ui='not-established')
    add('workspace:select-review-profile','MANUAL-WORKSPACE','选择沿用审查记录','workspace-handler ui-profile-pick',
        '无参数，.tmm文件选择。','success:true,data:{filePath}，取消data:null。','仅OS选择，不读取文件也不判断项目适用性。','不写文件；随后UI另调readReviewProfile。','handler无catch，原生对话框异常reject；无任务cancel。','UI沿用规则/假名选择全决策需结合profile契约')
    add('workspace:read-review-profile','MANUAL-WORKSPACE','提取可复用审查规则/假名','workspace-handler workspace-service workspace-container ui-profile-read',
        'filePath。','success:true,data:ey生成审查档案；失败标准workspace error。','v2/v3读取需解锁；v1走archive，容量超限可进入迁移辅助。','sw.readReviewProfile读snapshot经ey转换，缓存correction/pseudonym计数并写最近索引；finally关闭reader。','UI KEY_HIERARCHY_LOCKED解锁后重试；索引写失败可令读取成功后的请求整体失败。','ey字段选择/敏感原文归并/规则冲突待逐项审|不能从来源名推定可全部复用')
    add('workspace:reveal','MANUAL-WORKSPACE','定位审查文件','workspace-extra',
        'filePath。','success:true,data:null 或workspace error。','shell.showItemInFolder。','启动系统文件定位，不读文件内容/不删除。','同步异常包装；无回执确认OS真正显示成功。','现行UI入口未本轮定位',ui='not-established')
    add('workspace:migrate-v1-to-v2','MANUAL-WORKSPACE','旧项目迁移为保护容器','workspace-extra workspace-service workspace-container',
        'sourceFilePath非空，OS选择另存目标并补.tmm。','success:true,data:{sourceFilePath,filePath,documentCount,sourceBytes,ocrPages}；取消data:null。','L_.migrateLegacy要求aw(source)=v1；新DEK/localCmkSlot需要protected write本机能力。','R_读取旧项目并写目标容器；DEK finally清零。','catchworkspace error；本handler无取消进行中的迁移；源目标是否同路径由更下游约束仍待查。','R_转换全schema及原子提交未闭合|现行直接UI调用未定位',ui='not-established')
    add('workspace:create-transfer','MANUAL-WORKSPACE','创建带密码传输副本','workspace-extra transfer-service workspace-injection',
        '已保存filePath，OS选目标；resolve后拒绝目标与源完全相同。','success:true,data:{filePath,transferPassword}；取消data:null；错误workspace error。','V_存在；manager.openCompatible要求能读取本机保护容器。','V_.createTransferCopy生成随机传输密码/新DEK，以SCRYPT+AES-GCM transfer槽通过cf写副本，再打开自检；finally清DEK/关源reader。','写后自检失败可能有目标文件；没有撤销任务；主进程未复制用户账号/产品激活。','cf流封装/自检失败清理|UI创建副本调用本轮未定位',ui='not-established')
    add('workspace:receive-transfer','MANUAL-WORKSPACE','打开传输副本供本地审查','workspace-extra transfer-service workspace-service ui-transfer-receive',
        'transferPassword非空；OS另选.tmm。','success:true,data:临时workspace(snapshot/sources/sourceRefs/format)；取消data:null；密码错误等workspace error。','openTransferContainer校验objectType=tmm-transfer、唯一transfer槽、SCRYPT/AES-GCM及base64长度；合法密码解包。','handler走openTransferCopy+sw.openTransientV2Reader，登记provider；没有调用receiveTransferCopy写本机持久副本，不能说接收即已保存本机.tmm。','注册失败会close reader；用户后续保存单独操作。无后台任务取消。','Kb双次打开的reader关闭生命周期|全部本地保存引导/密码清理需继续审')
