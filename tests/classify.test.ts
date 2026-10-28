import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,folderLineage,peopleOf} from '../lib/tracker/domain';
const f=(reference:string,name:string,parentReference='',type='folder')=>({reference,name,type,parentReference}) as any;
const folders=[f('m','Machi','','project'),f('a','Anna','','project'),f('p','Personal','','project_default'),f('mj','Amber','','project'),
  f('m-epson','Epson','m'),f('m-personal','Personal','m'),f('m-amber','Amber','m'),f('m-epson-sub','2026','m-epson'),
  f('p-anna','Anna','p'),f('p-anna-sc','soundcore','p-anna')];
const people=peopleOf(folders);
const run=(folder:string,project:string,assigned:string)=>{const l=folderLineage(folder,project,folders);return classify(l,assigned,people)};
test('client folder directly under a person is the work project',()=>{assert.equal(run('m-epson','m','Machi').business?.name,'Epson')});
test('deeper subfolders stay in the client project',()=>{assert.equal(run('m-epson-sub','m','Machi').business?.name,'Epson')});
test('generic Personal and other people names are not projects',()=>{assert.equal(run('m-personal','m','Machi').business,undefined);assert.equal(run('m-amber','m','Machi').business,undefined)});
test('root with no folder is unassigned',()=>{assert.equal(run('m','m','Machi').business,undefined)});
test('person folders under the generic Personal root give the person and project',()=>{const c=run('p-anna-sc','p','');assert.equal(c.folderPerson,'Anna');assert.equal(c.business?.name,'soundcore')});
