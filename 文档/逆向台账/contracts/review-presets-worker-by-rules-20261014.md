# 预设／发布／OCR／映射导出交叉审查（文字规则代理）

No findings. 本次审查范围内此前可复现缺陷均已修复；OCR 自动 profile 的新增真实 API 回归仍由 root 执行，不能用我们的组合测试代替。

## 已关闭问题

- `PRESET-RULE-TYPE-ALIASES`：ruleKey now resolves name_cn/姓名 to the same actual kind; a contrary promotion yields conflicts rather than accepted, preserving both decisions for user handling.。状态：fixed and reverified。
- `PRESET-DUPLICATE-NAME-LIMIT`：200 UTF16 legal source names now reserve suffix budget without splitting surrogate pairs; profileSchema/checkedRuleset parse before INSERT. Reverified 200 Chinese characters and 100 emoji.。状态：fixed and reverified。
- `WORKER-ALIAS-PROJECT-LOCK`：Same real resolvePolicyMappings with two competing project FOR UPDATE transactions produced 姓名_000001 and 姓名_000002, count 2, no SQLSTATE23505; temporary isolated database dropped.。状态：fixed and independently reverified。
- `PROFILE-TYPE-ACTIONS-MODE`：full_star/default_star/custom_pseudonym ignore historical types; selective defaults alias, text mask full, PDF mask clear; explicit visual full_star remains full。状态：fixed and pure-function reverified。
- `MCP-MASK-EMPTY-MAPPING`：pnpm exec tsx tests/run-isolated.ts integration tests/mcp.integration.ts passed 1 full-chain test in 20.734 seconds; explicit type placeholder, public 【重要】, md-only TXT combined batches and noRestore revoked mapping permission cases all passed。状态：fixed and independently reverified in actual isolated MCP integration。
- `MCP-OUTPUT-FORMAT-DEFAULT`：pnpm exec tsx tests/run-isolated.ts integration tests/mcp.integration.ts passed 1 full-chain test in 20.734 seconds; explicit type placeholder, public 【重要】, md-only TXT combined batches and noRestore revoked mapping permission cases all passed。状态：fixed and independently reverified in actual isolated MCP integration。
- `MCP-SANITIZED-MAPPING-PERMISSION`：pnpm exec tsx tests/run-isolated.ts integration tests/mcp.integration.ts passed 1 full-chain test in 20.734 seconds; explicit type placeholder, public 【重要】, md-only TXT combined batches and noRestore revoked mapping permission cases all passed。状态：fixed and independently reverified in actual isolated MCP integration。
- `MAPPING-EXPORT-LPM-NAME`：safeExportName now accepts .lpm; actual plain and encrypted LPM exported and re-read for restoration。状态：fixed and actual isolated integration reverified。
- `OCR-SCREENSHOT-CONTEXT`：correctOcrText passes initial same image screenshot flag; timestamp receipt case without 微信号 produces receipt candidates after edit。状态：fixed and adapter independently reverified。
- `OCR-PROFILE-AFTER-CORRECTION`：apps/api/ocr.ts now resolves current profile under project→document exclusive locks, applies default/type replacement policies and permission-checked aliases, then finalizes source official-name/image-clear branches. Our adapter+pure composition test verifies default_star and pending; it does not claim automatic API policy application proof.。状态：static route fixed; composition test passed; new actual API automatic policy regression remains root-owned。

## 独立运行证据

- MCP 隔离数据库全链 1 测试通过，20.734 秒，涵盖普通【标签】、md-only TXT 和无还原权限交付。
- replacement-policies 隔离数据库 3 测试通过，27.280 秒，实际 LPM／加密 LPM 还原、XLSX、auth、CAS、Word 与签发 sidecar。
- source spatial adapter／OCR receipt 2 单元通过；profile default_star 显式组合验证保持 pending，不宣称它覆盖自动 API 接线。

## 仍需单独核验

- Root complete pnpm check, new OCR API automatic profile regression and final Edge deployment acceptance remain separate gates
- Licensed competitor processing chain remains unexecuted; static source oracle and our runtime acceptance do not establish binary interoperability
- Synthetic passing DOCX/PDF sidecars do not prove arbitrary real material OCR accuracy
