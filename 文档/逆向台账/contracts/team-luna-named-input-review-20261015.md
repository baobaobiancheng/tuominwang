# 命名输入与规则接口只读对抗复核（2026-10-15）

## 结论与状态

- 按父级计划核对清单中的 **60 个 I4 候选和 6 个 I1 保留项**。竞品处理链仍为 **R0**；公开源码只证明静态契约。我方本轮仅做 API/schema/归一及独占测试的窄修复，没有改 ledger、部署或运行全量门禁。
- **当前 I4 建议暂停到 root 完成修后快照复核并确认输入合同。** 除 RuleSet/entry extensions 外，本轮确认并修复了 RuleSet applicability 整对象替换，以及 profile 根/已知 JSON节点 extra 保留与 kI/PI 归一差异；对应复现和4项隔离验证通过。最终 I4 采纳仍须 root 新快照全门禁。
- 6 个原生/会话差异继续 I1：`dictionary:select-import-file`、`dictionary:select-export-path`、`dictionary:select-excel-import-file`、`workspace:list-recovery-prompts`、`workspace:open-dialog`、`workspace:select-review-profile`。

## 发现 F-01：ruleset:update 扩展字段不兼容（已修复）

**稳定 ID：** `IPC-9a6a89a8fb10`（写入），`IPC-8bfb6ec9fcd8`、`IPC-c04013aa6e1b`（读回/列表闭环）。

**源证据（逐行 UTF-8，闭区间，整文件 SHA256 `40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba`）：**

| 源路径/范围 | 可证事实 | 切片 SHA256 |
|---|---|---|
| `.data/research/lawbot-2026-10-13/readable/main.js:14268-14304` | `Rd`/`Cd`逐一验证已知字段但没有枚举键集或删除扩展属性；`Cd`检查 source enum 和 originWorkspaceId 类型。 | `b7a7db54f3c081bb6a9c250de6ab530e504a20bae5125133fe5d6c44c62bba24` |
| 同文件 `:14364-14377` | `validateRuleSet`仅将说明、ruleset applicability、matchMode、pattern/normalizedPattern归一化，再调用上述验证；不会投影 entry。 | `20ce3c0aaa0a566e979e3f6d9c1fb3125d118b5384a9752131533bb229ca20f9` |
| 同文件 `:14396-14425` | `Bd.update`完整 `structuredClone(e5.ruleSet)`，执行归一化后将整个 `ruleSet` 写入 JSON；`readStored`直接 parse 后验证并返回完整对象。`getActive`消费完整已读 ruleset。 | `8e5620b3a6c197c812a16a7ec673922e5a8fd4bc7b8f8433732b4a85f75ee788` |
| 同文件 `:25832-25849` | `ruleset:get` 返回 `n2.get(t2.id)`完整结果；`ruleset:update`将完整参数传入 `n2.update(t2)`。 | `2c56bfa3c705c573a9c96f7cd2998afddc8fc20ec2e83107a402e6624fbffb83` |

**我方证据：**

- `apps/api/presets.ts` SHA256 `fe149ce5e3f7a2b2026a1f7d7fab666deaf35127d4311b34e406c298d60151fc`：`:78-90` PUT 输入通过 `z.preprocess(normalizeReferenceRuleSetInput, rulesetSchema)`；`:27-34` GET/读取以 `checkedRuleset`解析已有 payload；PUT envelope 仍以 `.strict()` 校验。
- `packages/contracts/presets.ts` 修复前 SHA256 `fd4ae1ec3f3042a60ddb089e82cb15b95db3fba166c980b9136a6096bad535e0`，修复后 `011ec75cbe203130d6b063ac1193dca4848b52535341554981eb2a48e29da612`：`:30-37` entry 和 `:39-43` RuleSet 本体使用 `.passthrough()`；仅对这两个业务对象保留扩展字段。POST/PUT wrapper schema 仍 strict。
- `packages/core/presets.ts` SHA256 `c87db95743368144c312178760929720ad5d443f202b0b89af59af8548ab1668`：`:27-35` 的 retired-field preprocess保留输入键，之后交 strict schema；故不会弥补此差异。
- `tests/ruleset-normalization.integration.ts` 修复前 SHA256 `9371599d96c2d41958fa2c0c318006c7bafa0d6754847af690d56d197e73ee21`，修复后 `3e7bdd1e51a88a6a7647ddfb0eae76ebbecf6296fe2fe5720abb8e5a2f0bd55f`：旧的未知 RuleSet body 拒绝断言改为精确覆盖未知 wrapper 字段仍返回 400。`tests/ruleset-normalization.test.ts` 更新为断言 RuleSet/entry扩展字段被保留。

