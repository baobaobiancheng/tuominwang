/** Exact non-overlapping, leftmost-longest matching over literal UTF-16 strings.
 * Compressed trie edges retain long aliases without compiling a giant RegExp
 * or allocating one JS object for each character of every dictionary entry. */
export type LiteralMatch<T> = { index: number; text: string; value: T };
type Edge<T> = { text: string; node: Node<T> };
type Node<T> = { edges: Map<string, Edge<T>>; terminal?: { value: T } };
const node = <T>(): Node<T> => ({ edges: new Map() });
export function literalMatcher<T>(entries: Iterable<readonly [string,T]>) {
  const root = node<T>();
  for (const [text,value] of entries) {
    if (!text.length) throw new Error('LITERAL_MATCH_EMPTY');
    let current=root,offset=0,inserted=false;
    while(offset<text.length){
      const key=text[offset],edge=current.edges.get(key);
      if(!edge){const leaf=node<T>();leaf.terminal={value};current.edges.set(key,{text:text.slice(offset),node:leaf});inserted=true;break;}
      let shared=0;while(shared<edge.text.length&&offset+shared<text.length&&edge.text[shared]===text[offset+shared])shared++;
      if(shared===edge.text.length){current=edge.node;offset+=shared;continue;}
      const branch=node<T>();branch.edges.set(edge.text[shared],{text:edge.text.slice(shared),node:edge.node});current.edges.set(key,{text:edge.text.slice(0,shared),node:branch});offset+=shared;
      if(offset===text.length)branch.terminal={value};else{const leaf=node<T>();leaf.terminal={value};branch.edges.set(text[offset],{text:text.slice(offset),node:leaf});}
      inserted=true;break;
    }
    // An existing edge may end at a new prefix or duplicate terminal.
    if(!inserted)current.terminal={value};
  }
  function* matches(text:string):Generator<LiteralMatch<T>>{
    for(let start=0;start<text.length;){
      let current=root,at=start,best:{end:number;value:T}|undefined;
      while(at<text.length){const edge=current.edges.get(text[at]);if(!edge||!text.startsWith(edge.text,at))break;at+=edge.text.length;current=edge.node;if(current.terminal)best={end:at,value:current.terminal.value};}
      if(best){yield{index:start,text:text.slice(start,best.end),value:best.value};start=best.end;}
      else start+=(text.codePointAt(start)??0)>0xffff?2:1;
    }
  }
  return {matches,replace(text:string,replacement:(match:LiteralMatch<T>)=>string){const output:string[]=[];let offset=0;for(const match of matches(text)){output.push(text.slice(offset,match.index),replacement(match));offset=match.index+match.text.length;}output.push(text.slice(offset));return output.join('');}};
}
