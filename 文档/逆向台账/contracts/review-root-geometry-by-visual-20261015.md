# Root 实体几何主链接线独立复读

本范围未发现新增可复现缺陷。两个 preview 入口、锁内保存、真实 actor/坐标变更历史、opaque ID 删除清理及 marks/pageReview 联合撤销已逐体复读。2 项独立纯测试通过；三格式实际 API 由我方及 A 先前分别完整运行。

本结论不包含尚未自然退出通过的新两例 Edge，也不替代 C 正在实施的 portable geometry 生命周期。代码哈希与测试日志见同名 JSON。

## 后续真实验收更新

新两例 Edge 已全部通过并自然退出（2 PASS，5.9 分钟），包含 Word 两资源直达/同文保存和 PNG 识别实体八手柄保存/清除。长耗时来自 Edge crashpad/updater 继承 stderr，诊断文件保留；B/root 均确认未杀第二轮进程。portable geometry 普通 12 链与独立 legacy 正例/3篡改反例均通过。原前述待验是此前检查点，当前结论以本节及 JSON 为准。
