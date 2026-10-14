# 配置、规则、反馈记忆与 AI 协作：手工契约补证

日期：2026-10-13；对象：脱敏猫 0.5.9 已取得安装包的静态源码。所有定位均相对本工程根目录。

## 1. 结论和边界

本次覆盖 10 个命名域的 **101 条 IPC**：ai-collab 26、mcp-connectors 6、ruleset 10、profile 6、preference 2、dictionary 12、feedback 9、review 9、learner 7、pseudonym 14。它们在本次起点均属于全台账 202 条“命名线索待核”。“17”不是有效分母。101 条是本次局部人工补证范围，**不是完整调用链完成数量**。

所有条目保持 **S2 / R0**，我方 I 状态不变。本报告证明源文件里的关系和分支，不证明注册后的运行可达性、许可环境、文件输出正确性、依赖程序行为或产品等价。JSON 建议逐条区分：已定位 UI 调用的局部链路、仅 preload/handler/service 的局部链路、停用常量处理器。未定位 UI 不等于不存在 UI，动态别名和未读组件仍需排查。

本次未运行竞品代码、未调用远程接口、未读取运行时令牌或密钥、未修改安装包。审核报告和学习器两个附加 chunk 从 ASAR 只读提取，并比对 ASAR 成员 integrity、既有 extracted 文件及新可读文件哈希。记录在 `.data/research/lawbot-2026-10-13/manual-collaboration-evidence/hashmanifest.json`。TypeScript parser/printer 只用于格式化，未执行目标模块。

### 证据简称

- **M**：`.data/research/lawbot-2026-10-13/readable/main.js`
- **R**：`.data/research/lawbot-2026-10-13/readable/renderer.js`
- **P**：`.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js`
- **A**：`.data/research/lawbot-2026-10-13/manual-collaboration-evidence/DK2pJCiu.js`
- **L**：同目录 `Cw24Yh6r.js`
- 原始字符偏移和切片 SHA 仍由 `ipc-static-contracts.json`、`contracts/ipc-contract-index.json` 负责；本报告的可读行号补充人工语义，不替换原始证据。

## 2. 先纠正容易虚高的判断

| 命名或展示线索 | 源码实际行为 | 证据 / 验收含义 |
|---|---|---|
| AI 返回稿“通过安全校验” | 文件来源、轮次、格式、hash、交换件检查存在；但 `validation.valid=true`，missing/unknown/malformed/declaredChange 计数直接为 0，只有已知 token 出现数实际计算 | M:23631–23663。不能据此声称做了完整 token 语义验证；独立实现须明确自己的校验保证 |
| 恢复完成“残留 0” | 服务强制 `residualTokenCount=0`；UI restored 事件也填 0；MD 处理器 residual_tokens/tokens_not_in_mapping 固定空数组 | M:23754、23776、14238；R:28784。没有逐次残留扫描证据 |
| 假名歧义检测和选择 | inspect 返回 ambiguities=[]；`Ad(mapping, restoreChoices)` 第二参数没有使用，选择规范原文后 unresolved=[] | M:18384–18390、14170–14197。不能称为用户选择歧义恢复 |
| 自学习、更新、回滚 | 6 个 learner 通道是常量成功/空统计/停用错误；只有 get-stats 调用 chunk 取统计 | M:18179–18186；L:20、57。存在 updateRules 方法不证明 IPC 会执行它 |
| 反馈自动生成记忆 | `addFeedback`、`addFeedbackBatch` 都没有调用 `updateMemoryFromFeedback` | M:13344–13377。本次不能闭合“反馈→自动学习→识别” |
| 旧审核导出返回 filePath | 3 个服务方法返回结果对象，IPC 又把该对象放进 filePath；服务内部失败也可能落到外层 success:true | M:18781–18859、18886–18906。应保留原形态，不能人工展开成理想字符串接口 |
| 规则 supports contains / materialTypes | Schema 存在这些枚举；当前 validateRuleSet 先强制 description 空、applicability 全局、matchMode exact | M:14264–14391。不能依据 Schema 宣称界面支持按材料路由/包含匹配 |
| Proof Lite 网络流量为 0 | network_out_bytes 字段为字面量 0 | M:18781–18859。不属于网络审计或完整离线证明 |
| FeedbackStore 默认 encrypt:true | 加密分支还要求 encryption_key；当前所见 `vu()` 默认构造未传 key | M:13342、13438–13483、18091。不能只依据默认布尔值宣称反馈加密 |

## 3. 脱敏方案与导出偏好

### 调用链

