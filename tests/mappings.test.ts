import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { restoreText, validateMappingMarks, type Mapping } from "../packages/core/mappings.ts";
import { redact } from "../packages/core/redaction.ts";
import type { Mark } from "../packages/contracts/index.ts";
import policy from "../packages/core/export-policy.generated.js";

test("restoration policy exhaustively refuses missing rights, stale versions, unknown and ambiguous tokens", () => {
  for (const authorized of [false, true]) for (const current of [false, true]) for (const known of [false, true]) for (const unambiguous of [false, true]) expect(policy.restoreAllowed(authorized, current, known, unambiguous)).toBe(authorized && current && known && unambiguous);
});
test("stable mappings bind exact source, type, immutable id/version and token; same-name entities are not automatically merged", () => {
  const one: Mapping = { id: randomUUID(), version: 1, token: "【机构_000001】", value: "甲乙公司", kind: "机构" };
  const two = { ...one, id: randomUUID(), token: "【机构_000002】" };
  const text = "甲乙公司与甲乙公司", marks: Mark[] = [one, two].map((m, i) => ({ start: i * 5, end: i * 5 + 4, kind: "机构", decision: "redact", replacement: { mode: "alias", mappingId: m.id, version: 1, token: m.token } }));
  expect(() => validateMappingMarks(text, marks, [one, two])).not.toThrow();
  expect(redact(text, marks)).toBe("【机构_000001】与【机构_000002】");
  expect(restoreText(redact(text, marks), [one, two], true, true)).toBe(text);
  expect(restoreText('说明【重要】 '+one.token,[one],true,true)).toBe('说明【重要】 '+one.value);
  expect(()=>restoreText('说明【重要】 【未知_000099】 '+one.token,[one],true,true)).toThrow('UNKNOWN_ALIAS');
  expect(() => validateMappingMarks(text, marks, [one])).toThrow("MAPPING_MISMATCH");
  expect(() => validateMappingMarks(text, [{ ...marks[0], kind: "姓名" }], [one])).toThrow("MAPPING_MISMATCH");
  expect(() => validateMappingMarks("丙丁公司", [marks[0]], [one])).toThrow("MAPPING_MISMATCH");
  expect(() => restoreText(one.token, [one], false, true)).toThrow("MAPPING_ACCESS_DENIED");
  expect(() => restoreText(one.token, [one], true, false)).toThrow("VERSION_CONFLICT");
  expect(() => restoreText(one.token, [one, { ...two, token: one.token }], true, true)).toThrow("AMBIGUOUS_ALIAS");
  for (const input of ["【机构_000003】", "【机构_０００００１】", "[机构_000001]", "【机构_000001", "【手机号】", one.token + " [机构_000002]"]) expect(() => restoreText(input, [one], true, true)).toThrow("UNKNOWN_ALIAS");
  const nested = { ...one, value: two.token };
  expect(restoreText(one.token, [nested, two], true, true)).toBe(two.token);
});
test("new identifier kinds use unchanged v1 sensitive-item aliases and bind the original type", () => {
  const mapping: Mapping = { id: randomUUID(), version: 1, token: "【敏感项_000007】", value: "合成许可证123456", kind: "证照/许可证号" };
  const text = "证照号：" + mapping.value, mark: Mark = { start: 4, end: text.length, kind: mapping.kind, decision: "redact", replacement: { mode: "alias", mappingId: mapping.id, version: mapping.version, token: mapping.token } };
  expect(() => validateMappingMarks(text, [mark], [mapping])).not.toThrow();
  expect(restoreText(redact(text, [mark]), [mapping], true, true)).toBe(text);
  expect(() => validateMappingMarks(text, [{ ...mark, kind: "银行账号" }], [mapping])).toThrow("MAPPING_MISMATCH");
});

import {largePlainMappings} from './restoration-large-fixture.ts';
test('restores the full100000 diverse205-character valid aliases without native RegExp compilation, preserving gates and one pass',()=>{
 const{mappings:values,lastToken}=largePlainMappings(),mappings:Mapping[]=Object.entries(values).map(([token,value],i)=>({id:String(i),token,value,version:1,kind:'自定义'}));
 expect(restoreText(lastToken,mappings,true,true)).toBe('合成客户100000');expect(()=>restoreText(lastToken,mappings,false,true)).toThrow('MAPPING_ACCESS_DENIED');
 const one:Mapping={id:'a',token:'A',value:'AB',version:1,kind:'自定义'},two:Mapping={id:'b',token:'AB',value:'最长',version:1,kind:'自定义'};
 expect(restoreText('AB A',[one,two],true,true)).toBe('最长 AB');
});
