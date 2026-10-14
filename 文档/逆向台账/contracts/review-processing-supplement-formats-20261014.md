# DOCX/Markdown 增补独立审查

**No findings.** 当前快照无未解决行动项。4项已修问题已独立回读；11节、21段证据均维持 S2/R0。

## 已修正问题

### [P2] 把文件保存证据指向真实fo/Io实现

原1834–1862是canonical辅助函数，1905–1944仅覆盖Io尾部且混入搜索算法；遗漏预检、wx/fsync、hardlink与COPYFILE_EXCL、冲突和后缀主要分支。
已改1805–1830（含probe finally close/unlink）、1863–1926、2173–2177。

源码：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1805-1830`；`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1863-1926`；`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:2173-2177`

### [P2] 给重叠合组结论引用lo主体

原1823–1833不含lo，不能支撑重叠union/同型包含去重/fullStar码点结论。
已替换为1798–1804。

源码：`.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1798-1804`

### [P2] 给默认路由选择引用export入口

原1141–1147不含环境变量选择器；默认anchor-first及显式legacy开关发生于1105。
已引用1105–1109，覆盖normalize和最终writer。

源码：`.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:1105-1109`

### [P2] 准确记录超时按每额外1MiB增长

原“每超5MiB增加3秒”可能按5MiB步长实现；Pe计算max(0,ceil(bytes/1048576)-5)，每单位增加3000ms。
已写为60秒基线，超过5MiB部分每额外1MiB（向上取整）加3秒，180秒上限。

源码：`.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:351-351`

## 关键结论与边界

- **PSF01, PSF02, PSF03, PSF04**：预处理按部件warn/continue；未知包部件保留并非元数据全清；notes传整个note使w:t拼接可跨段，精确range去重不等于拒绝部分重叠；包层图片清理仅所列类型。 没有执行Python/lxml/python-docx或Office验收；上游冲突条件独立。
- **PSF05, PSF06, PSF07**：$o自行构造blocker全集，未读取blockerDecisions；sidecar已列blocker生成删除补丁，HTML表格独立重建。无敏感操作也处理link_destination。invalid-operation失败，其它映射问题可纯文本降级清issue，仍需重解析/文本一致/残留等门槛。 不扩大为所有未知HTML/资产必被枚举；不能将降级成功或预期原值次数比较称全部敏感内容清零。
- **PSF08**：文件提交器预检、临时同步、排他创建、显式冲突处理、最终清理的源码与修后范围吻合。 stat与rename之间不构成外部写入互斥；未实际验证断电和文件系统。
- **PSF09, PSF10**：默认anchor-first；legacy三次映射；anchor-first单候选hash与最终writer三次重写是不同阶段。残留循环检查相应归一化后JS length<2，严格为UTF16长度。 不是外部MarkItDown运行三次；单码点非BMP字符length为2，不被该条件一概跳过。仅重点分支语义检查，非全部候选算法递归闭合。
- **PSF11**：FIFO任务、共享取消、3秒强制收尾、Python本地转换/进程内socket拦截、内存与超时条件均有静态来源。 socket monkey patch与offline环境变量不是系统网络隔离；未运行第三方转换。

## 验证

- 21段证据的全文SHA256、原始字节切片SHA256和行边界匹配。
- markdown-worker AST解析打印复核通过（TypeScript 5.9.3），未执行竞品模块。
- 修后报告与生成器哈希保存在JSON审查记录。
- 阅读全部描述并追踪重点分支；未把11节、21范围或台账接口数量当作全部调用链证明。

- 只读竞品源码；未执行竞品模块、Python/Swift或受许可流程；没有绕过激活。
- 未修改应用或台账，root负责维护ledger。
- 不存在S3或R2升级依据；修复证据范围不意味着已读完第三方依赖。
