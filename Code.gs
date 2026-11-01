/**
 * COSEC CRS helper - Apps Script web app (data endpoint for the Tampermonkey script).
 * SETUP (once, by the admin):
 *  1. script.google.com > New project > paste this file > set TOKEN below (any long random text).
 *  2. Deploy > New deployment > type "Web app" > Execute as: Me > Who has access: Anyone > Deploy > authorise.
 *  3. Copy the Web app URL into the userscript (API_URL) together with the same TOKEN.
 */
const SHEET_ID = '108HLwnBlZk2sC0goEo4bl1htTZwEQatkiiTEryiVRuo';
const TOKEN = 'CHANGE_ME';

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.token !== TOKEN) return out_({ ok: false, error: 'bad token' });
    const ss = SpreadsheetApp.openById(SHEET_ID);
    if (p.action === 'list') return out_(list_(ss, p.all === '1'));
    if (p.action === 'case') return out_(getCase_(ss, p.id));
    if (p.action === 'mark') return out_(mark_(ss, p.id, p.status || 'Entered'));
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function table_(ws) {
  const v = ws.getDataRange().getDisplayValues();
  const h = v[0].map(String);
  return { h: h, rows: v.slice(1), col: function (n) { return h.indexOf(n); } };
}

function list_(ss, all) {
  const t = table_(ss.getSheetByName('Cases'));
  const ci = t.col('case_id'), co = t.col('company'), st = t.col('status'), ex = t.col('extracted_at'), as = t.col('assigned_to');
  const cases = t.rows.filter(function (r) { return r[ci]; }).map(function (r) {
    return { id: r[ci], company: r[co], status: r[st], assigned_to: as >= 0 ? r[as] : '', extracted_at: ex >= 0 ? r[ex] : '' };
  }).filter(function (c) { return all || c.status !== 'Entered'; });
  cases.reverse();                                   // newest first
  return { ok: true, cases: cases };
}

function getCase_(ss, id) {
  if (!id) return { ok: false, error: 'no id' };
  const t = table_(ss.getSheetByName('Extract'));
  const ci = t.col('case_id'), vi = t.col('value'), cv = t.col('corrected_value'), ei = t.col('entity'), fi = t.col('field');
  const data = { company: {}, persons: {}, corps: {} };
  let n = 0;
  t.rows.forEach(function (r) {
    if (String(r[ci]).trim() !== id || !r[ei] || !r[fi]) return;
    const val = String(r[cv] || r[vi] || '').trim();
    if (!val || /^MISSING/i.test(val)) return;
    const ent = r[ei], fld = r[fi];
    n++;
    if (ent === 'company') data.company[fld] = val;
    else if (/^person\d+$/.test(ent)) (data.persons[ent] = data.persons[ent] || {})[fld] = val;
    else if (/^corp\d+$/.test(ent)) (data.corps[ent] = data.corps[ent] || {})[fld] = val;
  });
  if (!n) return { ok: false, error: 'case not found in Extract' };
  return { ok: true, id: id, data: data };
}

function mark_(ss, id, status) {
  const ex = ss.getSheetByName('Extract');
  const t = table_(ex);
  const ci = t.col('case_id'), ei = t.col('entity'), fi = t.col('field'), si = t.col('status');
  const upd = [];
  t.rows.forEach(function (r, i) { if (String(r[ci]).trim() === id && r[ei] && r[fi]) upd.push(i + 2); });
  upd.forEach(function (row) { ex.getRange(row, si + 1).setValue(status); });
  const cs = ss.getSheetByName('Cases'), ct = table_(cs);
  const ri = ct.rows.findIndex(function (r) { return String(r[ct.col('case_id')]).trim() === id; });
  if (ri >= 0) cs.getRange(ri + 2, ct.col('status') + 1).setValue(status);
  return { ok: true, rows: upd.length, cases_row: ri >= 0 };
}
