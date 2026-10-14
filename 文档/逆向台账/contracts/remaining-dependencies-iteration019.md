# ITER019 剩余依赖对账

47个既有发现主题的静态依赖对账；主题不是接口数量、不是任意调用图的穷尽证明。只读公开发布包可见代码；不改ITER018快照。

47 主题；状态 {'cross-report-evidence': 41, 'external/unavailable': 5, 'runtime': 1}；687 精确范围。S2/R0，完整业务闭合=false。

- 本矩阵把历史“未读”与现有精确人工报告对齐；没有执行竞品，不证明模型/第三方/运行、全异常组合或我方产品等价。
- project-readable-open为本矩阵当前明确仍需补读的应用children；即便降到0也只对已识别47主题/函数边界成立，不宣称整个发布包所有函数已穷尽。
- 33复杂接口与53系统入口保持独立inventory；无renderer引用、静态体已读、持久化回执、运行结果各自分开。
- 外部可读第三方模块可按具体缺陷继续研究，但不能将其标成已证明算法、也不无限扩大为整库重写。

## 本轮对账

### DEP01 核心旧待办：全部基础规则、策略与granular

状态：`cross-report-evidence`。

41规则顺序、金额分支、策略no-op、配置实际生效集合与granular分支已有人工语义报告；这部分旧待办已补证。

边界：Id/Sd/Md/Ed另列DEP08；模型准确率与我方等价仍未证明。

### DEP02 核心旧待办：PDF/OCR中段与表格几何

状态：`cross-report-evidence`。

覆盖supplement、required OCR、bbox优先序、native有线表格producer、es/旋转缩放与oi/Ei语义。

边界：PDF.js/canvas/OCR推理、坐标真值、所有renderer父状态未由静态证据证明。

### DEP03 核心旧待办：DOCX OOXML保真/notes/删图

状态：`cross-report-evidence`。

接受修订、保留package、notes跨run和对象/包层删图已逐分支读；精确Python范围补齐原列号。

边界：未知OOXML部件保留不等于元数据已净化；Office实际打开效果和所有嵌入格式R0。

### DEP04 核心旧待办：Markdown节点/worker/保存

状态：`cross-report-evidence`。

AST节点到source-map、writer降级、anchor-first/legacy评分和Gf父worker/MarkItDown桥具独立语义证据。

边界：第三方解析实现和真实输入全集未证明；UI提示、草稿恢复另列。

### DEP05 核心旧待办：seal/face调用与后处理

状态：`cross-report-evidence`。

颜色/Hough平台分支、PDF图片过滤、YuNet BGR输入/输出/NMS阈值、模型文件大小SHA已写明；旧遮盖catch返回原buffer已定位。

边界：mac缺失Windows seal脚本、模型数值/第三方执行仍单列外部边界。

### DEP06 核心旧待办：report/M2/A2/ns及legacy

状态：`cross-report-evidence`。

报告常量保证、source恢复/hash、A2直接覆盖重试（纠正旧称atomic）、ns overlay、Dp/Sp转换及解密桥已实读。

边界：所有旧UI可达性、Windows缺失脚本、第三方officecrypto执行未闭合。

### DEP07 19辅助handler此前仅manual证据

状态：`cross-report-evidence`。

规则增补逐稳定ID对19/19 handler与source/folder/save/annotation helper实际补读，不再只是登记。

边界：这些handler freshRead不覆盖全部UI导入/卸载/关窗/反馈/恢复调用者；下列UI项仍保留。

### DEP08 强制规则定位Id/Sd/Md/Ed及_d/bd/yd/xd/wd

状态：`cross-report-evidence`。

SD01逐分支说明Id非重叠匹配、_d框裁剪、Ed旧实体选择、Md几何优先及Wd主调用；原未读定位组已有语义补证。

边界：即使短helper可穷尽，也不表示强制识别业务全链S3。

### DEP09 Iu Python依赖探测与解释器候选

状态：`cross-report-evidence`。

