import {describe,it,expect} from 'vitest';
import {detectComplete,filterCompleteNer} from '../packages/core/recognition-pipeline.ts';
describe('complete recognition pipeline',()=>{
  it('keeps source rules and reference scenarios together with pending decisions',()=>{
    const text='联系电话：13800138000\nEIN: 12-3456789\n合同金额：人民币10000元';
    const {marks}=detectComplete(text,[{kind:'text',start:0,end:text.length}]);
    expect(marks.some(m=>m.kind==='手机号'&&m.sources?.some(s=>s.code==='cn-mobile'))).toBe(true);
    expect(marks.some(m=>m.kind==='雇主识别号')).toBe(true);
    expect(marks.some(m=>m.kind==='金额')).toBe(true);
    expect(marks.every(m=>m.decision==='pending')).toBe(true);
  });
  it('does not create a cross-cell field match and retains original UTF16 positions',()=>{
    const text='手机号：\n13800138000',start=text.indexOf('138');
    const {marks}=detectComplete(text,[{kind:'cell',start:0,end:4,row:1,column:1},{kind:'cell',start,end:text.length,row:2,column:1}]);
    expect(marks.filter(m=>m.kind==='手机号').every(m=>m.start===start&&m.end===text.length)).toBe(true);
    expect(marks.every(m=>m.start>=start||m.end<=4)).toBe(true);
  });
  it('filters NER noise without changing retained candidate provenance',()=>{
    const text='法律意见书 张三';
    const marks=filterCompleteNer(text,[{start:0,end:5,kind:'姓名',decision:'pending',sources:[{layer:'ner',code:'model',score:.9}]},{start:6,end:8,kind:'姓名',decision:'pending',sources:[{layer:'ner',code:'model',score:.9}]}]);
    expect(marks.map(m=>text.slice(m.start,m.end))).toEqual(['张三']);
    expect(marks[0].sources?.[0].code).toBe('model');
  });
  it('does not turn a dictionary value across two independent objects into a usable mark',()=>{
    const text='张三\n李四',anchors=[{kind:'cell' as const,start:0,end:2,row:1,column:1},{kind:'cell' as const,start:3,end:5,row:1,column:2}];
    const result=detectComplete(text,anchors,[{value:text,kind:'姓名'}]);
    expect(result.marks.some(m=>m.start===0&&m.end===5)).toBe(false);
    const paragraph=detectComplete(text,[{kind:'object',start:0,end:5,part:'word/document.xml',object:'paragraph:1'}],[{value:text,kind:'姓名'}]);
    expect(paragraph.marks.some(m=>m.start===0&&m.end===5&&m.sources?.some(s=>s.code==='project-dictionary'))).toBe(true);
  });
});
