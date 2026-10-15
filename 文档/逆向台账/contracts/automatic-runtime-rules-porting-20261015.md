# 自动补录实时规则链（037）

稳定ID：`IPC-0ea3b09c375b`。竞品R0。本轮未升级ledger状态。

## 修复的遗漏

源Word/PDF/图片手工补录后会向活跃识别engine注入whitelist。此前我方只有手动规则+重新识别入口，不能视作这条producer已移植。037补齐仅活跃任务的自动链；保留当前草稿，不重排队，不写长期名单。

## 源与云适配

|环节|处理|
|---|---|
|输入|真实before/after候选、031不透明身份、规范原文及035语义校验；合法covered选择另作精确format归一验证|
|范围|file当前任务；project同owner项目活跃任务；spot不发送；audit固定file|
|投递|临时AEAD、job/generation/revision/hash绑定；job锁后单调序号|
|终点|最终规则窗口关闭accepting并drain，closed任务返回0；不改变审批|
|重试|生产claim新代重开并删旧代；旧代cleanup不可关闭新代|
|撤权|不可读/不可投；仅同认证owner可清自己的密文，无payload返回|
|遮罩|真正消费runtime-mask-org/address/default，既有sourcecomputed mask实现未改|

源只影响尚在运行的engine，云在最终完整canonical规则窗口应用投递，可能影响已处理前页；这属于明确时序适配，不冒称竞品时序等价。

## 真实验收

- 作者3项隔离API全部PASS，0skip，自然退出，合计10.910秒。
- 4项单测PASS：真实sourceue2 VM、原文literal变体、raw类型/遮罩、dispatcher无效操作与flush。
- B独立actual worker：1项PASS，3.562秒；未知raw类型候选pending、closed返回0、临时/长期名单0、原件/字典/版本不变。
- 真实对抗：篡改AEAD回滚、合法密文错canonical hash409、非法span400、production重试新代、旧代不关新代、跨owner不可清、撤权不可读但可删自己临时密文。

源码、每文件SHA、日志和不可变proof见同名JSON。新UI与完整快照仍待root全门禁；未运行竞品授权处理。
