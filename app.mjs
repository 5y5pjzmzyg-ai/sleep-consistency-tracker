import { defaults, snapshot, targetFor, localParts, sleepDate, checkInDate, shift, weekStart, weekday, dateValid, targetsValid,
  score, datesBetween, streaks, summary, backup, parseBackup } from './model.mjs';
import { read, update } from './storage.mjs';

const $ = selector => document.querySelector(selector);
const main = $('#main'), dialog = $('#dialog');
const paths = {
  home: 'M3 10l9-7 9 7v10H3z M9 20v-7h6v7', review: 'M4 19V5m0 14h16M8 15l4-5 4 2 4-6',
  settings: 'M4 7h16M4 17h16M9 4v6m6 4v6', moon: 'M20 15A8 8 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z',
  sun: 'M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
  check: 'm4 12 5 5L20 6', bolt: 'm13 2-9 12h7l-1 8 10-12h-7z', spark: 'M12 2c1 7 3 9 10 10-7 1-9 3-10 10C11 15 9 13 2 12c7-1 9-3 10-10Z',
  calendar: 'M4 6h16v14H4zM8 3v6m8-6v6M4 10h16', arrow: 'M4 12h15m-6-6 6 6-6 6'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const esc = value => String(value).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
const formatDate = (date, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(date + 'T00:00:00Z'));
const longDate = date => formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = date => formatDate(date, { month: 'short', day: 'numeric' });
const num = (value, digits = 0) => value == null ? '—' : value.toFixed(digits);
const useLabels = ['Terrible', 'Poor', 'OK', 'Good', 'Excellent'];
const energyLabels = ['Exhausted', 'Low', 'Moderate', 'Good', 'Excellent'];
const metrics = [
  ['bed', 'Bedtime success', 'moon'], ['alarm', 'First-alarm success', 'sun'], ['use', 'Day-use', 'spark'],
  ['energy', 'Energy', 'bolt'], ['overall', 'Overall Daily Score', 'review']
];
const labels = { home: 'Home', review: 'Review', settings: 'Settings' };
let state, page, reviewEnd, selectedDate, range = 13, trend = 'weekly', summaryPeriod = 'weekly', historyLimit = 10;
let timer, checkedDate, busy = false;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('nightline-data') : null;
const due = () => checkInDate(new Date(), state.settings);
const records = () => Object.values(state.records);
const activePage = () => Object.hasOwn(labels, location.hash.slice(1)) ? location.hash.slice(1) : 'home';

function toast(message) {
  $('#toast').textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => { $('#toast').textContent = ''; }, 4200);
}
async function save(change) {
  if (busy) return false;
  busy = true;
  try {
    state = await update(change);
    channel?.postMessage('changed');
    return true;
  } catch (error) {
    toast(error.message || 'The change could not be saved.');
    return false;
  } finally { busy = false; }
}
function nav() {
  $('#nav').innerHTML = Object.entries(labels).map(([key, label]) =>
    `<a href="#${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span></a>`).join('');
}
function heading(kicker, title, copy) {
  return `<div class="page-heading"><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${copy}</p></div>`;
}
function render() {
  if (!state) return;
  page = activePage();
  checkedDate = due();
  document.documentElement.dataset.theme = state.settings.theme;
  nav();
  main.innerHTML = page === 'home' ? home() : page === 'review' ? review() : settings();
}
function valueText(key, record) {
  const val = key === 'overall' ? score(record) : record?.[key];
  if (val == null) return key === 'overall' && record ? 'Incomplete' : 'Not recorded';
  if (val === 'none') return 'No alarm scheduled';
  if (val === 'yes') return 'Yes';
  if (val === 'no') return 'No';
  if (key === 'overall') return `${val}/100`;
  return `${val}/5 · ${(key === 'use' ? useLabels : energyLabels)[val - 1]}`;
}
function tone(key, record) {
  const val = key === 'overall' ? score(record) : record?.[key];
  if (val == null || val === 'none') return 0;
  if (val === 'yes') return 5;
  if (val === 'no') return 1;
  if (key !== 'overall') return val;
  return val < 40 ? 1 : val < 60 ? 2 : val < 75 ? 3 : val < 90 ? 4 : 5;
}
function options(key, name, values, current, help = '') {
  return `<fieldset><legend>${name}</legend>${help ? `<p class="field-help">${help}</p>` : ''}
    <div class="segments ${values.length === 5 ? 'ratings' : ''}">${values.map(([value, label], i) =>
    `<label><input type="radio" name="${key}" value="${value}" ${current === value ? 'checked' : ''}>
    <span class="segment ${values.length === 5 ? 't' + (i + 1) : ''}">${values.length === 5 ? `<b>${value}</b>` : ''}<small>${label}</small></span></label>`).join('')}</div></fieldset>`;
}
function form(date, record, modal = false) {
  const binary = [['yes', 'Yes'], ['no', 'No']];
  const target = record?.target ?? targetFor(state, date);
  return `<form data-form="entry" data-date="${date}" ${record ? 'data-edit="true"' : ''}>
    ${modal ? `<label class="field">Sleep record date<input type="date" name="date" min="1000-01-01" max="${[due(), date].sort().at(-1)}" value="${date}" required></label>` : ''}
    ${options('bed', modal ? 'Did you go to bed on time?' : 'Did you go to bed on time last night?', binary, record?.bed, `In bed by ${target.bed}, with no grace period.`)}
    ${options('alarm', 'Did you get up on your first alarm?', [...binary, ['none', 'No alarm scheduled']], record?.alarm, 'Out of bed without snoozing or going back to sleep.')}
    ${options('use', modal ? 'How well did you use the day?' : 'How well did you use yesterday?', useLabels.map((x, i) => [i + 1, x]), record?.use)}
    ${options('energy', modal ? 'How was your energy that day?' : 'How was your energy yesterday?', energyLabels.map((x, i) => [i + 1, x]), record?.energy)}
    <p class="form-error" role="alert" hidden></p>
    <button class="primary full" type="submit">${icon('check')} Save check-in</button>
    ${modal && record ? `<button class="danger text-button" type="button" data-delete="${date}">Delete check-in</button>` : ''}
  </form>`;
}
function resultRows(record) {
  return `<dl class="result-rows">${metrics.slice(0,4).map(([key, label]) =>
    `<div><dt>${label}</dt><dd><i class="dot t${tone(key, record)}"></i>${valueText(key, record)}</dd></div>`).join('')}</dl>`;
}
function home() {
  const date = due(), record = state.records[date], data = records(), stats = summary(data);
  const bed = streaks(data, 'bed', date), alarm = streaks(data, 'alarm', date);
  const value = score(record);
  return `${heading('YOUR SLEEP ROUTINE', 'Sleep consistency', 'A quick morning check-in for steadier nights and better days.')}
    <div class="home-layout"><div class="home-main">
    <section class="card checkin"><div class="card-head"><span class="tile lavender">${icon('calendar')}</span><div><h2>Morning check-in</h2><p>${longDate(date)}</p></div>
    ${record ? `<button class="secondary push" data-edit="${date}">Edit</button>` : ''}</div>
    ${record ? `<div class="score-strip"><span>Overall Daily Score</span><strong>${value == null ? 'Incomplete' : value + '<small>/100</small>'}</strong></div>${resultRows(record)}` : form(date)}
    </section>
    <button class="text-button backfill" data-add>${icon('calendar')} Choose a check-in date</button>
    </div><aside class="home-side">
    <section class="card targets"><div class="card-head"><span class="tile lavender">${icon('moon')}</span><div><h2>Sleep targets</h2><p>Your current schedule</p></div><a class="text-link push" href="#settings">Adjust</a></div>
    <div class="target-times"><div>${icon('moon')}<span>Bedtime</span><strong>${state.settings.bed}</strong></div><div>${icon('sun')}<span>Wake-up</span><strong>${state.settings.wake}</strong></div></div>
    </section><section class="card progress"><div class="card-head"><span class="tile mint">${icon('review')}</span><div><h2>Progress at a glance</h2><p>${data.length ? `${data.length} recorded ${data.length === 1 ? 'day' : 'days'}` : 'Your progress starts with one check-in.'}</p></div></div>
    <div class="streak-pair"><div><span>Bedtime streak</span><strong>${bed.current}<small> days</small></strong></div><div><span>First-alarm streak</span><strong>${alarm.current}<small> days</small></strong></div></div>
    <dl class="result-rows">${metrics.map(([key, label]) => `<div><dt>${label}</dt><dd>${statText(key, stats[key])}</dd></div>`).join('')}</dl>
    <a class="text-link review-link" href="#review">Open Review ${icon('arrow')}</a></section></aside></div>`;
}
function statText(key, value) {
  if (value == null) return '—';
  if (key === 'bed' || key === 'alarm') return num(value) + '%';
  return key === 'overall' ? num(value) + '/100' : num(value, 1) + '/5';
}
const ratingLegend = ['1', '2', '3', '4', '5'];
const scoreLegend = ['0–39', '40–59', '60–74', '75–89', '90–100'];
function legend(key) {
  const bands = key === 'bed' || key === 'alarm' ? [[1, 'No'], [5, 'Yes']] :
    (key === 'overall' ? scoreLegend : ratingLegend).map((label, i) => [i + 1, label]);
  return `<div class="legend">${[[0, key === 'alarm' ? 'Missing / no alarm' : key === 'overall' ? 'Missing / incomplete' : 'Missing'], ...bands].map(([color, label]) => `<span><i class="dot t${color}"></i>${label}</span>`).join('')}</div>`;
}
function grid(key, label, glyph, weeks, end) {
  const months = weeks.map((date, i) => !i || date.slice(0,7) !== weeks[i-1].slice(0,7) ? formatDate(date, { month: 'short' }) : '');
  return `<section class="card heat-card"><div class="card-head"><span class="tile ${key === 'overall' ? 'mint' : 'lavender'}">${icon(glyph)}</span><h3>${label}</h3></div>
    <div class="heat-scroll"><div class="heat" style="--weeks:${weeks.length}"><span></span>${months.map(month => `<span class="month">${month}</span>`).join('')}
    <div class="weekdays"><span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span></div>
    ${weeks.map(start => `<div class="heat-week">${datesBetween(start, shift(start, 6)).map(date => {
      if (date > end) return '<span class="heat-space"></span>';
      const record = state.records[date], detail = `${longDate(date)} · ${label} · ${valueText(key, record)}`;
      return `<button class="square t${tone(key, record)} ${date === selectedDate ? 'chosen' : ''}" data-day="${date}" aria-label="${detail}" title="${detail}"></button>`;
    }).join('')}</div>`).join('')}</div></div>${legend(key)}</section>`;
}
function grouped(data, type) {
  return Object.entries(data.reduce((groups, r) => { const key = type === 'weekly' ? weekStart(r.date) : r.date.slice(0,7) + '-01'; (groups[key] ??= []).push(r); return groups; }, {}))
    .sort(([a], [b]) => a.localeCompare(b));
}
function chart(data, end) {
  let first = trend === 'weekly' ? shift(end,-6) : trend === 'monthly' ? shift(end,-29) : shift(end,-364);
  let points;
  if (trend === 'yearly') {
    first = first.slice(0,7) + '-01';
    const groups = new Map(grouped(data, 'monthly'));
    points = datesBetween(first, end).filter(date => date.endsWith('-01')).map(date => [date, summary((groups.get(date) ?? []).filter(r => r.date <= end))]);
  } else points = datesBetween(first,end).map(date => [date, summary(state.records[date] ? [state.records[date]] : [])]);
  const series = [['overall','Overall score','#a897fb'],['bed','Bedtime','#58bd9f'],['alarm','First alarm','#82a9f3'],
    ['use','Day-use','#edac70'],['energy','Energy','#e88fab']];
  const x = i => 44 + 544 * i / Math.max(1, points.length - 1);
  const y = v => 169 - v * 1.43;
  const ts = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const ink = series.map(([key, label, color]) => {
    let path = '', dots = '', previous = false;
    points.forEach(([date, row], i) => {
      if (row[key] == null) { previous = false; return; }
      const value = key === 'use' || key === 'energy' ? (row[key] - 1) * 25 : row[key];
      path += `${previous ? 'L' : 'M'}${x(i)} ${y(value)} `;
      dots += `<circle cx="${x(i)}" cy="${y(value)}" r="${key === 'overall' ? 4 : 2.6}" fill="${color}"><title>${shortDate(date)} · ${label} · ${statText(key, row[key])}</title></circle>`;
      previous = true;
    });
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${key === 'overall' ? 3.2 : 1.7}"/>${dots}`;
  }).join('');
  const any = points.some(([,r]) => Object.values(r).some(x => x != null));
  return `<section class="card trend"><div class="card-head"><span class="tile mint">${icon('review')}</span><div><h3>Trends over time</h3><p>${trend === 'yearly' ? 'Monthly averages' : 'Daily values'} · 0–100 scale</p></div></div>
    <div class="switcher" aria-label="Trend period">${[['weekly','7 days'],['monthly','30 days'],['yearly','Year']].map(([key,label]) => `<button data-trend="${key}" aria-pressed="${trend === key}">${label}</button>`).join('')}</div>
    ${any ? `<svg class="chart" viewBox="0 0 610 204" role="img" aria-label="Trend lines for overall score, bedtime and first-alarm success, day-use and energy. The data table below shows exact values.">
      ${[0,25,50,75,100].map(v => `<text x="34" y="${y(v)+4}" text-anchor="end">${v}</text><line x1="44" x2="588" y1="${y(v)}" y2="${y(v)}"/>`).join('')}
      ${ink}${points.map(([date], i) => ts.has(i) ? `<text x="${x(i)}" y="193" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${trend === 'yearly' ? formatDate(date, { month:'short' }) : shortDate(date)}</text>` : '').join('')}
    </svg><div class="legend">${series.map(([,label,color]) => `<span><i class="dot" style="--dot:${color}"></i>${label}</span>`).join('')}</div>
    <details><summary>View chart data</summary>${statsTable(points.map(([date,stats]) => [trend === 'yearly' ? formatDate(date,{month:'short',year:'numeric'}) : shortDate(date),stats]))}</details>` : '<p class="empty">Check-ins in this period will appear here.</p>'}
    <p class="fine">One to five ratings map to 0–100. Gaps mean no eligible data. Compare the patterns over time to see how your schedule, energy and day-use move together.</p></section>`;
}
function statsTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Period</th><th scope="col">Bedtime</th><th scope="col">First alarm</th><th scope="col">Day-use</th><th scope="col">Energy</th><th scope="col">Score</th></tr></thead><tbody>
  ${rows.map(([label, values]) => `<tr><th scope="row">${label}</th>${metrics.map(([key]) => `<td>${statText(key,values[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function review() {
  const latest = due(), end = reviewEnd ?? latest, data = records(), stats = summary(data);
  const weeks = Array.from({length: range}, (_,i) => shift(weekStart(end), (i - range + 1) * 7));
  const period = weekStart(end) === weekStart(latest) ? 'Current period' : 'Return to current';
  const statsPeriod = summaryPeriod;
  const groups = grouped(data.filter(r => r.date <= end), statsPeriod).reverse();
  const recent = data.sort((a,b) => b.date.localeCompare(a.date));
  return `${heading('YOUR HISTORY', 'Review', 'Explore your nights and the days around them.')}
    <div class="review-toolbar"><div><strong>${shortDate(weeks[0])} – ${formatDate(end,{day:'numeric',month:'short',year:'numeric'})}</strong><span class="fine">Select any square for that day’s check-in.</span></div>
    <div class="switcher" aria-label="Calendar period"><button data-range="5" aria-pressed="${range === 5}">Month</button><button data-range="13" aria-pressed="${range === 13}">Quarter</button><button data-range="53" aria-pressed="${range === 53}">Year</button></div>
    <div class="paging"><button class="secondary" data-period="-1" aria-label="Previous period">‹</button><button class="secondary" data-period="0" ${!reviewEnd ? 'disabled' : ''}>${period}</button><button class="secondary" data-period="1" ${!reviewEnd ? 'disabled' : ''} aria-label="Next period">›</button></div></div>
    <div class="heatmaps">${metrics.map(([key,label,glyph]) => grid(key,label,glyph,weeks,end)).join('')}</div>
    <h2 class="section-title">Statistics</h2>
    <section class="card stat-card"><div class="stats-grid">${metrics.map(([key,label,glyph]) => {
      const s = key === 'bed' || key === 'alarm' ? streaks(data,key,latest) : null;
      return `<div>${icon(glyph)}<span>${label}</span><strong>${statText(key,stats[key])}</strong>${s ? `<small>Current ${s.current} · Longest ${s.longest}</small>` : ''}</div>`;
    }).join('')}</div><p class="fine">Rates use answered questions. No-alarm days are skipped in alarm rates and streaks. A missed date, missing answer, or “No” breaks the relevant streak. Current streaks run through the latest check-in date due.</p></section>
    ${chart(data, end)}
    <section class="card period-summary"><div class="card-head"><h3>Period averages</h3><div class="switcher push"><button data-summary="weekly" aria-pressed="${statsPeriod === 'weekly'}">Weekly</button><button data-summary="monthly" aria-pressed="${statsPeriod === 'monthly'}">Monthly</button></div></div>
    ${groups.length ? statsTable(groups.map(([id,rows]) => [statsPeriod === 'weekly' ? `Week of ${formatDate(id,{month:'short',day:'numeric',year:'numeric'})}` : formatDate(id,{month:'short',year:'numeric'}), summary(rows)])) : '<p class="empty">Your weekly and monthly averages will appear here.</p>'}</section>
    <details class="card formula"><summary>How the Overall Daily Score works</summary><p>Each answer carries up to 25 points. Yes earns 25 and No earns 0. For day-use and energy, ratings 1 to 5 earn 0, 6.25, 12.5, 18.75 or 25 points. When no alarm was scheduled, the three remaining answers are scaled from 75 to 100. The total is rounded once. Missing eligible answers leave the score incomplete.</p><p>A personal tracking index for comparing your own days. Use it for reflection, outside clinical assessment.</p></details>
    <section class="card history"><div class="card-head"><div><h3>Check-in history</h3><p>Browse or edit any recorded day.</p></div><button class="secondary push" data-add>Add check-in</button></div>
    ${recent.length ? `<ul>${recent.slice(0,historyLimit).map(record => `<li><button data-day="${record.date}"><span>${longDate(record.date)}</span><strong>${valueText('overall',record)}</strong><span aria-hidden="true">›</span></button></li>`).join('')}</ul>` : '<p class="empty">No check-ins yet. Add a past day or start on Home.</p>'}
    ${recent.length > historyLimit ? '<button class="secondary" data-more>Show more</button>' : ''}</section>`;
}
function settings() {
  const { bed, wake, zone, theme } = state.settings;
  const zones = [...new Set([zone, defaults.zone, ...((Intl.supportedValuesOf?.('timeZone')) ?? ['UTC'])])].sort();
  return `${heading('YOUR PREFERENCES', 'Settings', 'Manage your schedule, appearance and backups.')}
    <div class="settings-layout"><section class="card"><div class="card-head"><span class="tile lavender">${icon('moon')}</span><div><h2>Sleep schedule</h2><p>Each recorded day keeps its own targets.</p></div></div>
    <form data-form="settings"><div class="settings-times"><label class="field">Target bedtime<input name="bed" type="time" required value="${bed}"></label><label class="field">Target wake-up<input name="wake" type="time" required value="${wake}"></label></div>
    <label class="field">Time zone<select name="zone">${zones.map(z => `<option ${z === zone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
    <dl class="result-rows"><div><dt>Sleep-day cutoff</dt><dd>04:00</dd></div><div><dt>Target display</dt><dd>24-hour</dd></div></dl>
    <p class="fine">Bedtime success means getting into bed at or before your target. The wake-up target is for reference. Bedtimes before 04:00 belong to the previous evening.</p>
    <button class="primary" type="submit">Save schedule</button></form></section>
    <div class="settings-side"><section class="card"><div class="card-head"><span class="tile lavender">${icon('sun')}</span><h2>Appearance</h2></div>
    <div class="switcher" aria-label="Appearance">${['system','light','dark'].map(key => `<button data-theme-choice="${key}" aria-pressed="${theme === key}">${key[0].toUpperCase()+key.slice(1)}</button>`).join('')}</div></section>
    <section class="card"><div class="card-head"><span class="tile mint">${icon('settings')}</span><h2>Data & backups</h2></div>
    <p>Your check-ins are saved in this browser. They don’t sync across devices. Clearing site data can remove your records, so keep a JSON backup.</p>
    <div class="backup-actions"><button class="primary" data-export>Export JSON</button><label class="secondary file-button">Import JSON<input type="file" id="import" accept=".json,application/json"></label></div></section></div></div>`;
}
function openDialog(title, body) {
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="secondary" data-close aria-label="Close dialog">×</button></div>${body}`;
  if (!dialog.open) dialog.showModal();
  else dialog.querySelector('[data-close]').focus();
  dialog.scrollTop = 0;
}
function showDay(date) {
  const record = state.records[date];
  selectedDate = date;
  document.querySelectorAll('.square').forEach(cell => cell.classList.toggle('chosen', cell.dataset.day === date));
  const target = record?.target ?? targetFor(state, date);
  openDialog(longDate(date), `<p class="fine">Bedtime ${target.bed} · Wake-up ${target.wake} · ${esc(target.zone)}</p>
    ${record ? `<div class="score-strip"><span>Overall Daily Score</span><strong>${valueText('overall',record)}</strong></div>${resultRows(record)}` : '<p class="empty">No check-in for this sleep date.</p>'}
    <button class="primary full" data-edit="${date}">${record ? 'Edit check-in' : 'Add check-in'}</button>`);
}
function edit(date) {
  openDialog(state.records[date] ? 'Edit check-in' : 'Add check-in', form(date, state.records[date], true));
}
function addDate() {
  openDialog('Choose a check-in date', `<form data-form="choose"><label class="field">Sleep record date<input type="date" name="date" min="1000-01-01" max="${due()}" value="${due()}" required></label><button class="primary full">Continue</button></form>`);
}
function download() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup(state), null, 2)], {type:'application/json'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = `nightline-${localParts(new Date(), state.settings.zone).date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function surfaceError(form, message) {
  const error = form.querySelector('.form-error');
  error.textContent = message;
  error.hidden = false;
}
async function saveEntry(form, values) {
  const original = form.dataset.date, date = values.get('date') ?? original;
  if (!dateValid(date) || date > [due(), original].sort().at(-1)) return surfaceError(form, 'Choose a valid past sleep date.');
  const bed = values.get('bed'), alarm = values.get('alarm'), use = values.get('use'), energy = values.get('energy');
  if ([bed, alarm, use, energy].some(v => v == null)) return surfaceError(form, 'Answer all four questions to save your check-in.');
  const prior = form.dataset.edit ? state.records[original] : null;
  const target = prior?.target ?? targetFor(state,date);
  const entry = { date, bed, alarm, use: Number(use), energy: Number(energy), target, updatedAt: new Date().toISOString() };
  const ok = await save(current => {
    if ((prior && JSON.stringify(current.records[original]) !== JSON.stringify(prior)) ||
        (current.records[date] && (!prior || date !== original))) throw new Error('That date already has a check-in or was changed in another tab. Open it again to edit.');
    const updated = { ...current.records };
    if (prior && original !== date) delete updated[original];
    updated[date] = entry;
    return { ...current, records: updated };
  });
  if (ok) {
    if (dialog.open) dialog.close();
    render();
    toast(`Check-in saved · Overall score ${score(entry)}/100`);
  }
}
document.addEventListener('submit', async event => {
  const form = event.target, kind = form.dataset.form;
  if (!kind) return;
  event.preventDefault();
  const values = new FormData(form);
  if (kind === 'entry') return saveEntry(form, values);
  if (kind === 'choose') return edit(values.get('date'));
  const settings = { ...state.settings, bed: values.get('bed'), wake: values.get('wake'), zone: values.get('zone') };
  if (!targetsValid(settings)) return toast('Choose valid target times and a time zone.');
  if (await save(current => {
    const from = sleepDate(new Date(), settings);
    const newTargets = { ...snapshot(settings), from };
    const targets = [...current.targets.filter(t => t.from !== from), newTargets].sort((a,b) => a.from.localeCompare(b.from));
    return { ...current, settings: { ...settings, theme: current.settings.theme }, targets };
  })) { reviewEnd = null; render(); toast('Sleep schedule saved'); }
});
let pendingImport;
document.addEventListener('change', async event => {
  const field = event.target;
  if (field.name === 'date' && field.form?.dataset.form === 'entry' && dateValid(field.value) && !field.form.dataset.edit) {
    field.form.querySelector('.field-help').textContent = `In bed by ${targetFor(state,field.value).bed}, with no grace period.`;
  }
  if (field.id !== 'import' || !field.files.length) return;
  try {
    if (field.files[0].size > 12_000_000) throw new Error('Choose a JSON backup under 12 MB.');
    pendingImport = parseBackup(JSON.parse(await field.files[0].text()));
    const incoming = Object.values(pendingImport.records);
    const conflicts = incoming.filter(r => state.records[r.date]).length;
    openDialog('Restore backup', `<p>${incoming.length} check-ins validated. ${conflicts} match dates already on this device.</p>
      <p class="fine">Merge adds new dates and keeps local copies for matching dates. Replace all overwrites your saved check-ins, schedule and appearance with the backup.</p>
      <div class="backup-actions"><button class="primary" data-restore="merge">Merge new dates</button><button class="secondary" data-replace>Replace all…</button></div>`);
  } catch (error) {
    pendingImport = null;
    toast(error instanceof SyntaxError ? 'This file does not contain valid JSON.' : error.message);
  } finally { field.value = ''; }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !state) return;
  const d = button.dataset;
  if (d.nav) { location.hash = d.nav; return; }
  if ('close' in d) { dialog.close(); return; }
  if (d.day) return showDay(d.day);
  if ('add' in d) return addDate();
  if (d.edit) return edit(d.edit);
  if (d.delete) return openDialog('Delete this check-in?', `<p>${longDate(d.delete)} will be removed from your history.</p><div class="backup-actions"><button class="secondary" data-edit="${d.delete}">Cancel</button><button class="danger filled" data-confirm-delete="${d.delete}">Delete check-in</button></div>`);
  if (d.confirmDelete) {
    const prior = state.records[d.confirmDelete];
    if (await save(current => {
      if (JSON.stringify(current.records[d.confirmDelete]) !== JSON.stringify(prior)) throw new Error('This check-in changed. Reopen it before deleting.');
      const updated = { ...current.records };
      delete updated[d.confirmDelete];
      return { ...current, records: updated };
    })) { dialog.close(); render(); toast('Check-in deleted'); }
    return;
  }
  if (d.themeChoice) {
    if (await save(current => ({ ...current, settings: { ...current.settings, theme: d.themeChoice } }))) {
      render(); document.querySelector(`[data-theme-choice="${d.themeChoice}"]`).focus();
    }
    return;
  }
  if ('export' in d) return download();
  if ('replace' in d) return openDialog('Replace all local data?', '<p>This overwrites every check-in and setting on this device with the selected backup.</p><div class="backup-actions"><button class="secondary" data-close>Cancel</button><button class="danger filled" data-restore="replace">Replace all local data</button></div>');
  if (d.restore && pendingImport) {
    const incoming = pendingImport;
    const replace = d.restore === 'replace';
    if (await save(current => replace ? incoming : { ...current, records: { ...incoming.records, ...current.records } })) {
      pendingImport = null;
      reviewEnd = null;
      dialog.close(); render(); toast(replace ? 'Backup restored' : 'Backup merged');
    }
    return;
  }
  if (d.range) range = Number(d.range);
  else if (d.period) {
    const date = shift(reviewEnd ?? due(), Number(d.period) * range * 7);
    reviewEnd = d.period === '0' || date >= due() ? null : date;
  } else if (d.trend) trend = d.trend;
  else if (d.summary) summaryPeriod = d.summary;
  else if ('more' in d) historyLimit += 20;
  else return;
  const key = Object.keys(d)[0];
  const value = d[key];
  render();
  document.querySelector(`[data-${key}="${value}"]:not(:disabled)`)?.focus({ preventScroll: true });
});
window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); render(); window.scrollTo(0,0); main.focus({preventScroll:true}); });
channel?.addEventListener('message', async () => { state = await read(); if (!dialog.open && !document.activeElement?.closest('form')) render(); });
document.addEventListener('visibilitychange', () => {
  if (state && !document.hidden && checkedDate !== due() && !dialog.open && !document.activeElement?.closest('form')) render();
});
setInterval(() => {
  if (state && !document.hidden && checkedDate !== due() && !dialog.open && !document.activeElement?.closest('form')) render();
}, 30000);
try {
  state = await read();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline setup failed', error));
} catch {
  main.innerHTML = '<section class="card"><h1>Storage unavailable</h1><p>Nightline couldn’t open local storage. Check your browser’s site-data settings and reload to try again.</p></section>';
}
