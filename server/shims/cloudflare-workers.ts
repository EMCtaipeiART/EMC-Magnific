// D1-compatible adapter over node:sqlite so lib/tracker/store.ts and sync.ts run unchanged on a NAS.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const file=process.env.DB_PATH||'./data/ledger.sqlite';
mkdirSync(dirname(file),{recursive:true});
const sqlite=new DatabaseSync(file);
sqlite.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS records(owner TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,id));CREATE TABLE IF NOT EXISTS state(owner TEXT NOT NULL,key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,key));');
class Statement{
  constructor(private sql:string,private args:any[]=[]){}
  bind(...args:any[]){return new Statement(this.sql,args)}
  async first<T=any>():Promise<T|null>{return (sqlite.prepare(this.sql).get(...this.args) as T)??null}
  async all<T=any>(){return {results:sqlite.prepare(this.sql).all(...this.args) as T[],success:true}}
  async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}
}
export const env={DB:{
  prepare:(sql:string)=>new Statement(sql),
  async batch(statements:Statement[]){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}},
}};
export const rawSqlite=sqlite;