R:29192–29244 的 `profiles` store（refresh/select/create/duplicate/save/remove/setDefault/recordSuccessfulExport）→ P:108–117 → M:26883–26931 的处理器 → `OI`（M:25952–26077）→ `userData/profiles/items/{id}.json`、`index.json`、`preferences.json`。ProfileManager 使用该 store（R:29245 起）；AI 请求方案名称/ID匹配读取也使用同一桥（R:30845、34154）。

| IPC | 输入、成功返回 | 关键限制和副作用 |
|---|---|---|
| profile:list / get | 无参数 / `{id}`；`{success:true,data}`，list.data 为 items 摘要与 preferences；get.data 为完整方案 | 初始化会过滤坏用户条目；读取用户方案可能迁移并重写 |
| profile:create | `{name,description?,baseProfileId?,profile?}` → 新方案 | 名称 trim 后大小写不敏感去重；生成新 ID/时间/用户来源，规范化后写 item，再写 index |
| profile:update | `{profile}` → 更新方案 | 仅用户方案；保留 id/createdAt，更新 updatedAt；无 revision 并发比较 |
| profile:duplicate | `{id,name?}` → 新方案 | 副本名冲突时追加编号；经 create 持久化 |
| profile:delete | `{id}` → data:null | 系统方案只读；删除 item 后更新 index/default preference；多文件写不具备整体事务 |
| preference:set-default-profile | `{id}` → preferences | 确认存在再保存；删除当前默认用户方案时回到 system-default |
| preference:record-successful-export | `{kind,state}` → preferences | 仅明确检查 state.kind===kind，否则 PROFILE_EXPORT_KIND_MISMATCH；记录调用方提交的状态不证明真有导出文件 |

**字段约束**（M:18931–18973、25940–25951）：schemaVersion=1；id/name/description/createdAt/updatedAt 为字符串；source∈system/user、readonly 为布尔，system 必须 readonly。enabledEntityTypeIds 必须非空、无重复、属于既定实体类型；pseudonymTypeActions 的 action∈mask/pseudonym/partial_star/full_star。docx/pdf/image/batch 为对象，DOCX/MD 导出 mode 有五种，视觉模式不含 full_star；maskStyle∈black/white/purple/lightGray；commentHandlingMode∈remove/anonymize/keep；导出/移除选项要求布尔；batch 三个表名模板为非空字符串。实际迁移会补 markdown 和 cert_no 偏好、转换 default_pseudonym、移除 signature、将 party_slots 归一 standard，将 DOCX selective 归一 default_star。结构 Schema 与当前持久化结果须分开。

**错误和恢复**：`DI`（M:26078）包装 `{success:false,error:{code,message}}`，默认 PROFILE_OPERATION_FAILED。初始化读 index/preferences 出错回默认；用户坏文件被过滤，不表示物理删除。JSON 临时文件→rename，rename 失败会删除目标后重试，因此不能宣称无损原子替换；没有证据支持多文件事务回滚。当前这些处理器没有局部 assertActivated/main-frame 检查，但整个应用的启动、窗口和许可限制仍是未闭合前置，不应推导“未激活可用”。

## 4. 黑白名单规则集

R:28846–28907 的 rulesets store → P:95–105 → `SI`（M:25825–25927）→ `Bd`（M:14264–14447），初始化绑定 M:26879–26880。UI 导入只取预览，保存另外带 revision；current/saved 用深克隆分离，dirty 比较 JSON，成功后 accept 并 refresh。推广工作区修正调用 R:29105。

| IPC | 输入与成功 data | 约束、错误和副作用 |
|---|---|---|
| ruleset:list / get | 无 / `{id}` → items+activeRuleSetId / `{ruleSet,revision}` | id 受字符范围限制；get 校验文件和正整数 revision |
| ruleset:create | `{name,description,applicability}` → 新规则集+revision1 | 非空且归一名唯一；空 entries；先写文件再更新 index |
| ruleset:update | `{ruleSet,revision}` → 新 revision | 只读拒绝；revision 必须等于当前，否则 RULESET_REVISION_CONFLICT 并带 currentRevision；保持 id/source/createdAt |
| ruleset:delete | `{id}` → data:null | 只读拒绝；删除文件、清 index，若活动项被删则置空 |
| ruleset:set-active | `{id}`，id 可 null → activeRuleSetId | 必须存在；system_empty 不可激活；写 index |
| ruleset:import-excel | `{id}` → `{filePath,cleanEntries,conflicts,errors}` | 原生选 xlsx，取消 success:true/data:null；只读取首 sheet，返回预览，不落库；待 UI 另调 update |
| ruleset:export-excel / download-excel-template | `{id}` / 无 → 保存结果 | 原生保存；取消 success:true/data:null；实际文件写，模板含样例与验证列 |
| ruleset:preview-workspace-promotion | `{id,corrections}` → accepted/duplicates/conflicts | 只预览，不修改规则文件 |

