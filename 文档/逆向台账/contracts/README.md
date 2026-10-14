# IPC静态契约深化（0.5.9）

## 本轮结果与边界

原始214个IPC全部保留；展开主进程`ce(channel, callback)`注册包装器的22个字面调用后，合计**217个通道：209个处理器、8个通知事件**。新增3个图像复核通道。名称覆盖不是契约完成度：本轮**0个条目宣称完整静态全链路闭合，0个获得新增竞品运行验证**。

AST为每个处理器记录参数语法、参数属性访问/解构、直接return/throw/catch、条件、赋值/删除、调用边、注册位置和preload转发参数；另外记录通知推送位置及载荷形态。词法固定点展开共3123个函数节点，包含额外追踪的安全网关服务方法和嵌套回调。它们不是3123个接口，也不是3123个已完成契约。

输入字段访问不代表必填；返回对象语法不是完整运行时类型。动态成员调用、参数别名、外部chunks/原生依赖、回调执行条件、持久状态以及失败恢复仍有缺口。每一条均保留具体未解析调用和待办，不能把“已提取”填成S3。

## 文件

- [IPC逐项概览.csv](IPC逐项概览.csv)：217行，按通道查看处理器、preload、事件、词法可达函数和未解析调用数。
- [ipc-contract-index.json](ipc-contract-index.json)：217项直接契约及精确源码范围。
- `.data/research/lawbot-2026-10-13/ipc-static-contracts.json`：完整图及3123个函数契约。范围采用JavaScript UTF-16索引，不能直接当Python字符偏移。
- [gateway-service-contracts.json](gateway-service-contracts.json)：13个安全网关service方法的契约。第14个`gateway_ping`直接在分发器返回。
- [mcp-expanded-schemas.json](mcp-expanded-schemas.json)：12个MCP工具Schema，展开14个常量，包括跨文件TASK_GOALS、对象/数组spread和常量属性访问。这里只证明声明Schema已展开。
- [verification.json](verification.json)：先核对现有IPC/MCP产物是否与源码重新提取结果一致，再核对派生索引/网关/建议/CSV及台账contract_ref集合，最后验证4个原文件和源码范围哈希。负向探针仅改内存，不改原始文件。
- [ledger-recommendations.json](ledger-recommendations.json)：逐条建议的静态深度、中文摘要及剩余缺口。S2建议基于局部契约或事件关系，全部维持R0，没有S3建议；交父代理审查合并。

## 三个补充通道：人工核读

依据`readable/main.js`第18186–18343行和原始bundle范围（机器索引提供对应偏移）。这些通道通过通用invoke桥调用，不能因为preload没有专用方法就当不存在。

### image-review:batch-search

- 稳定ID：`IPC-4dd20e80cae3`。读取参数`fileName/searchText/pageIndex/ocrCacheKey`。`pageIndex`为零基，转换为缓存中的一基`pageNumber`。
- fileName或searchText为空返回`success:false,error`；缓存不存在返回OCR数据不存在错误。参数在校验前直接解构，null/undefined可能抛出，不能只列两个业务错误就称错误模型完整。
- 搜索使用OCR缓存`q2.get`→`vf`→Map `_f`。`wm`删除空白及多种不可见分隔字符。优先charBoxes，缺失时用字宽估算；还有相邻多行拼接搜索，间距限制及结果去重`dd`。
- 成功输出`success/results/checkedPageNumbers`，结果含pageNumber、坐标/多矩形bboxes、OCR画布大小、匹配文本及搜索区间。不是再次调用OCR来全文搜索。
- handler内未见直接激活断言；包装器管理macOS后台节流及电源租约。缓存产生、全局访问控制、真实坐标/Unicode匹配行为未运行验证，不据此推断未激活可使用。

### image-review:ocr-region

