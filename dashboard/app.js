// Token Radar's dashboard (radar-11). Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail view with the model's own inputs,
// the protocol's costed farm plan at three capitals, the live-token comparables, the set-aside
// list, the method and backtest tab, the family and fee tables, and the interactive lab. No
// network: every byte it shows is in data.js. No name is special-cased. The detail view
// recomputes each row's farm economics live from the row's own figures (slice = capital /
// (TVL + capital) x share x implied; net = slice - fees - T-bill); at the default $1,000 / 10%
// with breadth on it must match board.json exactly.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  // v10's data.js names the row fields with their units (tvl, fees_usd,
  // min_deposit_usd, time_minutes) and the watchlist flag is_watchlist; the
  // view below uses the shorter names. Alias them here so the rendering code
  // reads one shape; no value is changed, and the drawer recompute below
  // still reads the row's own figures.
  DATA.board.forEach(function (r) {
    r.tvl_usd = r.tvl;
    r.watchlist = r.is_watchlist;
    r.chain = r.farm.chain;
    r.hold_days = r.farm.hold_days;
    r.minutes = r.farm.time_minutes;
    r.p10_usd = r.model.p10_usd;
    r.p90_usd = r.model.p90_usd;
    r.farm.fees = r.farm.fees_usd;
    r.farm.min_deposit = r.farm.min_deposit_usd;
  });
  DATA.live.forEach(function (p) { p.tvl_usd = p.tvl; p.mcap_tvl = p.fdv_tvl; });
  DATA.set_aside_rows.forEach(function (p) { p.tvl_usd = p.tvl; });
  var app = document.getElementById('board');
  var BT = DATA.model;
  var state = { tab: 'board', q: '', category: 'all', chain: 'all', verdict: 'all', minTvl: 0, capital: 1000, share: 0.1, breadth: true, tier: 1000, sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var s = n < 0 ? '-$' : '$';
    return s + Math.abs(n).toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  // The farm economics of one row at a capital and airdrop share, recomputed live from the row's
  // own figures: slice = capital / (TVL + capital) x share x implied; net = slice - fees - T-bill.
  // With breadth off, the implied value is the board value divided by its breadth factor.
  function econOf(row, capital, share, breadthOn) {
    var implied = breadthOn === false ? row.implied_value_usd / row.model.breadth_factor : row.implied_value_usd;
    var slice = (capital / (row.tvl_usd + capital)) * share * implied;
    var tbill = 0.04 * capital * (row.hold_days / 365);
    var net = slice - row.farm.fees - tbill;
    var verdict = net > 0 ? 'FARM' : slice > row.farm.fees ? 'THIN' : 'SKIP';
    return { implied: implied, slice: slice, tbill: tbill, net: net, verdict: verdict, perHour: net / (row.minutes / 60) };
  }

  // The flat multiple the detail view compares against: the median mcap/TVL over the comps.
  function flatMultiple() {
    var rs = DATA.curve_points.map(function (p) { return p.mcap / p.tvl; }).sort(function (a, b) { return a - b; });
    return rs[Math.floor(rs.length / 2)];
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('verdict')) state.verdict = p.get('verdict');
    if (p.get('mintvl')) state.minTvl = Number(p.get('mintvl')) || 0;
    if (p.get('capital')) state.capital = Number(p.get('capital')) || 1000;
    if (p.get('share')) state.share = Number(p.get('share')) || 0.1;
    if (p.get('breadth') === 'off') state.breadth = false;
    if (p.get('tier')) state.tier = Number(p.get('tier')) || 1000;
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.tab !== 'board') p.set('tab', state.tab);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.verdict !== 'all') p.set('verdict', state.verdict);
    if (state.minTvl) p.set('mintvl', String(state.minTvl));
    if (state.capital !== 1000) p.set('capital', String(state.capital));
    if (state.share !== 0.1) p.set('share', String(state.share));
    if (!state.breadth) p.set('breadth', 'off');
    if (state.tier !== 1000) p.set('tier', String(state.tier));
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : '#');
  }

  function money(n) { return fmtUsd(n); }

  function renderHero() {
    var h = el('header', { class: 'hero' },
      el('h1', { text: 'Token Radar: comps curve tested blind, costed farm plan for every pre-token protocol' }),
      el('p', { class: 'lede', text: DATA.universe.ranked + ' protocols record no token. Here is what each launch would be worth, and what farming it costs. Values are this radar\u2019s own estimate from the snapshot, not a forecast that a token will launch.' }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: String(DATA.universe.ranked) }), el('span', { text: 'ranked pre-token' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.universe.traded) }), el('span', { text: 'traded apart' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.universe.set_aside) }), el('span', { text: 'set aside' })),
        el('div', { class: 'stat' }, el('b', { text: DATA.verdict_counts.farm + ' farm' }), el('span', { text: DATA.verdict_counts.thin + ' thin, ' + DATA.verdict_counts.skip + ' skip at $1.0K' })),
        el('div', { class: 'stat' }, el('b', { text: money(DATA.board[0].implied_value_usd) }), el('span', { text: 'top implied value' }))),
      el('div', { class: 'howto' },
        el('h2', { text: 'How a launch is priced' }),
        el('p', { html: 'value = 10<sup>' + BT.a.toFixed(2) + '</sup> \u00d7 (TVL / $100M)<sup>' + BT.b.toFixed(3) + '</sup> \u00d7 family \u00d7 growth \u00d7 seasoning \u00d7 sibling \u00d7 breadth \u2014 a power-law curve fit by least squares on ' + BT.comps_count + ' traded tokens, not a flat multiple.' }),
        el('p', { text: 'Blind test (leave-one-out): median miss x' + BT.loo_miss.toFixed(2) + ' vs x' + BT.loo_flat_miss.toFixed(2) + ' for a flat multiple; ' + Math.round(BT.loo_within3 * 100) + '% within 3x of the real cap (flat ' + Math.round(BT.loo_flat_within3 * 100) + '%). Time split: x' + BT.oos_miss.toFixed(2) + ' vs x' + BT.oos_flat_miss.toFixed(2) + ' flat.' }),
        el('div', { class: 'nums' },
          el('div', null, 'Best net per hour on the watchlist: ', el('b', { text: DATA.best_per_hour.map(function (x) { return x.name + ' +$' + x.per_hour_usd.toFixed(2) + '/h'; }).join(', ') })),
          el('div', null, 'Farm verdicts are net of every fee and the 4% T-bill given up: ', el('b', { text: 'FARM beats all of it, THIN beats fees only, SKIP does not.' })),
          el('div', null, 'New in this version: every row carries farm plans at $100, $1,000 and $10,000, a full model decomposition, and its uncertainty band. The lab tab lets you change the capital, the share and the breadth factor and re-rank the board live.'))));
    return h;
  }

  function renderTabs() {
    var tabs = [
      ['board', 'No token yet ' + DATA.universe.ranked],
      ['method', 'Method and backtest'],
      ['family', 'Families and fees'],
      ['lab', 'Interactive lab'],
    ];
    var nav = el('nav', { class: 'tabs' });
    tabs.forEach(function (t) {
      nav.appendChild(el('button', { class: state.tab === t[0] ? 'on' : '', text: t[1], onclick: function () { state.tab = t[0]; state.selected = null; writeHash(); render(); } }));
    });
    return nav;
  }

  function scatterChart(rows) {
    var W = 880, H = 300, PL = 70, PR = 16, PT = 14, PB = 34;
    var x0 = Math.log10(5e6), x1 = Math.log10(3e10), y0 = Math.log10(1e5), y1 = Math.log10(2e9);
    function X(v) { return PL + (Math.log10(v) - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (Math.log10(v) - y0) / (y1 - y0)) * (H - PT - PB); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Traded tokens and the fitted curve">';
    var ticks = [[1e7, '$10M'], [1e8, '$100M'], [1e9, '$1B'], [1e10, '$10B']];
    ticks.forEach(function (t) {
      s += '<line x1="' + X(t[0]).toFixed(1) + '" y1="' + PT + '" x2="' + X(t[0]).toFixed(1) + '" y2="' + (H - PB) + '" stroke="#3a2f22"/>';
      s += '<text x="' + X(t[0]).toFixed(1) + '" y="' + (H - 12) + '" fill="#b8a88e" font-size="11" text-anchor="middle">' + t[1] + '</text>';
    });
    [[1e6, '$1M'], [1e7, '$10M'], [1e8, '$100M'], [1e9, '$1B']].forEach(function (t) {
      s += '<line x1="' + PL + '" y1="' + Y(t[0]).toFixed(1) + '" x2="' + (W - PR) + '" y2="' + Y(t[0]).toFixed(1) + '" stroke="#3a2f22"/>';
      s += '<text x="' + (PL - 6) + '" y="' + (Y(t[0]) + 4).toFixed(1) + '" fill="#b8a88e" font-size="11" text-anchor="end">' + t[1] + '</text>';
    });
    s += '<text x="' + (W / 2) + '" y="' + (H - 2) + '" fill="#b8a88e" font-size="11" text-anchor="middle">TVL (log scale)</text>';
    var line = '';
    for (var i = 0; i <= 40; i++) {
      var tvl = Math.pow(10, x0 + (x1 - x0) * i / 40);
      var v = Math.pow(10, BT.a + BT.b * Math.log10(tvl / 1e8));
      line += (i === 0 ? 'M' : 'L') + X(tvl).toFixed(1) + ',' + Y(Math.max(1e5, Math.min(2e9, v))).toFixed(1);
    }
    s += '<path d="' + line + '" fill="none" stroke="#f5a623" stroke-width="2"/>';
    DATA.curve_points.forEach(function (p) {
      s += '<circle cx="' + X(p.tvl).toFixed(1) + '" cy="' + Y(Math.max(1e5, Math.min(2e9, p.mcap))).toFixed(1) + '" r="2.6" fill="#8a7a63"/>';
    });
    rows.forEach(function (r) {
      s += '<circle cx="' + X(r.tvl_usd).toFixed(1) + '" cy="' + Y(Math.max(1e5, Math.min(2e9, r.implied_value_usd))).toFixed(1) + '" r="2.6" fill="#f5a623"/>';
    });
    s += '<text x="' + (PL + 4) + '" y="' + (PT + 12) + '" fill="#f2e9d8" font-size="12">Traded tokens and the curve: grey = ' + BT.comps_count + ' traded tokens, amber = ' + (rows.length === DATA.universe.ranked ? 'this board' : 'the ' + rows.length + ' shown rows') + ', line = value = 10^' + BT.a.toFixed(2) + ' x (TVL/$100M)^' + BT.b.toFixed(3) + '</text>';
    s += '</svg>';
    return el('div', { class: 'chartwrap', html: s });
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.board.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.verdict !== 'all') { var e = econOf(r, state.capital, state.share, state.breadth); if (e.verdict !== state.verdict) return false; }
      return true;
    });
  }

  function sortRows(rows) {
    var key = state.sort, dir = state.dir;
    var val = function (r) {
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'change') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? -Infinity : r.age_days;
      if (key === 'net') return econOf(r, state.capital, state.share, state.breadth).net;
      if (key === 'perhour') return econOf(r, state.capital, state.share, state.breadth).perHour;
      if (key === 'slice') return econOf(r, state.capital, state.share, state.breadth).slice;
      if (key === 'name') return r.name;
      return r.implied_value_usd;
    };
    return rows.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (typeof va === 'string') return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      return (va - vb) * dir || (a.slug < b.slug ? -1 : 1);
    });
  }

  function renderBoard() {
    var wrap = el('div');
    var cats = ['all'];
    DATA.board.forEach(function (r) { var c = r.category || 'Uncategorized'; if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort();
    var chains = ['all'];
    DATA.board.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var f = el('div', { class: 'filters' });
    var q = el('input', { type: 'search', placeholder: 'Search protocol\u2026', value: state.q, oninput: function (e) { state.q = e.target.value; writeHash(); render(); } });
    var cat = el('select', { onchange: function (e) { state.category = e.target.value; writeHash(); render(); } });
    cats.forEach(function (c) { cat.appendChild(el('option', { value: c, text: c === 'all' ? 'All families' : c })); });
    cat.value = state.category;
    var ch = el('select', { onchange: function (e) { state.chain = e.target.value; writeHash(); render(); } });
    chains.forEach(function (c) { ch.appendChild(el('option', { value: c, text: c === 'all' ? 'All chains' : c })); });
    ch.value = state.chain;
    var vd = el('select', { onchange: function (e) { state.verdict = e.target.value; writeHash(); render(); } });
    ['all', 'FARM', 'THIN', 'SKIP'].forEach(function (v) { vd.appendChild(el('option', { value: v, text: v === 'all' ? 'Any verdict' : v })); });
    vd.value = state.verdict;
    var mt = el('select', { onchange: function (e) { state.minTvl = Number(e.target.value); writeHash(); render(); } });
    [[0, 'Any TVL'], [25000000, 'TVL $25M+'], [100000000, 'TVL $100M+'], [500000000, 'TVL $500M+']].forEach(function (o) { mt.appendChild(el('option', { value: String(o[0]), text: o[1] })); });
    mt.value = String(state.minTvl);
    var cap = el('select', { onchange: function (e) { state.capital = Number(e.target.value); writeHash(); render(); } });
    [[1000, '$1,000 capital'], [10000, '$10,000 capital'], [100000, '$100,000 capital']].forEach(function (o) { cap.appendChild(el('option', { value: String(o[0]), text: o[1] })); });
    cap.value = String(state.capital);
    var sh = el('select', { onchange: function (e) { state.share = Number(e.target.value); writeHash(); render(); } });
    [[0.1, '10% airdrop share'], [0.05, '5% airdrop share'], [0.2, '20% airdrop share']].forEach(function (o) { sh.appendChild(el('option', { value: String(o[0]), text: o[1] })); });
    sh.value = String(state.share);
    f.append(q, el('label', { text: 'Family ' }), cat, el('label', { text: 'Chain ' }), ch, el('label', { text: 'Verdict ' }), vd, el('label', { text: 'Min TVL ' }), mt, el('label', { text: 'Capital ' }), cap, el('label', { text: 'Share ' }), sh);
    wrap.appendChild(f);
    var rows = sortRows(filteredRows());
    wrap.appendChild(el('div', { class: 'count', text: rows.length + ' of ' + DATA.universe.ranked + ' rows shown. Click a row for its detail, its build and its farm plan.' }));
    wrap.appendChild(scatterChart(rows));
    var table = el('table', { class: 'grid' });
    var head = el('tr');
    [['#', 'rank'], ['Protocol', 'name'], ['TVL', 'tvl'], ['7D', 'change'], ['Age', 'age'], ['Implied value \u00b7 P10 to P90', 'implied'], ['Slice', 'slice'], ['Net of all costs', 'net'], ['$/hour', 'perhour']].forEach(function (h) {
      head.appendChild(el('th', { class: 'num', text: h[0], onclick: function () { if (state.sort === h[1]) state.dir = -state.dir; else { state.sort = h[1]; state.dir = -1; } writeHash(); render(); } }));
    });
    table.appendChild(head);
    rows.forEach(function (r) {
      var e = econOf(r, state.capital, state.share, state.breadth);
      var lo = r.p10_usd, hi = r.p90_usd;
      var pct = (Math.log10(r.implied_value_usd) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
      var tr = el('tr', { class: 'row', onclick: function () { state.selected = r.slug; writeHash(); render(); } });
      tr.appendChild(el('td', { class: 'num', text: String(r.rank) }));
      var nameCell = el('td', null, el('b', { text: r.name }), r.watchlist ? el('span', { text: ' \u25cf watchlist' }) : null);
      nameCell.appendChild(el('span', { class: r.model.multi_chain ? 'tag' : 'tag single', text: r.model.multi_chain ? 'multi-chain' : 'single-chain' }));
      nameCell.appendChild(el('div', { class: 'note', text: (r.category || 'Uncategorized') + ' \u00b7 ' + r.chains.slice(0, 3).join(', ') }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'num', text: money(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      var bar = el('div', { class: 'bar' });
      bar.appendChild(el('i', {}));
      bar.firstChild.style.left = '0%';
      bar.firstChild.style.width = '100%';
      bar.appendChild(el('u', {}));
      bar.lastChild.style.left = (pct * 100).toFixed(1) + '%';
      tr.appendChild(el('td', { class: 'num' }, el('b', { text: money(r.implied_value_usd) }), el('div', { class: 'note', text: money(lo) + ' \u2013 ' + money(hi) }), bar));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd2(e.slice) }));
      tr.appendChild(el('td', { class: 'num' }, el('span', { class: 'pill ' + e.verdict, text: e.verdict }), el('div', null, fmtUsd2(e.net))));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd2(e.perHour) + '/h' }));
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }

  function nearestPeers(row) {
    return DATA.curve_points
      .map(function (p) { return { p: p, d: Math.abs(Math.log10(p.tvl) - Math.log10(row.tvl_usd)) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 6)
      .map(function (x) { return x.p; });
  }

  function tierOf(row, capital) {
    for (var i = 0; i < row.farm_tiers.length; i++) {
      if (row.farm_tiers[i].capital_usd === capital) return row.farm_tiers[i];
    }
    return row.farm_tiers[1];
  }

  function renderDetail() {
    var row = null;
    DATA.board.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) { state.selected = null; return renderBoard(); }
    var e = econOf(row, state.capital, state.share, state.breadth);
    var tier = tierOf(row, state.tier);
    var w = el('div', { class: 'detail' });
    w.appendChild(el('button', { class: 'back', text: '\u2190 Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } }));
    w.appendChild(el('h2', { text: row.name + ' \u2014 implied ' + money(row.implied_value_usd) }));
    w.appendChild(el('p', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.universe.ranked + ' \u00b7 ' + (row.category || 'Uncategorized') + ' \u00b7 TVL ' + money(row.tvl_usd) + ' \u00b7 7-day ' + fmtPct(row.change_7d) + ' \u00b7 no token for ' + fmtAge(row.age_days) + (row.watchlist ? ' \u00b7 on the watchlist' : '') + (row.model.multi_chain ? ' \u00b7 multi-chain (' + row.chains.length + ' chains)' : ' \u00b7 single-chain') }));
    w.appendChild(el('h3', { text: 'How ' + money(row.implied_value_usd) + ' is built' }));
    var kv = el('table', { class: 'kv' });
    kv.appendChild(el('tr', null, el('th', { text: 'Size curve' }), el('td', { class: 'num', text: money(row.model.curve_usd) }), el('td', { text: '10^' + BT.a.toFixed(2) + ' \u00d7 (TVL/$100M)^' + BT.b.toFixed(3) })));
    kv.appendChild(el('tr', null, el('th', { text: 'Family (' + (row.category || 'Uncategorized') + ')' }), el('td', { class: 'num', text: '\u00d7' + row.model.family_factor.toFixed(2) }), el('td', { text: 'mean residual of its traded peers, shrunk n/(n+20)' })));
    kv.appendChild(el('tr', null, el('th', { text: 'Growth (7-day ' + fmtPct(row.change_7d) + ')' }), el('td', { class: 'num', text: '\u00d7' + row.model.growth_factor.toFixed(2) }), el('td', { text: 'TVL two weeks ahead at the 7-day rate, through the slope' })));
    kv.appendChild(el('tr', null, el('th', { text: 'Seasoning (' + fmtAge(row.age_days) + ')' }), el('td', { class: 'num', text: '\u00d7' + row.model.seasoning_factor.toFixed(2) }), el('td', { text: 'x0.70 at launch, x1.15 at 18 months, x0.95 at 5 years' })));
    if (row.model.sibling_factor !== 1) kv.appendChild(el('tr', null, el('th', { text: 'Watchlist sibling' }), el('td', { class: 'num', text: '\u00d7' + row.model.sibling_factor.toFixed(2) }), el('td', { text: 'its first word matches a token that trades' })));
    kv.appendChild(el('tr', null, el('th', { text: 'Breadth (' + (row.model.multi_chain ? row.chains.length + ' chains' : '1 chain') + ')' }), el('td', { class: 'num', text: '\u00d7' + row.model.breadth_factor.toFixed(3) }), el('td', { text: 'multi-chain tokens trade ~7% lower; ridge slope ' + row.model.breadth_beta.toFixed(4) + ', shrunk, so the applied correction is ~0.4%' })));
    kv.appendChild(el('tr', null, el('th', { text: 'Implied value' }), el('td', { class: 'num' }, el('b', { text: money(row.implied_value_usd) })), el('td', { text: 'P25\u2013P75 ' + money(row.implied_value_usd * BT.p25) + ' \u2013 ' + money(row.implied_value_usd * BT.p75) + '; P10\u2013P90 ' + money(row.p10_usd) + ' \u2013 ' + money(row.p90_usd) + ', the blind residual range' })));
    kv.appendChild(el('tr', null, el('th', { text: 'Implied / TVL' }), el('td', { class: 'num', text: fmtMult(row.model.implied_tvl_multiple) }), el('td', { text: 'a flat multiple would price this row at ' + money(row.tvl_usd * flatMultiple()) })));
    w.appendChild(kv);
    var bandW = row.p90_usd / Math.max(1, row.p10_usd);
    w.appendChild(el('div', { class: 'callout', html: '<b>Uncertainty.</b> This row\u2019s P10\u2013P90 band is ' + money(row.p10_usd) + ' \u2013 ' + money(row.p90_usd) + ' (x' + bandW.toFixed(1) + ' wide). The model\u2019s blind test puts ' + Math.round(row.model.loo_within3 * 100) + '% of traded tokens within 3x of their real cap; the time splits miss by x' + row.model.oos_miss.toFixed(2) + ' (2025) and x' + row.model.oos2024_miss.toFixed(2) + ' (2024). Treat the implied value as an order of magnitude, not a price.' }));
    w.appendChild(el('h3', { text: 'Against traded peers' }));
    var peers = nearestPeers(row);
    var pt = el('table', { class: 'kv' });
    pt.appendChild(el('tr', null, el('th', { text: 'Nearest traded token by TVL' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' })));
    peers.forEach(function (p) {
      pt.appendChild(el('tr', null, el('td', null, el('b', { text: p.name || p.category }), el('div', { class: 'note', text: p.category })), el('td', { class: 'num', text: money(p.tvl) }), el('td', { class: 'num', text: money(p.mcap) }), el('td', { class: 'num', text: fmtMult(p.mcap / p.tvl) })));
    });
    w.appendChild(pt);
    w.appendChild(el('h3', { text: 'Farm plan \u2014 pick a capital' }));
    var tb = el('div', { class: 'tierbtns' });
    [100, 1000, 10000].forEach(function (c) {
      tb.appendChild(el('button', { class: state.tier === c ? 'on' : '', text: '$' + c.toLocaleString(), onclick: function () { state.tier = c; writeHash(); render(); } }));
    });
    w.appendChild(tb);
    w.appendChild(el('p', { class: 'note', text: 'Showing the $' + tier.capital_usd.toLocaleString() + ' plan on ' + tier.chain + ', cheapest of its first three chains. Slice ' + fmtUsd2(tier.slice_usd) + ', net ' + fmtUsd2(tier.net_usd) + ' \u00b7 ' + tier.verdict.toUpperCase() + ', ' + fmtUsd2(tier.per_hour_usd) + '/h.' }));
    var steps = el('ol', { class: 'steps' });
    tier.steps.forEach(function (s, i) {
      steps.appendChild(el('li', null, el('b', { text: (i + 1) + '. ' }), document.createTextNode(s)));
    });
    w.appendChild(steps);
    var sum = el('table', { class: 'kv' });
    sum.appendChild(el('tr', null, el('th', { text: 'Slice of the airdrop' }), el('td', { class: 'num', text: fmtUsd2(e.slice) }), el('td', { text: '$' + state.capital.toLocaleString() + ' / (TVL + $' + state.capital.toLocaleString() + ') \u00d7 ' + Math.round(state.share * 100) + '% \u00d7 implied value' })));
    sum.appendChild(el('tr', null, el('th', { text: 'Fees (gas + bridge)' }), el('td', { class: 'num', text: fmtUsd2(row.farm.fees) }), el('td', { text: 'cheapest chain: ' + row.chain })));
    sum.appendChild(el('tr', null, el('th', { text: 'T-bill forgone (4% x ' + row.hold_days + ' days)' }), el('td', { class: 'num', text: fmtUsd2(e.tbill) }), el('td', { text: 'the yield the capital gives up over the hold' })));
    sum.appendChild(el('tr', null, el('th', { text: 'Net of all costs' }), el('td', { class: 'num' }, el('b', { text: fmtUsd2(e.net) + ' \u00b7 ' + e.verdict })), el('td', { text: row.farm.min_deposit === null ? 'No deposit beats all costs on this row.' : 'Smallest deposit that beats all costs: $' + row.farm.min_deposit.toLocaleString() })));
    sum.appendChild(el('tr', null, el('th', { text: 'Work' }), el('td', { class: 'num', text: (row.minutes / 60).toFixed(1) + 'h' }), el('td', { text: fmtUsd2(e.perHour) + ' per hour' })));
    w.appendChild(sum);
    w.appendChild(el('h3', { text: 'Net at a launch drop, by deposit' }));
    var st = el('table', { class: 'kv' });
    st.appendChild(el('tr', null, el('th', { text: 'Launch drop' }), el('th', { class: 'num', text: '$1K' }), el('th', { class: 'num', text: '$10K' }), el('th', { class: 'num', text: '$100K' })));
    [0.05, 0.1, 0.2].forEach(function (drop, i) {
      var tr = el('tr', null, el('td', { text: Math.round(drop * 100) + '% lower value' }));
      row.farm.sensitivity[i].forEach(function (v) { tr.appendChild(el('td', { class: 'num', text: fmtUsd2(v) })); });
      st.appendChild(tr);
    });
    w.appendChild(st);
    w.appendChild(el('p', { class: 'note', text: 'Implied values are this radar\u2019s own estimate from the snapshot, not a forecast that a token will launch and not a claim by make.fun. Records no token means DefiLlama carries none, not proof that none exists. Not financial advice.' }));
    return w;
  }

  function renderLive() {
    var w = el('div');
    w.appendChild(el('div', { class: 'count', text: DATA.live.length + ' protocols whose token already trades, by market cap. These are the comparables the curve is fit from \u2014 they never appear on the board.' }));
    var t = el('table', { class: 'grid' });
    t.appendChild(el('tr', null, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7D' })));
    DATA.live.forEach(function (p) {
      t.appendChild(el('tr', null, el('td', null, el('b', { text: p.name }), el('div', { class: 'note', text: (p.category || 'Uncategorized') + ' \u00b7 ' + p.chains.slice(0, 3).join(', ') })), el('td', { class: 'num', text: money(p.tvl_usd) }), el('td', { class: 'num', text: money(p.mcap_usd) }), el('td', { class: 'num', text: fmtMult(p.mcap_tvl) }), el('td', { class: 'num', text: fmtPct(p.change_7d) })));
    });
    w.appendChild(t);
    return w;
  }

  function renderSetAside() {
    var w = el('div');
    w.appendChild(el('div', { class: 'count', text: DATA.set_aside_rows.length + ' pre-token protocols set aside, with the rule that set each one aside. They are not ranked, and the board says why.' }));
    var t = el('table', { class: 'grid' });
    t.appendChild(el('tr', null, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { text: 'Why it is set aside' })));
    DATA.set_aside_rows.forEach(function (p) {
      t.appendChild(el('tr', null, el('td', null, el('b', { text: p.name }), el('div', { class: 'note', text: (p.category || 'Uncategorized') })), el('td', { class: 'num', text: money(p.tvl_usd) }), el('td', { text: p.reason })));
    });
    w.appendChild(t);
    return w;
  }

  function looChart() {
    var W = 880, H = 300, PL = 70, PR = 16, PT = 14, PB = 34;
    var x0 = Math.log10(1e6), x1 = Math.log10(2e8), y0 = Math.log10(1e5), y1 = Math.log10(2e9);
    function X(v) { return PL + (Math.log10(Math.max(1e6, Math.min(2e8, v))) - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (Math.log10(Math.max(1e5, Math.min(2e9, v))) - y0) / (y1 - y0)) * (H - PT - PB); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Out of sample: each traded token priced as if it had none">';
    s += '<polygon points="' + X(1e6) + ',' + Y(3e6) + ' ' + X(2e8) + ',' + Y(6e8) + ' ' + X(2e8) + ',' + Y(2e8) + ' ' + X(1e6) + ',' + Y(1e6) + '" fill="#2c2318"/>';
    var line = '';
    for (var i = 0; i <= 20; i++) {
      var v = Math.pow(10, x0 + (x1 - x0) * i / 20);
      line += (i === 0 ? 'M' : 'L') + X(v).toFixed(1) + ',' + Y(v).toFixed(1);
    }
    s += '<path d="' + line + '" fill="none" stroke="#f5a623" stroke-width="1.5"/>';
    DATA.loo_points.forEach(function (p) {
      s += '<circle cx="' + X(p.pred).toFixed(1) + '" cy="' + Y(p.real).toFixed(1) + '" r="3" fill="#7fb3d5"/>';
    });
    s += '<text x="' + (PL + 4) + '" y="' + (PT + 12) + '" fill="#f2e9d8" font-size="12">Out of sample: each traded token priced as if it had none (leave-one-out prediction vs real market cap; shaded = within 3x)</text>';
    s += '<text x="' + (W / 2) + '" y="' + (H - 2) + '" fill="#b8a88e" font-size="11" text-anchor="middle">Leave-one-out prediction (log scale)</text>';
    s += '</svg>';
    return el('div', { class: 'chartwrap', html: s });
  }

  function renderMethod() {
    var m = el('div', { class: 'method' });
    m.appendChild(el('h2', { text: 'Universe' }));
    m.appendChild(el('p', { html: 'The snapshot holds <b>758 protocols at or above $5M TVL</b> (DefiLlama, fetched ' + esc(DATA.as_of) + '). A protocol is pre-token when it records no market cap, no CoinGecko id and no symbol. That gives <b>' + DATA.universe.ranked + ' ranked</b>, <b>' + DATA.universe.traded + ' traded apart</b> and <b>' + DATA.universe.set_aside + ' set aside</b>: ' + DATA.universe.ranked + ' + ' + DATA.universe.traded + ' + ' + DATA.universe.set_aside + ' = 758. The watchlist of 40 is the floor, never the ceiling: 152 early rows below the $50M floor are ranked too.' }));
    m.appendChild(el('p', { text: 'Set aside: bridges, liquid staking and restaking, restaked BTC and CEX; names ending in a version marker; names carrying wrapped, staked or staking; names beginning with an exchange; and siblings of a token that trades \u2014 a protocol whose first word matches a traded token\u2019s, unless it is on the watchlist, where it stays at half value.' }));
    m.appendChild(el('h2', { text: 'Curve' }));
    m.appendChild(el('p', { html: 'value = 10<sup>' + BT.a.toFixed(2) + '</sup> \u00d7 (TVL / $100M)<sup>' + BT.b.toFixed(3) + '</sup> \u00d7 family \u00d7 growth \u00d7 seasoning \u00d7 sibling \u00d7 breadth. One point per traded token: listings that share a token are merged (TVL summed); bridges and version listings are dropped; exchange tokens are dropped; ratios outside 1/500\u201350x are trimmed. Least squares on ' + BT.comps_count + ' points: log10(mcap) = ' + BT.a.toFixed(2) + ' + ' + BT.b.toFixed(3) + ' \u00d7 log10(TVL/$100M) (R\u00b2 = ' + BT.r2.toFixed(3) + '). A slope under 1 means small protocols trade at a higher multiple of TVL.' }));
    m.appendChild(el('p', { text: 'At $100M TVL the curve pays $' + (Math.pow(10, BT.a) / 1e6).toFixed(1) + 'M. A flat multiple would pay the same multiple at every size; the curve pays less per dollar as protocols grow, which is what the traded tokens do.' }));
    m.appendChild(el('h2', { text: 'Breadth' }));
    m.appendChild(el('p', { text: 'The one new factor in this version. A binary indicator: 1 when a protocol lists two or more chains, 0 when it lists one. Its slope comes from a one-feature ridge regression on the log residuals against curve x family (lambda = 10n, strong shrinkage): beta = ' + BT.breadth_beta.toFixed(4) + ', so a multi-chain protocol is priced ' + ((1 - Math.pow(10, BT.breadth_beta)) * 100).toFixed(1) + '% lower. ' + BT.breadth_multi_count + ' of the ' + BT.comps_count + ' comps are multi-chain. The factor is refit inside every validation fold, like family, and it beats the no-breadth model on all three splits (LOO x' + BT.loo_miss.toFixed(4) + ' vs x2.8294, OOS 2025 x' + BT.oos_miss.toFixed(4) + ' vs x1.9298, OOS 2024 x' + BT.oos2024_miss.toFixed(4) + ' vs x2.0991). The effect is small and honest: about 0.4% on a typical row.' }));
    m.appendChild(el('h2', { text: 'Family' }));
    m.appendChild(el('p', { text: 'Each category\u2019s factor is its mean residual against the curve, shrunk as if 20 extra tokens sat on the curve, capped x0.50\u2013x2.50. Thin categories barely move: a category with one token counts almost nothing.' }));
    m.appendChild(el('h2', { text: 'Growth and seasoning' }));
    m.appendChild(el('p', { text: 'Growth carries the TVL two weeks ahead at its 7-day rate, through the slope: (1 + clamp(change_7d, \u00b130%)/100)^(2 x ' + BT.b.toFixed(3) + '). Seasoning is piecewise by age: x0.70 at launch, rising to x1.15 at 18 months, back to x0.95 at 5 years.' }));
    m.appendChild(el('p', { text: 'Factor check: the blind residuals correlate r = ' + BT.factor_growth_r.toFixed(2) + ' with growth and r = ' + BT.factor_age_r.toFixed(2) + ' with log age \u2014 both inside the \u00b10.21 noise band, so the snapshot cannot confirm either. They stay small; size and family carry the value.' }));
    m.appendChild(el('h2', { text: 'Tests' }));
    m.appendChild(el('p', { text: 'Blind (leave-one-out, each token refit without it): median miss x' + BT.loo_miss.toFixed(2) + ' vs x' + BT.loo_flat_miss.toFixed(2) + ' for a flat multiple; ' + Math.round(BT.loo_within3 * 100) + '% within 3x of the real cap (flat ' + Math.round(BT.loo_flat_within3 * 100) + '%); ' + Math.round(BT.loo_within10 * 100) + '% within 10x. Curve only (no family, growth or seasoning): x' + BT.curve_only_loo.toFixed(2) + '.' }));
    m.appendChild(el('p', { text: 'Time split (fit before 2025-01-01, test the ' + BT.oos_test + ' newer tokens): median miss x' + BT.oos_miss.toFixed(2) + ' vs x' + BT.oos_flat_miss.toFixed(2) + ' flat; ' + Math.round(BT.oos_within3 * 100) + '% within 3x (flat ' + Math.round(BT.oos_flat_within3 * 100) + '%). Earlier split (fit before 2024-01-01, test ' + BT.oos2024_test + ' tokens): x' + BT.oos2024_miss.toFixed(2) + ' vs x' + BT.oos2024_flat_miss.toFixed(2) + ' flat; ' + Math.round(BT.oos2024_within3 * 100) + '% within 3x (flat ' + Math.round(BT.oos2024_flat_within3 * 100) + '%).' }));
    m.appendChild(el('p', { text: 'Band calibration: the blind residual bands cover ' + Math.round(BT.band50 * 100) + '% for a 50% band and ' + Math.round(BT.band80 * 100) + '% for an 80% band. The board\u2019s P10\u2013P90 range is the blind residual range: x' + BT.p10.toFixed(2) + ' to x' + BT.p90.toFixed(2) + ' around each implied value.' }));
    m.appendChild(looChart());
    m.appendChild(el('h2', { text: 'Farm plans' }));
    m.appendChild(el('p', { text: 'Slice = capital / (TVL + capital) \u00d7 airdrop share \u00d7 implied value. Net subtracts every fee and the 4% T-bill yield given up over the hold. FARM beats all of it, THIN beats fees only, SKIP does not. Each plan runs on the cheapest of the protocol\u2019s first three chains, from one fee table; the hold is 120 days under 6 months of age, 90 days under 18 months, else 60 days. Every row carries plans at $100, $1,000 and $10,000: the $100 plan is a test-size position (fees are a large share of it), the $10,000 plan splits across two wallets.' }));
    m.appendChild(el('h2', { text: 'Limits' }));
    m.appendChild(el('p', { text: 'One day of data. The ranking is an order of magnitude, not a price: the blind range is x' + BT.p10.toFixed(2) + '\u2013x' + BT.p90.toFixed(2) + ' around each value. A protocol on this board may still have a token its DefiLlama record does not carry. The breadth effect is small (about 0.4%): it does not move any row far, and the model is at the noise floor \u2014 the farm plans and the lab are where this version differs, not the ranking. Nothing here is a forecast that a token will launch, and nothing is financial advice.' }));
    m.appendChild(el('p', { class: 'note', text: 'Implied values are this radar\u2019s own estimate from the snapshot, not a forecast that a token will launch and not a claim by make.fun. Records no token means DefiLlama carries none, not proof that none exists. Not financial advice.' }));
    return m;
  }

  function renderFamily() {
    var m = el('div', { class: 'method' });
    m.appendChild(el('h2', { text: 'Family factors' }));
    m.appendChild(el('p', { text: 'Each category\u2019s factor is its mean residual against the curve, shrunk as if 20 extra tokens sat on the curve, capped x0.50\u2013x2.50. Thin categories barely move: a category with one token counts almost nothing.' }));
    var ft = el('table', { class: 'kv' });
    ft.appendChild(el('tr', null, el('th', { text: 'Family' }), el('th', { class: 'num', text: 'Tokens' }), el('th', { class: 'num', text: 'Factor' })));
    DATA.family.forEach(function (f) { ft.appendChild(el('tr', null, el('td', { text: f.category }), el('td', { class: 'num', text: String(f.tokens) }), el('td', { class: 'num', text: '\u00d7' + f.factor.toFixed(2) }))); });
    m.appendChild(ft);
    m.appendChild(el('h2', { text: 'Fees by chain' }));
    m.appendChild(el('p', { text: 'Gas and bridge per chain, in whole dollars: typical mainnet costs, November 2026. Each farm plan runs on the cheapest of the protocol\u2019s first three chains, from this one table.' }));
    var fet = el('table', { class: 'kv' });
    fet.appendChild(el('tr', null, el('th', { text: 'Chain' }), el('th', { class: 'num', text: 'Gas / tx' }), el('th', { class: 'num', text: 'Bridge' })));
    Object.keys(DATA.fees).sort().forEach(function (c) { fet.appendChild(el('tr', null, el('td', { text: c }), el('td', { class: 'num', text: '$' + DATA.fees[c].gas.toFixed(2) }), el('td', { class: 'num', text: '$' + DATA.fees[c].bridge.toFixed(2) }))); });
    fet.appendChild(el('tr', null, el('td', { text: 'Any other chain' }), el('td', { class: 'num', text: '$1.00' }), el('td', { class: 'num', text: '$2.50' })));
    m.appendChild(fet);
    m.appendChild(el('h2', { text: 'Universe: traded tokens' }));
    m.appendChild(renderLive());
    m.appendChild(el('h2', { text: 'Universe: set aside' }));
    m.appendChild(renderSetAside());
    return m;
  }

  function renderLab() {
    var m = el('div', { class: 'method' });
    var box = el('div', { class: 'labbox' });
    box.appendChild(el('h2', { text: 'Your inputs' }));
    box.appendChild(el('p', { text: 'Change the capital, the airdrop share and the breadth factor, and the board re-ranks live. The economics are recomputed from each row\u2019s own figures; nothing is re-fit. At the defaults ($1,000, 10%, breadth on) the lab matches board.json exactly.' }));
    var f = el('div', { class: 'filters' });
    var capIn = el('input', { type: 'number', value: String(state.capital), min: '10', max: '1000000', step: '100', oninput: function (e) { state.capital = Number(e.target.value) || 1000; writeHash(); render(); } });
    var shIn = el('input', { type: 'number', value: String(Math.round(state.share * 100)), min: '1', max: '100', step: '1', oninput: function (e) { state.share = (Number(e.target.value) || 10) / 100; writeHash(); render(); } });
    var brIn = el('input', { type: 'checkbox', checked: state.breadth ? true : null, onchange: function (e) { state.breadth = e.target.checked; writeHash(); render(); } });
    f.append(el('label', { text: 'Capital $ ' }), capIn, el('label', { text: 'Airdrop share % ' }), shIn, el('label', { text: 'Breadth factor ' }), brIn);
    box.appendChild(f);
    var counts = { farm: 0, thin: 0, skip: 0 };
    var ranked = DATA.board.map(function (r) {
      var e = econOf(r, state.capital, state.share, state.breadth);
      counts[e.verdict.toLowerCase()]++;
      return { row: r, econ: e };
    }).sort(function (a, b) {
      if (b.econ.implied !== a.econ.implied) return b.econ.implied - a.econ.implied;
      return a.row.slug < b.row.slug ? -1 : 1;
    });
    box.appendChild(el('p', { text: 'At $' + state.capital.toLocaleString() + ' and ' + Math.round(state.share * 100) + '% share, breadth ' + (state.breadth ? 'on' : 'off') + ': ' + counts.farm + ' FARM, ' + counts.thin + ' THIN, ' + counts.skip + ' SKIP. The top 10 by re-ranked implied value:' }));
    var t = el('table', { class: 'grid' });
    t.appendChild(el('tr', null, el('th', { class: 'num', text: 'Lab rank' }), el('th', { class: 'num', text: 'Board rank' }), el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'Implied value' }), el('th', { class: 'num', text: 'Slice' }), el('th', { class: 'num', text: 'Net' }), el('th', { class: 'num', text: 'Verdict' })));
    ranked.slice(0, 10).forEach(function (x, i) {
      var r = x.row, e = x.econ;
      var delta = r.rank - (i + 1);
      var dText = delta === 0 ? '\u2014' : (delta > 0 ? '\u2191' + delta : '\u2193' + (-delta));
      t.appendChild(el('tr', { class: 'row', onclick: function () { state.selected = r.slug; state.tab = 'board'; writeHash(); render(); } },
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', { class: 'num', text: String(r.rank) + ' (' + dText + ')' }),
        el('td', null, el('b', { text: r.name }), el('div', { class: 'note', text: (r.category || 'Uncategorized') + ' \u00b7 ' + r.chains.slice(0, 3).join(', ') })),
        el('td', { class: 'num', text: money(e.implied) }),
        el('td', { class: 'num', text: fmtUsd2(e.slice) }),
        el('td', { class: 'num', text: fmtUsd2(e.net) }),
        el('td', { class: 'num' }, el('span', { class: 'pill ' + e.verdict, text: e.verdict }))));
    });
    box.appendChild(t);
    box.appendChild(el('p', { class: 'note', text: 'Rank deltas show how far a protocol moves when the inputs change. Turning breadth off divides each multi-chain row by its breadth factor (about x0.996) and re-ranks: the moves are small, which is the point \u2014 breadth is a correction, not a ranking.' }));
    m.appendChild(box);
    return m;
  }

  function render() {
    app.setAttribute('aria-busy', 'true');
    app.textContent = '';
    app.appendChild(renderHero());
    app.appendChild(renderTabs());
    if (state.selected) app.appendChild(renderDetail());
    else if (state.tab === 'method') app.appendChild(renderMethod());
    else if (state.tab === 'family') app.appendChild(renderFamily());
    else if (state.tab === 'lab') app.appendChild(renderLab());
    else app.appendChild(renderBoard());
    var foot = el('footer', { text: 'Token Radar \u00b7 model ' + DATA.model.version + ' \u00b7 snapshot ' + DATA.as_of + ' \u00b7 DefiLlama snapshot. Implied values are this radar\u2019s own estimate from the snapshot, not a forecast that a token will launch and not a claim by make.fun. Not financial advice.' });
    app.appendChild(foot);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