**规则字段**：schemaVersion1，字符串 id/name/description/timestamps，source∈system/user/migrated，readonly 布尔。entry 的 id/pattern/normalizedPattern/entityType/timestamps 非空；kind∈forceDetect/forceSkip；enabled 布尔；source∈manual/reviewSuggestion/promotedFromWorkspace/excelImport/migration，originWorkspaceId 可选字符串。名和内容 trim、空白归一；相同 type+normalizedPattern+matchMode 的同 kind 为 RULESET_DUPLICATE_ENTRY、相反 kind 为 RULESET_ENTRY_CONFLICT。M:14268–14297、14364–14391。

**实际范围归一**：保存与旧数据清理都把规则降到 exact，全局 applicability，不保留 contains/materialTypes 的差异。Excel 旧列可识别 matchMode 列位，但当前导入仍写 exact。旧词典迁移的 whitelist→forceDetect、其他→forceSkip，冲突 forceSkip 优先；切勿按英文直觉把名单含义反转。迁移会创建备份、冲突记录、迁移规则集，并归档旧提示统计；不自动激活迁移集。M:14298–14363。

**失败**：`_I`（M:25818）返回 `{success:false,error:{code,message,details?}}`。JSON 文件临时写/rename；单文件版本控制不代表 index+item+migration 多文件原子事务。坏旧文件的归一异常可被逐文件忽略；恢复需同时核对 index、目标文件与 revision，不得用一次 list 成功代表持久一致性。

## 5. 旧词典、反馈和实体记忆

### 共享存储与 UI 证据范围

P:191–223、270–282 → M:18091–18186 / 18536–18664 / 18861–18922 → `Mu`（M:13332–13483）。`vu()` 返回单例；dictionary/review/feedback 都用此存储，非独立三套库。默认 `user_data/feedback/feedback_json.dat` 保存 feedbacks/memories/hints/审计日志（最后 1000 条）。写为同步直接文件写，load 解析/解密失败被 catch；没有 crash-safe 事务证据。

已定位当前 UI 仅 feedback.addBatch（R:8780–8788）、learner.getHighConfidenceMemoryCount（R:8770）、learner.getStats（R:10305）。R:10244–10246 的 cache-dictionary-draft 事件不能直接当 dictionary IPC 调用；旧 dictionary 和 review 方法目前只闭合 preload→handler→Mu/Dm，保留 UI 入口待核。

| IPC 组 | 字段与返回 | 语义 / 失败 |
|---|---|---|
| feedback:add / review:add-feedback | 前者记录透传；后者 camelCase→file_identifier/file_name/type/entity_type/entity_text/start_offset/end_offset/context/note/original_score；返回 id / recordId | Mu 强制生成 id/created_at/os_user；没有完整字段 Schema。审计并存盘，不调用 updateMemoryFromFeedback |
| feedback:add-batch | 数组；documentName/file_identifier/file_name、feedbackType、entityType/entityText、offsets、context、notes、confidence 支持别名；返回 count | feedbackType 仅 FP→false_positive，其余→false_negative；循环入内存→save→追加批次审计，最后那条审计未随这次 save 保存 |
| feedback:query / get-document-stats / get-global-stats | query 可 documentName/type；返回 records / stats | query 名称比较和 stats 文档比较的大小写规则不同；global FP/FN 通过 includes 分类；别把 UI 统计统一成同一个逻辑 |
| feedback:delete-by-document / delete-by-id / clear-all | 文档名 / ID / 无；deleted 或 removed/计数等以逐项 AST 原形态为准 | delete-by-document 逐条删除并逐条保存；clear 清反馈、记忆、提示，并保留审计历史+clear记录；影响不止反馈 |
| review:get-feedbacks / get-blacklist / get-whitelist / get-statistics / clear-all | 无；feedbacks / blacklist / whitelist / statistics / message | 名单过滤 confidence>=0.5；读记忆时删过期非手工项，仅内存；clear 与 feedback 共存储 |
| dictionary:get-entries / add-entry / remove-entry | 无 / `{pattern,entity_type,rule_type?}` / id；entries / id+rulesUpdated:false / removed | 默认 rule_type=whitelist；键 rule_type:type:pattern；仅 user_dictionary 可删除。新增 confidence1、超远到期；同键旧记忆可转手工源。未完整验证字符串/枚举 |
| dictionary:record-hint-action | `{action,entity_type,pattern}`；key/count/shouldPrompt/stat | action 非 delete 全归 add；类型小写、文本空白归一；同项达到 2 次且全局未提示时置提示。是提示统计，不是识别规则自动生效 |
| dictionary:import / export | entries 数组 / 无；added / data{_meta,entries} | 导入重复键跳过，保存新增；导出仅输出 pattern/type/rule_type，不自动写文件 |
| dictionary:select-import-file / select-excel-import-file | 无；filePath+entries(+errors) | 原生文件选择；取消 success:false/error“用户取消”；JSON 支持 entries 或根数组；Excel 首 sheet 的 A内容/B属性/C方式，逐行报错/去重/冲突；返回数据不自动导入 |
| dictionary:select-export-path / save-export-file | 无 / `{filePath,content}`；路径 / success | 选择与写分开；save 直接 UTF-8 写调用者路径，未见局部路径约束；这只是静态信任边界观察，不代表对外网络暴露 |
| dictionary:download-excel-template / export-excel | 无；filePath（导出另 count） | 原生保存后写 xlsx；无活动窗口/取消/文件写失败有错误。模板和旧词典路径与新 ruleset 导入不可混为一套 |

