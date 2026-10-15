import React,{useEffect,useRef,useState} from 'react';
export type DocxSafeModeState={safeMode:boolean;detail?:string;time?:string;reason?:unknown};
type Api=<T>(path:string,method?:string,body?:unknown)=>Promise<T>;
export function useDocxSafeMode(api:Api){
 const latest=useRef(api);latest.current=api;const [value,setValue]=useState<DocxSafeModeState|null>(null),[error,setError]=useState(''),sequence=useRef(0);
 useEffect(()=>{const current=++sequence.current;void latest.current<DocxSafeModeState>('/preferences/docx-safe-mode').then(v=>{if(sequence.current===current)setValue(v);}).catch(e=>{if(sequence.current===current)setError(e.message);});return()=>{sequence.current++;};},[]);
 async function set(reason:unknown){const current=++sequence.current;setValue({safeMode:true,reason});setError('');try{const result=await latest.current<DocxSafeModeState>('/preferences/docx-safe-mode','PUT',{reason});if(sequence.current===current)setValue(result);}catch(e){if(sequence.current===current)setError((e as Error).message);}}
 async function reset(){const current=++sequence.current;setError('');try{const result=await latest.current<DocxSafeModeState>('/preferences/docx-safe-mode','DELETE');if(sequence.current===current)setValue(result);}catch(e){if(sequence.current===current)setError((e as Error).message);}}
 return {value,error,set,reset};
}
export function DocxSafeModeControl({value,error,onEnable,onReset}:{value:DocxSafeModeState|null;error:string;onEnable:()=>void;onReset:()=>void}){
 return <div className="docx-safe-mode" aria-label="Word 兼容预览设置">{value?.safeMode?<><p role="status">已使用兼容文字预览，图片和复杂版式请在原件与图片审查区核对。{value.time&&<small> 设置时间：{new Date(value.time).toLocaleString()}</small>}</p><button type="button" className="secondary" onClick={onReset}>恢复高保真预览</button></>:<button type="button" className="secondary" disabled={!value} onClick={onEnable}>使用兼容文字预览</button>}{error&&<p role="alert">预览设置未能保存：{error}</p>}</div>;
}
