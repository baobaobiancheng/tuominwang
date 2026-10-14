import { test, expect } from "vitest";
import { parseFile, fileFormat, exportFile, verifyFile, validateFileMarks } from "../packages/core/files.ts";
import { detect } from "../packages/core/redaction.ts";

test("paths reject traversal and unsafe aliases", () => {
  expect(fileFormat("合同/附件.csv")).toBe("csv");
  for (const path of ["../x.txt", "/x.txt", "a//x.txt", "a\\x.txt", "C:x.txt", "a/./x.txt", "a./x.txt", "x.exe", "x.txt\0"]) expect(() => fileFormat(path)).toThrow();
});
test("UTF-8 originals parse without executing markdown or loading images", () => {
  expect(parseFile(Buffer.from("\ufeff联系13800138000"), "txt").text).toBe("联系13800138000");
  expect(() => parseFile(Buffer.from([0xff, 0xfe]), "txt")).toThrow("INVALID_ENCODING");
  expect(() => parseFile(Buffer.from("x\0y"), "txt")).toThrow("INVALID_ENCODING");
  expect(parseFile(Buffer.from("x".repeat(102401)), "txt").text.length).toBe(102401);
  expect(() => parseFile(Buffer.alloc(50 * 1024 * 1024 + 1, 120), "txt")).toThrow("FILE_SIZE_LIMIT");
  for (const source of ["![秘密](https://example.com/a.png)", "<script>alert(1)</script>", "![x][img]\n\n[img]: secret.png"]) expect(() => parseFile(Buffer.from(source), "md")).toThrow("UNSUPPORTED_MARKDOWN_OBJECT");
  const source = "# 联系\n[邮件](mailto:demo@example.com)\n```\n13800138000\n```";
  const parsed = parseFile(Buffer.from(source), "md");
  const marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const }));
  const output = exportFile(parsed.text, marks, "md", parsed.anchors);
  expect(output).toContain("# 联系");
  expect(output).not.toContain("demo@example.com");
  expect(() => verifyFile(parsed.text, marks, output, "md", parsed.anchors)).not.toThrow();
});
test("CSV cells keep quoted delimiters and line breaks, and escape formulas", () => {
  const parsed = parseFile(Buffer.from('姓名,电话,备注\r\n"张,三",13800138000,"第一行\n第二行"\r\n李四,13900139000,=1+1\r\n'), "csv");
  expect(parsed.anchors).toHaveLength(9);
  expect(parsed.coverage).toHaveLength(3);
  const marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const }));
  expect(parsed.anchors.find(a => a.start === marks[0].start)).toMatchObject({ row: 2, column: 2 });
  const output = exportFile(parsed.text, marks, "csv", parsed.anchors);
  expect(output).toContain('"张,三","【手机号】","第一行\n第二行"');
  expect(output).toContain("'=1+1");
  expect(() => verifyFile(parsed.text, marks, output, "csv", parsed.anchors)).not.toThrow();
  expect(() => verifyFile(parsed.text, marks, output.replace("【手机号】", "13800138000"), "csv", parsed.anchors)).toThrow();
  expect(() => validateFileMarks(parsed.text, [{ start: 0, end: 8, kind: "自定义", decision: "redact" }], "csv", parsed.anchors)).toThrow("CROSS_CELL_MARK");
  expect(() => parseFile(Buffer.from('a,b\n"unterminated'), "csv")).toThrow("INVALID_CSV");
});
test("unsupported binary containers fail closed", () => {
  for (const format of ["docx", "xlsx", "pdf", "png"] as const) expect(() => parseFile(Buffer.from("fake"), format)).toThrow("UNSUPPORTED_FORMAT");
});