**最小反例和结果：**

以现有有效 ruleset 的完整 `PUT /api/presets/rulesets/:id` body 为底稿，`revision`用当前值，`settings` 和 `settings.entries[0]`分别增加 `futureRuleSetField` / `futureEntryField`，其它必需字段保持合法；PUT 外层同时另测未知 `futureWrapperField`。

- 源预期：HTTP 成功；update不投影规则本体或entry，存盘后 `ruleset:get`能回读这两层的附加值。源 Excel 导出会按既有表格列投影，不包含这个未来字段，但不会改写/清除已存对象。
- 修复前我方：依 `.strict()` 返回 400；已有扩展 payload 会让 `getPreset`/list 的 `checkedRuleset` 解析失败。
- 修复后我方：隔离 API 成功写入并经 GET、duplicate、project preset snapshot完整读回；worker 对规则末项产生 pending mark 和 `ruleset-force-detect:<id>` trace。未知 wrapper 字段仍400。未知字段不出现在 worker trace，对 `approved/role/sourceIdentity`哨兵值没有审批、权限或身份效力。native portable codec往返保留 RuleSet/entry扩展字段；Excel导出按已声明列投影，不带扩展字段。

**修复范围与合同：** `ruleEntrySchema` 与 `rulesetSchema` 对业务本体 `.passthrough()`，使 unknown properties在 API保存、duplicate、项目快照、worker输入和 native portable JSON 中往返；消费函数继续只投影已知字段。API PUT 外层 wrapper 仍 `.strict()`，POST create 输入也仍 `.strict()`，因此未知 wrapper 参数和创建参数继续拒绝。源 create重建RuleSet，不消费/保留额外 create参数；源 update把 `ruleSet`本体完整clone写回。源 Excel导出表格仅有已知列，不含新增键。

## 已检查项与证据分组

除 F-01 定向隔离测试外，本次没有重跑下列由父级冻结证据覆盖的域。按类别列出静态路径、旧的真实验收证据与具体已核分支；这些我方云端证据不代表竞品动态运行。

