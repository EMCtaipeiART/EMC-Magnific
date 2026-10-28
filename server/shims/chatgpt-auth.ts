// Single shared ledger on the NAS: every visitor reads the same owner.
export const OWNER='nas';
export async function getChatGPTUser(){return {userId:OWNER,displayName:'EMC',email:'',fullName:null}}
export function chatGPTSignInPath(_returnTo?:string){return '/auth/start'}
