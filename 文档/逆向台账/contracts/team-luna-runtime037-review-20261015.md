# 037 自动运行规则 producer / 并发对抗审查

日期：2026-10-15。范围：脱敏猫 0.5.9 公开发布包静态源码，与当前工作区 037 源码、A/B 实际运行回执交叉审查。只读审查；未运行测试或门禁，也未改产品、台账、测试、部署或服务。

## 结论

本子任务所查的 Word、PDF、通用手工及审核入口未确认新的可复现漏迁移。后续 35 ID 交叉审查发现 **PageEditor 页面 OCR 文字补录 producer 漏接**，见 `team-sol-processing35-review-20261015.md` 的精确源行和发现时工作区 hash；root 已确认并正在窄修。因此本报告早期“无新漏迁移”结论仅限本子任务实际检查的入口，不适用于整个 037 producer 集合。补录经服务端校验后，以带文档/内容/源版本绑定的 AEAD 密文写入仍运行的 detect job。worker 在检测结束时锁定并关闭该代窗口，按数据库序号读取，再将规则映射为 pending 标记交回审阅；不改 runtime_whitelists、revision 或审阅决定。新 claim 开启新 generation 并清理旧代；旧代 cleanup 不关闭新代。撤权后 owner 可销毁自己任务的临时密文，不能读取或投递，异 owner 清理无效。

竞品状态仍为 R0。A 的 API 实际回执 3 PASS / 10.910s；B 的真实 worker 回执 1 PASS / 3.562s（总 5.632s）。这些只证明我方路径，不代表竞品运行验证或全部调度时序。

切片 hash 是含起止行及换行的 UTF-8 字节 SHA-256。

## 有限链路证据

### IPC-0ea3b09c375b：renderer → main → 活跃 engine

- 源 main.js:17183-17195：校验 request/session、scope、类型；spot/blacklist 不应用 whitelist；project 按 session 找存活 detect-only engine，file 按 requestId 找；逐 engine 调用 applyRuntimeRuleUpdate。切片 36aa6de88e6de22a9d85df600284f75cc4e1d560097ac0a7c30903c07ab1d59f；全文件 40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba。
- 源 renderer.js:6185-6190 是 IPC caller；:9999-10017 展示已有标记覆盖选区、新增、批量新增都在 cu2 后发送规则。:6572-6573 展示 audit 补录后发送。切片分别 1d059d95871cc4856278e861d6060b87226061e817cbd5b1d66cb5d6661ddfe6、9d33c2e6b32bde5b7f6ca3969832f16cc6191f3935b5cb6eb7cd4b40e24e267c、e679e890971604a88fd6325dc57d6f86ed2138cd2d52f662d6543e22633cf53e；全文件 4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc。
- main.js:9296-9304 仅向活动 engine 的 learnedWhitelists 内存数组追加；:9439-9464 匹配 literal、空格和括号变体，避免同类型重叠。切片分别 f8af378e8b84e52c337096e8a716d839d2fe2e2da85d8c341c39ad4864c704db、49615652aabda0e05b42026dca62087cf0fb75e84ac5725d66dd00af4d1b1401。
- 我方 apps/web/main.tsx:484-485、985、1145 连接普通手工/一键/审核补录与 covered-selection；apps/web/automatic-runtime-rules.ts:3-11 只接受三类 producer，过滤隐藏/ignore、重复和无变化，提供 pending flush；packages/core/reference-runtime-rule-producer.ts:5-14 再按有效 before 槽、id、span 排除旧标记。全文件 hash：web dispatcher b5cb101ac6107f7f917097dc6d40f5fdd13eca236ee6f5cb17ec8826dd83114b；core producer 1b85d7659399d18fe9e39d67032cd34ab23e979557a29b7a2ba0f5c8fa88287e。
- 最小输入：after=before、重复 span、ignore/hidden、新 pending、已有标记覆盖 selection。预期只有新增或 covered-selection 生成规则；ignore/重复不进入临时窗，规则不批准审阅。API 用例覆盖 unchanged、invalid、covered selection、ignore 拒绝；worker 返回标记仍 pending。

### 037-API-TEMP：活跃任务桥接

- 我方 apps/api/automatic-runtime-rules.ts:23-39 校验登录权限、revision、原件/content hash、entity span 和 selection；file 限当前 doc/revision，project 限 owner 的活跃项目 job，spot 不排队。查询要求 detect、running、有效 lease、accepting、job_authorized。切片 hash 1c8c5e72249590e044f888b41b0af63d55684ac690138ca98d63ce6be54e6cc0；全文件 a9652558a81684e736af88332991ecfa1d967b2a8356022b5a829469c99cf015。
- 最小输入：一个 completed job、一个 active file job、同项目第二个 active job。预期 file 投递1个、project投递2个，不重排队。A 回执 activeFile=1、activeProject=2、closed=0、persistentWhitelists=0。