|分组 / ID范围|已查入口→归一/helper→存储→消费|具体检查点与基线证据|
|---|---|---|
|个人 profile 与 preference：`IPC-0b6b223f384f`、`IPC-92e8c95a136b`、`IPC-ddc5ff507c75`、`IPC-59456f319530`、`IPC-271b4728636e`、`IPC-3d307eb4bc00`、`IPC-7b3025225249`、`IPC-7e8602707608`|`apps/api/presets.ts:53-129` → `packages/contracts/presets.ts:1-28,45-47` → encrypted `redaction_presets/redaction_preferences` → project snapshot/export receipt|已有 `personal-settings-interface-closure-20261015.json` 明列 caller method/route、49项响应与测试hash；summary/final receipt 记载个人设置 API 4项、真实写回与登录用户隔离。检查 name trim/case-insensitive uniqueness、duplicate suffix、readonly/revision 与 nullable preference。源执行仍 R0。|
|ruleset CRUD/import/export/activation/promotion：`IPC-18da1e923824`、`IPC-c04013aa6e1b`、`IPC-8bfb6ec9fcd8`、`IPC-9a6a89a8fb10`、`IPC-7754362b9148`、`IPC-337d01816990`、`IPC-c17682083b52`、`IPC-2187e949f831`、`IPC-2bdb599038fb`、`IPC-620a9576690e`|源 `main.js:14268-14456`（Rd/Cd/Bd validation、CRUD、dedup/conflict、active-route）；我方 `apps/api/presets.ts:53-110,131+`、`packages/core/presets.ts:23-44`、`packages/core/user-memory-rules.ts:26` → project preset CAS snapshot → worker trace|POST/PUT 归一覆盖空说明、null applicability、materialTypes legacy routes、contains→exact、stale normalizedPattern、entry route extension保留；F-01已由本轮针对性测试关闭，未知 envelope仍拒绝。父级证据 `tests/ruleset-normalization.integration.ts` 及 `.data/research/lawbot-2026-10-15/iteration036/*ruleset-normalization*`：合法更新真实消费尾项并trace，32769条最后一项在 `tests/ruleset-capacity.integration.ts` 通过真实 worker命中；独立容量复核 JSON记账32769/10,070,956字节。源/我方当前均逐项去重并拒绝同键冲突；readonly/revision由各自路径执行。|
|反馈与复核、统计、导出和删除：`IPC-d874c25112ba`、`IPC-a05e3b6af8e1`、`IPC-6ff537a49940`、`IPC-feab6613b5ed`、`IPC-72093dfff7bf`、`IPC-14a3820628e8`、`IPC-9bb6c463b31f`、`IPC-b199b300f630`、`IPC-9dbd84b9715b`、`IPC-9a7ac510f8c7`、`IPC-e024a8242875`、`IPC-bb6001e11068`、`IPC-d3e5e1de12d2`、`IPC-196efa6b695b`、`IPC-b2c075e4afde`、`IPC-efc77b9d6c1d`、`IPC-b828b79da058`、`IPC-7d7beed074d0`、`IPC-5457cc5660c4`|源 `main.js:12800+` feedback store/methods、`:18817-18821` audit report exact enum counters；我方 `apps/api/feedback.ts:1-` → `packages/core/feedback.ts:1-` → encrypted feedback/memory rows → audit/proof export|父级 raw-type vector 有 arbitrary well-formed raw string（含大小写与`__proto__`），持久回读/重启/导出保原始 type；单条 add允许合法未知type；batch仍保持 FP-only映射；query为lowercase后精确匹配；IPC/general统计 lower+includes，review/audit/proof统计 exact；`review:get-statistics`映射显式 `/api/feedback/review-statistics`，不混用global confirmed。已有 `tests/feedback-raw-type.integration.ts` 与 A独立日志显示 targeted PASS，但本子任务未执行。learner仅历史/停用统计，不代表自动训练。|
|个人词库与文件输入导出：`IPC-25271d44841c`、`IPC-acbca2a96370`、`IPC-50d02c91469e`、`IPC-0f2d4d6b6262`、`IPC-9b9d5a0f489e`、`IPC-3f0d71fadee4`、`IPC-22c459a29cd7`、`IPC-c19a241811ac`、`IPC-80e954e3a669`|源 `main.js` dictionary handlers/feedback store；我方 `apps/api/recognition.ts`、`apps/api/feedback.ts`、`packages/core/dictionary-workbook.ts` → project dictionary/preset snapshot → recognition and workbook|已有49个人设置API closure与 XLSX round-trip/原始控制字符证据；词条raw type/pattern限制已移除。确认已声明范围是本人云端词库与JSON/Excel下载；`dictionary:save-export-file` 源调用者文件路径/内容写入不等价任意OS路径写入，因此只保留业务下载适配。三个select-file/path方法维持I1。|
|工程、传输、恢复与审阅profile：`IPC-e6a8f1b41825`、`IPC-f53f8972c1a5`、`IPC-3c8789ad9a8f`、`IPC-7e55b9d273b1`、`IPC-be30d4526c26`、`IPC-a80eb991f683`、`IPC-f417c3628886`、`IPC-feb24aa50a4f`、`IPC-86a65aa5ca0e`、`IPC-8ed0acbb4144`、`IPC-1d575f4ee880`、`IPC-70e09702200d`、`IPC-c356082df625`、`IPC-ff1d1193dc22`、`IPC-9be2a0784913`、`IPC-1ad8e879614a`、`IPC-98cb505df8ea`|源 `main.js` workspace/transfer callers与 `renderer.js` recovery/apply callers；我方 `apps/api/workspace*.ts`、`packages/core/workspace*.ts` → owner/revision/hash bounded object-store、transfer/archive、export/download result|既有 `current-interface-handoff-C-20261015.json` 17项和 workspace callgraph/compat/recovery tests cover ownership/CAS/bytes/hash/reopen；记录 source prompt条件与dirty cloud draft差别；无原生文件窗口/OS keychain声称。Transfer使用调用者密码/云端不可变对象适配，不伪称源随机密码/keychain协议；版本迁移、transfer、另存下载不写caller绝对路径。其余16?业务方法仅按各自声明云端合同判断。|

