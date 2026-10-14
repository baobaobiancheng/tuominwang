# Raw 实体完整链独立对抗审查

详见同名 JSON 的当前快照指纹与可复现步骤。

- 同 span 10 种 raw 字典类型完整保留，动态前缀及 prototype 名字不吞并；单类型策略只作用目标；9 项来源全部保留。
- 独立真实 API 复跑 1 通过 5.98 秒：假名命名空间、LPM、导出、还原、portable 文档范围重绑。
- P2：合法 raw 标签含 U+0001，映射 XLSX 生成成功但 XML 中裸控制字符非法。作者正在用 ST_Xstring 无损编码、一次解码和 literal escape 保护修复；关闭前保留 open。不得用删除字符或拒绝未知类型冒闭合。
- 此审查不修改作者 shared 实现；竞品完整正版动态运行 R0 不变。

## P2 独立关闭

作者已接全部 writer 与 XLSX shared/inline/cached-string canonical decode，XLSX 写回 DOM textContent 用不含 XML entity 的 encodeXlsxText。独立反例重新执行映射表无裸控制字符（1589 bytes），个人表无损回读（2568 bytes），6 个个人表与 2 个 ST_Xstring 单测全部通过。重叠 literal `_x005F_x0001_` 的 underscore 也逐一保护，仅一次解码；不通过拒绝合法 raw 类别掩盖问题。实录 iteration027/raw-xlsx-independent-probe.log。
