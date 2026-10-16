import assert from 'node:assert/strict';
import {test} from 'vitest';
import {MCP_PROTOCOL,MCP_ORIGINAL_PROTOCOL,negotiateMcpProtocol,mcpDispatch,type ProtocolSession} from '../packages/core/mcp-tools.ts';
const caller={sessionId:'synthetic',adapterId:'codex',displayName:'codex'};
const tool=async()=>({ok:true});
test('negotiates both supported MCP versions and dispatches core methods',async()=>{for(const requested of [MCP_ORIGINAL_PROTOCOL,MCP_PROTOCOL,'2099-01-01',undefined]){
 const selected=negotiateMcpProtocol(requested);
 const session:ProtocolSession={caller,initialized:false,protocol:selected};
 const response=await mcpDispatch({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:requested}},session,tool);
 assert.equal(response.result.protocolVersion,selected);
 assert.equal(selected,requested===MCP_ORIGINAL_PROTOCOL?MCP_ORIGINAL_PROTOCOL:MCP_PROTOCOL);
 assert.deepEqual(response.result.capabilities,{tools:{listChanged:false},resources:{listChanged:false}});
 await mcpDispatch({jsonrpc:'2.0',method:'notifications/initialized'},session,tool);
 assert.equal((await mcpDispatch({jsonrpc:'2.0',id:2,method:'tools/list'},session,tool)).result.tools.length,12);
 assert.deepEqual(await mcpDispatch({jsonrpc:'2.0',id:3,method:'resources/list'},session,tool),{jsonrpc:'2.0',id:3,result:{resources:[]}});
 assert.deepEqual(await mcpDispatch({jsonrpc:'2.0',id:4,method:'ping'},session,tool),{jsonrpc:'2.0',id:4,result:{}});
 console.log(JSON.stringify({requested:requested??null,selected,dispatch:true}));
}});