### 规则源头/路线、容量、type-hide 静态与验收交叉核对

- 规则 entry source enum 的源检查是 `main.js:14282-14290`；源允许五种 source 并对可选 `originWorkspaceId`只作 string检查。业务 route 原始规范在 `:14268-14281`；源先要求已知 route keys，随后 current-product `validateRuleSet`又强制 `applicability={mode:'all',materialRouteKeys:[]}`。我方把 legacy route搬到 entry `materialRouteKeys` 的转换见 `packages/core/workspace-compat.ts:76-78`，读取消费过滤见 `packages/core/user-memory-rules.ts:26`。`ruleset-normalization.integration.ts` 对 own entry route保存做 readback；父级日志另有尾项真正worker消费。因 source current runtime一般走ruleset applicability，而 own迁移路径额外有 entry route extension，不能仅凭API保存就声称每条route已与竞品运行等价；R0保留。
- 32769容量：父级的 `review-ruleset-capacity-by-C-20261015.json` 是针对当前树的独立API+worker证据，末项带 `ruleset-force-detect:<uuid>` trace且 pending。它证明我方不截断消费，不能证明许可竞品处理链；源校验/迭代 `main.js:14268-14456`无32768 count cap。当前容量切片、测试hash和冻结proof见该JSON，未本地重跑。
- raw反馈统计与类型隐藏：详细接口/证据见上述分组及 `review-per-id-status-proposal-by-rules-20261015.json` 的 `newFindingsClosed` / `sourceUiTypeHideFinding`。源type-hide证据按该JSON记录在 renderer `4270-4288,9645-9690,30484-30489`：隐藏字段包含deleted/hiddenByType/出生状态、发dirty变化并跨保存/恢复；我方 targeted test `tests/review-type-hide.integration.ts` 保存、导出、恢复、actor历史与无FP。当前证明属我方 API/codec targeted测试记录，最终Edge流程和竞品runtime均不由此报告宣告通过。

## 66项逐ID清单

本表复核精确绑定 proposal 中的 stable ID，不扩展旧 I1。`I1` 仅指保持现状态；`I4` 仍是有条件建议。F-01定向修复已通过测试，最终 I4 采纳仍由root新快照全门禁决定。

