# ITER024 交叉只读审查

**No findings**：本次没有新增满足复现条件的权限、源绑定或配置漏消费缺陷。

## 范围

- mcp：latest list-pending read-only SQL/permissions/humanTask; consume fullTask/consumedOpen, same project/authorization/epoch UI; protocol session and own cookie logout
- unlock：known-password immutable original, remove-security output, empty-password reload all page geometry/text, attachments/scripts count, source/derived hash, finally cleanup
- vml：group coordinates, crop/rotate/flip, controlled textbox DOM, numeric styles, squarewrap/fit; private PNG asset dedup; no untrusted SVG/HTML insertion
- runtime：worker and OCR share existing NER context callback; authenticated native/OCR glyph and table cells; compatibility sourcecaller and fragment gates; source-provenance masks preview/export

## 实证

- pnpm exec vitest run tests/reference-table.test.ts tests/reference-table-adapter.test.ts tests/reference-party.test.ts tests/reference-fragment.test.ts tests/reference-visual-table.test.ts tests/reference-detected-mask.test.ts tests/document-unlock.test.ts tests/docx-vml-preview.test.ts：8 files39tests pass; source mask fixture expanded after this and separate4mask tests rerun
- pnpm exec tsx tests/run-isolated.ts integration tests/contextual-recognition.integration.ts：2testsPASS; actual DOCX/MD/CSV upload+worker and configuration legacy/fragment enabled→modern disabled readback,8.49sec
- pnpm exec tsc --noEmit：PASS at reviewed snapshot

## 关闭与撤回

- OOXML empty vMerge owner label and nested tree unit were independently reproed and fixed by author A, review B proof iteration022/table-xml-independent-probes.json
- Withdrawn claim jl skipped judgment: source jl8751 does not consume document type; not a valid defect
- Source USCC/tax same-span winner differs from additive own pending evidence; not an undisclosed selective omission

## 验证边界

- This read-only review does not independently rerun the Edge VML screenshot or latest C full MCP stdio test; those are separate author/parent gates
- Licensed competitor full processing runtime not executed (R0)
- PDF unlock verifies full page text/geometry and attachment/script counts; no claim of original-byte identity for the derived decrypted PDF
- Source title/freeform formulas/gradients/unknown VML objects have explicit preview warnings; this report does not assert arbitrary Word pixel-equivalent layout