- 稳定ID：`IPC-910347ed48b5`。读取`fileName/pageNumber/canvasX/canvasY/canvasW/canvasH/canvasWidth/canvasHeight/ocrCacheKey`。
- 从已缓存页面提取文字，画布坐标按OCR页面尺寸缩放。字框路径按字框中心是否落区选择；缺字框时按行宽比例切片。函数名含OCR不等于每次启动OCR识别。
- 缺文件名、缓存或页面/页面尺寸返回`{success:false,text:""}`；成功返回`{success:true,text,ocrBbox}`，空区域可得到空文本和null bbox。
- 直接参数解构及数值运算缺少完整输入Schema，画布尺寸为0等边界没有独立运行结论。无直接license断言不等于无上游权限要求。

### image-review:get-ocr-page

- 稳定ID：`IPC-ba07bb14e3df`。输入`fileName/ocrCacheKey/pageNumber`，可选`pdfBuffer/totalPages/pageNumbers`。
- pageNumber必须有限且大于0；先查缓存。缓存缺页且有pdfBuffer时，接受Buffer/ArrayBuffer/typed view，启动`processPdfWithForcedOcr`，通过回调和后续lookup填充缓存。
- `J2`按缓存key保存进行中Promise，避免同key重复任务；finally有条件清除。等待以250ms Promise.race轮询直到目标页出现或任务结束。
- 成功返回pageNumber/pageWidth/pageHeight/lines（text、confidence、bbox、charBoxes）；失败返回`{success:false,page:null}`。部分异常在等待处吞掉，任务Promise仍可能拒绝；依赖OCR引擎/回调的异常、取消及资源恢复不能仅由外层handler穷尽。

缓存补充证据：`readable/main.js`15335–15370。`_f`最多50个缓存key或估算128MiB，新增时淘汰最早key；`Af`按pageNumber替换并排序，`kf`通过`Ef`维护缓存及字节估计。该观察不等同于精确内存上限或所有OCR缓存机制。

## 哪些局部契约已人工闭合

以下6个handler是直接常量结果，局部输入、结果和无显式副作用可从函数体穷尽。**仅handler局部完整**，没有提升为完整应用链路或竞品运行验收：

| 通道 | 局部结果 |
|---|---|
| learner:get-high-confidence-memory-count | success=true，count/totalMemories/lastSnapshotMemoryCount均0 |
| learner:update-rules | success=true，stats=null，rulesetHash为空串；不是确实更新规则 |
| learner:get-snapshots | success=true，snapshots空数组 |
| learner:rollback-to-previous | success=false，error说明自学习回滚已下线 |
| learner:rollback | success=false，同义说明写在message字段 |
| learner:rollback-previous | success=false，同义说明写在message字段 |

证据为`readable/main.js`18178–18186，原始处理器范围见JSON。不要根据遗留名称宣称训练、回滚或快照功能可用。

## 激活前置与动态入口

直接处理器层发现9处`nd.assertActivatedOrThrow`调用，逐项见索引`directActivationCalls`。人工进一步确认`desensitization:detect-only`和`desensitization:apply`开头的try/catch：激活断言失败返回`success:false,requiresActivation:true`，随后才建立处理任务。前者见17196行起，后者17409行起。

其余直接命中为process-file-main、process-files、recognize-docx-images、save-file、save-markdown-draft、save-report、feedback:export-audit-report。此列表是直接调用观察；不能推出其他接口没有间接前置条件。

3处原始动态语法位置分别为：

1. 主进程`ce`里的参数通道：还原22个字面调用点，其中19个已被其他位置纳入历史214，3个为本轮新增。
2. preload第308行：`window.ipc.invoke(channel,...args)`。
3. preload第314行：`window.electron.ipcRenderer.invoke(channel,...args)`。

后两项是无界运行时字符串桥，不能展开成封闭通道全集。已观察到的调用点和未来可传入字符串不是同一个分母。包装器还原也不证明每条注册在所有启动路径都可达。

## 安全网关补充

13个service方法均唯一定位到`class qw`：startSecureReview、startLocalRestore、getReviewStatus、requestSessionResume、getConfigurationCatalog、waitForReviewDelivery、getArtifact、allocateSlot、submitResult、requestRestore、continueReview、completion、waitForRestoreCompletion。机器文件提供各方法参数、返回、throw/catch、直接调用/变更及源码范围。