|稳定 ID|接口|本次建议|
|---|---|---|
| `IPC-0b6b223f384f` | `profile:create` | 建议 I4，仍待最终父门禁 |
| `IPC-92e8c95a136b` | `profile:list` | 建议 I4，仍待最终父门禁 |
| `IPC-ddc5ff507c75` | `profile:get` | 建议 I4，仍待最终父门禁 |
| `IPC-59456f319530` | `profile:update` | 建议 I4，仍待最终父门禁 |
| `IPC-271b4728636e` | `profile:duplicate` | 建议 I4，仍待最终父门禁 |
| `IPC-18da1e923824` | `ruleset:create` | 建议 I4，仍待最终父门禁 |
| `IPC-c04013aa6e1b` | `ruleset:list` | 建议 I4，F-01修复后仍待最终父门禁 |
| `IPC-8bfb6ec9fcd8` | `ruleset:get` | 建议 I4，F-01修复后仍待最终父门禁 |
| `IPC-9a6a89a8fb10` | `ruleset:update` | 建议 I4，F-01修复后仍待最终父门禁 |
| `IPC-7754362b9148` | `ruleset:download-excel-template` | 建议 I4，仍待最终父门禁 |
| `IPC-337d01816990` | `ruleset:export-excel` | 建议 I4，仍待最终父门禁 |
| `IPC-c17682083b52` | `ruleset:import-excel` | 建议 I4，仍待最终父门禁 |
| `IPC-3d307eb4bc00` | `preference:set-default-profile` | 建议 I4，仍待最终父门禁 |
| `IPC-2187e949f831` | `ruleset:set-active` | 建议 I4，仍待最终父门禁 |
| `IPC-7b3025225249` | `preference:record-successful-export` | 建议 I4，仍待最终父门禁 |
| `IPC-2bdb599038fb` | `ruleset:preview-workspace-promotion` | 建议 I4，仍待最终父门禁 |
| `IPC-7e8602707608` | `profile:delete` | 建议 I4，仍待最终父门禁 |
| `IPC-620a9576690e` | `ruleset:delete` | 建议 I4，仍待最终父门禁 |
| `IPC-d874c25112ba` | `feedback:add` | 建议 I4，仍待最终父门禁 |
| `IPC-a05e3b6af8e1` | `review:add-feedback` | 建议 I4，仍待最终父门禁 |
| `IPC-6ff537a49940` | `feedback:add-batch` | 建议 I4，仍待最终父门禁 |
| `IPC-feab6613b5ed` | `feedback:query` | 建议 I4，仍待最终父门禁 |
| `IPC-72093dfff7bf` | `review:get-feedbacks` | 建议 I4，仍待最终父门禁 |
| `IPC-14a3820628e8` | `feedback:get-document-stats` | 建议 I4，仍待最终父门禁 |
| `IPC-9bb6c463b31f` | `feedback:get-global-stats` | 建议 I4，仍待最终父门禁 |
| `IPC-b199b300f630` | `review:get-statistics` | 建议 I4，仍待最终父门禁 |
| `IPC-9dbd84b9715b` | `review:get-blacklist` | 建议 I4，仍待最终父门禁 |
| `IPC-9a7ac510f8c7` | `review:get-whitelist` | 建议 I4，仍待最终父门禁 |
| `IPC-5457cc5660c4` | `learner:get-stats` | 建议 I4，仍待最终父门禁 |
| `IPC-e024a8242875` | `review:export-audit-log` | 建议 I4，仍待最终父门禁 |
| `IPC-bb6001e11068` | `review:export-proof-lite` | 建议 I4，仍待最终父门禁 |
| `IPC-d3e5e1de12d2` | `review:export-user-memories` | 建议 I4，仍待最终父门禁 |
| `IPC-196efa6b695b` | `feedback:export-audit-report` | 建议 I4，仍待最终父门禁 |
| `IPC-b2c075e4afde` | `feedback:delete-by-document` | 建议 I4，仍待最终父门禁 |
| `IPC-efc77b9d6c1d` | `feedback:delete-by-id` | 建议 I4，仍待最终父门禁 |
| `IPC-b828b79da058` | `feedback:clear-all` | 建议 I4，仍待最终父门禁 |
| `IPC-7d7beed074d0` | `review:clear-all` | 建议 I4，仍待最终父门禁 |
| `IPC-25271d44841c` | `dictionary:add-entry` | 建议 I4，仍待最终父门禁 |
| `IPC-acbca2a96370` | `dictionary:get-entries` | 建议 I4，仍待最终父门禁 |
| `IPC-d0b393b9e93d` | `dictionary:select-import-file` | 保留 I1（原生边界） |
| `IPC-50d02c91469e` | `dictionary:import` | 建议 I4，仍待最终父门禁 |
| `IPC-0f2d4d6b6262` | `dictionary:export` | 建议 I4，仍待最终父门禁 |
| `IPC-8a12674fee54` | `dictionary:select-export-path` | 保留 I1（原生边界） |
| `IPC-9b9d5a0f489e` | `dictionary:save-export-file` | 建议 I4，仍待最终父门禁 |
| `IPC-3f0d71fadee4` | `dictionary:download-excel-template` | 建议 I4，仍待最终父门禁 |
| `IPC-22c459a29cd7` | `dictionary:export-excel` | 建议 I4，仍待最终父门禁 |
| `IPC-7de3f60b8ed5` | `dictionary:select-excel-import-file` | 保留 I1（原生边界） |
| `IPC-c19a241811ac` | `dictionary:record-hint-action` | 建议 I4，仍待最终父门禁 |
| `IPC-80e954e3a669` | `dictionary:remove-entry` | 建议 I4，仍待最终父门禁 |
| `IPC-e6a8f1b41825` | `workspace:create-transfer` | 建议 I4，仍待最终父门禁 |
| `IPC-f53f8972c1a5` | `workspace:discard-recovery` | 建议 I4，仍待最终父门禁 |
| `IPC-3c8789ad9a8f` | `workspace:forget-recent` | 建议 I4，仍待最终父门禁 |
| `IPC-7e55b9d273b1` | `workspace:list-recent` | 建议 I4，仍待最终父门禁 |
| `IPC-be30d4526c26` | `workspace:list-recoveries` | 建议 I4，仍待最终父门禁 |
| `IPC-a80eb991f683` | `workspace:list-recovery-prompts` | 保留 I1（原生边界） |
| `IPC-f417c3628886` | `workspace:migrate-v1-to-v2` | 建议 I4，仍待最终父门禁 |
| `IPC-feb24aa50a4f` | `workspace:open` | 建议 I4，仍待最终父门禁 |
| `IPC-86a65aa5ca0e` | `workspace:open-dialog` | 保留 I1（原生边界） |
| `IPC-8ed0acbb4144` | `workspace:open-recovery` | 建议 I4，仍待最终父门禁 |
| `IPC-1d575f4ee880` | `workspace:read-review-profile` | 建议 I4，仍待最终父门禁 |
| `IPC-70e09702200d` | `workspace:receive-transfer` | 建议 I4，仍待最终父门禁 |
| `IPC-c356082df625` | `workspace:save` | 建议 I4，仍待最终父门禁 |
| `IPC-ff1d1193dc22` | `workspace:save-as` | 建议 I4，仍待最终父门禁 |
| `IPC-9be2a0784913` | `workspace:save-recovery` | 建议 I4，仍待最终父门禁 |
| `IPC-1ad8e879614a` | `workspace:save-result` | 建议 I4，仍待最终父门禁 |
| `IPC-98cb505df8ea` | `workspace:select-review-profile` | 保留 I1（原生边界） |

