# 0.5.9 动态 IPC 桥调用范围核验

核验日期：2026-10-13。只读取公开发布包与静态语法树，不执行竞品代码、不绕过激活。

## 结论与闭合口径

先前“2 处动态 invoke 范围待核”的**当前发布包调用点调查已完成**。完整 ASAR dist 清单为 16 文件（15 个 JavaScript 和 1 个 HTML）：渲染主包、延迟加载块、PDF worker、OpenJPEG fallback、preload、主进程及全部 7 个主进程 chunk/2 个 worker。逐文件从 ASAR 读取并和提取副本比对 SHA-256；此前未提取的 OpenJPEG fallback 已补齐。

还对 ASAR 中其余 8,563 个 JavaScript 文件（包括 unpacked 文件）逐个读取、哈希和桥接关键词筛查，没有新增 ipcMain、ipcRenderer、window/globalThis/self.ipc 或 electron 的显式引用。这个补充检查是词法筛查，不冒充第三方/native 库的完整形式化可达性证明。

| 桥 | 原始 preload 定位 | 当前 renderer 调用点 | 不同通道 | 结果 |
|---|---|---:|---:|---|
| `window.ipc.invoke` | `dist/preload/index.js:308` | 23 | 10 | 全部通道为字面字符串；5 个 fallback 局部别名已按声明符号追踪，引用均为立即 invoke |
| `window.electron.ipcRenderer.invoke` | `dist/preload/index.js:314` | 16 | 4 | 全部通道为字面字符串；没有动态计算桥属性或桥对象传递到未知函数 |
| 合计 | 两处通用转发器 | 39 | 14 | 14 个通道均有 `ipcMain.handle` 注册，未发现当前包的非字面通道调用 |

**这是当前发布快照的静态调用集闭合。桥本身仍接受任意 channel 与任意 ...args，没有白名单，也没有参数 Schema。** 不应把 14 个已见通道写成桥的允许列表，更不能声称未来版本、运行时注入/外部代码或任意输入已被证明受限。两项调查可标记 `closed-current-published-lexical-callset`；运行时输入边界应保留 `unbounded-by-bridge-design`。竞品运行等级继续 R0。

## 通道与参数

| 桥 | 通道 | 参数来源/用途 |
|---|---|---|
| ipc | `window:is-maximized` | 无参数；标题栏/不同审查视图查询最大化状态 |
| ipc | `window:minimize`、`window:toggle-maximize`、`window:close` | 无参数；标题栏操作 |
| ipc | `license:get-status`、`license:get-machine-id` | 无参数；授权页、初始化、路由保护、菜单及导出客户名读取 |
| ipc | `license:activate` | 授权码输入框值 trim；仅记录静态调用，没有执行激活 |
| ipc | `app:get-env` | 无参数；授权页读取版本与环境 |
| ipc | `app:reset-docx-safe-mode` | 无参数；恢复 DOCX 格式预览 |
| ipc | `log:renderer-error` | 7 处传入错误字符串；DOCX 预览、挂载、Vue/window 错误处理 |
| electron.ipcRenderer | `get-pdfjs-worker-path` | 无参数；PDF worker 初始化（2 处） |
| electron.ipcRenderer | `image-review:batch-search` | fileName、ocrCacheKey、searchText；部分带 pageIndex；图像/PDF、跨材料查漏及候选定位 |
| electron.ipcRenderer | `image-review:ocr-region` | fileName、ocrCacheKey、pageNumber 和 canvas 坐标/尺寸；框选取字 |
| electron.ipcRenderer | `image-review:get-ocr-page` | fileName、ocrCacheKey、pageNumber、totalPages、pageNumbers、pdfBuffer；OCR 页恢复 |

JSON 保存全部 39 调用点的未截断实参表达式、源码 UTF-16 start/end、行列、片段 SHA-256；每个通道附主进程注册证据。不是只对方法名 grep 后给出“完成”。主进程动态注册 wrapper 也按声明符号调查：22 次引用全部为字面通道直接调用，未见作为参数传递、赋值别名或非字面调用。

动态加载点另列 `codeLoadingSites`：包括 DOCX 延迟块、PDF.js worker/module import、开发模式 loadURL 与发布模式 loadFile。当前 dist 源码全部解析；外部/未来加载代码不纳入“任意运行时输入已证明”的结论。

## 发现的日志传输差异

`log:renderer-error` 的 7 个 **renderer invoke** 与主进程 `handle` 匹配；不能把它误报成完全没有接收端。

