export const defaults = { bed: '22:30', wake: '05:55', cutoff: '04:00', zone: 'Europe/Helsinki', theme: 'system' };
export const initial = () => ({ version: 1, settings: { ...defaults }, targets: [{ from: '0001-01-01', ...snapshot(defaults) }], records: {} });
export function snapshot({ bed, wake, cutoff, zone }) { return { bed, wake, cutoff, zone }; }

const formatters = new Map();
export function localParts(instant, zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }));
  const p = Object.fromEntries(formatters.get(zone).formatToParts(instant).map(({ type, value }) => [type, value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function shift(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekday = date => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
export const weekStart = date => shift(date, -weekday(date));
export function sleepDate(instant, { zone, cutoff }) {
  const { date, time } = localParts(instant, zone);
  return time < cutoff ? shift(date, -1) : date;
}
export const checkInDate = (instant, { zone }) => shift(localParts(instant, zone).date, -1);
export const onTime = (localTime, { bed, cutoff }) => {
  const minutes = time => {
    const [h, m] = time.split(':').map(Number);
    return (h * 60 + m + 1440 - Number(cutoff.slice(0, 2)) * 60 - Number(cutoff.slice(3))) % 1440;
  };
  return minutes(localTime) <= minutes(bed);
};
export function targetFor(state, date) {
  return snapshot(state.targets.findLast(target => target.from <= date) ?? state.targets[0]);
}
export function score(record) {
  if (!record) return null;
  const { bed, alarm, use, energy } = record;
  if (bed == null || alarm == null || use == null || energy == null) return null;
  const points = Number(bed === 'yes') + Number(alarm === 'yes') + (use - 1) / 4 + (energy - 1) / 4;
  return Math.round(100 * points / (alarm === 'none' ? 3 : 4));
}
export function datesBetween(start, end) {
  const dates = [];
  for (let date = start; date <= end; date = shift(date, 1)) dates.push(date);
  return dates;
}
export const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export const rate = values => average(values.filter(value => value === 'yes' || value === 'no').map(value => value === 'yes' ? 100 : 0));
export function streaks(records, key, end) {
  let run = 0, longest = 0, previous = null;
  for (const record of records.filter(r => r.date <= end).sort((a, b) => a.date.localeCompare(b.date))) {
    if (previous && shift(previous, 1) !== record.date) run = 0;
    const value = record[key];
    if (value === 'yes') run += 1;
    else if (!(key === 'alarm' && value === 'none')) run = 0;
    longest = Math.max(longest, run);
    previous = record.date;
  }
  return { current: previous === end ? run : 0, longest };
}
export function summary(records) {
  const values = key => records.map(r => key === 'overall' ? score(r) : r[key]).filter(value => value != null);
  return { bed: rate(values('bed')), alarm: rate(values('alarm')), use: average(values('use')), energy: average(values('energy')), overall: average(values('overall')) };
}
const timeValid = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function dateValid(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function zoneValid(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; }
  catch { return false; }
}
export const targetsValid = target => target && timeValid(target.bed) && timeValid(target.wake) && target.cutoff === '04:00' && zoneValid(target.zone);
export function parseBackup(raw) {
  if (!raw || raw.version !== 1 || !targetsValid(raw.settings) || !['system', 'dark', 'light'].includes(raw.settings.theme) ||
      !Array.isArray(raw.targets) || !raw.targets.length || raw.targets[0]?.from !== '0001-01-01' ||
      !Array.isArray(raw.records) || raw.records.length > 50000) throw new Error('This file is not a valid Sleep Consistency backup.');
  const targets = raw.targets.map((item, i) => {
    if (!targetsValid(item) || (i && (!dateValid(item.from) || item.from <= raw.targets[i - 1].from)))
      throw new Error('The backup contains an invalid target history.');
    return { from: item.from, ...snapshot(item) };
  });
  const records = {};
  const rating = value => value == null || Number.isInteger(value) && value >= 1 && value <= 5;
  for (const r of raw.records) {
    if (!r || !dateValid(r.date) || Object.hasOwn(records, r.date) || !targetsValid(r.target) ||
        ![null, 'yes', 'no'].includes(r.bed ?? null) || ![null, 'yes', 'no', 'none'].includes(r.alarm ?? null) ||
        !rating(r.use) || !rating(r.energy) || (r.updatedAt != null && (typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt)))))
      throw new Error('The backup contains an invalid or duplicate check-in.');
    records[r.date] = { date: r.date, bed: r.bed ?? null, alarm: r.alarm ?? null, use: r.use ?? null,
      energy: r.energy ?? null, target: snapshot(r.target), updatedAt: r.updatedAt ?? null };
  }
  return { version: 1, settings: { ...snapshot(raw.settings), theme: raw.settings.theme }, targets, records };
}
export const backup = state => ({ ...state, records: Object.values(state.records).sort((a, b) => a.date.localeCompare(b.date)) });