SD02补Iu环境/候选/失败分类和uu超时包装；不是只用docx-runner相邻范围覆盖。

边界：Dp legacy转换补读不能替代Iu解释器选择；运行依赖是否存在R0。

### DEP10 Windows机器标识WMI/PowerShell helpers

状态：`cross-report-evidence`。

SD03补Windows固定WMI/PowerShell回退、过滤、标识组合与缓存；这里只读命令源码，未执行。

边界：shell命令文本可读不等于Windows执行与硬件标识稳定性已验证。

### DEP11 legacy snapshot review子schema验证器

状态：`cross-report-evidence`。

SD05明确子schema有限数不等于正数/整数、bbox未普遍验正尺寸、进度/charBoxes/rotations弱校验等具体分支。

边界：UI draft赋值与main schema拒绝条件不是同一证据。

### DEP12 Markdown统计Zf和日志Cp

状态：`cross-report-evidence`。

SD04补Cp日志摘要/失败吞掉、Zf格式过滤/去重和2MiB日志尾读取；原辅助helper待办已有证据。

边界：读取统计成功不等于实际识别/导出成功。

### DEP13 LPM格式化kr/Ar/Fr及文本重叠planReviewedTextEdits

状态：`cross-report-evidence`。

DPS08 main2923–3192覆盖kr/Ar/Fr的类型归一与JSON导出，DP18/PSF06写出重叠union、同型包含与替换合并语义。

边界：索引与LPM多文件事务不成立；身份密钥实际运行另列。

### DEP14 system→mf迁移；collab→CMK/secure/LPM索引

状态：`cross-report-evidence`。

mf逐文件迁移、索引补偿、cf/df分块GCM和Fg密钥槽/缓存/设备恢复已有明确契约，消除“另组尚未读”泛占位。

边界：native safeStorage/密码学库实现、断电和多文件原子性仍不能证明。

### DEP15 格式还原→Dp/Sp legacy转换

状态：`cross-report-evidence`。

Dp串行队列、平台选择、超时/取消、回环文本与对象计数验证、Sp内嵌图片规范化已实读。

边界：Iu选择器原缺口另列DEP09；Windows脚本本包不可见、Office效果R0。

### DEP16 workspace→MarkdownInputAdapter语法

状态：`cross-report-evidence`。

输入编码、GFM/YAML节点、sidecar source-map、blocker与降级分支已有人工契约。

边界：legacy review子schema另列DEP11；外部parser内部不是自动闭合。

### DEP17 workspace/collab→sourceRegistry生命周期

状态：`cross-report-evidence`。

dp注册/路径优先/快照缺失重建/延迟或即时hash/readRange/release及provider接口已实读；明确无sender绑定和close错误中断。

边界：所有provider具体调用者与renderer离开/销毁覆盖不能由dp泛接口证明，另列DEP18。

### DEP18 snapshot保存恢复、OCR进度归一化与重开消费者

状态：`cross-report-evidence`。

eV/Jm字段与词法差分、Ed2/kd2/Om2/Dm2重开调度、实体冲突和父级映射推进已实际读；与旧Nu2/saveRecovery证据连接。schema complete不强制目标覆盖、重开await无全程代际属于已分析条件，并非尚待读函数。

边界：本轮命名归一化/重开函数已有精确证据；磁盘恢复实际回执、晚返回与中途取消及外部容器运行仍R0。

### DEP19 TMM外部压缩/流/JSON parser和系统原生身份

状态：`external/unavailable`。

应用层容器已读，剩下Node/native safeStorage/第三方JSON streaming/archiver/yauzl内部及跨平台行为。

边界：不能因发布包含第三方源码就统称项目逻辑已闭合；本清单不新增第三方内部审计承诺。

### DEP20 格式33复杂链整体状态

状态：`cross-report-evidence`。

33条复杂格式接口复用DEP13–19/30及既有主/增补报告；应用已列直接依赖进一步补读，容器/OS/Office外部实现及合法运行仍未知。不能把单一聚合主题改状态视为33份端到端合同已闭合。