人工对照`readable/main.js`24126–24167的`ux`分发器，与上述方法一致；`gateway_ping`直接返回ready/uiReady/pid/schemaVersion。该接口面与Electron IPC分开计算。分发器校验sessionSecret和caller，执行assertAccess回调，再转发；异常统一回`{id,ok:false,error:{code,message}}`。本轮没有调用网关，没有读取或使用真实sessionSecret。

## 复现与核验

从项目根目录首先只核验现有产物：

```sh
node 文档/逆向台账/contracts/verify-contracts.mjs
```

统一入口按顺序执行`extract-ipc --check`、`expand-mcp-schemas --check`、`summarize-contracts --check`，它们都不覆盖现有产物。随后按源码权威结果的语义哈希再次核对当前读入对象，防止删条目或修改Schema仍通过；核对217条IPC的名称/稳定ID/contract_ref集合、12个MCP名称及14个网关名称到13个service方法的映射。成功才写入新的verification.json；失败不会改写旧报告，旧报告不能代表本次失败运行通过。

若检查失败，先确认变动来源并审阅差异，不要立即重生成来消除错误。只有确认原始证据发生了预期变化或明确授权修复派生文件后，才显式重新生成：

```sh
node 文档/逆向台账/contracts/extract-ipc.mjs
node 文档/逆向台账/contracts/expand-mcp-schemas.mjs
python3 文档/逆向台账/contracts/summarize-contracts.py
node 文档/逆向台账/contracts/verify-contracts.mjs
```

所有命令只解析本地已取得代码文本；不import/eval供应商代码、不发网络请求、不启动或绕过授权。Schema解释器拒绝执行表达式。统一核验的内存负向探针覆盖范围偏移、内容哈希、删除IPC、删除MCP、改首项Schema为string、移除ledger契约引用，均须拒绝。父代理负责合并ledger及生成视图，本目录工具不会修改ledger。

## 人工契约统一核验

`manual-workflow-contracts.json`（63项）、`manual-collaboration-contracts.json`（101项）与`manual-system-contracts.json`（53项）覆盖已知217个IPC。这里的覆盖指每项有人工局部契约记录；**完整业务契约仍为0，全部保留S2/R0，我方实现状态不升级**。协作文件内另附MCP/网关分析，不并入IPC分母。

先检查当前证据及已有报告（默认也是只读检查）：

```sh
python3 文档/逆向台账/contracts/verify-manual-contracts.py --check
```

脚本先调用源码提取、派生索引和workflow构建器的只读`--check`，然后核对217项无漏无重、稳定ID、原始handler/事件与preload的逐项关联、UTF-16偏移切片、逐行切片及整文件哈希。UI入口和服务局部关系分别保留证据；没有UI位置的条目保持待核。它不执行供应商代码，也不能自动证明人工摘要语义正确或把目录/接口名当完整链路。

删除条目、重复条目、切片哈希篡改或缺失、S3/R2/complete状态冒进、实现状态升级及错误preload关联的负向探针只改内存，每种在三份来源上各测一次。另测不存在的renderer、无哈希或只有路径的伪UI引用、越界行范围，以及把有效主进程证据伪作UI证据，共32个探针。人工/UI引用强制要求路径、完整坐标和SHA256，UI引用须来自已知renderer来源；缺字段不能跳过验证。所有验证通过后才比较已存报告；失败不覆盖旧报告。旧报告不能代表后续失败检查通过。

初次生成或已审阅且确认需要更新的证据变动，显式执行：

```sh
python3 文档/逆向台账/contracts/verify-manual-contracts.py --generate
python3 文档/逆向台账/contracts/verify-manual-contracts.py --check
```

输出`manual-coverage.json`与`.data/research/lawbot-2026-10-13/manual-ledger-recommendations.json`；后者逐项提供`manualContractRef`、人工摘要、已确认局部关系、UI证据和待办供审查合并。本工具不写ledger，不提升S3/R2或我方实现状态。报告哈希固定当前证据快照，不能证明更早时刻内容。
