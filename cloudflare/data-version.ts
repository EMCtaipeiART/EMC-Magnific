import {getState,setState} from '@/lib/tracker/store';
import {OWNER} from './shims/chatgpt-auth';
/** Bumped whenever ledger data changes; the API response cache is keyed on it so edits and syncs show up immediately. */
export const dataVersion=():Promise<number>=>getState(OWNER,'dataV',0);
export const bumpDataVersion=()=>setState(OWNER,'dataV',Date.now());