读取/写入各 handler 返回格式不统一，统一的大 Schema 不能从参数属性访问直接推出。一般失败 `{success:false,error}`，少数为 message；dictionary:get-entries catch 的字符串实际是 OCR 诊断错误文案，不能解释成 OCR 调用链。

### 审核导出和学习器

- **feedback:export-audit-report**：M:18156–18178 明确 assertActivatedOrThrow；失败 `{success:false,error:'软件未激活',requiresActivation:true}`。options.outputDir 或默认 Documents/Lawbot审核报告；mkdir 后秒级文件名写 Markdown；返回 `{success:true,outputPath,content}`。A:14–39 先按 created_at 与起止字符串过滤，再 slice(0,1000)，统计仅覆盖截取结果；byDocument 最多20，详细记录仅 1–50 条时显示，建议是 FP/FN 比例模板。时间范围无额外有效日期 Schema。相同秒路径用普通 write，可覆盖；不能称分页全历史报告。
- **review 三种导出**：P:197–199 → M:18886–18906 → `Dm`（18781–18859）。audit 支持 csv/jsonl/json；Proof Lite 含元数据/反馈/可选记忆；user-memories 为 JSON 数据。服务 catch 后返回 `{success:false,error}`，handler仍可能包装 success:true/filePath对象；这是一项需要兼容测试或独立修正的合同差异。默认 exports 目录构造时创建，覆盖 outputDir 不一定预先 mkdir。Proof Lite hash/网络字段不构成密码学或网络审计证明。
- **learner**：get-high-confidence-memory-count 返回三个 0；update-rules 返回 stats:null、rulesetHash:""；get-snapshots 返回 []；rollback-to-previous 的错误用 error，rollback/rollback-previous 用 message。rollback-previous 没有专用 preload 成员。get-stats 动态加载 L 并 getStats，实例构造会建立快照目录/读取 history；L 保留学习/回滚算法不意味着这六个停用 handler 会执行它们。未发现 addFeedback 自动更新记忆的调用闭环，保持未证明。

## 6. AI 连接器、入口和权限

R:28008/28023/28035/28060 → P 的 mcpConnectors → M:24389–24418 → `ax`（M:23828–23972）。get-status/choose-folder/copy-setup/retry 有明确 UI；open/update-automation 未在本次定位到 renderer 调用。

- sender 必须在绑定主窗口集合，且 senderFrame===sender.mainFrame（M:24381）；窗口 closed 删除绑定并清本窗口回填令牌（24450–24453）。这和“只看参数”不是同一个权限门。
- mcp-connectors:get-status 返回 snapshot，非法 sender 返回 null；retry 启动网关再返回 snapshot；choose-folder 仅 restored 选择还原目录，其余 sanitized；取消 `{success:false,canceled:true}`。
- update-automation 输入对象，两个目录须本机绝对路径、≤1024 字符；mkdir + W_OK 校验，shareRestorePassword:true 明确拒绝并始终保存 false。未知其他字段并未作为严格 Schema 整体拒绝，而是不使用。settingsQueue 串行读改写，临时 JSON→rename，读失败回默认设置。默认输出在 Documents/脱敏猫/{脱敏文件,还原文件}。M:23834–23895。
- copy-setup 校验连接器、访问许可、Node/适配器文件存在；写剪贴板后读回一致才 markSetupPrepared；prepared 表示配置已复制，不是连接成功。DSH 分支会复制模板/runtime/图标并写 cordis.patch.yml。open 仅 qwenwork/workbuddy/dsh，探测已安装本机客户端后 `/usr/bin/open -a`；未执行此分支。
- status 中 verifiedAt 是历史成功调用，不表示当前在线。M:23920–23922。
- 网关启动还检查打包平台 ARM64/macOS、manifest版本/组件哈希/Node代码哈希/签名/运行时版本，以及 activated&&license（M:24303–24332）。本次只读取检查逻辑，未执行命令。
- Unix socket 在随机 0700 临时目录；discovery JSON 用 0600（M:24334–24364）；jobs-v1.laj 使用注入的 protectedObjects（M:24337）。不在文档中记录实际 sessionSecret。

