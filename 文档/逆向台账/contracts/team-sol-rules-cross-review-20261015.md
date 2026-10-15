# RuleSet entry passthrough 交叉审查（2026-10-15）

## 结论

交叉审查确认本次改动正确恢复 RuleSet 本体及 entry 的未知字段透传；PUT envelope 仍 strict，duplicate、项目 preset snapshot、worker消费、native portable codec 与 Excel 已声明列投影都有真实 integration 测试覆盖。源与我方校验均不把未知属性作为身份、权限或审批输入；测试中用 `approved/role/sourceIdentity` 哨兵字段检查它们不进入 worker trace。

**发现一处尚未闭合的源兼容差异：PUT 中 `settings.applicability` 的未知子字段应被源重置后丢弃并成功保存；我方当前先保留它，再由 nested strict schema 拒绝请求。** 例如只在现有有效 PUT 的 `settings.applicability` 加 `futureApplicabilityField: true`，源 `Bd.validateRuleSet`会整体覆盖 applicability，预期成功且读回 `{mode:"all",materialRouteKeys:[]}`；我方 `normalizeReferenceRuleSetInput` 在 `packages/core/presets.ts:33` spread 原对象，接着 `packages/contracts/presets.ts:41` 的 applicability `.strict()` 会令 PUT 返回 400。此反例未由现有 integration 覆盖。建议修复归一化时只构造两个源保留字段，再以独占API补此边界；本交叉审查未改代码，也未执行测试。

## 精确证据

公开发布包源码 `.data/research/lawbot-2026-10-13/readable/main.js` 整文件 SHA256：`40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba`。

| 范围 | 事实 | 切片 SHA256 |
|---|---|---|
| `main.js:14282-14290` | `Cd`逐字段校验 entry，但不枚举或投影对象键，故未知 entry 字段保留。 | `20d74621a10f26b024c03d9e5cc3aa88a903edf0af3fb19f14163a5d3905ac37` |
| `main.js:14364-14377` | `Bd.validateRuleSet`先重置 description 和**整个 applicability 对象**，再归一化 entry 已知字段并调用 `Rd`；unknown applicability 子字段丢弃。 | `20ce3c0aaa0a566e979e3f6d9c1fb3125d118b5384a9752131533bb229ca20f9` |
| `main.js:14404-14412` | update clone 完整传入 RuleSet，重置身份/来源/只读/创建时间，调用该归一化后写入完整对象。 | 整文件 hash 绑定如上；未另算此范围切片 |

我方当前 hash：

| 文件 | SHA256 | 相关范围 |
|---|---|---|
| `packages/contracts/presets.ts` | `011ec75cbe203130d6b063ac1193dca4848b52535341554981eb2a48e29da612` | `30-43`: entry 与 RuleSet `.passthrough()`；applicability 子对象仍 `.strict()` (`41`) |
| `packages/core/presets.ts` | `c87db95743368144c312178760929720ad5d443f202b0b89af59af8548ab1668` | `30-35`: applicability spread 后覆写两个字段，因此意外保留额外字段 |
| `apps/api/presets.ts` | `fe149ce5e3f7a2b2026a1f7d7fab666deaf35127d4311b34e406c298d60151fc` | `78-89`: PUT 外层 schema `.strict()`；嵌套 settings 走 preprocess + ruleset schema |
| `tests/ruleset-entry-extension.integration.ts` | `90f1567e049dcc3269901e2a211b6de0364b947323d9fee7823a5b8d02e4dcc1` | source `Bd`对照、PUT/GET、duplicate、项目快照、worker、native codec、Excel投影 |
| `tests/ruleset-normalization.integration.ts` | `3e7bdd1e51a88a6a7647ddfb0eae76ebbecf6296fe2fe5720abb8e5a2f0bd55f` | create/update retired字段归一、wrapper unknown 400、真实尾项 worker命中 |
| `tests/ruleset-normalization.test.ts` | `3bf41d8e83d1acaf307eab5c8d9dbbf5750abe06a68a499df86ce7c52c87f566` | 源 `Bd`与我方纯函数对照、entry route及 RuleSet/entry extension保留 |
| `team-luna-named-input-review-20261015.md` | `a4f16f03302f59c794a1da00d2b08a0657d22191c2a806b702ef25527b4d01f4` | 记载针对性隔离测试2 PASS；本交叉审查不重跑 |

## 最小反例与差异

在已有有效 PUT body 上只改一处：

```json
{"revision":1,"settings":{"...":"有效既有字段","applicability":{"mode":"materialTypes","materialRouteKeys":["judgment"],"futureApplicabilityField":true}}}
```

源先执行 `e5.applicability = { mode: "all", materialRouteKeys: [] }`，所以请求成功，额外字段不存储。当前我方 preprocess 在 `packages/core/presets.ts:33` 生成 `{...app, mode:"all", materialRouteKeys:[]}`，额外字段仍在；随后 `rulesetSchema` 的 nested applicability `.strict()` 于 `packages/contracts/presets.ts:41` 拒绝，API为 400。根因限定为该 nested object 的前置归一化；RuleSet 本体和 entry `.passthrough()` 行为没有问题。

