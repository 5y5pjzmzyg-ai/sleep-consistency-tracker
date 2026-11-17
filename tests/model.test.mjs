import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, initial, snapshot, score, onTime, sleepDate, checkInDate, localParts, dateValid, streaks, summary, targetFor, backup, parseBackup } from '../model.mjs';

const day = (date, values = {}) => ({ date, bed: 'yes', alarm: 'yes', use: 4, energy: 3, target: snapshot(defaults), updatedAt: null, ...values });
const time = iso => new Date(iso);
test('equal weights, one rounding, and score extremes', () => {
  assert.equal(score(day('2026-11-17')), 81);
  assert.equal(score(day('2026-11-17', { use: 5, energy: 5 })), 100);
  assert.equal(score(day('2026-11-17', { bed: 'no', alarm: 'no', use: 1, energy: 1 })), 0);
});
test('no alarm is excluded, missing answers leave score incomplete', () => {
  assert.equal(score(day('2026-11-17', { alarm: 'none' })), 75);
  assert.equal(score(day('2026-11-17', { alarm: 'no' })), 56);
  for (const key of ['bed', 'alarm', 'use', 'energy']) assert.equal(score(day('2026-11-17', { [key]: null })), null);
  assert.equal(summary([day('2026-11-17', { alarm: 'none' }),day('2026-11-18', { alarm: 'no' })]).alarm, 0);
});
test('bedtime is strict and considers post-midnight clock times', () => {
  for (const t of ['22:29','22:30']) assert.equal(onTime(t, defaults), true);
  for (const t of ['22:31','23:59','00:00','03:59']) assert.equal(onTime(t, defaults), false);
  assert.equal(onTime('00:29', { ...defaults, bed:'00:30' }), true);
  assert.equal(onTime('00:31', { ...defaults, bed:'00:30' }), false);
});
test('Helsinki cutoff and morning attribution', () => {
  for (const t of ['2026-11-17T21:00Z','2026-11-17T22:30Z','2026-11-18T00:00Z','2026-11-18T01:59Z'])
    assert.equal(sleepDate(time(t),defaults), '2026-11-17');
  assert.equal(sleepDate(time('2026-11-18T02:00Z'),defaults), '2026-11-18');
  assert.equal(checkInDate(time('2026-11-18T03:55Z'), defaults), '2026-11-17');
  assert.equal(checkInDate(time('2026-11-17T22:02Z'), defaults), '2026-11-17');
});
test('spring DST jump and repeated autumn clock times', () => {
  assert.equal(localParts(time('2026-03-29T00:59Z'), defaults.zone).time, '02:59');
  assert.equal(sleepDate(time('2026-03-29T00:59Z'),defaults), '2026-03-28');
  assert.equal(sleepDate(time('2026-03-29T01:00Z'),defaults), '2026-03-29');
  for (const t of ['2026-10-25T00:30Z','2026-10-25T01:30Z']) {
    assert.equal(localParts(time(t), defaults.zone).time,'03:30');
    assert.equal(sleepDate(time(t),defaults),'2026-10-24');
    assert.equal(checkInDate(time(t),defaults),'2026-10-24');
  }
});
test('streaks bridge alarm-free days, break on gaps, missing answers and failures', () => {
  const days = [day('2026-11-12'), day('2026-11-13',{alarm:'none'}), day('2026-11-14'), day('2026-11-16',{bed:'no'}), day('2026-11-17',{alarm:null})];
  assert.deepEqual(streaks(days,'alarm','2026-11-14'),{current:2,longest:2});
  assert.deepEqual(streaks(days,'alarm','2026-11-13'),{current:1,longest:1});
  assert.deepEqual(streaks(days,'alarm','2026-11-17'),{current:0,longest:2});
  assert.deepEqual(streaks(days,'bed','2026-11-17'),{current:1,longest:3});
  assert.deepEqual(streaks(days,'bed','2026-11-18'),{current:0,longest:3});
});
test('target history follows calendar dates and snapshots survive', () => {
  const state = initial();
  state.records['2026-11-17'] = day('2026-11-17');
  state.targets.push({from:'2026-11-18',...snapshot({...defaults,bed:'23:00'})});
  assert.equal(targetFor(state,'2026-11-17').bed,'22:30');
  assert.equal(targetFor(state,'2026-11-18').bed,'23:00');
  assert.equal(state.records['2026-11-17'].target.bed,'22:30');
});
test('backup round trip, invalid dates, duplicates and values', () => {
  const state = initial(), d = day('2026-11-17',{energy:null});
  state.records[d.date] = d;
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup(state)))), state);
  assert.throws(() => parseBackup({...backup(state),records:[d,d]}),/duplicate/);
  assert.throws(() => parseBackup({...backup(state),records:[{...d,energy:0}]}),/invalid/);
  assert.throws(() => parseBackup({...backup(state),records:[{...d,date:'2026-02-30'}]}),/invalid/);
  assert.throws(() => parseBackup({...backup(state),settings:{...defaults,zone:'Bogus/Zone'}}),/valid/);
  assert.equal(dateValid('2028-02-29'), true);
});