## 7. AI 任务：UI→IPC→服务→持久化

### 公共包装与入口事件

P:27–56 的 aiCollab methods → M:24419–24449 的 `d2` → `qw`（M:22930–23793）。d2先主窗口+主frame，再网关存在，再 `{success:true,job:serviceResult}`；异常 `{success:false,error,errorCode}`。**job 并不始终是任务对象**：prepare-export 为路径集、repair 为任务数组、diagnostic 可 undefined。list-pending 则直接数组，consume-open-job 直接对象/null。

服务创建/变更 → M:24381–24387 记最后 open-job 队列、恢复显示并聚焦主窗、loading 时等 did-finish-load 再发；P.onOpenJob订阅带 removeListener；R:32868–32874 消费队列并订阅。R:28410–28419 另刷新任务列表。该关系可从静态闭合到 UI handler，不代表实际跑过。

| 阶段与 IPC | UI 证据 | 服务与状态、副作用、失败恢复 |
|---|---|---|
| authorize / retry-authorization | R:30907；retry 无已定位入口 | M:23219–23245、23431；jobId+6必需boolean授权、2可选目录覆盖boolean，拒未知键/错误阶段；必须允许脱敏交付，按 workflow 检查路径权利。设置 authorizedOutputDirectories/authorizedAt。handler授权后 attach 失败会 rollback；并非撤销已导出文件 |
| attach-source / attach-sources | 专用 UI 调用未定位；authorize 间接调用 attach | M:23352–23377；sourcePath(s)普通支持文件、批次1–100、≤50MiB；可注入原件快照捕获；单件/子任务进入 waiting_for_human_review。批次逐件创建，不能声称全批事务 |
| open-task / restore-saved-task / restart-preparation | R:30784 | M:23300–23321；打开投影并通知UI；已保存恢复需最新有效轮次，可本地补 allowRestorePath；failed重启为新任务并保留 resumedJobId；原路径缺失 SOURCE_NOT_FOUND |
| cancel | R:30922 | M:23246–23258；completed/round_completed/cancelled/restoring 拒绝；批次子任务同步取消但保留正在恢复/已完成轮次；不是文件删除 |
| set-review-intent | 专用 UI 入口未定位 | M:23259–23274；waiting_for_task_selection+artifact；taskType、depth、outputModes枚举，focusAreas≤20、customInstruction≤2000；转 artifact_ready |
| report-statistics / diagnostic-event | R:30822、30831、37049 | M:23438–23450、22938–22944；统计数 clamp/floor，low≤total、unknown≤余量、docCount≥1，perDocument前100，humanReviewed须literal true；诊断服务外部依赖未逐项闭合。统计不是重新识别 |
| prepare-export | R:37050 | M:23451–23469；允许review/ready/analyzing/rejected；计算受控路径并mkdir，unlink待生成同名输出/MD/visual fallback（错误可忽略）；返回路径集。重试可能清理准备文件，不是纯读接口 |
| release-export | R:37125–37126 | M:23470–23559；比对prepared path、文件格式/大小/安全名、受保护lpm和token、注入export receipt；非DOCX另要求统计/所需文件与receipt；视觉fallback还验magic。合格后building→写exchange唯一artifact→清原始路径/实体字段→artifactVersion+1→ready或redact_only completed |
| finish-batch-export | R:36923、37128 | M:23378–23430；子任务须到ready/completed/failed；单独模式归纳父状态，合并模式需统一token表、MD/视觉fallback、总大小检查，写combined artifact。失败子件不等于全批完成 |
| fail | R:30799–30801、36920、37091 | 服务 failFromRenderer，记录失败码并投影；部分已产出文件仍可能存在，须结合文件/阶段核验 |
| list-pending / consume-open-job / open-job | R:28410、28419、32868–32874 | 列表过滤和任务投影 M:23291–23299；事件实现24436–24439/24381–24387；最后队列 consume 后清空，不是持久事件队列 |
| restore-completed / standalone-restore-completed / restore-failed | R:30936、30955 | M:23726–23776；已生成文件和完成记录分开；普通任务完成先写pending，生成后续假名交换件再清pending；其catch会转restore_failed并提示确认重试。standalone只见先pending再直接save，没有相同catch，失败回收不可套用普通任务；两者residual固定0 |
| retry-confirmation / retry-restore / resume-local-restore / change-restore-directory | R:28816、28819、28719；resume无专用入口已定位 | M:23322–23351、23734–23746；确认重试只补完成记录，不重做回填；pending时禁止重做；目录重选只失败/待批准且非pending；重启restoring→restore_failed |
| repair-task-storage | R:28047 | M:24429–24431先原生确认；cx隔离坏主索引+backup为preserved文件，再建空索引；已有输出保留，旧任务不会自动恢复到列表 |

