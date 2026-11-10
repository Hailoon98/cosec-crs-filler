// ==UserScript==
// @name         COSEC CRS Filler
// @namespace    cosec
// @version      3.0
// @description  Pick a case, press ONE button, the CRS form fills itself. You only click the blue Save buttons. Never submits.
// @match        https://crs.ssm4u.com.my/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Hailoon98/cosec-crs-filler/main/cosec_crs.user.js
// @downloadURL  https://raw.githubusercontent.com/Hailoon98/cosec-crs-filler/main/cosec_crs.user.js
// ==/UserScript==
(function () {
  'use strict';

  /* API URL + TOKEN are NOT in this file. Asked once per browser, stored by Tampermonkey. */
  const ask = (k, msg) => { let v = GM_getValue(k, ''); if (!v) { v = (prompt(msg) || '').trim(); if (v) GM_setValue(k, v); } return v; };
  const API_URL = ask('api_url', 'COSEC: paste the API URL (from your admin)');
  const TOKEN   = ask('api_token', 'COSEC: paste the TOKEN (from your admin)');
  const reset = () => { GM_setValue('api_url', ''); GM_setValue('api_token', ''); location.reload(); };
  window.cosecReset = reset;
  try { unsafeWindow.cosecReset = reset; } catch (e) { /* console access only */ }
  try { GM_registerMenuCommand('COSEC: change API URL / token', reset); } catch (e) { /* menu is optional */ }

  const FIXED = {
    nameSearch: { category: 'LOCAL COMPANY', type: 'S - LIMITED BY SHARES', sub: 'PRIVATE COMPANY', suffix: 'SDN. BHD.', application: 'PROPOSED COMPANY NAME' },
    regAddr: { l1: 'NO 420 LEVEL 3A, SUNWAY VISIO TOWER', l2: '', l3: '', postcode: '55100', city: 'KUALA LUMPUR', state: 'WILAYAH PERSEKUTUAN KUALA LUMPUR', country: 'MALAYSIA', email: 'reactiveman520@gmail.com', office: '0397712267' },
    secretaryPC: '201908000188', secretaryGender: 'MALE', secretaryRace: 'MALAY',
    secAddr: { l1: 'NO 12 & 12A, JALAN WANGSA JAYA UTAMA', l2: 'TAMAN  WANGSA JAYA', l3: '', postcode: '35900', city: 'TANJONG MALIM', state: 'PERAK', country: 'MALAYSIA' },
  };

  /* ---------------- tiny helpers ---------------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const txt = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
  const vis = e => !!(e && (e.offsetParent || e.getClientRects().length));
  const U = s => String(s || '').trim().toUpperCase();
  const $$ = (r, s) => [...(r || document).querySelectorAll(s)];
  const ev = (e, ts) => ts.forEach(t => e.dispatchEvent(new Event(t, { bubbles: true })));

  function labelOf(e) {
    let p = e;
    for (let k = 0; k < 5 && p; k++) {
      p = p.parentElement;
      const x = p && p.querySelector('label');
      if (x) return txt(x).replace(/\*/g, '').trim();
    }
    return '';
  }
  function setText(el, val) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    el.focus();
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    ev(el, ['input', 'change', 'blur']);
  }
  /* all editable fields whose label matches, in page order, inside root */
  function fields(root, re, kind) {
    const sel = kind === 'select' ? 'select' : kind === 'area' ? 'textarea' : 'input:not([type=radio]):not([type=checkbox]):not([type=hidden]),textarea';
    return $$(root, sel).filter(e => vis(e) && re.test(labelOf(e)));
  }
  const readOnly = e => e.disabled || e.readOnly;
  function inputByText(root, re) {                          // first editable input AFTER the first visible caption matching re
    const caps = $$(root, '*').filter(e => e.children.length === 0 && re.test(txt(e)) && vis(e));
    for (const c of caps) {
      const i = $$(root, 'input,textarea').find(x => vis(x) && !readOnly(x) && x.type !== 'checkbox' && x.type !== 'radio' &&
        (c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (i) return i;
    }
    return null;
  }
  window.cosecDebug = () => console.log($$(document, 'input,select,textarea').filter(vis).map(e => [e.tagName, e.type, labelOf(e), e.value, e.disabled || e.readOnly].join(' | ')).join('\n'));
  function chooseOption(sel, want) {
    const w = U(want);
    const o = [...sel.options];
    const hit = o.find(x => U(x.text) === w) || o.find(x => U(x.text).startsWith(w)) || o.find(x => U(x.text).includes(w));
    if (!hit) return false;
    sel.value = hit.value; ev(sel, ['input', 'change', 'blur']);
    return true;
  }

  const log = [];                          // [icon, text]
  const mark = (ok, what) => { log.push([ok ? '✔' : '⚠', what]); render(); };

  async function T(root, re, val, what, idx) {            // fill text field by label
    val = String(val == null ? '' : val);
    if (!val) return;
    const f = fields(root, re)[idx || 0];
    if (!f) return mark(false, `${what}: field not found`);
    if (readOnly(f)) return mark(true, `${what}: locked by CRS (${f.value})`);
    setText(f, val); await sleep(150);
    mark(f.value.trim() !== '' , `${what}: ${val}`);
  }
  async function S(root, re, val, what, idx) {            // fill select by label
    if (!val) return;
    const arr = fields(root, re, 'select');
    let f = (idx || 0) < 0 ? arr.filter(x => !readOnly(x)).slice(idx)[0] : arr[idx || 0];
    for (let i = 0; i < 10 && f && f.options.length < 2; i++) { await sleep(400); }
    if (!f) return mark(false, `${what}: dropdown not found`);
    if (readOnly(f)) return mark(true, `${what}: locked by CRS`);
    mark(chooseOption(f, val), `${what}: ${val}`);
    await sleep(250);
  }
  function radio(root, questionRe, answerRe) {            // radio (optionally inside a question block)
    let scope = root;
    if (questionRe) {
      const q = $$(root, 'label,span,div,p,h4,h5').find(e => e.children.length <= 1 && questionRe.test(txt(e)) && vis(e));
      if (!q) return false;
      let c = q;
      for (let i = 0; i < 6 && c && $$(c, 'input[type=radio]').length < 2; i++) c = c.parentElement;
      scope = c || root;
    }
    const r = $$(scope, 'input[type=radio]').find(x => answerRe.test(txt(x.parentElement)) && vis(x.parentElement));
    if (!r) return false;
    if (!r.checked) r.click();
    return true;
  }
  function check(root, re, want) {                         // checkbox by its own text
    const c = $$(root, 'input[type=checkbox]').find(x => re.test(txt(x.parentElement) || labelOf(x)));
    if (!c) return false;
    if (c.checked !== want) c.click();
    return c.checked === want;
  }
  async function amountField(root, amount) {               // masked: needs real-looking typing
    const f = fields(root, /Amount of Issued/i).find(e => !readOnly(e)) || inputByText(root, /Amount of Issued/i);
    if (!f) return mark(false, 'Amount of Issued Shares: field not found');
    const want = Number(amount).toFixed(4);
    for (const mode of ['exec', 'keys']) {
      f.scrollIntoView({ block: 'center' }); f.focus(); f.select();
      const digits = String(Math.round(Number(amount) * 10000));
      if (mode === 'exec') document.execCommand('insertText', false, digits);
      else for (const d of digits) { f.dispatchEvent(new KeyboardEvent('keydown', { key: d, bubbles: true })); f.value += d; ev(f, ['input']); f.dispatchEvent(new KeyboardEvent('keyup', { key: d, bubbles: true })); }
      ev(f, ['change', 'blur']); await sleep(300);
      if (f.value === want) break;
    }
    mark(f.value === want, `Amount of Issued Shares: ${f.value} (want ${want})`);
  }

  /* ---------------- data ---------------- */
  function gm(opts) {
    return new Promise((res, rej) => GM_xmlhttpRequest(Object.assign({
      method: 'GET', timeout: 30000,
      onload: r => { try { res(JSON.parse(r.responseText)); } catch (e) { rej(new Error('Bad reply (HTTP ' + r.status + '): ' + String(r.responseText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160))); } },
      onerror: () => rej(new Error('No connection to Google.')), ontimeout: () => rej(new Error('Google timed out.')),
    }, opts)));
  }
  const api = (action, extra) => gm({ url: API_URL + '?token=' + encodeURIComponent(TOKEN) + '&action=' + action + (extra || '') });

  let CASES = [], CUR = null, DATA = null, BUSY = false, STEP = '';

  const stripSuffix = n => String(n || '').replace(/\s*(SDN\.?\s*BHD\.?|SENDIRIAN\s+BERHAD)\s*$/i, '').trim();
  function splitAddress(s, n) {                            // text -> up to n lines, overflow merged into the last
    const parts = String(s || '').split(/\s*[\n,]\s*/).filter(Boolean);
    const out = parts.length > n ? parts.slice(0, n - 1).concat([parts.slice(n - 1).join(', ')]) : parts.slice();
    while (out.length < n) out.push('');
    return out;
  }
  const rolesOf = p => String(p.roles || '').toLowerCase().split(/[,;/]/).map(x => x.trim());
  const isForeignCountryName = s => /PTE|LTD|LIMITED|INC|LLC|GMBH|CO\.|CORP/i.test(s || '');
  const isMalaysianCo = s => /SDN\.?\s*BHD|SENDIRIAN\s+BERHAD/i.test(s || '');

  /* ---------------- dialogs ---------------- */
  function dialogRoot(titleRe) {
    const h = $$(document, '*').find(e => e.children.length === 0 && titleRe.test(txt(e)) && vis(e));
    if (!h) return null;
    let c = h;
    for (let k = 0; k < 12 && c && $$(c, 'input,select').length <= 5; k++) c = c.parentElement;
    return c;
  }
  async function waitDialog(titleRe, open) {
    for (let i = 0; i < 40; i++) { const d = dialogRoot(titleRe); if (open ? d : !d) return d || true; await sleep(300); }
    return null;
  }
  async function waitClosed(titleRe, what) {                // waits for the human to press the blue Save
    setStep(`👉 Check the form, then click the blue SAVE button (${what}). I will continue by myself.`);
    for (let i = 0; i < 2000; i++) {
      if (!dialogRoot(titleRe)) return true;
      if (i % 6 === 5) {                                    // every 3 s: say WHY Save may be refused
        const bad = $$(document, '*').filter(e => e.children.length === 0 && /is required|invalid/i.test(txt(e)) && vis(e)).map(e => txt(e).replace(/^Field\s+/i, '')).slice(0, 6);
        if (bad.length) setStep(`👉 Cannot save yet - still required: ${[...new Set(bad)].join('; ')}. Fill by hand (or put it in corrected_value), then click SAVE.`);
      }
      await sleep(500);
    }
    return false;
  }
  const clickBtn = re => { const b = $$(document, 'button').find(x => re.test(txt(x)) && vis(x)); if (b) b.click(); return !!b; };

  async function postcodeBlock(root, a, idx) {             // postcode first -> City -> State -> Country
    await T(root, /^Postcode$/i, a.postcode, 'Postcode', idx || 0);
    await sleep(2200);
    await S(root, /^City$/i, a.city, 'City', idx || 0);
    await sleep(900);
    await S(root, /^State$/i, a.state, 'State', idx || 0);
    await S(root, /^Country$/i, a.country, 'Country', idx || 0);
  }

  /* ---------------- sections ---------------- */
  async function fillNameSearch() {
    const c = DATA.company, N = FIXED.nameSearch, root = document;
    setStep('Filling Name Search…');
    await S(root, /^Category$/i, N.category, 'Category'); await sleep(900);
    await S(root, /Type of Company/i, N.type, 'Type of Company'); await sleep(700);
    await S(root, /Sub Type/i, N.sub, 'Sub Type'); await sleep(600);
    await S(root, /Suffix|Ending/i, N.suffix, 'Suffix');
    await S(root, /Type of Application/i, N.application, 'Type of Application'); await sleep(600);
    await T(root, /Proposed Company Name|^Company Name$/i, stripSuffix(c.name_1), 'Company name');
    setStep('👉 Check Name Search, then click the green SEARCH button yourself. After the form opens, press “Fill everything”.');
  }

  async function fillCompanyDetails() {
    const c = DATA.company, R = FIXED.regAddr, root = document;
    setStep('Company Details…');
    const dl = fields(root, /Business Code/i)[0];
    if (dl) {
      const codes = ['msic_1', 'msic_2', 'msic_3'].map(k => c[k]).filter(Boolean);
      for (const code of codes) {
        let inputs = fields(root, /Business Code/i);
        let box = inputs.find(i => !i.value);
        if (!box) {                                         // need another row: press the add button in that section
          const sec = inputs[0].closest('div[class*=card],section,div') || document;
          let c2 = inputs[0]; for (let i = 0; i < 6 && c2 && !$$(c2, 'button').some(b => /add/i.test(txt(b))); i++) c2 = c2.parentElement;
          const ab = c2 && $$(c2, 'button').find(b => /add/i.test(txt(b)));
          if (ab) ab.click(); await sleep(600);
          inputs = fields(root, /Business Code/i); box = inputs.find(i => !i.value);
        }
        if (!box) { mark(false, `Business code ${code}: no empty box (add it by hand)`); continue; }
        setText(box, code.trim()); await sleep(500);
        mark(true, `Business code: ${code}`);
      }
    } else mark(false, 'Business code: field not found');
    await T(root, /Nature of Business/i, c.nature_of_business, 'Nature of business');
    await T(root, /Business URL/i, c.business_url, 'Business URL');
    const a = $$(root, 'input').filter(e => vis(e) && /Local Address/i.test(labelOf(e)) && e.type === 'text');
    // registered address block = first Local Address group on the page
    const grp = a.slice(0, 3);
    [R.l1, R.l2, R.l3].forEach((v, i) => { if (v && grp[i]) setText(grp[i], v); });
    mark(!!grp[0], 'Registered address lines');
    await postcodeBlock(root, R, 0);
    await T(root, /^Email$/i, R.email, 'Registered email', 0);
    await T(root, /Office No/i, R.office, 'Office No.');
    mark(true, 'Business address left unticked (registered only)');
  }

  async function fillSecretary() {
    const root = document;
    setStep('Secretary…');
    const f = fields(root, /^SSM PC No\.?$/i).find(e => !readOnly(e));
    if (!f) return mark(false, 'Secretary SSM PC No.: field not found');
    setText(f, FIXED.secretaryPC); await sleep(300);
    f.scrollIntoView({ block: 'center' });
    let c = f; for (let i = 0; i < 6 && c && !$$(c, 'button').some(b => /search/i.test(txt(b))); i++) c = c.parentElement;
    const b = c && $$(c, 'button').find(x => /search/i.test(txt(x)));
    if (!b) return mark(false, 'Secretary Search button not found');
    b.click();
    for (let i = 0; i < 60; i++) { if ($$(root, 'h1,h2,h3,h4,h5').some(h => /Particulars of Secretary/i.test(txt(h)) && vis(h))) break; await sleep(500); }
    await sleep(800);
    const part = $$(root, 'h1,h2,h3,h4,h5').find(h => /Particulars of Secretary/i.test(txt(h)));
    if (!part) return mark(false, 'Secretary details did not appear (CRS slow?). Press Fill everything again.');
    let sec = part; for (let i = 0; i < 8 && sec && $$(sec, 'select,input').length < 6; i++) sec = sec.parentElement;
    mark(radio(sec, null, /^MALE$/i), 'Secretary gender: MALE');
    await S(sec, /^Race$/i, FIXED.secretaryRace, 'Secretary race');
    // residential address = the next "Residential Address" block after the secretary particulars
    const ra = $$(root, 'h1,h2,h3,h4,h5').filter(h => /^Residential Address$/i.test(txt(h)) && vis(h)).pop();
    if (ra) {
      let r = ra; for (let i = 0; i < 8 && r && $$(r, 'input,select').length < 6; i++) r = r.parentElement;
      const A = FIXED.secAddr, lines = $$(r, 'input[type=text]').filter(e => vis(e) && /Address Line|Local Address/i.test((e.placeholder || '') + labelOf(e)));
      [A.l1, A.l2, A.l3].forEach((v, i) => { if (v && lines[i]) setText(lines[i], v); });
      mark(!!lines[0], 'Secretary residential address lines');
      await postcodeBlock(r, A, 0);
    } else mark(false, 'Secretary residential address block not found');
  }

  /* required value absent in the Sheet (MISSING rows are never sent) -> tell the human, never silently skip */
  const need = (what, val) => { if (!String(val || '').trim()) mark(false, `${what}: MISSING in Sheet - type it in "corrected_value", or fill it by hand`); };

  async function shareholding(root, units, label) {
    check(root, /CASH/i, true);
    if (!/^\d+(\.\d+)?$/.test(String(units || '').trim()) || Number(units) <= 0) {
      mark(false, `${label}: number of shares MISSING in Sheet - type it in "corrected_value" (Extract tab), or fill Number of Unit by hand. Amount left untouched.`);
      return;                                                // never type 0.0000 into Amount: that is what made the form look stuck
    }
    const uf = fields(root, /Number of Unit/i).find(e => !readOnly(e)) || inputByText(root, /Number of Unit/i);
    if (!uf) return mark(false, `${label}: "Number of Unit" box not found - run cosecDebug() in the console and send me the text`);
    uf.scrollIntoView({ block: 'center' }); setText(uf, String(units).trim()); await sleep(400);
    mark(uf.value.trim() === String(units).trim(), `${label} number of units: ${uf.value}`);
    await amountField(root, units);                         // amount = units x RM1
    const price = fields(root, /Price per Share/i)[0];
    if (price) mark(/^1(\.0+)?$/.test(price.value), `Price per share: ${price.value}`);
  }

  const COUNTRIES = ['SINGAPORE', 'CHINA', 'HONG KONG', 'TAIWAN', 'MALAYSIA', 'INDONESIA', 'THAILAND', 'VIETNAM', 'PHILIPPINES', 'INDIA', 'JAPAN', 'KOREA', 'UNITED KINGDOM', 'AUSTRALIA', 'UNITED STATES'];
  async function residential(root, p, who) {                 // Local (Malaysia) or Foreign address, exactly as the client gave it
    const addr = String(p.home_address_text || [p.addr_line1, p.addr_line2, p.addr_line3, p.postcode, p.city, p.state].filter(Boolean).join(', ')).trim();
    if (!addr) return mark(false, `${who} residential address: MISSING in Sheet - type it in corrected_value (home_address_text), or fill by hand`);
    const up = U(addr);
    const country = U(p.country) || COUNTRIES.find(c => up.includes(c)) || U(p.nationality);
    const local = country === 'MALAYSIA';
    if (!radio(root, null, local ? /Local Address/i : /Foreign Address/i)) mark(false, `${who} residential: ${local ? 'Local' : 'Foreign'} Address option not found`);
    await sleep(900);
    if (local && p.addr_line1) {
      [p.addr_line1, p.addr_line2, p.addr_line3].forEach((v, i) => { const l = $$(root, 'input[type=text]').filter(e => vis(e) && /Address Line/i.test(e.placeholder || ''))[i]; if (v && l) setText(l, v); });
      await postcodeBlock(root, { postcode: p.postcode, city: p.city, state: p.state, country: 'MALAYSIA' }, 0);
    } else if (local) {
      mark(false, `${who} residential (Malaysia): split address (lines/postcode/city/state) not in Sheet - fill by hand: ${addr.slice(0, 60)}`);
    } else {
      const ls = splitAddress(addr, 3);
      const fa = $$(root, 'input[type=text]').filter(e => vis(e) && !readOnly(e) && /Foreign (Residential )?Address/i.test(labelOf(e)));
      ls.forEach((v, i) => { if (v && fa[i]) setText(fa[i], v); });
      mark(!!fa[0], `${who} foreign residential address lines` + (fa.length < 3 ? ' (only ' + fa.length + ' box(es) found)' : ''));
      await S(root, /^Country$/i, country, `${who} address country`, -1);
    }
  }

  async function fillPerson(root, p, asMember) {
    const idt = U(p.id_type || (/^[STFG]\d{7}[A-Z]$/i.test(p.id_number || '') ? 'FOREIGNER NATIONAL ID' : 'MYKAD'));
    await S(root, /^Identification Type$/i, idt, 'ID type');
    await sleep(500);
    await T(root, /^Identification No\.?$/i, p.id_number, 'ID number');
    await sleep(900);
    await S(root, /Secondary Identification Type/i, 'PASSPORT', 'Secondary ID type');
    await T(root, /Secondary Identification No/i, p.passport_number, 'Passport number');
    await T(root, /Secondary Identification Expiry/i, p.passport_expiry, 'Passport expiry');
    await T(root, /^Name \(as per/i, p.full_name, 'Name');
    await T(root, /Date of Birth/i, p.dob, 'Date of birth');
    mark(radio(root, null, new RegExp('^' + (U(p.gender) === 'FEMALE' ? 'FEMALE' : 'MALE') + '$', 'i')), `Gender: ${p.gender}`);
    await S(root, /^Nationality$/i, p.nationality, 'Nationality');
    await S(root, /^Race$/i, p.race, 'Race');
    await T(root, /Phone No/i, (p.phone || '').replace(/[^\d]/g, ''), 'Phone');
    await T(root, /^Email$/i, p.email, 'Email');
    [['Name', p.full_name], ['ID number', p.id_number], ['Date of birth', p.dob], ['Gender', p.gender], ['Nationality', p.nationality], ['Race', p.race], ['Phone', p.phone], ['Email', p.email]].forEach(([w, v]) => need((asMember ? 'Member ' : 'Director ') + w, v));
    await S(root, /^Citizenship$/i, p.citizenship, 'Citizenship');
    await residential(root, p, asMember ? 'Member' : 'Director');
  }

  async function addDirector(p) {
    if (!clickBtn(/Add Director/i)) return mark(false, 'Add Director button not found');
    const root = await waitDialog(/^Director Details$/, true);
    if (!root) return mark(false, 'Director dialog did not open');
    await sleep(600);
    setStep(`Director: ${p.full_name}…`);
    const alsoMember = rolesOf(p).includes('shareholder') || U(p.units) !== '';
    if (alsoMember && rolesOf(p).includes('shareholder')) check(root, /MEMBER/i, true);
    await fillPerson(root, p);
    if (alsoMember && rolesOf(p).includes('shareholder')) { await sleep(600); await shareholding(root, p.units, 'Director-member'); }
    await waitClosed(/^Director Details$/, 'Director ' + p.full_name);
  }

  async function addMemberPerson(p) {
    if (!clickBtn(/Add Member/i)) return mark(false, 'Add Member button not found');
    const root = await waitDialog(/^Member Details$/, true);
    if (!root) return mark(false, 'Member dialog did not open');
    await sleep(600);
    setStep(`Member: ${p.full_name}…`);
    radio(root, /Type of Member/i, /INDIVIDUAL/i); await sleep(500);
    await fillPerson(root, p, true);
    await shareholding(root, p.units, 'Member');
    await waitClosed(/^Member Details$/, 'Member ' + p.full_name);
  }

  async function addMemberCorp(k) {
    if (!clickBtn(/Add Member/i)) return mark(false, 'Add Member button not found');
    const root = await waitDialog(/^Member Details$/, true);
    if (!root) return mark(false, 'Member dialog did not open');
    await sleep(600);
    setStep(`Company shareholder: ${k.entity_name}…`);
    radio(root, /Type of Member/i, /BODY CORPORATE/i); await sleep(600);
    const my = isMalaysianCo(k.entity_name);
    radio(root, /Registered with SSM/i, my ? /^Yes$/i : /^No$/i); await sleep(600);
    await S(root, /Category of Member/i, k.category || (my ? '' : 'FOREIGN ENTITY NOT REGISTERED WITH SSM'), 'Category');
    await T(root, /Entity No/i, k.entity_no, 'Entity No.');
    if (my) mark(false, 'Malaysian company: click the Search button next to Entity No. yourself, then press Fill everything again if fields stay empty');
    await T(root, /Entity Name/i, k.entity_name, 'Entity name');
    await T(root, /Date of Incorporation/i, k.incorporation_date, 'Date of incorporation');
    await T(root, /Place of Incorporation/i, k.place_of_incorporation, 'Place of incorporation');
    await T(root, /Enactment Act/i, k.enactment_act, 'Enactment Act');
    await T(root, /^Email$/i, k.email || k.rep_email, 'Entity email');
    if (!my) {
      radio(root, null, /Foreign Address/i); await sleep(900);
      const ls = splitAddress(k.registered_office, 3);
      const fa = $$(root, 'input[type=text]').filter(e => vis(e) && !readOnly(e) && /Foreign (Registered )?Address/i.test(labelOf(e)));
      ls.forEach((v, i) => { if (v && fa[i]) setText(fa[i], v); });
      mark(!!fa[0], 'Foreign address lines' + (fa.length < 3 ? ' (only ' + fa.length + ' box(es) found)' : ''));
      await S(root, /^Country$/i, k.place_of_incorporation, 'Address country', -1);
    }
    [['Entity No.', k.entity_no], ['Date of incorporation', k.incorporation_date], ['Place of incorporation', k.place_of_incorporation], ['Entity email', k.email || k.rep_email], ['Registered office', k.registered_office], ['Representative name', k.rep_name], ['Representative ID no.', k.rep_id_number], ['Representative designation', k.rep_designation]].forEach(([w, v]) => need('Company shareholder ' + w, v));
    await shareholding(root, k.units, 'Company shareholder');
    await T(root, /Name of Person/i, k.rep_name, 'Representative name');
    await S(root, /Identification Type/i, k.rep_id_type || 'FOREIGNER NATIONAL ID', 'Representative ID type', 0);
    await T(root, /Identification No/i, k.rep_id_number, 'Representative ID number');
    await S(root, /Designation/i, (k.rep_designation || 'DIRECTOR').toUpperCase(), 'Representative designation');
    await waitClosed(/^Member Details$/, 'Company shareholder');
  }

  async function fillAll() {
    if (BUSY) return;
    if (!DATA) return setStep('Pick a case first (step 1).');
    BUSY = true; log.length = 0; render();
    try {
      if (!/Business Code/i.test(document.body.innerText)) { setStep('Open the form first: click Search on Name Search. Then press this button again.'); BUSY = false; return; }
      await fillCompanyDetails();
      await fillSecretary();
      const have = n => document.body.innerText.toUpperCase().includes(U(n));
      const persons = Object.values(DATA.persons), corps = Object.values(DATA.corps);
      for (const p of persons.filter(p => rolesOf(p).includes('director'))) {
        if (have(p.full_name) && $$(document, 'table').some(t => U(t.innerText).includes(U(p.full_name)))) { mark(true, `Director ${p.full_name}: already in list, skipped`); continue; }
        await addDirector(p);
      }
      for (const p of persons.filter(p => rolesOf(p).includes('shareholder') && !rolesOf(p).includes('director')))
        await addMemberPerson(p);
      for (const k of corps) {
        if ($$(document, 'table').some(t => U(t.innerText).includes(U(k.entity_name)))) { mark(true, `Shareholder ${k.entity_name}: already in list, skipped`); continue; }
        await addMemberCorp(k);
      }
      const bad = log.filter(l => l[0] === '⚠').length;
      setStep(bad ? `Done with ${bad} ⚠ item(s). Fix the ⚠ lines by hand, then press “Tick declarations”.` : 'All filled ✔. Check the form, press “Tick declarations”, then you Save / Submit.');
    } catch (e) { mark(false, 'Stopped: ' + e.message); setStep('Something broke. Take a screenshot of this panel and tell the admin.'); }
    BUSY = false;
  }

  async function tickDeclarations() {
    if (!confirm('You confirm that the facts in this application are true to the best of your knowledge (s.591 Companies Act). Tick the boxes now?')) return;
    radio(document, /Do you have any employee/i, /^No$/i);
    check(document, /ANY EMPLOYEE WHO PROVIDES ANY STATEMENT/i, true);
    check(document, /I CONFIRM THAT THE FACTS/i, true);
    setStep('Ticked: employee = NO, EPF, Declaration. Now Save / Submit yourself.');
  }

  async function markEntered() {
    if (!CUR) return;
    if (!confirm('Mark this case as ENTERED in the Sheet (turns the rows green)?')) return;
    try { const r = await api('mark', '&id=' + encodeURIComponent(CUR) + '&status=Entered'); setStep(r.ok ? 'Sheet updated: Entered ✔' : 'Sheet error: ' + r.error); } catch (e) { setStep(e.message); }
    loadList();
  }

  /* ---------------- panel ---------------- */
  const P = document.createElement('div');
  P.style.cssText = 'position:fixed;right:12px;bottom:12px;width:330px;max-height:78vh;overflow:auto;z-index:99999;background:#fff;border:2px solid #1b2a6b;border-radius:10px;font:13px/1.4 Arial,sans-serif;color:#111;box-shadow:0 4px 18px rgba(0,0,0,.35)';
  document.body.appendChild(P);
  const btn = (t, cls) => `<button data-a="${cls}" style="display:block;width:100%;margin:6px 0;padding:10px;font:bold 13px Arial;border:0;border-radius:6px;color:#fff;background:${cls === 'fill' ? '#1b7a3a' : cls === 'tick' ? '#b36b00' : cls === 'done' ? '#1b2a6b' : '#555'};cursor:pointer">${t}</button>`;
  function setStep(t) { STEP = t; render(); }
  function render() {
    const opts = CASES.map(c => `<option value="${c.id}" ${c.id === CUR ? 'selected' : ''}>${c.id} — ${(c.company || '').slice(0, 34)}${c.status ? ' [' + c.status + ']' : ''}</option>`).join('');
    const onName = /Name Search/i.test(document.body.innerText) && !/Business Code/i.test(document.body.innerText);
    P.innerHTML = `<div style="background:#1b2a6b;color:#fff;padding:8px 10px;font-weight:bold">COSEC CRS Filler <span id="cx_min" style="float:right;cursor:pointer">—</span></div>
    <div id="cx_body" style="padding:8px 10px">
      <div><b>Step 1.</b> Pick the case</div>
      <select id="cx_case" style="width:100%;padding:6px;margin:4px 0"><option value="">— choose —</option>${opts}</select>
      ${btn('↻ Refresh case list', 'refresh')}
      <div><b>Step 2.</b> ${onName ? 'You are on Name Search' : 'You are on the main form'}</div>
      ${onName ? btn('Fill Name Search', 'name') : btn('FILL EVERYTHING', 'fill')}
      <div><b>Step 3.</b> When all is filled</div>
      ${btn('Tick declarations', 'tick')}${btn('Mark case ENTERED in Sheet', 'done')}
      <div style="margin:6px 0;padding:6px;background:#fff7d6;border-radius:6px;min-height:34px">${STEP || 'Start with Step 1.'}</div>
      <div style="font-size:12px;max-height:150px;overflow:auto">${log.slice(-40).map(l => `<div>${l[0]} ${l[1]}</div>`).join('')}</div>
    </div>`;
    const sel = P.querySelector('#cx_case'); if (sel) sel.onchange = () => pickCase(sel.value);
    P.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => ({ refresh: loadList, name: fillNameSearchGo, fill: fillAll, tick: tickDeclarations, done: markEntered }[b.dataset.a])());
    const m = P.querySelector('#cx_min'); if (m) m.onclick = () => { const b = P.querySelector('#cx_body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
  }
  async function fillNameSearchGo() { if (!DATA) return setStep('Pick a case first (step 1).'); if (BUSY) return; BUSY = true; log.length = 0; try { await fillNameSearch(); } catch (e) { mark(false, e.message); } BUSY = false; }

  async function pickCase(id) {
    CUR = id || null; DATA = null; GM_setValue('last_case', id || '');
    if (!id) return render();
    setStep('Loading case from Sheet…');
    try {
      const r = await api('case', '&id=' + encodeURIComponent(id));
      if (!r.ok) return setStep('Sheet error: ' + r.error);
      DATA = r.data;
      const np = Object.keys(DATA.persons).length, nc = Object.keys(DATA.corps).length;
      setStep(`Loaded: ${stripSuffix(DATA.company.name_1)} · ${np} person(s) · ${nc} company shareholder(s).`);
    } catch (e) { setStep(e.message); }
  }
  async function loadList() {
    if (!API_URL || !TOKEN) return setStep('Reload the page and enter the API URL and TOKEN when asked.');
    try {
      const r = await api('list');
      if (!r.ok) return setStep('Sheet error: ' + r.error);
      CASES = r.cases.filter(c => !/^(Delete|Entered|Archived)$/i.test(c.status || '')); setStep(CASES.length + ' case(s) not yet Entered.');
      const last = GM_getValue('last_case', ''); if (last && !CUR && CASES.some(c => c.id === last)) { CUR = last; render(); pickCase(last); }
    } catch (e) { setStep(e.message); }
  }
  render(); loadList();
  setInterval(() => { if (!BUSY) { const on = /Business Code/i.test(document.body.innerText); if (P.dataset.on !== String(on)) { P.dataset.on = String(on); render(); } } }, 1500);
})();