但 preload 初始化 catch（320 行）及 `uncaughtException`（331 行）另外用 **send** 上报同名通道，而本发布包只有 `ipcMain.handle`，没有同名 `ipcMain.on/once`。这两条异常上报链不能由 handle 接收，属于竞品静态传输不匹配。报告 `preloadSendDispatch` 单独保留这两处和所有实际注册，不能把 invoke 成功配对推广为 send 配对。

## 与 115 项 UI 调查交叉核验

A 组 58 项、B 组 57 项的固定 ID 并集为 115；其中 71 项被归类为本发布包无前端调用。将这 71 项通道与独立枚举的全部 14 个动态桥字面通道求交，结果为空。没有发现“专用 preload 方法未用，但实际通过通用 invoke 调用”而漏算的条目。

“无发布包前端调用”表示本次静态调用点调查的结果；由于通用桥无白名单，它不等于这些已注册 handler 在所有可能运行状态下均不可调用。

## 可重跑核验

在项目目录运行：

```sh
node 文档/逆向台账/contracts/verify-dynamic-closure.mjs --check
python3 文档/逆向台账/contracts/verify-dynamic-ui-cross-check.py
```

第一条重新读取 ASAR、核对全部 dist 成员、对提取副本做字节哈希比对、重建 AST/别名/通道/注册/参数/范围/其他依赖词法筛查结果，并和 JSON 全量规范输出比较；缺文件、通道删除、调用点删除、范围变造和无界说明篡改都会使 `--check` 失败。它不会写回报告。无 `--check` 时重建 JSON；新增未知别名逃逸/计算属性/非字面通道会先失败，须重新调查。

第二条只读交叉检查两组 115 项与动态桥通道集；检测到“无入口”结论与已知 invoke 相矛盾则失败。

## 规则与策略目前仍不能声明完全等价

动态入口闭合不等于规则、模型或整体产品实现等价。以下差异有当前源码/契约依据，不能被本轮调查标记为已完成：

| 项目 | 已知竞品行为与我方现状 | 具体来源 |
|---|---|---|
| 检测算法完整闭合 | `su` 的识别策略、NER/OCR Python 处理、Markdown adapters，以及 Wd/lm 规则冲突、去重与 offset 修正尚未逐层闭合。当前调查没有补完这些算法 | `manual-workflow-contracts.md` 259 行 |
| NER 等价 | 我方使用独立公开 `shibing624/bertspan4ner-base-chinese`，128 token 窗口、94 步长、姓名/地址/机构三类；未证明与竞品模型权重、标签、阈值、分窗和融合逻辑逐项一致 | `packages/core/ner.ts` 28–71 行；`scripts/ner-runtime-lock.json`；上述 detect-only 契约 |
| 规则集库与旧规则迁移 | 竞品有独立命名规则集、active ID、revision 冲突、readonly、forceDetect/forceSkip、迁移备份及历史白名单反向语义；我方为项目词表版本与重新识别，尚无全套规则集文件/迁移兼容证据 | `manual-collaboration-contracts.md` 56–75 行；`脱敏猫REA分析与开发对齐.md` 120、126 行 |
| 学习规则 | 竞品 6 个学习/回滚 handler 已为常量/停用实现，只有 get-stats 进入学习 chunk；反馈记录没有调用 updateMemoryFromFeedback。不能把类中有算法写成实际自动学习已启用，更不能要求我方凭空“对齐自动学习能力” | `manual-collaboration-contracts.md` 29–30、101–105 行 |
| 假名和脱敏策略 | 我方已有类型占位、稳定项目假名、保留首尾的遮盖、自定义文字；像素输出不支持假名/部分遮盖，DOCX/PDF 自动还原、`.tmm/.lpm` 互通没有实现 | `packages/core/redaction.ts` 151–175 行；`脱敏猫REA分析与开发对齐.md` 226–227 行 |
| 识别材料路由/视觉策略 | 自动材料路由建议、自动人脸/印章候选、独立印章暂停尚未对齐；DOCX 图片单独增量重跑尚未对齐 | `脱敏猫REA分析与开发对齐.md` 118–121、221、223 行 |
| OCR 纠错 | 我方未实现保留原 OCR/改字版本/作用域并使旧复核失效的完整改字版本链 | `脱敏猫REA分析与开发对齐.md` 225 行 |
| 业务运行对照 | 没有竞品许可证，检测/导出处理链不能做正版逐项运行对照；我方功能测试不能替代竞品运行验收或准确率金标准 | 已有运行证据/台账 R0；本 JSON 明确 static-only |

这些条目是已知未完成范围，不是“全部前端、接口、规则已经百分之百复刻”的证明。
