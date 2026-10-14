import {it,expect} from 'vitest';
import {checkKnownEntities} from '../packages/core/review-tools.ts';
it('cross document known seeds retain explicit exceptions and expose ambiguous same values',()=>{
  const text='张三张三张三',anchors=[{kind:'text' as const,start:0,end:6}];
  const result=checkKnownEntities(text,[{start:2,end:4,kind:'姓名',decision:'ignore'}],'txt',anchors,[{value:'张三',kind:'姓名'}]);
  expect(result.entities[0].matches.map(m=>m.status)).toEqual(['missing','retained','missing']);
  expect(result.additions.map(m=>m.decision)).toEqual(['pending','pending']);
  const ambiguous=checkKnownEntities(text,[],'txt',anchors,[{value:'张三',kind:'姓名'},{value:'张三',kind:'机构'}]);
  expect(ambiguous.additions).toEqual([]);expect(ambiguous.entities[0].ambiguous).toBe(true);
});
