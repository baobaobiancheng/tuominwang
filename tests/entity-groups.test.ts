import { expect, test } from "vitest";
import { buildEntityGroups, groupActionRequest } from "../apps/web/entity-groups.tsx";
import type { Mark } from "../packages/contracts/index.ts";
import {applyReplacementPolicies} from '../packages/core/replacement-policies.ts';

function mark(start: number, end: number, extra: Partial<Mark> = {}): Mark {
  return { start, end, kind: "姓名", decision: "pending", ...extra };
}

test("exact same values across text windows and more than 50 groups retain every occurrence", () => {
  const marks = [mark(0, 2), ...Array.from({ length: 60 }, (_, i) => mark(100 + i * 2, 102 + i * 2)), mark(40000, 40002)];
  const markTexts = Object.fromEntries(marks.map((item, index) => [`${item.start}:${item.end}`, index === 0 || index === marks.length - 1 ? "张三" : String(index).padStart(2, "0")]));
  const groups = buildEntityGroups({ text: "张三", textOffset: 40000, markTexts }, marks);
  expect(groups).toHaveLength(61);
  expect(groups.find(group => group.value === "张三")?.indices).toEqual([0, 61]);
  expect(groups.reduce((sum, group) => sum + group.indices.length, 0)).toBe(62);
  expect(buildEntityGroups({ text: "张三", markTexts }, marks).map(group => group.id)).toEqual(groups.map(group => group.id));
});

test("truncated long values with the same prefix never merge or match a short exact value", () => {
  const prefix = "甲".repeat(120);
  const marks = [mark(0, 121), mark(200, 321), mark(400, 520), mark(600, 721)];
  const groups = buildEntityGroups({ text: prefix + "乙", markTexts: { "200:321": prefix + "…", "400:520": prefix, "600:721": prefix } }, marks);
  expect(groups).toHaveLength(4);
  expect(groups.map(group => group.exact)).toEqual([false, false, true, false]);
  expect(groups.map(group => group.indices)).toEqual([[0], [1], [2], [3]]);
  expect(buildEntityGroups({ text: "甲".repeat(4002) }, [mark(0, 2001), mark(2001, 4002)]).every(group => !group.exact)).toBe(true);
});

test("different kinds and whitespace remain distinct while UTF-16 spans group exactly", () => {
  const groups = buildEntityGroups({ text: "😀甲😀甲 甲 甲" }, [mark(0, 3), mark(3, 6), mark(0, 3, { kind: "自定义" }), mark(6, 8), mark(9, 10)]);
  expect(groups).toHaveLength(4);
  expect(groups.find(group => group.value === "😀甲" && group.kind === "姓名")?.indices).toEqual([0, 1]);
  expect(groups.filter(group => group.value === "😀甲")).toHaveLength(2);
  expect(groups.filter(group => group.value === " 甲" || group.value === "甲")).toHaveLength(2);
  const cached = buildEntityGroups({ text: "", textOffset: 100, markTexts: { "0:3": "😀甲", "3:6": "😀甲" } }, [mark(0, 3), mark(3, 6)]);
  expect(cached).toHaveLength(1);
});

test("mixed decisions and replacement policies are reported without changing marks", () => {
  const marks = [mark(0, 1), mark(1, 2, { decision: "ignore", replacement: { mode: "type" } }), mark(2, 3, { decision: "redact", replacement: { mode: "custom", value: "客户甲" } })];
  const original = structuredClone(marks);
  const [group] = buildEntityGroups({ text: "甲甲甲" }, marks);
  expect(group.counts).toEqual({ pending: 1, redact: 1, ignore: 1 });
  expect(group.mixedDecisions).toBe(true);
  expect(group.mixedReplacements).toBe(true);
  expect(marks).toEqual(original);
  expect(buildEntityGroups({ text: "甲甲" }, marks.slice(0, 2))[0].mixedReplacements).toBe(false);
});

test("missing previews and overlong fully visible values stay independent", () => {
  const marks = [mark(40000, 40001), mark(40002, 40003)];
  const groups = buildEntityGroups({ text: "" }, marks);
  expect(groups).toHaveLength(2);
  expect(groups.every(group => !group.exact)).toBe(true);
  const long = "甲".repeat(2001);
  expect(buildEntityGroups({ text: long + long }, [mark(0, 2001), mark(2001, 4002)])).toHaveLength(2);
});


test("long-value selection stays on its original position when the text window moves", () => {
  const value = "甲".repeat(121);
  const marks = [mark(0, 121), mark(40000, 40121)];
  const markTexts = { "0:121": value.slice(0, 120) + "…", "40000:40121": value.slice(0, 120) + "…" };
  const before = buildEntityGroups({ text: value, textOffset: 0, markTexts }, marks);
  const after = buildEntityGroups({ text: value, textOffset: 40000, markTexts }, marks);
  expect(after.map(group => group.id)).toEqual(before.map(group => group.id));
  expect(after.find(group => group.id === before[0].id)?.indices).toEqual([0]);
});


