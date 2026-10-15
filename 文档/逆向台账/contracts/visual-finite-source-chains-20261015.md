# 视觉有限公开链逐体展开（2026-10-15）

本报告只覆盖表中明确的函数作用域及生产消费关系。竞品授权运行仍为 R0，不将我方 API 测试升级为竞品 S3。

|节点|源行|已核实分支|
|---|---|---|
|Word.gn2|6536–6570|dedup-live same-type/UTF16 and image path+line+occurrence; newly added missed entities produce FN only when count>0; no empty append|
|Word.So2/Co2/Mo2|8767–8795|nonempty deferred queue; optional missing bridge noop; session tuple documentName|type|start|end|FPFN beforeRPC dedupe; returned success:false ignored and rejected RPC swallowed in source|
|Word.Ql2|9621–9643|single real live delete, normalized same identity overlap set; FP representative once; emit deletion and review dirty; absent match noop|
|Word.eu2/tu2|9645–9690|aggregate same type+normalized text FP notes/count; manual-added removal decrements FN, type hide saveFeedback=false,countAsFp=false; no live ids noop|
|IPC.feedback:add/add-batch|18091–18105|service call returns success/count; exception returns success:false,error; read memory filter unused|
|Mu constructor/addFeedbackBatch|13332–13355|camel/snake normalization, ids/timestamps/os_user; Map append; save before adding audit batch log|
|Mu.save/load|13438–13456|JSON feedback/memory/hint/guide/archive/audit1000; encrypt only configured key; synchronous persistent write; missing file and load errors noop|
|shared.xc/_c/Sc|4270–4288|type hidden tombstone with prior userAdded, restore pending or userAdded; no feedback call|
|shared.zf|5779–5790|Set integer/inbounds/live indices only, clones list and changed entries; empty/no valid changes noop|
|PDF.Lo2/zo2/jo2|24396–24414|sidebar index navigation; source validates deletion indices then emits delete-entities/typeHidden and review-state-change; focus cleanup|
|PDF.Go2|24438–24448|same display group carousel wrap by current selected originalindex; empty false|
|PDF.Nl2/Il2|24691–24708|canvas select focuses sidebar; sidebar select real originalentityindex, first meta bboxes/bbox, scroll ir2(y)-100 only rendered page; no render-await or deferred retry|
|PDF exposed focus + get/applyReviewState|25913–25937|conflict/markdown target exact-key navigation false when absent; serializes viewport/rotations/manual-only/deletedpages; apply restores clamp scale, then rerender on rotations/scale/deletion change|
|PDF mount/unmount|25959–26002|init buffer guards; event/resize/scroll; unmount generation increment, render cancel, timeouts/RAF/maps/listeners cleanup; canvases/textlayer zero and pdf cleanup/destroy|
|PDF.er2/tr2 geometry|23439–23448|same-scope geometry list precedence bboxes>split>bBox; page filter, approximate supplied bbox match else first. NOT parent er2 deletion|
|PDF.Po2 projection|24330–24366|valid geometry screen projection, normalized type/text/page and bbox overlap dedupe; no canonical entity deletion|
|PDF batch duplicate geometric comparison|25284–25335|samepage normalized type/value and equal/contains; bbox full coverage or equal-value closecenter<10 then skip duplicate; emits new entities only; finally loading false|
|Image watch/exposed get/applyReviewDraft|26655–26712|deep G2 emits review-state-change, input bbox/deleted watch updates; get/apply captures active/deleted boxes, selected id, viewport and mapping state; project add missing bridge/IPCfailure/empty false|
|Image filters state|26751–26751|Et2 exact all/type, Nt2 text filter; independent from global Word/PDF same names|
|Image.Ia2/Pa2/Ra2|26935–26957|copy sort y then x; exact type and casefold literal text projection; type+normalized-text carousel wrap; does not mutate source G2|
|Image.wi2/ki2|27274–27303|selected id; nextTick current live bbox; ycenter or ensure-visible fullbbox, clamp actualscroll bounds; sidebar current filtered index; none mode only focus|
|Image deletion Si2 + keyboard Ci2|27304–27348|single archivesdeleted then removesactive; type hide skips ordinary removal tracking; clean selection; ArrowUpDown search or samegroup; no input/contenteditable interception|
|Image actualrender Pa2 sidebar consumer|27425–27425|Kp consumes Pa2 exactprojection; selected Y2; onSelect wi2 ycenter; onDelete Si2; no other Pa2 function mixed|
|Parent.Qi2/Zi2/er2/tr2|32135–32155|reviewState normalization and pure rejected/user deletion metadata; restores user-added or confirmed; NOT PDF er2 geometry|
|Parent.Xu2/Ju2 deletion draft producer|32706–32728|id set to er2 iflive, update Zh2 draft selected id and parent review; guards file identity before nextTick draft reapply|
|Parent.Vf2|35047–35066|replace other-type covering match: image physicallyfilter bbox; Word/PDF tombstone entity by stablekey/id then update draft/currentrenderer|
|Parent project all delete|35396–35420|ready-file counts then explicit dialog; image removes boxes; other formats tombstone live matching entities, persist drafts/registerunified/updateproject|
|Parent.Qv2 PDF deletion consume|35726–35731|filekindguard then zf changedindices, optional _c; nochange noop; dirty draft/sensitive count and Yd2|
|Parent.ng2 global removal consume|36065–36106|idSet formatbranches image physicalremove, PDFtombstone, Word/MD draft tombstone clearselection; single-file original/current arrays onlylive state changes|
|Parent.Ty2 single PDF deletion consume|37314–37317|zf/_c changed only + review state update; no feedback:batch call|