## 定向验证和限制

- 使用 Node v24.19.0 和 `pnpm exec tsx tests/run-isolated.ts integration tests/ruleset-entry-extension.integration.ts`。隔离库独占；结果 2 passed、0 failed、0 skipped，总计约 5.3 秒。包含源 `Bd.validateRuleSet`真实VM校验和 API→GET→duplicate→project snapshot→worker末项→native codec完整流程；Excel表格回读确认无扩展键。未运行全量门禁。
- 源 workspace codec静态证据：`main.js:19386` 对整个 `rulesetSnapshot` JSON.stringify进档案，切片 SHA256 `6bc60a2dad766d9186d95808d6b43f4c683af7439b931f3e53523d92a41311b9`；`:22497` 从规则 JSON entry还原整个对象，hash `2b0c756dcedcc5e834cff15696918cbebb1f51f75b74d0505265206237ed113e`。renderer :32444 通过 JSON stringify/parse clone snapshot，hash `381f4b0aaa27a346b945a7758e798564815ba3f8622a62dbfed29be550f90b81`。这支持源 workspace codec保留嵌套extra；source workspace-compat映射导入会构造新entry，不能把它混同完整原样codec。
- 产品改动文件当前 SHA256：`packages/contracts/presets.ts` `011ec75cbe203130d6b063ac1193dca4848b52535341554981eb2a48e29da612`；`tests/ruleset-entry-extension.integration.ts` `90f1567e049dcc3269901e2a211b6de0364b947323d9fee7823a5b8d02e4dcc1`；`tests/ruleset-normalization.integration.ts` `3e7bdd1e51a88a6a7647ddfb0eae76ebbecf6296fe2fe5720abb8e5a2f0bd55f`；`tests/ruleset-normalization.test.ts` `3bf41d8e83d1acaf307eab5c8d9dbbf5750abe06a68a499df86ce7c52c87f566`。报告 hash须在root最终提交前按共同树复核。
- 所有竞品运行继续 R0；`ruleset-capacity`的32769独立API/worker证据、raw feedback/type-hide父级证据未在本子任务重复执行。Edge和最终新快照全量门禁仍由root负责。本文件未修改ledger状态。