边界：这里的33是接口集合，不是33个互不重叠算法；恒定6/应用边界49同样未自动升S3。

### DEP21 UI旧父级待办：entity-group-review

状态：`cross-report-evidence`。

新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。

边界：只消除这些已读子项；新报告stillUnreadOrUnverified逐项另列，不代表六UI完整业务闭合。

### DEP22 UI旧父级待办：full-text-search-scopes

状态：`cross-report-evidence`。

新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。

边界：只消除这些已读子项；新报告stillUnreadOrUnverified逐项另列，不代表六UI完整业务闭合。

### DEP23 UI旧父级待办：review-preview-mode

状态：`cross-report-evidence`。

新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。

边界：只消除这些已读子项；新报告stillUnreadOrUnverified逐项另列，不代表六UI完整业务闭合。

### DEP24 UI旧父级待办：preview-policy-hierarchy

状态：`cross-report-evidence`。

新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。

边界：只消除这些已读子项；新报告stillUnreadOrUnverified逐项另列，不代表六UI完整业务闭合。

### DEP25 UI旧父级待办：known-entity-audit

状态：`cross-report-evidence`。

新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。

边界：只消除这些已读子项；新报告stillUnreadOrUnverified逐项另列，不代表六UI完整业务闭合。

### DEP26 UI旧父级待办：manual-correction-scope

状态：`cross-report-evidence`。

新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。

边界：只消除这些已读子项；新报告stillUnreadOrUnverified逐项另列，不代表六UI完整业务闭合。

### DEP27 实体投影上游及其他删除调用者

状态：`cross-report-evidence`。

实体投影/侧栏/删除发出与父消费、Af/Ef/Cf/Md/mc/$o2/Xd2/Jd2/Qd2及qh/df/Nf本体均有精确范围。事件发出与快照保存门已分别连接，未把emit当保存完成。

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP28 PDF布局/单位与行高的生产者

状态：`cross-report-evidence`。

原始页集合、旋转、页面尺寸布局、行高与测宽/框精修全部指定应用helper已读。PDF.js viewport与字体真值保留外部和R0边界。

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP29 child大文档DOM/渲染生命周期深依赖

状态：`cross-report-evidence`。

原先Xr2/ps2/Xu2以及To2/_u2/Ir2/lo2/Bb均有实际函数证据；Nd是应用VML包装已在LH06实读，不能再混称第三方未读；CpyDD6WX及PDF.js内部仍明确外部模块边界。

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP30 假名canonical子归一与逐格式消费

状态：`cross-report-evidence`。

jc.set四个真实调用与schema、深snapshot校验、findTokenConflict、Markdown Td、Rp及Python恢复均实际读；V3 sb/fb与correction叶Yg/Kg/Jg/Zg后续补读亦有范围。传输/磁盘/算法精度仍未运行。

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP31 native审计输入/过滤及几何聚合依赖

状态：`cross-report-evidence`。

gf2输入和审计落点、批量audit/pseudonym更新及iy2/ry2已读；draft-producers对其余14个指定赋值位置及邻接Qv2逐体补读，并已由root独立审查。父级保存回执另接PA07/旧UIR。36赋值索引只作导航，不能把切片含赋值行当36端到端语义/运行证明。

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP32 局部OCR/人工批量的内部匹配建框

状态：`cross-report-evidence`。

DOCX同图重复框、PDF Ul2/Zs2/_u2、Image mi2/Ye2；PDF ro2/io2/so2、wb→yb/gb/Qy和原始页集合均已读。只原生主循环排deleted，OCR优先/末页LCS不排；这些为已揭示条件，未测几何正确率。

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP33 feedback.addBatch主进程持久化

状态：`cross-report-evidence`。

formats.feedback main13332–13485/18091–18178等已经追Mu持久化；parents补DOCX Co2去重后异步send与catch空。