## 覆盖可信度与边界

- `ruleset-entry-extension.integration.ts` 以真实隔离 API 写入未知 RuleSet/entry字段，验证 GET、duplicate、项目 preset snapshot完整保留；跑 worker 后验证规则生成 pending mark、rule trace含稳定 entry id、trace不泄露未知字段；再往返 native portable codec 验证两层扩展保留；Excel导出解析后验证业务 pattern仍存在而未知字段不在列输出中。该文件还执行源 `Bd.validateRuleSet` 的 VM 静态对照。命名子报告记载此 targeted API/worker/codec 验证 PASS，本次只读审阅代码与证据，不重跑。
- wrapper strict 有真实 400断言：PUT未知 wrapper字段在两份 integration 均拒绝；create额外顶层字段也有真实 400断言。body内部 RuleSet未知键透传有真实写回断言。
- 哨兵额外属性在 PUT 负载中包含 `approved`、`role`、`sourceIdentity`，并确认 worker trace不含这些扩展键；这支持“字段不被消费为 worker规则/审批指令”的窄结论。测试没有断言每一类授权、身份、审批输出语义，故不扩大为完整权限验证结论。
- 当前 normalization integration 还覆盖源旧 description/applicability/matchMode归一与 own entry `materialRouteKeys` 保留，以及真实末项worker命中。它没有覆盖 `applicability` 内未知键，这正是本报告发现。
- 对本次改动范围，未见 duplicate、project snapshot、worker、native codec、Excel 路径漏保/误消费问题；Excel是已知列投影，不承诺往返未知扩展键。
- 竞品仍 R0；上述是公开源码静态对照。我未改实现、测试或 ledger，也未运行测试或全量门禁。

## 2026-10-15 第二轮只读交叉复核：profile 与 applicability 修复

复核命名子最终共享树后，前节记录的 `settings.applicability` extra 拒绝差异已关闭：RuleSet normalizer 现整体构造源的 `{mode:'all',materialRouteKeys:[]}`，因此 nested extra 成功提交并被丢弃。Profile 修复亦符合当前源校验/持久化契约：profile 根及 source JSON原样保存的子对象 passthrough；`pseudonymTypeActions` 仍限制为已知 entity 键；可选 `pseudonymTemplate`缺省合法；legacy `party_slots` 整体降为 standard并执行已知选择项回退；create/update envelope继续 strict。

### 源调用链和矩阵

源包整文件 SHA256仍为 `40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba`。相关切片（UTF-8逐行，闭区间）：

| 源范围 | 源行为 | 切片 SHA256 |
|---|---|---|
| `main.js:18931-18964` (`Um`) | 校验 profile已知顶层/嵌套字段；未知 `pseudonymTypeActions` key被明确拒绝；`pseudonymTemplate`可选且允许 `standard`/`party_slots`。未枚举普通对象键，因此其它 JSON额外字段保留。 | `c8c4b72f246739e136affac537bad24c94c09b61268848ffc1d14bcf9a7476e8` |
| `main.js:25938-25950` (`kI/PI/TI`) | `kI`补空 actions/markdown并归一 default_pseudonym；`PI`把 party_slots降为standard并回退 selective；`TI`过滤 signature。 | `d742122e7f2eb6d733115b4ed00c221ebd12769f8166eded96d9cc2b7b2cfc95` |
| `main.js:25929-25931` (`vI`) | JSON stringify/parse完整克隆。 | `4f2b912885d2aad14f3bfda63207d2bf4db2e7349c9d5a16b113d22d19766945` |
| `main.js:26038-26050` (`OI.create/update`) | 派生或复制 profile后运行上述 helper 和 `Um`，将完整对象JSON写盘并返回完整clone。 | `3874f558c1cbcb87e177ad39276c3f951d7cb27cd4eb28dc0f2544cea5129dd9` |
| `main.js:14364-14377` (`Bd.validateRuleSet`) | 整体替换 applicability，丢弃 nested extra。 | `20ce3c0aaa0a566e979e3f6d9c1fb3125d118b5384a9752131533bb229ca20f9` |

新增 VM 矩阵从源包抽取并执行 `$m/Lm/Fm/Bm/jm,Vm,Um,kI,PI,TI,vI`，覆盖 actions未知键拒绝、可选template、party_slots回退、JSON extra保留及旧 default 归一。隔离 integration 进一步验证 API create/update/get、duplicate、project snapshot、native portable、RuleSet applicability覆写、wrapper 400、worker和Excel投影。命名子报告记录 Node 24.19.0 定向命令结果 **4/4 PASS**；我只读审查用例和报告，没有重跑。

### 本轮判断与覆盖边界