## 新增真实遗漏

Word 手工补录 FN、单条/分组删除 FP 的自动反馈生产端，不能以已有手工反馈面板或 `/feedback/batch` 后端代替。已交 A 实作，根节点挂接。类型隐藏明确不生成 FP；PDF/image 删除没有这条 Word 自动反馈链，不能泛化。

源 Co2 在请求前占用会话去重键，忽略 success:false，异常后不释放去重；我方以真实持久化结果显示成功；会话请求前去重及失败后抑制是已明确的源兼容行为，不冒称自动重试。源 Mu.save 配置 encrypt:true 但未给 key 时实际明文，不能照搬。

## 验证边界

- 同文位置：3 项实际 API 与独立复证通过；新 Word Edge 查找/定位/加入/保存和资源直达、PNG实体八手柄已在第二轮真实通过并自然退出（2 PASS，5.9分钟）；首轮错误fixture与sample仍保留。
- 实体几何：2 项实际 API、A 独立 2 项通过；三格式实际像素、原件不变、残留拒绝与身份校验已验证。新两例Edge及C完整portable恢复、B独立legacy签名桥接均已通过。
- Pa2 是 Image 26935 排序筛选；er2 分为 PDF 23439 几何 getter 与父组件 32146 删除状态生产器，严格区分。
- 已从公开原始 app.asar 精确提取 dist/preload/index.js（22688 bytes），逐字节 SHA-256 与 asar 内完整性字段相等；203–215 行直接桥接 anbao.feedback.addBatch(records) 到 feedback:add-batch，无额外过滤/捕获。该静态桥接边已补读，仍不是授权竞品运行验证。

完整逐范围 SHA-256 见同名 JSON。

## 后续真实验收更新

新两例 Edge 已全部通过并自然退出（2 PASS，5.9 分钟），包含 Word 两资源直达/同文保存和 PNG 识别实体八手柄保存/清除。长耗时来自 Edge crashpad/updater 继承 stderr，诊断文件保留；B/root 均确认未杀第二轮进程。portable geometry 普通 12 链与独立 legacy 正例/3篡改反例均通过。JSON与本节记录完整最终证据。
