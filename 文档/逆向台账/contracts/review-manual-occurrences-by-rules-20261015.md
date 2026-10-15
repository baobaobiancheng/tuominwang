# 手工同文查找：独立对抗审查

[P2] 归一为空的Word图片查询误命中已纠正实体——已关闭。

实际Word嵌图手机号纠正138→149后，查询仅U+200B返回200并带整段无关手机号glyph。视觉作者在API/worker/UI按源ignored字符全集补明确有效查询门；独立同材料复跑：不可见字符、软连字符和ZWJ组合均400 MANUAL_SELECTION_INVALID，合法149查询仍准确1项，数据库加密canonical/content_hash/source_hash与revision、原件字节均不变。

另独立完整2API32.65s通过：Word同文/跨对象、PNG/PDF/Word嵌图真实glyph和导出像素/CAS/RLS。归一空修复后实际1API5.616s。PNG原先已有IMAGE_SEARCH_INVALID409防护，没有将它误报为命中。

前失败和后通过完整日志、源码/测试hash见同名JSON。竞品运行仍R0。