## 2026-10-15 root 授权的最终 profile / applicability 对齐

本节是继前述 RuleSet extra 修复后的窄扩展。修前冻结值：`packages/contracts/presets.ts` SHA256 `011ec75cbe203130d6b063ac1193dca4848b52535341554981eb2a48e29da612`；`packages/core/presets.ts` `c87db95743368144c312178760929720ad5d443f202b0b89af59af8548ab1668`；独占集成 `90f1567e049dcc3269901e2a211b6de0364b947323d9fee7823a5b8d02e4dcc1`。源包 `main.js` SHA256 `40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba`。

### 输入矩阵结论

| 对象/字段 | 最小输入变化 | 源 OI create/update 的源预期 | 修后 API 实际 | 边界 |
|---|---|---|---|---|
| RuleSet `applicability` | 合法 settings 内 `{mode:'materialTypes',materialRouteKeys:['contract'],futureApplicabilityField:'x'}` | `Bd.validateRuleSet` 把整个对象换成 `{mode:'all',materialRouteKeys:[]}`，unknown 子键随对象丢弃 | PUT 200；GET 与源相同且不含 extra | 顶层 PUT wrapper仍 strict；每条 entry 自有 material route保持 |
| Profile 根和标准 pseudonymTemplate | 各注入 JSON-safe `future...` | `OI.create/update` 经 `vI` clone、`kI/PI/TI/Um` 后完整 JSON 写入；`Um`仅校验已知字段 | POST/PUT/GET、duplicate、project snapshot、native portable 回读均保留 | unknown extra仅存储，worker路径只读取已知键；wrapper strict |
| `docx/markdown/pdf/image/batch` | 各自对象注入 extra | 源只验证已知属性，整对象JSON保存 | API round-trip保留 | 合法额外对象键不参与能力选择 |
| `batch.exportMarkdownByKind`、`batch.pseudonymTableNameTemplates` | 两个子对象各注入 extra | 源只验证必需已知键，源JSON保存 | API round-trip保留 | 子对象通过 known-field读取 |
| `pseudonymTypeActions` | 删除该属性 / 注入不支持的 key | 缺失由 `kI` 补 `{}`；不支持 key由 `Um` 抛 unsupported rule | 缺失由 normalizer补齐；未知 key HTTP 400 | 不对 actions map passthrough |
| `markdown` | 删除节点；batch markdown mode设 `default_pseudonym` | `kI` 从 batch补 markdown，随后把 default_pseudonym改成 custom_pseudonym | 合成 markdown，并归一为 custom_pseudonym | profile schema仍要求最终 normalized markdown |
| `pseudonymTemplate` | 删除节点 | `Um`允许其 optional，`PI`不强制创建 | schema允许 optional | 不假定默认标准模板 |
| default mode | 各格式及 batch值 `default_pseudonym` | `kI`改为 `custom_pseudonym` | normalizer相同归一 | 不影响附加 JSON 键 |
| cert number兼容分支 | `certNoPreferenceRecorded`缺失/false且类型含`case_number`不含`cert_no` | `kI`插入`cert_no`并置标记；OI写入前会强制标记true | source VM与归一 helper单测分别验证；API写入按 OI顺序先强制标记，避免额外插入 | 保持写入顺序和迁移分支差异 |
| batch markdown默认 | `batch.markdownDefaultMode`缺失/空 | `kI`补 `default_star` | normalizer补同值 | 缺节点由 schema校验拒绝 |
| signature | enabled types含`signature`，或只有signature | 源 0.5.9 `TI`删除signature；若数组变空，替换源默认类型 | 默认 sourceCompat 模式同样执行TI；仅云端 profile create/update显式传内部 `preserveNativeSignature:true` 保留它和其他六个native类型 | 这是我方原生扩展，不声称与源 profile create/update 等价；无外层布尔输入，不扩权 |
| legacy `party_slots` | template/slot附加键，docx及batch docx为selective | `PI`整体替换 template为 `{kind:'standard'}`，并把 selective改 default_star | PUT 200且结果相同，template/slot extra一并清掉 | 不给slot对象开放 passthrough |
| `pseudonymTypeActions.future_type` | 设置为合法动作值 `mask` | `Um`明确拒绝 unsupported rule | HTTP 400 | 保持原生拒绝语义 |

