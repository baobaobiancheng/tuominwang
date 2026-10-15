# Word／Markdown 自动复核反馈与独立审查

## 当前结论

公开源明确补录和删除的自动反馈已接入独立实现；作者与 C 独立真实接口各 2 项通过。竞品保持 R0。主界面 producer 已由 root 挂载，最终 UI／全量门禁另记，不能由接口通过推断。

|真实操作|反馈|无副作用条件|
|---|---|---|
|手工补录、审查补漏|每个真正新增项 FN|没有实际新增则无反馈|
|一键同文补录|首项 FN，并保真实数量|空选择无反馈|
|明确单删|实际被删组的代表 FP|不存在／无 live 项无反馈|
|树所选组删除|按规范类型和文字分组 FP|用户补录项仍可记录 FP，计数语义单列|
|隐藏类型、保留原值、无变化|不反馈|不能把 ignore 当 source.deleted|
|PDF／Image 删除|不套用 Word 反馈|格式分支明确无写入|

## 数据与权限

服务端验证当前原件、规范文本、UTF16 范围与真实槽位，035纠正值149和规范识别值138分存；客户端不能自行声称原始值。prepare签发的是用户绑定的非审批历史反馈计划。普通复核保存后的旧revision计划，仅在当前权限与原件／规范hash仍一致时提交；未来版本、换源和撤权拒绝。锁内记录ID幂等保证并发重放不重复。不会自动学习或把反馈当审批。

## 源差异与失败语义

源 Co2 在 RPC 前占用去重key，失败后不释放；本轮保持该行为。我方false／timeout只返回失败、成功计数0，不伪造成功，不阻断正常复核。保存按钮等待有界feedback flush；独立15秒传输后失败收敛。

源 Mu.addFeedbackBatch 先save，再addAuditLog；该batch audit到下一次save才落盘。我们的事务即时审计是明确适配，不称源完全相同。源可选key时XOR文件存储也不能冒称我方AEAD/RLS。源filtered memories结果未消费，没有自动学习。

## 真实验收

- 作者：2API通过，13.523秒，0跳过；C独立：2API通过，13.53秒，0跳过。
- 覆盖：记录GET真实持久化、立即普通保存后提交、重复并发提交、ignore后真实删除、隐藏／无变化无写入、138／149双值、换源409、撤权403、跨租户404及PDF不套用。
- 独立发现并关闭：先前native PDF手动改字导致整页facts被跳过；改为精确span来源后原反例实际通过22.058秒，失败日志保留。
- 独立复跑C完整035三格式／四codec：3API通过68.421秒；独立几何：2API通过35.732秒，含真实像素、错误移动残留拒绝、原件不变。

完整源码范围由visual-finite-source-chains报告逐行hash绑定，53个同伴有限范围另经A重算。代码、作者／独立日志hash见同名JSON；最终Edge及部署由root独立记录。

## Persistent type-hide supplement

Source type-hide persists processing rejection rather than session-only folding. The implementation now saves ignore+hidden metadata, restores pending, preserves current opaque slots and uses trusted original userAdded birth. Normal ignore is not deleted; only true hidden corresponds to source deleted. Real Word forged-birth API passed13.366s; eight portable roundtrips independently passed39.643s; inherited-birth feedback counter API passed3.737s. See final-rule-type-hide-boundaries-20261015 for exact sources and hashes. The earlier session-only implementation is superseded, not presented as equivalent.
