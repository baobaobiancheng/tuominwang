# 剩余依赖对账 · 2026-10-14

本清单对账 5 份主报告、3 份处理增补，并接入 UI 父组件增补。**不是再次全量算法审计，不修改原报告或台账，全部保持 S2/R0。**

## 状态说明

- 清单行数是依赖主题，不是接口完成率；同一接口可包含多个状态。
- cross-report-evidence仅所列可见项目子链已有精确证据；不意味着各报告之间身份/时间/版本不变量已全部验证。
- project-readable-open是尚未完整契约化的项目函数/连接，或明确未展开的应用依赖；不能自动归因许可证缺失。
- external/unavailable包括本包不可见服务/平台资产、第三方和原生执行边界。
- runtime是尚未合法运行或我方等价验收，所有台账S2/R0保持，不修改历史报告。

## 逐项对账

|ID|依赖|状态|对账结论|
|---|---|---|---|
|DEP01|核心旧待办：全部基础规则、策略与granular|cross-report-evidence|41规则顺序、金额分支、策略no-op、配置实际生效集合与granular分支已有人工语义报告；这部分旧待办已补证。|
|DEP02|核心旧待办：PDF/OCR中段与表格几何|cross-report-evidence|覆盖supplement、required OCR、bbox优先序、native有线表格producer、es/旋转缩放与oi/Ei语义。|
|DEP03|核心旧待办：DOCX OOXML保真/notes/删图|cross-report-evidence|接受修订、保留package、notes跨run和对象/包层删图已逐分支读；精确Python范围补齐原列号。|
|DEP04|核心旧待办：Markdown节点/worker/保存|cross-report-evidence|AST节点到source-map、writer降级、anchor-first/legacy评分和Gf父worker/MarkItDown桥具独立语义证据。|
|DEP05|核心旧待办：seal/face调用与后处理|cross-report-evidence|颜色/Hough平台分支、PDF图片过滤、YuNet BGR输入/输出/NMS阈值、模型文件大小SHA已写明；旧遮盖catch返回原buffer已定位。|
|DEP06|核心旧待办：report/M2/A2/ns及legacy|cross-report-evidence|报告常量保证、source恢复/hash、A2直接覆盖重试（纠正旧称atomic）、ns overlay、Dp/Sp转换及解密桥已实读。|
|DEP07|19辅助handler此前仅manual证据|cross-report-evidence|规则增补逐稳定ID对19/19 handler与source/folder/save/annotation helper实际补读，不再只是登记。|
|DEP08|强制规则定位Id/Sd/Md/Ed及_d/bd/yd/xd/wd|cross-report-evidence|SD01逐分支说明Id非重叠匹配、_d框裁剪、Ed旧实体选择、Md几何优先及Wd主调用；原未读定位组已有语义补证。|
|DEP09|Iu Python依赖探测与解释器候选|cross-report-evidence|SD02补Iu环境/候选/失败分类和uu超时包装；不是只用docx-runner相邻范围覆盖。|
|DEP10|Windows机器标识WMI/PowerShell helpers|cross-report-evidence|SD03补Windows固定WMI/PowerShell回退、过滤、标识组合与缓存；这里只读命令源码，未执行。|
|DEP11|legacy snapshot review子schema验证器|cross-report-evidence|SD05明确子schema有限数不等于正数/整数、bbox未普遍验正尺寸、进度/charBoxes/rotations弱校验等具体分支。|
|DEP12|Markdown统计Zf和日志Cp|cross-report-evidence|SD04补Cp日志摘要/失败吞掉、Zf格式过滤/去重和2MiB日志尾读取；原辅助helper待办已有证据。|
|DEP13|LPM格式化kr/Ar/Fr及文本重叠planReviewedTextEdits|cross-report-evidence|DPS08 main2923–3192覆盖kr/Ar/Fr的类型归一与JSON导出，DP18/PSF06写出重叠union、同型包含与替换合并语义。|
|DEP14|system→mf迁移；collab→CMK/secure/LPM索引|cross-report-evidence|mf逐文件迁移、索引补偿、cf/df分块GCM和Fg密钥槽/缓存/设备恢复已有明确契约，消除“另组尚未读”泛占位。|
|DEP15|格式还原→Dp/Sp legacy转换|cross-report-evidence|Dp串行队列、平台选择、超时/取消、回环文本与对象计数验证、Sp内嵌图片规范化已实读。|
|DEP16|workspace→MarkdownInputAdapter语法|cross-report-evidence|输入编码、GFM/YAML节点、sidecar source-map、blocker与降级分支已有人工契约。|
|DEP17|workspace/collab→sourceRegistry生命周期|cross-report-evidence|dp注册/路径优先/快照缺失重建/延迟或即时hash/readRange/release及provider接口已实读；明确无sender绑定和close错误中断。|
|DEP18|snapshot/保存恢复直接拥有者已读，子归一化待补|project-readable-open|Nu2各格式组装、provider、save回执、Nd2/Pd2恢复连接已有UIR01–03；底层容器复用formats。 WU/qU、oV/lV/uV/cV、wV/gV/bV/xV已补读且记录有损字段/默认值；Nu2直接组装不再待读。|
|DEP19|TMM外部压缩/流/JSON parser和系统原生身份|external/unavailable|应用层容器已读，剩下Node/native safeStorage/第三方JSON streaming/archiver/yauzl内部及跨平台行为。|
|DEP20|格式33复杂链整体状态|project-readable-open|14个pseudonym和19个workspace接口仍保持原分类；可读子依赖有些已通过DEP13–17补证，但DEP09/11/18/后续UI导出连接尚在，禁止整体33销项。|
|DEP21|UI旧父级待办：entity-group-review|cross-report-evidence|新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。|
|DEP22|UI旧父级待办：full-text-search-scopes|cross-report-evidence|新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。|
|DEP23|UI旧父级待办：review-preview-mode|cross-report-evidence|新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。|
|DEP24|UI旧父级待办：preview-policy-hierarchy|cross-report-evidence|新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。|
|DEP25|UI旧父级待办：known-entity-audit|cross-report-evidence|新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。|
|DEP26|UI旧父级待办：manual-correction-scope|cross-report-evidence|新parents报告已实际读parentDependenciesRead与failureAndConcurrency列出的调用者/状态消费，精确范围附在support。|
|DEP27|实体投影上游及其他删除调用者|project-readable-open|Eo2/Pa2/Il2/St2与zf/_c/er2本体已读；不是原函数仍未读。|
|DEP28|PDF布局/单位与行高的生产者|project-readable-open|Markdown W2非空白查询关闭虚拟化、St2及PDF nr2/Ji2等变换/Es2已读。|
|DEP29|child大文档DOM/渲染生命周期深依赖|project-readable-open|Nu2保存重开、gs2/$s2/zu2分发及PDF卸载已读；正式计数门和AppWindowControls未看false已单列。 所有列名序列化主体已有leaf覆盖；保存后重绘的DOM/异步生命周期仍独立。|
|DEP30|假名canonical子归一与逐格式消费|project-readable-open|jc/UK本体、锁定token/alias一跳和reserved行为已读；不能据此证明逐格式导出。 policy RP01–09已读cc/Lc/of/sf、jc/YK、各格式token→IPC/main/LPM恢复消费；记录图片键规范化漏配等差异。|
|DEP31|native审计输入/过滤及几何聚合依赖|project-readable-open|vf2/ff2/pf2/xv2本体已读，UTF16与码点索引条件缺陷有精确证据。 Am2/Tm2、mC/pC、af2/rf2/of2/lf2/uf2/cf2实际补读；页边启发式和宽高非finite/索引差异已有证据。|
|DEP32|局部OCR/人工批量的内部匹配建框|project-readable-open|sn2/Xe2/so2/hs2/yi2以及Es2/Pb/Ib/As2/Ts2/Is2本体已读；不再列为完全未读。 xl2/kl2/nv与Uf/Vf/Wf/qf/Yf/Xf、OCR几何uf2已读；不再列这些函数本体未读。|
|DEP33|feedback.addBatch主进程持久化|cross-report-evidence|formats.feedback main13332–13485/18091–18178等已经追Mu持久化；parents补DOCX Co2去重后异步send与catch空。|
|DEP34|ai-collab open-job/consume→renderer le2生产消费|cross-report-evidence|CE01–03实际读主进程单槽→preload→两个renderer消费者、AF/Kc队列、le2每个状态分支及授权/停放/回执推进；不是只看同名函数。|
|DEP35|协作回执/归档/还原接格式算法|cross-report-evidence|apply任务、各writer、还原脚本与Gf取消已有单独语义证据可连接；原先“文档组另审”已有产物。|
|DEP36|协作客户端/MCP/DSH和远端支付签发|external/unavailable|本地socket/client/protocol可见；远端支付/凭证签发/外部宿主ctx.fs/native安装及OSpeer为外部或不可见边界。|
|DEP37|electron-updater下载executor/differential及签名安装|external/unavailable|协作已读GenericProvider/Provider/MacUpdater，system仍交叉指回协作。双方互相引用不等于executor/differential全层已读；这是具体可见第三方依赖边界，归external而非项目函数；不扩大到全部库。|
|DEP38|系统其余renderer消费与全入口生命周期|project-readable-open|AppWindowControls已补，prepare-close=false仍可能放行、save后不再isDirty；hI系统状态机在旧证据。|
|DEP39|原生认证helper/官方恢复凭证服务|external/unavailable|LAContext原生helper未逐指令分析；官方凭证签发/撤销服务不在包内。|
|DEP40|组织地域/品牌前缀与renderer wd对照|cross-report-evidence|RP10逐项对照五组有序列表61/75/23/7/9，wd/Nt相同原始输入分支对应；An扩大后缀/前缀40/104项，记录first-match及qp先cc导致的差异。|
|DEP41|OCR诊断路径、缓存全层和事件消费者|cross-report-evidence|CE04–07补诊断完整字段与写失败、Mac/Paddle差异、2progress/3page监听注册解绑及main生产者、三层缓存。发现缺requestId兼容、DOCX早分支及64/16hex释放键不一致。|
|DEP42|导入内容判据与密码/识别及第三方预览资源|project-readable-open|Fg2仅后缀predicate，Ug2/Kg2/jg2/Nn2和DataURL生命周期已读；PDFWorker objectURL单独区分。 BU只jpg/jpeg/png、FU后缀解析与$U白名单已读；predicate≠内容验证。|
|DEP43|取消清理、覆盖原件与落盘中间态组合|cross-report-evidence|root实读输入原路径、A2覆盖、Markdown提交、receipt与finally取消组合，形成条件化反例：同源覆盖后abort可能删除原路径；成功receipt也可先于finally清理。|
|DEP44|模型/图像/Office外部依赖与平台缺失文件|external/unavailable|ONNX/tokenizer/Paddle/Vision/Sharp/canvas/PDF.js/PDF-lib/Office/PyMuPDF外部语义；mac包缺seal及Windows Office脚本有ASAR清单证据。|
|DEP45|合法竞品E2E、故障、真实几何与我方等价|runtime|所有报告运行状态R0；语料准确率、版式保真、并发/取消/关窗/恢复、授权后导出和我方I4均无此次实测。|
|DEP46|规则更新/类型路由/搜索归一旧manual措辞|cross-report-evidence|core已有直接算法节与精确范围，接口沿用的旧manual残留不能反过来否定这些已读控制流；归一/路由范围以章节为限。|
|DEP47|协作逐格式导出/还原的末端连接|project-readable-open|Kg2导入及Jc2/save provider已有跨报告实读；le2本体不再待读。 policy已补各格式token出口→Gi2/apply以及LPM聚合/restore消费；不再把这些算法本体全写未读。|