### 服务字段、外部前置与网关区别

M:22870–22895 的 Cw 明确校验启动参数；M:23130–23196 追加语义约束。purpose∈contract_review/general_analysis；单路径与数组互斥；sourcePaths和fileSettings最多100；路径字符串非空≤1024；executionMode automatic/human_review；taskMode redact_only/ai_process/ai_process_restore；documentType枚举8种；ruleSet/profile名称或ID≤120；maskingMode四种；outputFormats 1–2项 original/md；unifiedPseudonyms布尔；batchResultMode individual/combined。advanced仅 profile/entityTypes/exportMode/maskStyle/removeImages/removeHeaderFooter/commentHandlingMode/pseudonymRules。实体枚举18种，**该处不含 profile 中的 cert_no**；pseudonymRules类型不可重复，prefix唯一且正则限定字母/下划线/短横线1–20字符，action pseudonym/mask。不可把两处枚举合并成理想 Schema。

combined 必须统一假名并补 MD；选择性遮罩不能承诺 ai_process_restore 完整可逆；自动模式不允许保留页眉页脚或原批注；非假名模式禁止需要还原任务。fileSettings 必须绑定实际源路径；统一模式前缀要一致。启动同参数并发锁去重，并复用5分钟内特定pending任务；这不是永续幂等键。

文件夹导入排除输出/交换/私有目录，禁止符号链接，深度≤32、扫描条目≤10000、最终文件≤100。readRegularFile/底层提取器、DOCX解析、OCR、Python/Office引擎是外部契约边界，本报告未宣称对所有文件格式完成递归分析。

### 14 个网关方法不是 14 个 MCP tools

M:24122–24168：请求 id/sessionSecret/caller(method,params在各分支使用)。caller.adapterId/displayName配对固定三客户端，sessionId32位hex。secret相等后逐次 assertAccess（许可+已配置connector，M:24371–24374）；所有失败映射 `{id,ok:false,error:{code,message}}`，未知异常隐藏为 INTERNAL_ERROR，任务索引损坏专门恢复错误。

14分支：gateway_ping；start_secure_review/start_local_restore；get_review_status/resume_secure_review/get_configuration_catalog；wait_review_delivery/get_sanitized_artifact/allocate_result_slot/submit_pseudonymized_result/request_local_restore/continue_review/get_completion_status/wait_restore_completion。既有 MCP schema JSON 和 gateway-service-contracts 负责12tools→14分支→13服务的详细映射；本次补的是服务语义，不增加分母。

- owned（M:22962–22971）每次比 sessionId+adapterId+displayName；跨会话接续先创建等待本地授权任务，授权后锁定原任务/子任务、验artifact/hash/映射索引后转移所属（22979–23012起），不是跨会话直接读取。
- get_configuration_catalog 仅每类前200项，id/name各截120字符且清名称控制字符，不交付名单内容/密码（23275–23277）；实际回调注入还需保持证据，不把空默认当真实配置目录。
- allocate_result_slot（23583–23610）绑定最新artifact、docx/md、reviewed_document/derived_report；视觉稿只能derived_report；已提交不能换槽；round/slot/path控制，20MiB上限。重复未提交调用返回同槽；replaceSlotId改变槽但保留轮次。
- submitResult（23631–23663）拒 restorePassword；要求最新轮次/槽/来源artifact，检查hash、文件、综合报告所有来源；同hash重复提交可返回已有状态，异hash拒绝；归档用wx，有同hash文件可复用。**token语义计数常量限制见第2节**。
- freezeRestoreInput（23668–23679）写private-restore-input固定hash文件，wx碰撞只接受同hash，不覆盖；恢复后续必须验证该输入。
- wait_review_delivery/wait_restore_completion（23279–23289）分别服务交付/本地完成，失败须停止轮询且给本机重试；completionPending只补确认，不重新生成。

### 持久化和失败恢复

`cx`（M:23979–24120）以队列串行更新jobs索引；上限64MiB，验证schema1/jobs数组/jobId/状态/调用者/updatedAt/ID唯一；当前注入protectedObjects，写前备份，读主损坏可恢复backup，二者坏则 AI_JOB_INDEX_RECOVERY_REQUIRED。isolateUnreadableIndex 保留坏数据快照；它让新任务可继续，不表示旧数据已修复。普通恢复确认服务先pending再清pending的设计能区分“输出已经生成”和“完成记录尚未保存”，验收必须覆盖这两段断电点。

