import { test, expect } from "vitest";
import { exportDictionary, importDictionary } from "../packages/core/dictionary-workbook.ts";
import { readZip, writeZip } from "../packages/core/office-zip.ts";
import { detect } from "../packages/core/redaction.ts";
import { officeFixture } from "./office-fixtures.ts";
import type { DictionaryEntry } from "../packages/contracts/index.ts";

test("black/white list workbooks roundtrip literal formula-like names and empty templates without macros", async () => {
  const entries: DictionaryEntry[] = [{ value: "甲乙公司", kind: "机构" }, { value: "=HYPERLINK(\"https://example.invalid\")", kind: "自定义", action: "exclude" }, { value: "O'Reilly & <甲>", kind: "姓名", action: "exclude" }];
  const bytes = await exportDictionary(entries);
  expect(await importDictionary(bytes)).toEqual(entries);
  const parts = await readZip(bytes);
  expect(parts.get("xl/worksheets/sheet1.xml")!.toString()).not.toContain("<f>");
  expect(await importDictionary(await exportDictionary([]))).toEqual([]);
  await expect(exportDictionary([entries[0], entries[0]])).rejects.toThrow("DUPLICATE_DICTIONARY_ENTRY");
  await expect(importDictionary(await officeFixture("xlsx"))).rejects.toThrow("INVALID_DICTIONARY_TABLE");
  parts.set("xl/vbaProject.bin", Buffer.from("unsupported"));
  await expect(importDictionary(await writeZip(parts))).rejects.toThrow("COVERAGE_INCOMPLETE");
  await expect(importDictionary(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow("DICTIONARY_FILE_LIMIT");
});
test("whitelist hints do not remove candidates, auto-approve them or override rules", () => {
  const marks = detect("联系13800138000", [], [{ value: "13800138000", kind: "手机号", action: "exclude" }]);
  expect(marks).toHaveLength(1); expect(marks[0].decision).toBe("pending");
  expect(marks[0].sources?.map(s => s.code)).toEqual(["cn-mobile", "project-whitelist"]);
});
test("expanded identifier kinds roundtrip through the existing black/white workbook contract", async () => {
  const entries: DictionaryEntry[] = [
    { value: "A123456789", kind: "证券/资金账号" }, { value: "粤BA1234", kind: "车牌号" }, { value: "wxid_example", kind: "微信号" }, { value: "https://example.invalid/private", kind: "网址" },
    { value: "CN202610123456.7", kind: "专利号" }, { value: "粤ICP备2026123456号-1", kind: "备案号", action: "exclude" }, { value: "合成许可证123456", kind: "证照/许可证号" },
  ];
  expect(await importDictionary(await exportDictionary(entries))).toEqual(entries);
});
