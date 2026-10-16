import {expect,it} from 'vitest';
import {mcpDispatch,type ProtocolSession} from '../packages/core/mcp-tools.ts';
it('advertises and returns the original empty resource catalog without tool invocation',async()=>{
 const s:ProtocolSession={caller:{sessionId:'session',adapterId:'codex',displayName:'codex'},initialized:false,protocol:'2025-11-25'};
 let invoked=0;const tool=async()=>{invoked++;throw new Error('must not invoke a tool');};
 const init=await mcpDispatch({jsonrpc:'2.0',id:1,method:'initialize'},s,tool);
 expect(init.result.capabilities.resources).toEqual({listChanged:false});
 await mcpDispatch({jsonrpc:'2.0',method:'notifications/initialized'},s,tool);
 expect(await mcpDispatch({jsonrpc:'2.0',id:2,method:'resources/list'},s,tool)).toEqual({jsonrpc:'2.0',id:2,result:{resources:[]}});
 expect((await mcpDispatch({jsonrpc:'2.0',id:3,method:'resources/read',params:{uri:'file:///etc/passwd'}},s,tool)).error.code).toBe(-32601);
 expect(invoked).toBe(0);
});
