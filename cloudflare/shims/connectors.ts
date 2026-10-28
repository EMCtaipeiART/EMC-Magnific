import {callTool} from '../mcp';
export function connectorsForRequest(){
  return {async invoke(_connector:string,action:string,args:Record<string,unknown>){return callTool(action,args)}};
}