- 先前报告记录的 applicability反例已在最新实现闭合，且 integration 对写入与 GET 后结果均断言只剩源默认对象。
- Profile额外数据在根及 `docx/markdown/pdf/image/batch`、batch两个子节点、standard pseudonymTemplate均有 create→GET精确回读断言；根字段另经 update→GET、duplicate、project snapshot和native portable回读。profile JSON扩展由schema验证与持久层保留，消费端只读取已知 selector。测试未把 profile extra送进审批/权限流程；API身份仍由登录用户scope和资源归属控制，profile的 `source/readonly/id/createdAt`在 create/update使用服务端覆盖值。本结论是本次已检查调用路径上的窄结论，不宣称全系统权限审计。
- `pseudonymTypeActions`未知 key在integration真实API断言400，VM另证源 `Um`拒绝；wrapper额外字段真实400。未知 profile键无法替代角色、审批或身份字段，因为这些不是已知 profile selector，且身份/只读服务字段由路径覆写。
- Schema允许 signature与产品扩展 entity ids，是当前合同中显式扩展；源 `TI`会滤掉signature属于已知差异边界，本轮没有把它扩大为本次 passthrough 回归，也没有改变产品策略。
- profile `party_slots`与 `default_pseudonym`的降级已通过VM和API用例对照源 helper；schema仍对已知字段/枚举/动作值执行验证，没有将整个profile改成无校验对象。

### 修后指纹

| 文件 | SHA256 |
|---|---|
| `packages/contracts/presets.ts` | `b96205488e580d937bd151f6f876963a161655068a5f87cdcb024bf88411f917` |
| `packages/core/presets.ts` | `5d1b453946a6c56a66c7e5b5777612efda8260238a27c229981e7d25258a51f7` |
| `apps/api/presets.ts` | `0c19ed39015efd2f8bd2c44c6d76eea0399d3f0cf4a1f2b20f9a370fb2825c41` |
| `tests/ruleset-entry-extension.integration.ts` | `a0ff6bdeed6aef571ac48e2f0cd691c8be3880c4999bbec5ee87c9d0fe1ace57` |
| `team-luna-named-input-review-20261015.md` | `77061248498e82e45a41c91c6da18c64e06b0b6962d6ed92a560dae2038c2920` |

本轮只更新本交叉审查报告；没有修改产品、测试或 ledger，也未运行任何门禁。竞品状态仍 R0。


## 最终复核收口（命名子第二次窄修后）

root要求补查的 `kI` 与 `TI` 分支已经在最终共享快照闭合，并由命名子独占隔离实测4/4 PASS：

- `normalizeReferenceProfileInput(value, writeInput)` 区分 API create/update 与旧记录迁移。writeInput先强制 `certNoPreferenceRecorded=true`，符合 OI.create/update 中在 `kI` 前设置此标志的顺序；读旧记录分支在标记缺失或false时，若含 `case_number` 且缺 `cert_no` 则插入并置标记。
- source `kI` 在空值时补 `batch.markdownDefaultMode='default_star'`；实现同步补值；旧 `default_pseudonym` 与 party_slots selective回退均一致。
- source `TI` 会移除 `signature`，仅该值时恢复 `SOURCE_DEFAULT_ENTITY_TYPES`；实现同步，integration对带signature更新做 API readback断言，VM对单独signature/default回退做对照。
- pseudonymTypeActions未知键由源 `Um`与我方 schema/API共同拒绝；RuleSet applicability extra由 API成功覆盖并在 GET 断言丢弃。create/update envelope未知字段仍有真实400断言。

因此本轮源兼容目标内没有剩余反例。源证据切片 hash见上表（`:25938-25950` 的 `d742122e...`，`:18931-18964` 的 `c8c4b72f...`，`:25929-25931` 的 `4f2b9128...`，`:26038-26050` 的 `3874f558...`）。注意，旧数据迁移会依据`certNoPreferenceRecorded`补 `cert_no`，而 API 写入按源顺序先强制标志为 true；报告明确保留此区别，没有把旧记录迁移行为错误套用到新写入。

最终冻结候选 hash：`packages/contracts/presets.ts` `b96205488e580d937bd151f6f876963a161655068a5f87cdcb024bf88411f917`；`packages/core/presets.ts` `161c1a63c2c26fcb7ed0d89d6541d25b5abe4541a31b86ee6f7a6bdafb9fa5e8`；`apps/api/presets.ts` `f6306324c3f30eebf8383fd5af6da83f879a0c8859301e4885e40e8b4cf8f9a3`；`tests/ruleset-entry-extension.integration.ts` `e7db54a9e4efa5f8163fb8911342c7887003954b2d9d7a11a92dc24198777c5f`；命名子报告 `cdb2fe22ffb8642c4214fec1f7f7936e95d7dd0921a0579e7e0f10fc14a69992`。最终 cross-review hash由写入后重算。
