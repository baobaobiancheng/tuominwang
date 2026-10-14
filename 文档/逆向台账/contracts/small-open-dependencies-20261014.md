# 可读依赖补读（2026-10-14）

全部保持 **S2/R0**。本报告记录五组具体依赖，不能据此宣布端点完整闭合。

## SD01 校正规则出现位置及旧实体复用

- Id 在 canonical text 上逐个查找非重叠精确匹配；仅涉及一个唯一页面时返回 pageNumber。_d 优先切 charBoxes 后取联合框，否则返回 anchors；单框局部命中按 UTF16 长度比例裁框，最小宽0.5。它不是字符排版测量。
- Sd 以 indexOf 和 max(1, pattern.length) 扫描非重叠位置。Ed 排除已使用实体，依次选精确 span/兼容页面、同页唯一候选、几何中心曼哈顿距离最近、首个候选、无页候选；没有歧义拒绝步骤。
- Md 把 confidence 设为1，并写 workspace correction 来源。已有合法单框及已有非空多框数组优先于新 occurrence 几何；更新 position 并不必然更新旧框。多框数组在此未逐项验证。
- Wd 校正分支：PDF/mixed/scanned_pdf 只保留可定位页面的 Id 结果；无结果时仅升级已有匹配的标记。每个 occurrence 复用一个未使用旧实体，或新增实体，初始 masked 长度按 JS UTF16 pattern.length。

剩余边界：charBoxes 上游索引单位、真实复杂版式定位与多处同文匹配质量需要运行核验；本节不证明所有规则优先级或全文几何准确性。

证据：.data/research/lawbot-2026-10-13/readable/main.js:14069–14158, .data/research/lawbot-2026-10-13/readable/main.js:14460–14504。

## SD02 DOCX Python 发现及依赖探测

- Iu 开发环境按配置/本地虚拟环境候选选择，打包环境使用配置或捆绑路径。候选规格按 command/baseArgs 去重；Windows 才追加 py -3 与 py。临时目录为 userData/docx-cache 或安全临时目录。
- getPythonSpec 对已存在的路径型命令直接返回，不证明该文件可执行；其他命令用8秒探测。getPythonSpecForDocx 对候选逐个执行 import docx,lxml，配置10秒 timeout；close 时 exit0 且 stdout.trim().endsWith("ok") 才通过，不保证10秒硬截止，并缓存 Promise 结果，包括 null。这里仅分析源码，未运行这些探测。
- checkDependency 区分 python-not-found、python-docx-missing 和 python-error；缺 lxml 不进入 docx 专用错误。诊断优先 stderr，否则 stdout，截最后800字符。
- 环境继承进程环境并设置 UTF8、禁止用户 site 与字节码；特定 Mac 捆绑 Python 设置 PYTHONHOME，额外环境最后覆盖。Mac uu 包装用 awake task timer 到时 kill，close/error 清计时器；该包装没有附加 SIGKILL 升级。
- OCR模型目录检查只检查推理配置文件存在且非空、参数文件至少1MiB，并要求一个det与一个rec；此处不是哈希或推理可用性验证。

剩余边界：实际 Python/lxml/docx 环境、平台命令输出及转换质量未运行验证；第三方库语义不因探测包装已读而闭合。

证据：.data/research/lawbot-2026-10-13/readable/main.js:12932–13142。

## SD03 系统硬件提取包装与缓存

- Windows 固定 WMI/PowerShell 查询封装使用3秒或5秒超时；CPU/磁盘 wmic 的 PowerShell 回退只在异常时触发，空输出本身不会进入该回退。MAC选择要求非内部IPv4与非零MAC，优先常见接口名。
- zu 过滤默认/未知/OEM/全零全F等占位值；Windows 并行采集多项信息，MAC 单独存在不足以进入正常分支。当前组合标识不使用MAC，兼容别名会考虑旧标识。缺信息时走带告警的 fallback。
- Ku 可直接接受包含 machineId 的本地JSON缓存；Windows旧算法版本会触发重算，其他平台没有这条版本门槛。缓存命中不重新核验当前硬件，读取异常按无缓存处理。
- Mac ioreg 异常时才尝试 system_profiler；取不到UUID时按MAC或固定占位退化。最终缓存包含硬件摘要字段及时间戳，写失败吞掉，仍返回计算结果。这里只描述数据与失败行为，不执行系统命令，不生成授权凭证。

