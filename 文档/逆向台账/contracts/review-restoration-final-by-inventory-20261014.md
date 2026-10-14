# 最后还原链独立复证

三个可复现缺陷已关闭：100000个205字合法别名的native fatal、Markdown编码变体按对象顺序覆盖、shared restoreText巨型Regex。全部使用压缩radix匹配器；未新增映射数量或别名长度限制，权限／版本／未知／歧义／一遍替换gate保留。

- 独立6文件25单测通过2.23秒，含原长别名反例、Word跨run／metadata、100组Unicode/最长匹配oracle、权限及未知gate。
- 独立真实4个API通过7.587秒；23MB映射走现有512MiB真实worker，MD与跨runWord均生成不可变派生物并实际下载校验。
- tsc通过。具体源码SHA、原失败和修复日志见同名JSON。

竞品许可链仍R0；这些复证不是全部外部协议再次执行或竞品完全等价声明。
