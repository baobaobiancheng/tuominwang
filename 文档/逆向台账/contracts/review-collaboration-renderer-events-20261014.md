# 协作 renderer 事件补充：独立对抗审查

结论：**所审可见分支支持报告结论，0 项未决发现；仍 S2 / R0。**
- 目标 JSON SHA256：`2080efb59976be9e7993a3dce90cfeae0c20e5e40d446f64d760d6d934f2f22a`
- 目标 Markdown SHA256：`b294bc81d55f468181e2e344628ad059b08daa10db2dbe0f6b457be57a8d61e4`
- 7 节、47 个源码范围全部哈希核验；逐节回读可见分支。未审作者生成器。

## CE01 单槽不清与消费异步边界

c2覆盖s2、send不清，consume取出清空；Dashboard回调未return le2所以catch不覆盖其reject；第二列表消费者无代际。支持有条件旧/重复快照风险，不保证每次必重复。

## CE02 同job无串行

AF只延后busy且当前不同job；Kc同key直接true；le2在await refresh/import前后无统一任务身份复核。A2仅还原enabled等局部，不能称完整恢复全部设置。

## CE03 停放、导入、授权及恢复回执

B2/P2/O2先登记与清理条件、Zg2未await、ue2授权固定字段、de2同job+round门、he2 transport冒泡均与源码一致。此结论不证明Kg2/Zg2/xy2/Nv2内部。

## CE04 诊断文本/落盘/健康超时

darwin Vision摘要无filePath；Paddle路径和stderr进入summary，剪贴板另造摘要未复制路径；write前赋path及吞异常不能保证落盘。spawn availability无timeout，renderer 5秒race不停止探针，timeout不赋re2。

## CE05 progress身份与解绑

两应用注册通过独立rg排除PDF.js；seal保存局部解绑，Dashboard共享ya2卸载释放。apply严格request+sequence，detect严格非空request；main apply最终字段覆盖上游，detect是上游覆盖request。旧PDF发送无request所以Ra2拒绝。

## CE06 page监听和共享槽

三注册皆允许无request，batch/single的docx_progress在filename检查前返回；resume finally全局ba2无身份保护，batch/single finally有各自request/代际门。静态支持重入误解绑条件，未证明实际重入必可达。

## CE07 64/16缓存标识与分层释放

无路径buffer登记64hex，release返回原对象（额外核读main15885–15896），handler仅传bufferHashes；engine calculateBufferHash16hex原样set，无法相等。支持该路径removedEngineCaches=0条件；不扩大为所有源/所有缓存释放失败。engine超大单项能留，source缓存可自淘汰。

## 审查边界

- 没有执行竞品、授权工作流、OCR探针或诊断硬件命令。
- 未验证实际消息竞态/重入可达性；文中风险是条件性静态推导。
- 未将UI事件、缓存层或7节覆盖外推为全部第三方资源释放/格式导出闭合。
- target快照变化后需要重新核验hash与语义差异。
