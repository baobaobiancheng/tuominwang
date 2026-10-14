# 大映射与长假名还原最终闭环

| 缺陷 | 修复结果 |
|---|---|
| 自有5000条上限 | 与源/项目100000一致，5001/100000合法、100001拒绝 |
| Word可选空白巨型正则fatal | 完整wrapper扫描＋统一归一化查表，plain用压缩前缀树 |
| 23MB长plain巨型正则fatal | MD/Word及共享restoreText统一无巨型正则的压缩前缀树 |
| HTML/反斜杠形式碰撞依赖JSON顺序 | 仅MD显式拒有歧义原文/非恒定队列；Word保留literal区分 |
|300字符假名/200000+原文选择被专门限制 | 去除专门长度门，保wellformed/noNUL/HTTP文件预算 |

作者19单测PASS2.77s；C独立25单测与原fatal/碰撞反例关闭。真实4项API PASS7.12s，包括完整23MB映射经原worker门、Word/MD派生副本持久化、hash下载，以及长选择值。未改worker/模型加载或部署资源门。

固定seed、22788935字节、完整输入SHA256和generator SHA见同名JSON与restoration-large-fixture-20261014.json；原两类fatal日志均保留。

全first-party源码检索后，未再发现按映射/假名全集拼接的动态RegExp入口。其他固定规则/表格/地域表达式不冒称一切正则普遍安全。没有将容量测试当真实检测准确率。

最终独立复跑：C 的6文件25单测PASS2.23s、4项真实API PASS7.587s，完整23MB映射经原512MiB worker后生成并下载MD/跨run Word；最终tsc通过。独立报告与逐日志hash见 [review-restoration-final-by-inventory-20261014.json](review-restoration-final-by-inventory-20261014.json)，无新增已确认缺陷。