## 仍可读而未完整核验的具体层

### DEP18 snapshot/保存恢复直接拥有者已读，子归一化待补

Nu2各格式组装、provider、save回执、Nd2/Pd2恢复连接已有UIR01–03；底层容器复用formats。 WU/qU、oV/lV/uV/cV、wV/gV/bV/xV已补读且记录有损字段/默认值；Nu2直接组装不再待读。

位置：renderer eV OCR进度子校验与全schema字段差分；重开后Om2/kd2/Ed2消费者的完整控制流

边界：已有主进程保存证据应复用；此open指缺失连接/producer，不指全部磁盘逻辑从未读。

### DEP20 格式33复杂链整体状态

14个pseudonym和19个workspace接口仍保持原分类；可读子依赖有些已通过DEP13–17补证，但DEP09/11/18/后续UI导出连接尚在，禁止整体33销项。

位置：原报告中所列producer/consumer连接

边界：这里的33是接口集合，不是33个互不重叠算法；恒定6/应用边界49同样未自动升S3。

### DEP27 实体投影上游及其他删除调用者

Eo2/Pa2/Il2/St2与zf/_c/er2本体已读；不是原函数仍未读。

位置：DOCX S2/k2/Ao2/xs2全部生产者；删除helpers其他调用者持久化

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP28 PDF布局/单位与行高的生产者