## 8. 假名表保存与本地回填

调用链：R:28618 的 P2=window.anbao；R:28671–28824 的恢复向导 → P.pseudonym/auth → M:18342–18535 → Mm/mf/Ad/Td/Rp（保护存储和格式引擎边界）。批量导出保存项目假名表 R:37008→pseudonym:save-mapping。

**表保存**（M:16586–16628）：scope只把project识别为project，其余single；表名替换非法字符/压空白/截80；仅收集有pseudonym且非mask/partial_star/full_star的匹配。按页/位置排序，汇总mappings/details/entityMap/occurrences、forms和sourceFiles；合并token映射冲突或缺原文就停止导出。`th`另过滤废弃实体类型。mf 保存到 userData/pseudonym-mappings/{UUID}.lpm 与受保护index.lsi；先写表、再索引、再受保护读回；失败尽力回滚索引并删除新表（M:15190–15205），不是任意JSON映射导入。

**路径/大小**（M:15169–15234）：只允许该目录直接子级 .lpm、36字符UUID样式；索引16MiB、表64MiB；approvedTokens1–5000、每项≤256。列表只给记录/路径；锁定/未配置key保留具体错误，不可显示成“没有表”。UI对此有专门错误状态（R:28695–28708）。

**授权**：he/fe（M:32–45）一次性随机token绑定webContents、有效15分钟，验证尝试即删除；认证成功或已授权会话可重发（M:18672–18761）。inspect 和实际回填都消耗token；inspect成功返回新token。UI的 ee2 会刷新会话token并在失败重新打开认证。会话授权、key hierarchy、系统认证属于相邻安全链，未在本篇宣称完整实现/许可运行闭合。

**inspect**（M:18384起）：校验token，读取受保护表，返回ambiguities=[]和新token；Ad 依据候选原文确定canonical，restoreChoices未使用，输出策略token-canonical，不保证逐出现位置恢复原写法。

| 回填 IPC | 输入 / 结果 | 文件副作用和恢复 |
|---|---|---|
| select-input-files / docx / docx-batch / markdown / markdown-batch | 原生选择；success+filePath(s)，失败/取消 | 不执行恢复；只有通用select-input-files定位到当前UI，四个专用入口保留待核 |
| restore-docx | inputPath/mappingPath/authToken，outputPath?/preserveExistingOutput?/restoreChoices?；success/outputPath/stats或错误 | native save可取消；Python/python-docx依赖检查；DOC/WPS经兼容引擎转DOCX→恢复→转回且扩展名必须原格式；临时目录finally清理。部分异常可能直接IPC reject |
| restore-docx-batch | inputPaths/mappingPath/outputDir/authToken | 逐文件唯一命名、报告进度；失败删除该失败输出，保留成功项，返回partial+results/计数；重试应只选失败项 |
| restore-markdown | 与单DOCX相似 | Td读UTF-8；最长token优先且支持Markdown转义/HTML实体等价键；普通write可能覆盖，preserveExistingOutput走唯一命名；计数不含真实未知/残留扫描 |
| restore-markdown-batch | 同批量 | 唯一名通过wx并重试编号≤9999，写失败移除当前输出；成功保留、失败partial；目录创建失败结构化错误 |
| restore-progress | 事件 {percent,message,...} | 主进程sender推送，UI更新进度；卸载取消监听（R:28799–28803），不是最终成功证据 |
| open-output-folder | filePath → success | shell打开dirname；UI打开失败仍提示文件保留，实际目录打开/文件内容需运行验证 |

底层DOCX `restorePseudonym` 在 M:13199起，Rp为 M:16241–16267；本篇仅跟到Python/格式保持器调用边界，未审完整脚本及Office二进制行为。MD实现完整局部可见 M:14229–14262，但没有竞品运行记录。

**AI恢复的 UI 完成回报**：R:28784→restored事件→R:30936→restore-completed/standalone-restore-completed；错误→R:30955→restore-failed。确认保存失败后，R:28814–28817优先复用结果/调用retryConfirmation，提示“不会重新回填”；正常重做R:28819调用retryRestore。服务markRestoreCompleted生成的后续交换件来自冻结的**假名输入**，不是实名输出（M:23747–23766），不要误记为“实名稿交回AI”。

## 9. 后续验收门槛和台账建议