test("distinct full, clear and reference variants report mixed group policies",()=>{for(const pair of [[{mode:'type'},{mode:'full'}],[{mode:'clear'},{mode:'full'}],[{mode:'reference-mask',variant:'default'},{mode:'reference-mask',variant:'detected'}]] as const){const marks=[mark(0,1,{replacement:pair[0]}),mark(1,2,{replacement:pair[1]})];expect(buildEntityGroups({text:'甲甲'},marks)[0].mixedReplacements).toBe(true);}});

test('corrected semantic values group by their own exact slot, without changing the canonical original or merging a duplicate sibling',()=>{const marks=[mark(0,2),mark(0,2)],doc={text:'张三',entityCorrections:{version:1 as const,sourceHash:'a'.repeat(64),contentHash:'b'.repeat(64),capturedRevision:0,entries:[{id:'synthetic-correction',markIndex:0,start:0,end:2,kind:'姓名' as const,recognizedText:'张三',correctedText:'张四',originalType:'person',correctedType:'person',source:'highlight-context-menu' as const,correctedAt:'2026-10-15T00:00:00.000Z',actorId:'server-actor',page:0,lineIndex:0,occurrence:0,boxes:[{x:0,y:0,width:20,height:10}]}]}};const groups=buildEntityGroups(doc,marks);expect(groups.map(g=>({value:g.value,indices:g.indices}))).toEqual([{value:'张四',indices:[0]},{value:'张三',indices:[1]}]);expect(doc.text).toBe('张三');expect(marks).toEqual([mark(0,2),mark(0,2)]);});

test('corrected sibling at one span receives only its own per-key action',()=>{
  const marks=[mark(0,2),mark(0,2)],doc={text:'张三',entityCorrections:{version:1 as const,sourceHash:'a'.repeat(64),contentHash:'b'.repeat(64),capturedRevision:0,entries:[{id:'synthetic-correction',markIndex:0,start:0,end:2,kind:'姓名' as const,recognizedText:'张三',correctedText:'张四',originalType:'person',correctedType:'person',source:'highlight-context-menu' as const,correctedAt:'2026-10-15T00:00:00.000Z',actorId:'server-actor',page:0,lineIndex:0,occurrence:0,boxes:[{x:0,y:0,width:20,height:10}]}]}};
  const target=buildEntityGroups(doc,marks).find(group=>group.value==='张四')!;
  const request=groupActionRequest(target,marks,'full_star',false);
  const result=applyReplacementPolicies(doc.text,marks,request,[],{semanticValue:(_,index)=>index===0?'张四':'张三'});
  expect(result.marks[0].replacement).toEqual({mode:'custom',value:'**'});
  expect(result.marks[1].replacement).toBeUndefined();
  expect(()=>applyReplacementPolicies(doc.text,marks,{...request,values:request.values.map(({semanticValue:_ignored,...value})=>value)},[],{semanticValue:(_,index)=>index===0?'张四':'张三'})).toThrow('POLICY_VALUE_CONFLICT');
  expect(()=>applyReplacementPolicies(doc.text,marks,{...request,values:request.values.map(value=>({...value,semanticValue:'伪造值'}))},[],{semanticValue:(_,index)=>index===0?'张四':'张三'})).toThrow('POLICY_TARGET_NOT_FOUND');
});

test('source per-key action addresses an exact identity and all equal occurrences without touching sibling keys',()=>{
  const marks=[mark(0,2),mark(2,4),mark(4,6),mark(6,8,{kind:'机构'})];
  const doc={text:'张三张三张四张三'};
  const group=buildEntityGroups(doc,marks).find(item=>item.value==='张三'&&item.kind==='姓名')!;
  expect(group.indices).toEqual([0,1]);
  const request=groupActionRequest(group,marks,'partial_star',false);
  expect(request.values).toEqual([{start:0,end:2,kind:'姓名',semanticValue:'张三',rule:{mode:'custom',value:'张*'}}]);
  expect(request.keepExplicit).toBe(false);
  expect(()=>groupActionRequest(group,marks,'mask',false)).toThrow('POLICY_ACTION_UNAVAILABLE');
  expect(groupActionRequest(group,marks,'mask',true).values[0].rule).toEqual({mode:'clear'});
  expect(groupActionRequest(group,marks,'pseudonym',false).values[0].rule).toEqual({mode:'alias'});
  expect(groupActionRequest(group,marks,'full_star',false).values[0].rule).toEqual({mode:'full'});
  const preview=buildEntityGroups({text:'',textOffset:100,markTexts:{'0:2':'张...'}},[mark(0,2)])[0];
  expect(()=>groupActionRequest(preview,[mark(0,2)],'partial_star',false)).toThrow('POLICY_EXACT_VALUE_REQUIRED');
});
