import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { defaultProfile, checkedRuleset, previewRuleImport, previewRulePromotion, importedEntries, exportRulesWorkbook, importRulesWorkbook, rulesetDictionary, presetNameWithSuffix, SOURCE_DEFAULT_ENTITY_TYPES, profileAllowsKind } from "../packages/core/presets.ts";
import { profileSchema, type RuleSet } from "../packages/contracts/presets.ts";

function ruleset(): RuleSet { const now = new Date().toISOString(); return { id: randomUUID(), schemaVersion: 1, name: "测试规则库", description: "", source: "user", readonly: false, applicability: { mode: "all", materialRouteKeys: [] }, createdAt: now, updatedAt: now, entries: [] }; }
const imported = (pattern: string, kind: "forceDetect" | "forceSkip" = "forceDetect", enabled = true) => ({ row: 2, pattern, entityType: "name_cn" as const, kind, enabled });
describe("full preset field and rules semantics", () => {
  it("retains all profile settings and independently validates visual vs text modes", () => {
    const p = defaultProfile(); expect(profileSchema.parse(p)).toEqual(p); expect(p.enabledEntityTypeIds).toEqual([...SOURCE_DEFAULT_ENTITY_TYPES]); expect(p.enabledEntityTypeIds).toHaveLength(19); expect(p.enabledEntityTypeIds).not.toContain("signature"); expect(profileSchema.parse({...p,enabledEntityTypeIds:[...p.enabledEntityTypeIds,"signature","tax_no"]}).enabledEntityTypeIds).toContain("signature");
    expect(profileSchema.safeParse({ ...p, pdf: { ...p.pdf, defaultMode: "full_star" } }).success).toBe(false);
    expect(profileSchema.safeParse({ ...p, enabledEntityTypeIds: [] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...p, enabledEntityTypeIds: ["name_cn", "name_cn"] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...p, readonly: false }).success).toBe(false);
  });
  it("keeps all recovered extension kinds under source default families and supports explicit extension-only settings", () => {
    const p=defaultProfile(); for(const kind of ["护照号","国际身份证号","社保号","税号","雇主识别号","公文编号"] as const)expect(profileAllowsKind(p,kind)).toBe(true);
    const other=profileSchema.parse({...p,enabledEntityTypeIds:["name_cn"]});for(const kind of ["护照号","国际身份证号","社保号","税号","雇主识别号","公文编号"] as const)expect(profileAllowsKind(other,kind)).toBe(false);
    expect(profileAllowsKind(profileSchema.parse({...p,enabledEntityTypeIds:["passport_no"]}),"护照号")).toBe(true);
  });
  it("normalizes whitespace, rejects same and opposite keys instead of silently dropping rules", () => {
    const r = ruleset(); r.entries = importedEntries([imported(" 张 三 "), imported("张  三")], "manual");
    expect(() => checkedRuleset(r)).toThrow("RULESET_DUPLICATE_ENTRY");
    r.entries[1].kind = "forceSkip"; expect(() => checkedRuleset(r)).toThrow("RULESET_ENTRY_CONFLICT");
    r.entries.pop(); expect(checkedRuleset(r).entries[0].normalizedPattern).toBe("张 三");
  });
  it("exposes import conflicts and file duplicates without writing the target", () => {
    const r = ruleset(); r.entries = importedEntries([imported("张三")], "manual");
    const before = JSON.stringify(r), p = previewRuleImport(r, [imported("张三", "forceSkip"), imported("李四"), imported("李四", "forceSkip")]);
    expect(p.conflicts[0].kind).toBe("opposite"); expect(p.cleanEntries).toHaveLength(1); expect(p.errors).toHaveLength(1); expect(JSON.stringify(r)).toBe(before);
    expect(previewRulePromotion(r, [imported("张三")]).duplicates).toHaveLength(1);
  });
  it("treats source IDs and display-kind aliases as the same rule for promotion conflicts", () => {
    const r = ruleset(); r.entries = importedEntries([imported("张三", "forceSkip")], "manual");
    const candidate = { ...imported("张三"), entityType: "姓名" as const };
    expect(previewRulePromotion(r, [candidate]).conflicts).toHaveLength(1);
    r.entries.push(...importedEntries([candidate], "promotedFromWorkspace"));
    expect(() => checkedRuleset(r)).toThrow("RULESET_ENTRY_CONFLICT");
  });
  it("bounds duplicate-name suffixes without splitting astral characters", () => {
    for (const name of ["甲".repeat(200), "😀".repeat(100)]) {
      const duplicated = presetNameWithSuffix(name, " 副本 2"); expect(duplicated.length).toBeLessThanOrEqual(200); expect(duplicated.isWellFormed()).toBe(true); expect(duplicated.endsWith(" 副本 2")).toBe(true);
    }
  });
  it("includes only enabled entries and preserves force-skip as whitelist evidence", () => {
    const r = ruleset(); r.entries = importedEntries([imported("张三"), imported("李四", "forceSkip"), imported("王五", "forceDetect", false)], "excelImport");
    expect(rulesetDictionary(r)).toEqual([{ value: "张三", kind: "姓名" }, { value: "李四", kind: "姓名", action: "exclude" }]);
  });
  it("roundtrips all XLSX fields including disabled state and malicious formula-looking literal strings", async () => {
    const r = ruleset(); r.entries = importedEntries([imported('=HYPERLINK("synthetic")', "forceDetect", false), imported("李四", "forceSkip")], "manual");
    const output = await exportRulesWorkbook(r), back = await importRulesWorkbook(output);
    expect(back.errors).toHaveLength(0); expect(back.imported.map(x => [x.pattern, x.entityType, x.kind, x.enabled])).toEqual(r.entries.map(x => [x.pattern, x.entityType, x.kind, x.enabled]));
  });
  it("template is a usable first-sheet import with genuine draft entries", async () => {
    const parsed = await importRulesWorkbook(await exportRulesWorkbook()); expect(parsed.errors).toHaveLength(0); expect(parsed.imported).toHaveLength(2);
    expect(parsed.imported[1].kind).toBe("forceSkip");
  });
});