源依据为 `main.js:18931-18964`（`Um`），`:25938-25950`（`kI/PI/TI`），`:25929-25934`（`vI`），`:26038-26050`（`OI.create/update`）。VM矩阵从真实源抽取 `$m/Lm/Fm/Bm/jm,Vm,Um,kI,PI,TI,vI` 执行。源 create/update 对对象采取 JSON clone与全对象写盘，没有未知键投影；API现有 profile create/update wrapper顶层仍用 `.strict()`。

### 修复和验证

- `profileSchema`只对源 JSON原样保存的 profile节点启用 passthrough：profile根、docx、markdown、pdf、image、batch、batch两个对象和标准 pseudonymTemplate。`pseudonymTypeActions`仍是有限键 partial record。`pseudonymTemplate`允许缺省。未知 profile wrapper保持 strict。
- 新增 `normalizeReferenceProfileInput`：对齐源 `kI/PI` 缺省与 legacy归一；规则集 normalizer丢弃整个旧 applicability对象，重建源默认对象。API create profile内部 profile参数作为嵌套源 profile输入后仍经标准 schema校验；API update settings和外层 wrapper继续 strict。为兼容我方已公开的native signature能力，云端 create/update 显式开启内部 `preserveNativeSignature`，而默认 sourceCompat调用仍运行TI。这项保存行为标记为我方native扩展，不作为0.5.9源等价。
- `tests/ruleset-entry-extension.integration.ts`扩为独占覆盖：来源 VM矩阵、RuleSet applicability PUT/GET丢弃、profile节点 extra POST/PUT/GET/duplicate/project snapshot/native回读、unknown action/wrapper 400、party_slots归一和旧的末条worker/Excel投影链。
- Node v24.19.0 命令：`PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:/usr/bin:/bin" pnpm exec tsx tests/run-isolated.ts integration tests/ruleset-entry-extension.integration.ts`；结果 4 passed / 0 failed / 0 skipped，约 5.2 秒。未运行全量门禁。

修后 SHA256（含最后 source-normalization扩展）：`packages/contracts/presets.ts` `b96205488e580d937bd151f6f876963a161655068a5f87cdcb024bf88411f917`；`packages/core/presets.ts` `ea28f23c0745e1cd58bcc6ea0c5a864272b82fc612016a882e3426f5c9095757`；`apps/api/presets.ts` `3820fe5c6fa2ea215a33867a6310d3a00611da9a54bdca4d5c580a4cc83e7bae`；`tests/ruleset-entry-extension.integration.ts` `f977cfcc64f47946665d504e1c8474a43f3ce7fa25831ec502b2a5100a30ee7b`。报告自身 SHA256以 root 最终快照复核。云端signature回归另经合成PNG项目真实上传与 `tick()`；worker写入的 `documents.recognition.visual.pages[].detectors`包含 `signature`，同时 create/update/get/duplicate/project snapshot/native portable都保留enabled type。