Markdown W2非空白查询关闭虚拟化、St2及PDF nr2/Ji2等变换/Es2已读。

位置：Yi2/mt2/pt2布局生产者；Li2/vE；al2/il2行高与tn2旋转来源

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP29 child大文档DOM/渲染生命周期深依赖

Nu2保存重开、gs2/$s2/zu2分发及PDF卸载已读；正式计数门和AppWindowControls未看false已单列。 所有列名序列化主体已有leaf覆盖；保存后重绘的DOM/异步生命周期仍独立。

位置：DOCX Xr2/ps2及动态renderer load/unmount；PDF Xu2完整虚拟渲染

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP30 假名canonical子归一与逐格式消费

jc/UK本体、锁定token/alias一跳和reserved行为已读；不能据此证明逐格式导出。 policy RP01–09已读cc/Lc/of/sf、jc/YK、各格式token→IPC/main/LPM恢复消费；记录图片键规范化漏配等差异。

位置：jc.set全部外部载入/继承schema验证；YK.applySnapshot上游所有深验证及findTokenConflict全部调用分支；旧formats Rp/Td未覆盖的内部定位替换

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP31 native审计输入/过滤及几何聚合依赖

vf2/ff2/pf2/xv2本体已读，UTF16与码点索引条件缺陷有精确证据。 Am2/Tm2、mC/pC、af2/rf2/of2/lf2/uf2/cf2实际补读；页边启发式和宽高非finite/索引差异已有证据。

