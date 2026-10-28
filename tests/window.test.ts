import test from 'node:test';
import assert from 'node:assert/strict';
import {inScanWindow} from '../cloudflare/window';
const at=(iso:string)=>inScanWindow(Date.parse(iso));
test('weekday daytime in Taipei is inside the scan window',()=>{assert.equal(at('2026-10-28T10:00:00+08:00'),true);assert.equal(at('2026-10-28T08:00:00+08:00'),true);assert.equal(at('2026-10-28T19:59:00+08:00'),true)});
test('evenings, nights and early mornings are outside',()=>{assert.equal(at('2026-10-28T20:00:00+08:00'),false);assert.equal(at('2026-10-28T07:59:00+08:00'),false);assert.equal(at('2026-10-28T02:00:00+08:00'),false)});
test('weekends are outside',()=>{assert.equal(at('2026-10-31T10:00:00+08:00'),false);assert.equal(at('2026-11-01T14:00:00+08:00'),false)});
test('the Taipei weekday decides, not UTC',()=>{assert.equal(at('2026-11-02T08:30:00+08:00'),true);assert.equal(at('2026-10-30T20:30:00+08:00'),false)});
