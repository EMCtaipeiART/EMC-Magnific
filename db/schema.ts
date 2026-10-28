import {sqliteTable,text,primaryKey} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{owner:text('owner').notNull(),id:text('id').notNull(),data:text('data').notNull()},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const state=sqliteTable('state',{owner:text('owner').notNull(),key:text('key').notNull(),data:text('data').notNull()},t=>[primaryKey({columns:[t.owner,t.key]})]);