边界：其它zf/_c/er2调用者仍DEP27；Image U2空实现不等于后台反馈成功，不能复用DOCX结论。

### DEP34 ai-collab open-job/consume→renderer le2生产消费

状态：`cross-report-evidence`。

CE01–03实际读主进程单槽→preload→两个renderer消费者、AF/Kc队列、le2每个状态分支及授权/停放/回执推进；不是只看同名函数。

边界：同job没有全串行/卸载取消保证，事件callback不await le2，真实交错R0；逐格式导出/还原具体叶节点单列DEP47。

### DEP35 协作回执/归档/还原接格式算法

状态：`cross-report-evidence`。

apply任务、各writer、还原脚本与Gf取消已有单独语义证据可连接；原先“文档组另审”已有产物。

边界：renderer le2与完成通知来源仍DEP34；固定valid/零残留计数不变，不能变成真实内容验收。

### DEP36 协作客户端/MCP/DSH和远端支付签发

状态：`external/unavailable`。

本地socket/client/protocol可见；远端支付/凭证签发/外部宿主ctx.fs/native安装及OSpeer为外部或不可见边界。

边界：无法用客户端schema、HTTP200、finish或同requestId证明服务端幂等、合法签发或安装完成。

### DEP37 升级下载executor/differential已补读，外部算法与安装运行边界

状态：`external/unavailable`。

UD01–09实际补读下载executor、完整/差分、multipart、取消、progress、cache及retry应用/库编排。当前Mac配置disableDifferentialDownload=true，差分仅发布包条件路径。此有限链不再留具名函数未读；原ASAR字节来源由新报告核对。保留external/unavailable类别对应Node crypto/zlib/stream、其它provider/platform/install实现及CDN/签名/OS安装结果，不再把这些与已读executor混合。

边界：原生Squirrel/OS安装与CDN发布不可见另属external/runtime；签名归一比较不能证明安装算法。

### DEP38 53系统入口的发布renderer消费与生命周期边界

状态：`cross-report-evidence`。

53系统原接口逐条inventory：41存在renderer调用者并读对应消费体，12发布renderer无调用；无调用不证明通用invoke不能调用。授权/菜单/升级/窗口事件的局部错误/解绑已分析；workspace恢复转SP，系统main沿原报告。不是53全生命周期运行完成。

边界：SC09–14已逐有调用入口读消费体，12无发布调用保留无引用；不据此证明所有系统平台、授权、升级和退出真实生命周期成功。

### DEP39 原生认证helper/官方恢复凭证服务

状态：`external/unavailable`。

LAContext原生helper未逐指令分析；官方凭证签发/撤销服务不在包内。

边界：native文件完整性/codesign通过只验证资产，不验证业务行为。

### DEP40 组织地域/品牌前缀与renderer wd对照

状态：`cross-report-evidence`。

RP10逐项对照五组有序列表61/75/23/7/9，wd/Nt相同原始输入分支对应；An扩大后缀/前缀40/104项，记录first-match及qp先cc导致的差异。

边界：原始wd/Nt可见分支对应不等于完整partial_star链等价；An全部实际语料/模型调用上下文与准确度R0。

### DEP41 OCR诊断路径、缓存全层和事件消费者

状态：`cross-report-evidence`。

CE04–07补诊断完整字段与写失败、Mac/Paddle差异、2progress/3page监听注册解绑及main生产者、三层缓存。发现缺requestId兼容、DOCX早分支及64/16hex释放键不一致。

边界：此处是所列本地链条已读；全事件嵌套模型语义/运行交错/全部内存释放不由此证明。跨格式snapshot/恢复仍DEP18/29，模型外部DEP44，实测DEP45。

### DEP42 导入内容判据与密码/识别及第三方预览资源

状态：`cross-report-evidence`。

Og2密码及routeOnly连接已实际读；Fg2/Blob/DataURL/Nn2旧UIR04/05+UL05保留，source所有权DPS15明确进程全局且handler不按sender绑定，不能把不存在的sender授权检查列待找。第三方资源真实decode/多窗口并发与原路径恢复身份为外部或运行边界。

