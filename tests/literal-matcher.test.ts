import {it,expect} from 'vitest';
import {literalMatcher} from '../packages/core/literal-matcher.ts';
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
it('compressed edges preserve insertion splits, prefix terminals, duplicates, Unicode and leftmost-longest one-pass output',()=>{
 const entries=[['abcdef','甲'],['abcxyz','乙'],['abc','丙'],['ab','丁'],['abcdefghi','戊'],['abc','新丙'],['😀','笑'],['😀A','长笑'],['[x]','A']]as const,map=new Map<string,string>(entries),text='zabcdefghi abcxyz abc ab 😀A😀 [x]';
 const expected=text.replace(new RegExp([...map.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|'),'gu'),m=>map.get(m)!);expect(literalMatcher(entries).replace(text,m=>m.value)).toBe(expected);expect([...literalMatcher(entries).matches(text)].map(m=>m.text)).toEqual(['abcdefghi','abcxyz','abc','ab','😀A','😀','[x]']);
});
it('fixed-seed dictionaries agree with the legacy small literal oracle under every insertion order, without rescanning returned aliases',()=>{
 let state=0xdecafbad;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},alphabet=['A','B','C','-','&','[',']','😀'];
 for(let trial=0;trial<100;trial++){const entries=Array.from({length:32},(_,i)=>[Array.from({length:1+next()%8},()=>alphabet[next()%alphabet.length]).join(''),'R'+i]as const),map=new Map<string,string>(entries),text=Array.from({length:150},()=>alphabet[next()%alphabet.length]).join(''),expected=[...text.matchAll(new RegExp([...map.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|'),'gu'))].map(m=>({index:m.index,text:m[0],value:map.get(m[0])!}));expect([...literalMatcher(entries).matches(text)]).toEqual(expected);}
 const matcher=literalMatcher([['AB','A'],['A','B']]);expect(matcher.replace('AB A',m=>m.value)).toBe('A B');
});