### 037-AEAD-QUEUE：并发、顺序、generation、撤权

- 我方 packages/adapters/automatic-runtime-rules.ts:6-25 绑定 job/generation/tenant/project/user/document/revision/sourceHash/contentHash；AEAD AAD 另含 delivery id；producer/drain 锁同一 job 行，按 delivery_seq 排序并校验 metadata、AEAD、hash、schema。切片 4a221e8c37cc202ad31706bb3a4e143a27bad0c2d18174c0e05ad03a645c976f；全文件 511c7fa83ea32ab469a6973c3042de9274a0474fd624aee85853001a4a75f45a。
- scripts/037.sql:1-55：claim 每次 generation+1、开新窗、删旧代；受限 SECURITY DEFINER cleanup 只按当前 user/tenant/job 清指定代。全片 1be899fa1587f71ec29c180b6ed368a36fabe7452c57417fc340c003af6ee566。
- A retry/revoke 实例经过真实 claim_job：N+1 accepting=true、旧密文清空、N 的 discard 不关 N+1、外国 owner 无法删；禁用成员后 API 401、RLS 不可见，owner cleanup 后临时行=0、窗口关闭。回执 automatic-runtime-retry-revoke-actual-A.json。API 完整日志 automatic-runtime-api-complete.log：3 PASS / 0 fail / 10.910s。
- 并发最小输入：多个 producer 争用 job 行后 worker 关窗。预期事务按锁串行，delivery_seq 决定消费顺序；关窗后 producer appliedToTasks=0。API 实测序号递增、最终按序读取；未做高并发压力测试。

### 037-WORKER：检测、取消、复核

- packages/adapters/processing.ts:53-81 用 worker message request/reply 由 parent 读取当前代规则；eventWrites 串行处理检测事件、规则请求、最终结果。切片 4245736e8c042da98de2dc17cb5f3f67ecc7b959188af02aebe40bc53a6d492a；全文件 11a81bb5ddf80e9c2ae6348798b5c76e2a95fad9a93cddc0315c9af44933b759。
- processing-worker.ts:200-215 在候选检测后读取临时规则再生成标记。切片 fa16b8517fd3ad33c6d086b6e3ebd025b90b69b1fe87f1e089db30a5dc4c6c5a；全文件 964cf0bb9cd3f174c3fcc1902bf5a62f03eb11da82b3a54022f7bbbf79474f03。标记 decision=pending，来源 runtime-whitelist。
- apps/worker/main.ts:74-86 以 claim 返回的 generation 构造绑定；:162-166 finally cleanup。切片 2a0c15853ed4d40337a5def4e9533286b7aaa00720a4b1f495685f2c493f3554、09735bc3c4b390e9dad49c49ac4d955f29d7a444a74edc2a74014487c789d1ac；全文件 17dfd38169070a0d5c61cc1ecf19688d2003eac6edd9e992181a37286318ff74。
- B 实际 worker 日志 automatic-runtime-worker-B.log：1 PASS / 0 fail / 3.562s（总 5.632s）。真实 claim、真实 detect thread、API 异步投递，drain 等待事件写入；结果 pending 标记2条，迟到投递0、临时表0、长期名单0，原件与复核未变。
- 取消最小时序：有 delivery → abort → worker terminate → finally discard。静态代码表明清理当前代，但无取消实测。公开源 main 即时追加运行 engine；我方在候选形成末端取窗。补录若晚于取窗会被拒绝，结果不重跑。公开源无自动重排队分支，因此这是可见时点差异，尚不足以证明漏迁移；如产品定义要求中途刷新当前候选，需另设验收。

## 未见叶子和限制

- 无许可证，未激活或运行竞品；竞品状态 R0。静态源码为 .data/research/lawbot-2026-10-13/readable/main.js 和 renderer.js；无可独立确认等价的公开 worker 文件。
- 未审 preload 对 window.anbao 的具体暴露/发送实现，也未闭合 detect-only 注册/注销完整生命周期；未对所有格式做浏览器操作。
- 未执行取消期间数据库断连、极端并发、序列耗尽、跨页/跨单元 selection 全排列。worker PASS 仅证明投递早于最终 drain 的该条时序，不能证明任意中间时点逐帧一致。