1. 当前局部链路定位可以更新 flow_mapping，仍不提升S3/R2；JSON列明每项 UI/preload/handler/service边和证据。没有 UI 证据的旧通道继续标记入口未确认。
2. 规则：并发revision冲突、Excel预览不落库、冲突优先级、迁移后active状态、index/item中断恢复、保存后重新载入值。方案：归一后的枚举与UI一致、重复名、默认项删除、导出偏好与真实文件分开。
3. 反馈/词典：跨API共享clear影响、批次审计持久化、过期项重启后行为、加密前置、导出内层失败不可误报成功、1000条截断明确展示；不复制已停用自学习的能力声明。
4. AI：许可/主frame/会话隔离分别验收；同参数并发去重、跨会话接续、100件及大小上限、部分失败、receipt和hash变化、旧artifact拒绝、slot替换/重复提交、输出目录不可写、索引主/备双损坏、恢复完成两阶段故障。
5. 恢复：假名歧义/别名/组合token的真实输出，未知及残留token扫描，DOC/DOCX/WPS/MD和转义样本、一次性token过期、取消后重发、混合批次、同名输出保护、完成确认失败重试不重复写文件。当前静态固定0不能作为通过证据。
6. 我方独立实现保留明确Schema、权限、版本和事务边界；竞品的嵌套返回/常量统计/旧功能占位是差异证据，不能直接转成能力承诺。

本篇的范围与逐项建议以 `manual-collaboration-contracts.json` 为准。本次没有改 ledger 或已固定的对抗审查报告。整合时由主负责人追加事件、证据hash并生成/check派生视图；若后续读取更多UI或外部实现，只追加实际已证明的边，不按命名批量升级。

### 补充：12 MCP 工具的逐项适配边

证据 T=`.data/research/lawbot-2026-10-13/extracted/lawbot-mcp/tools.js`；C=同目录 `gatewayClient.js`；S=同目录 `server.js`；B=同目录 `batchDelivery.js`。以下全部为手工核读局部关系，详见 JSON 的 `mcp_gateway_manual`（12工具、14网关方法、13服务方法、完整契约0）。

| MCP 工具 | 网关→服务 | 适配行为 / 证据 |
|---|---|---|
| resume_lawbot_task | resume_secure_review→requestSessionResume | 可选job_id转换；T:271–272 |
| list_lawbot_saved_settings | get_configuration_catalog→getConfigurationCatalog | 空参数；T:204–205 |
| start_lawbot_redaction | start_secure_review→startSecureReview | snake_case转换、固定automatic、默认purpose/task/output；T:219–238 |
| start_lawbot_redaction_for_user_manual_review | 同上 | 固定human_review，逐文件设置转换；T:219–238 |
| start_lawbot_restoration | start_local_restore→startLocalRestore | 可复用secure_review，额外taskReused/nextAction，不代表绕过本地权限；T:239–255 |
| check_document_delivery | wait_review_delivery→waitForReviewDelivery | 默认wait45秒；combined/individual批次提示和可领取子件不同；T:256–270 |
| receive_sanitized_document | get_review_status→getReviewStatus；get_sanitized_artifact→getArtifact；allocate_result_slot→allocateSlot | 先状态→resolveReceivableJob→artifact→slot，视觉强制derived_report默认docx；DSH返回时移除slotPath；T:273–297、B:1–26 |
| submit_reviewed_document | submit_pseudonymized_result→submitResult | normalize后提交；token_changes虽然Schema仍列出，已声明deprecated/ignored，服务不消费；T:156、183–198、298–304 |
| open_lawbot_restore | request_local_restore→requestRestore | 本机UI执行恢复；T:305–306 |
| continue_current_document_review | continue_review→continueReview | 下一轮服务状态门；T:307–308 |
| get_lawbot_capabilities | 无网关调用 | 本地常量能力说明，不能当实际支持测试；T:206–218 |
| check_restore_completion | wait_restore_completion→waitForRestoreCompletion | 等待最新轮次；T:309–310 |

额外两条网关关系：`gateway_ping` 由 C:224 内部发现握手调用，无对应独立工具；`get_completion_status` 在 M:24156→M:23788–23791 有分支，但本次 T 中未找到调用。不能强行给14分支各配一个tools/list入口。

S:55–61 的 tools/call 直接调用 callTool；本层没有 JSON Schema validator。成功包装 content文本+structuredContent/isError:false，异常包装文本/isError:true。**Schema完全展开不等于入参运行时全部校验**；主进程Cw和各方法参数/状态检查须分别记录。MCP说明明确外部AI自身的shell/文件系统权利不受此工具限制，OS隔离是另一层（T:212）。DSH提示中的 submit_workspace_result 属于另一个插件入口，当前12工具分母不能包含或隐含其完整审查。

### 本次范围检查结果

101 IPC 的稳定ID/名称与当前ledger逐项一致，56条有手工定位UI调用、45条当前UI入口未定位；12 MCP和14网关ID/名称逐项匹配现存台账。没有S3/R2/I状态升级建议。后续运行校验与存储/格式依赖递归补完仍是待办。
