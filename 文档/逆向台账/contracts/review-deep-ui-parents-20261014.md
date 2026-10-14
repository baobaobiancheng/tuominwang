# 前端父调用链独立对抗审查（2026-10-14）

所审关键静态结论与来源一致，两项措辞问题已修正。六项仍维持S2/R0，不据此升级全链或全产品完成。

## 范围

固定6项ID；59条来源hash全部通过；19条可重叠范围记录独立语义复核。没有重新证明全部59范围的全部分支。未执行竞品，0项S3建议。

## 已解决问题

- **P3 / UIP-REV-01**：Qo2 ready/partial 门禁须限于批量 mo2 分支；单文档直接调用 child.setPreviewMode。 作者已限定批量分支并明确单文档分支；当前快照回读一致。
- **P3 / UIP-REV-02**：Rs2 的30秒是每页循环开始的已耗时检查，不是打断 await Es2 的总超时。 作者已改为循环开始检查且不打断await；独立额外读 Es2 23702–23725，内部3秒Promise.race也不证明底层工作已取消。

## 关键结论

### UI-2c1712d35460

groupCountByKey 全文仅声明和读取，三个侧栏callsite未传；Image U2为空async。Co2先登记去重key再await反馈，catch为空，失败不自动回退key。

边界：不据此判定所有删除入口、投影、持久化反馈均闭合。

### UI-3f01047e6b59

Image Ee2及watcher无请求序号/查询身份校验，旧响应可能覆盖新结果；PDF Vn2有序号/query复核。PDF码点数组与UTF16 indexOf索引并用，存在特定Unicode输入坐标风险。

边界：静态可达风险，未运行竞品验证；不宣称所有Unicode输入失败。

### UI-339d8e53408d

jm2失败重排dirty并保存错误，dispose不取消正在运行Promise；Vm2逐份草稿写入后调用child，缺跨文件事务回滚；saveRecovery串行队列及缺源补登记重试一次有源码支持。

边界：renderer回执不证明主进程原子保存、加密、重开恢复与卸载取消已完成。

### UI-ad41d13c4a2d

已读project entry生成优先级与重置分支支持报告；store mutation后异步统一同步失败无整体回滚。

边界：没有把预览优先级外推为全部导出/LPM消费者优先级；jc/UK仍待递归。

### UI-67e30cf66ad0

Pf2 image success:false/非数组不加skipped；PDF deleted-page过滤checkedPageNumbers但不同时过滤results。av2先Vf2删除再Wf2，后者可因缺Markdown映射返回false，旧实体无恢复分支。

边界：未复核所有候选几何和draft版本门；部分修改可达性不等于竞品运行复现。

### UI-32ce2fb60c5f

Df2键缺sourceAnchor、材料集合、revision；Wd2只有初始化/读取/赋值/成功尾部清空四处，不随草稿修改主动失效。manual当前框先插入、后project apply。Rs2有循环取消、时间预算、覆盖检查，提交前再验序号。

边界：父控制流不证明旋转、裁切、坐标转换正确；Es2额外只审等待控制，不宣称全部geometry闭合。

## 精确剩余

### UI-2c1712d35460

- 未展开 DOCX Eo2 投影/惰性列表完整性（renderer:8820起）、Markdown St2 虚拟窗口定位（6333起）、Image Pa2 投影（26935附近）及 PDF Il2 完整滚动链。已读callsite不证明各格式侧栏显示全部实体。
- 未展开 zf/_c/er2 的所有调用者及 feedback.addBatch 主进程持久化；本项只读指定删除分支。

### UI-3f01047e6b59

- 未展开 Markdown虚拟窗口完整搜索 producer/窗口加载 St2(6333起) 和其他全文索引，只确认共享DOM搜索与scope消费者。
- PDF xa2/ka2 已读直接坐标组合；nr2(23449起)、Ji2/ar2/sl2/Ar2/rl2 全部旋转坐标转换尚未递归闭合。未读 pdf.js 的 getTextContent 实现，未运行Unicode/字体/分页用例。

### UI-339d8e53408d

- 未展开 Nu2(32622调用)各格式snapshot序列化、workspace save/recovery preload及主进程加密/原子落盘/重开恢复；恢复正确性仍未动态验证。
- child内 gs2/zu2/forceRefreshReviewHighlights 等渲染算法和DOCX文档大型异步加载的所有取消/卸载路径尚未闭合。

### UI-ad41d13c4a2d

- jc完整 inherited-profile/canonicalKey/tokenFor/apply实现（4418起）及UK规范化/机构简称关系（29843起）未递归展开；完整alias碰撞等价性仍未闭合。
- 未从这些entry逐一追到DOCX/PDF/Image/Markdown导出mask选择器、LPM生成及还原消费；不得把预览qp结果等同导出成品。

### UI-67e30cf66ad0

- vf2 PDF native全文抽取（34679起）、ff2/pf2/xv2候选几何转换（34673/34660/35294起）尚未递归展开；uf2与cf2直接算法已读，不等于整条geometry闭合。
- 未读所有gf2上游draft生成和重新识别并发版本门；需要动态覆盖删除页OCR、sourceMap缺口、失败返回与审计切换。

### UI-32ce2fb60c5f

- PDF Es2/Pb/Ib/As2/Ts2/Is2完整相对坐标转换及DOCX同图批量路径未展开；本节只读PDF Rs2父控制流。
- DOCX sn2(6455起)所有本地匹配、PDF so2与Image Xe2搜索包装、manual hs2/Ul2/yi2建实体实现尚未完整递归闭合。
- 未动态验证关窗、切换文件、预览期间重新识别/删除实体、异步错误后重复apply、保存重开和导出；仍R0。

## 未纳入本轮

- 协作 open/consume 的 renderer le2 生产消费未在本轮展开。
- 各格式 saveDraft/close 的全部生命周期，以及preload→主进程保存→重开恢复尚未全链闭合。
- legacy snapshot review schema 子验证器不是本轮范围。

## 校验

`python3 文档/逆向台账/contracts/build-review-deep-ui-parents-20261014.py --check`

目标快照：

- json SHA-256: `b4a9529e9740c06116e36da34934d29dfc89a675d5b5fca4e9dee72b4a130bd0`
- md SHA-256: `2b76ae6070b049e4102d67b42b38e9358ccfd284bf180a0f69faa899f30f8d58`

精确独立读码范围及切片hash见同名JSON的evidence。
