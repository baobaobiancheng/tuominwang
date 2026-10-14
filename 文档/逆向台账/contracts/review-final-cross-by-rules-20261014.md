# 最后交叉对抗审查（规则作者，迭代029）

| 项目 | 结果 | 证据 |
|---|---|---|
| OFFICIAL 姓名覆盖选择性按类型遮罩 | P2已关闭：root只对overall detected例外，type/value/manual保Nt | 独立2 tests PASS |
| Markdown降级代码语言重复选中原文 | P2已关闭：产品无info fence，纯源Writer保持oracle | 单测137PASS、真实接口5PASS18.77s |
| 重叠GroupOf辅助覆盖统计 | P2已关闭：C union修正，A逐条独立重核5749记录；141改142/153，TP/FP/FN及ignored不变 | face-group-overlap-counterexample.json |

GroupOf问题仅辅助覆盖数；TP/FP/FN及P/R/F1不变。推理数据与代码快照保持不可变，作者计划另签发派生修正并完整比较计数。

## 已核边界

- 中央替换策略、手动策略重置、后置人工清除、椭圆真实交界与派生文字抑制。
- Markdown原件/私有sidecar/ACK/版本/覆盖门；旧MD必须重新识别，已签发副本兼容路径另保留。
- Progress用户、项目、revision、generation、source/content绑定。
- source自定义替换后端无100上限或<>【】禁令，源UI有30 maxlength；原Writer接受空串、全空白、长字、多行与U+0001，拒NUL。当前Markdown实测原字节保空白，Office XML格式门仍独立。
- 脸评估全量/出处/训练重叠声明、源码及原图hash与最终验证器；不升级为官方mAP、法律语料准确率或竞品授权runtime等价。

详细文件hash、源码行、修正前反例与各日志见同名JSON。本报告不是root全库最终门禁或部署完成声明。


迭代030补核：压缩radix、100000乘205长别名、Word跨run、编码碰撞、proto原样别名、非递归替换与视觉空字分支只读审查；独立5文件14PASS加旧Word还原12PASS，共26PASS。源授权runtime仍R0。
