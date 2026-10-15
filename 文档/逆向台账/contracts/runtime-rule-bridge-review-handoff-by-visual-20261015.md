# 实时临时规则桥接：B 审查交接

## 已实际通过

`tests/automatic-runtime-worker.integration.ts` 独立实际 **1 PASS / 0 skip / 3.562 秒，总 5.632 秒，自然退出0**。两份 API 创建的 TXT 原件、真实调度 claim、真实检测线程；异步 onEvent 完成自动 producer API 与事件写入后，最终规则窗口才读取。实际得到2个未知类型 runtime-whitelist 待确认标记，迟到投递0，临时表和长期名单0，来源复核/字典/原件均不变。

返回结果不是已发布或批准的复核快照。若在本文件追加另一个 scheduler case，先用实际取消 API 清理前一 case 的活跃合成 job；当前独立 runner 自然结束时删除整隔离库。

## 两项修复仍待实际反例终验

1. 新代际没有重开 accepting：037现每次 claim重开并清旧代；源码已读，需真实重试、旧代投递/cleanup不能影响新代验证。
2. 撤权导致 finally 受RLS挡住清理：现用只按可信tenant/user/job/generation工作的窄definer，不返回payload；源码已读，需实际撤view_original/disabled和foreign-owner反例。

A已接收这两项；B因用户新的模型分工要求停止，不新写第二测试。作者还在最终补API分支，因此当前是交接，不是冻结后的全量审查通过。

## 浏览器与文档

新 type-hide spec 和增强后的同文/八手柄操作截图、自动FN断言等待 root全Edge。已通过的旧两例Edge自然退出，但保存后折叠截图不能当拖框操作图。操作指南已更新并显式标注这些待截图范围、界面差异和真实识别质量。

完整日志路径、代码哈希、后续任务与当前范围见 `.data/research/lawbot-2026-10-15/iteration037/handoff-visual-runtime-review-B.json`。B已无运行进程，未部署/启动Edge，竞品许可运行仍R0。