位置：gf2全部draft上游与各格式审计命中持久化消费；PDF.js字体/几何外部语义及运行另列

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP32 局部OCR/人工批量的内部匹配建框

sn2/Xe2/so2/hs2/yi2以及Es2/Pb/Ib/As2/Ts2/Is2本体已读；不再列为完全未读。 xl2/kl2/nv与Uf/Vf/Wf/qf/Yf/Xf、OCR几何uf2已读；不再列这些函数本体未读。

位置：DOCX同图重复位置批量；PDF Ul2→Zs2；mi2/Ye2/ro2；页集合生产者

边界：没有将静态竞态条件写成已运行复现；失败补偿/版本一致性还需R0验证。

### DEP38 系统其余renderer消费与全入口生命周期

AppWindowControls已补，prepare-close=false仍可能放行、save后不再isDirty；hI系统状态机在旧证据。

位置：53系统IPC其余菜单/更新/授权renderer生产消费；不能由窗口这一条推成53条完整闭合

边界：不能把6条UI路径扩张为所有菜单、更新、授权、退出接口的生产消费链。

### DEP42 导入内容判据与密码/识别及第三方预览资源

Fg2仅后缀predicate，Ug2/Kg2/jg2/Nn2和DataURL生命周期已读；PDFWorker objectURL单独区分。 BU只jpg/jpeg/png、FU后缀解析与$U白名单已读；predicate≠内容验证。

位置：Og2密码/批量detect连接；DOCX第三方渲染器内部资源；多窗口路径授权复用main但整链待证

边界：本版本无UI引用端点已有A/B census；无引用不是缺少可见按钮待找，也不证明通用invoke不可达。

### DEP47 协作逐格式导出/还原的末端连接

Kg2导入及Jc2/save provider已有跨报告实读；le2本体不再待读。 policy已补各格式token出口→Gi2/apply以及LPM聚合/restore消费；不再把这些算法本体全写未读。

位置：Zg2/xy2/Nv2协作多步骤编排的全部失败/重复事件/跨产物回填组合；个体token/writer算法已分别具证据，真实交错R0

边界：不是le2函数本身仍未读；不是所有格式算法全未读；相邻范围不能替代完整数据生产/消费证据。

## 证据索引和计数

所有支持报告章节、精确范围与SHA256、原待办文本、33复杂接口逐ID映射见同名JSON。原报告保留历史措辞，本清单负责当前对账。

{"items": 47, "byStatus": {"cross-report-evidence": 30, "project-readable-open": 11, "external/unavailable": 5, "runtime": 1}, "formatComplexInterfaces": 33, "evidenceRanges": 427, "allBusinessClosed": false, "runtime": "R0"}