边界：本版本无UI引用端点已有A/B census；无引用不是缺少可见按钮待找，也不证明通用invoke不可达。

### DEP43 取消清理、覆盖原件与落盘中间态组合

状态：`cross-report-evidence`。

root实读输入原路径、A2覆盖、Markdown提交、receipt与finally取消组合，形成条件化反例：同源覆盖后abort可能删除原路径；成功receipt也可先于finally清理。

边界：按条件静态推导，非真实文件系统复现；链接/inode/故障/晚到取消R0，第三方writer原子性未证明。

### DEP44 模型/图像/Office外部依赖与平台缺失文件

状态：`external/unavailable`。

ONNX/tokenizer/Paddle/Vision/Sharp/canvas/PDF.js/PDF-lib/Office/PyMuPDF外部语义；mac包缺seal及Windows Office脚本有ASAR清单证据。

边界：本轮不执行vendor、不绕许可；不存在的Windows资产不能用Mac分支推断。

### DEP45 合法竞品E2E、故障、真实几何与我方等价

状态：`runtime`。

所有报告运行状态R0；语料准确率、版式保真、并发/取消/关窗/恢复、授权后导出和我方I4均无此次实测。

边界：接口/哈希/静态控制流全可读也不能替代这些验收。

### DEP46 规则更新/类型路由/搜索归一旧manual措辞

状态：`cross-report-evidence`。

core已有直接算法节与精确范围，接口沿用的旧manual残留不能反过来否定这些已读控制流；归一/路由范围以章节为限。

边界：原分类器所有外部特征/模型准确率以及所有renderer搜索producer仍需各自报告；没有提整个接口S3。

### DEP47 协作逐格式导出/还原末端编排

状态：`cross-report-evidence`。

Zg2/Nv2/xy2准备、主apply及附加MD分叉、prepare/release/finish、还原面板/父完成回执均实际读。主apply未知结果停止但附加MD不停止；fail后release拒绝；密码cancel内return仍可Rm2。分支条件已知，不等于全组合/幂等性经过运行验证。

边界：Zg2/Nv2/xy2及restore回执应用分支已读；调用链静态条件不等于全故障组合、持久化事务及外部AI/模型运行等价。

## 直接跨报告连接

- LM04/05 To2/_u2/Ir2/lo2/Bb → LH01–05。只应用体；PDF.js/字体不随此闭合
- LM06 Nd VML包装 → LH06。Nd应用代码已读；loadImage/renderTextBox/decode外部真值仍未知
- LM08 Nf/df/qh/_2/v2 → PA01/08/09。过滤/分组/合并本体已读；非DOM几何验收
- LM11 wb/yb/gb/Qy → SP15。冲突规范化已读；真实框定位R0
- SC02 Dm2/Om2和SC13 Nd2 → SP02–04。检测/重开调度应用体已读；不扩成外部模型结果
- DEP42 source多窗口身份 → 旧DPS15+DPS17/UIR04/05 与SC01/13。registry不按sender绑定是明确静态事实；多窗口真实并发释放及文件变化R0

## 仍需哪一层

- 本矩阵已列命名应用子体未读：0 主题（有限发现范围，不是整个发布包穷尽）。
- 外部/不可得：5主题，含压缩/原生身份、远端协作/签发、升级底层算法/平台签名安装、认证与恢复服务、模型/平台缺失依赖；有精确补读证据的executor不再列未读。
- 运行：1聚合主题，包括合法竞品端到端、故障/取消/多窗口竞态、真实字体几何及我方等价验收。
- 第三方可见模块仍未逐库展开：DOCX动态模块、PDF.js、updater未纳入范围的其它provider/platform/install及底层primitive；限定executor已读不代表所有库内部已验证。
- 我方产品实现对齐是独立验收，本轮不改应用，也不声称完成。