剩余边界：真实 Windows/macOS 输出、硬件变化稳定性、服务端设备绑定及许可证运行行为未核验；私有服务实现不在发布包内。

证据：.data/research/lawbot-2026-10-13/readable/main.js:13486–13671。

## SD04 Markdown 结果日志与统计聚合

- Cp 只追加选择后的结果摘要到 markdown-export.log；输出哈希只写12字符前缀；cancelled 覆盖状态，manual-draft 是专门事件。异常吞掉，不向调用者提供持久化确认。$p/source-apply 与 Lp/docx-export 各自记录选择后的字段。
- 统计读取日志最后 2097152 字节（2MiB），截断时无条件丢弃首行并标记 truncated，截点恰在行首也会丢掉该完整行；文件不存在返回空统计，其余读取错误转为用户错误，finally关闭文件。
- Zf 忽略坏JSON/非对象、sourceKind=markdown；只汇总 export-outcome/manual-draft，source-apply不计入旧事件数。diagnosticId 必须匹配8–16字符格式，按 event:diagnosticId 去重。seen 在 status 验证前写入，首个无效状态可遮蔽后续同键记录。
- success/degraded 分开计数，存在非空候选失败数组才增加 recovered；manual-draft 单独计数。failed 按允许的 sourceKind 和 MD-E三位数字聚合，否则unknown，按次数降序/来源排序。保存草稿成功后记录 manual-draft，日志失败不阻止保存成功。

剩余边界：日志不构成完整审计或导出安全证明；实际落盘、截断编码和并发追加未运行验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:15528–15559, .data/research/lawbot-2026-10-13/readable/main.js:16268–16295, .data/research/lawbot-2026-10-13/readable/main.js:17105–17137。

## SD05 工作区旧版子结构校验

- Wm/Hm/Km 分别检查普通对象、有限数、字符串，有限数默认并非整数或正数；Ym bbox 只要求有限坐标/尺寸及可选页面有限，没有通用正尺寸或页面边界约束。
- 继承化名配置 schema1 限 entries 10万、reserved 20万；key要求含冒号且唯一，token非空，不在此证明 token 无碰撞。旧Office扩展/engine受枚举约束，normalizationVersion为正整数。
- OCR缓存 qm 验证页/行与bbox结构，charBoxes仅要求数组，未逐元素深验。PDF OCR进度 Jm 的页面数组需为范围内正整数但允许重复；complete 不强制完成数等于总页。重复图片组另有唯一组ID、至少两不同页面、代表页属于集合、正尺寸与框边界约束。
- Zm recognition 进度要求 processed非负整数、total为空或正整数且不小于processed；user-cancel不能同时complete，warning仅允许既定枚举。时间戳仅字符串，没有日期解析。
- Qm 的DOCX occurrence span只要求有限 start/end，不查顺序/整数/非负；PDF bboxes必须非空且含有限page；image用通用Ym。
- eg 旧版 review draft 验证开关、策略枚举、各格式的部分实体与viewport字段；entries只要求数组。PDF rotations只要求对象、manualOnlyRotationPages只要求数组；此处未验证内容。DOCX可选图片索引/尺寸大部分仅要求有限数，notes部分另要求非负整数。
- eg 有DOCX/PDF/image分支，其他kind抛错。这是旧版子结构校验边界，不能推出后续V2工作区不支持Markdown。

剩余边界：后续版本格式、导入调用上下文与第三方解压解析仍以 formats 专项为准；本节不作完整V1/V2/V3互操作或恶意归档测试结论。

证据：.data/research/lawbot-2026-10-13/readable/main.js:18974–19155。
