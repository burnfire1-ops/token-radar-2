// Token Radar dashboard — radar-8.
// One model prices the board and the page: the drawer recomputes each row's
// implied value live from the model coefficients in window.RADAR, using the
// same formula the builder used. It must match the board value exactly.
// The page builds its own DOM inside #board; index.html is only a shell.

(function () {
  var D = window.RADAR;
  var boardEl = document.getElementById("board");
  if (!D || !D.rows) {
    boardEl.innerHTML = '<p class="empty">No radar data loaded.</p>';
    return;
  }

  var model = D.model;
  var rows = D.rows;

  // ---- build the DOM -----------------------------------------------------
  // index.html is a bare shell, so the page creates its header, stats, cards,
  // panels, controls, table, drawer, and footer itself.

  boardEl.setAttribute("aria-busy", "false");
  boardEl.innerHTML =
    '<div class="wrap">' +
    '<header class="top">' +
    "<h1>Token Radar<span class=\"dot\">.</span></h1>" +
    "<p class=\"sub\">Pre-token protocols ranked by what their launch would be worth. " +
    "The value comes from the snapshot's own traded tokens: a size curve fitted to the " +
    "<b>" + model.comps_count + " protocols that already trade</b>, adjusted by each protocol's " +
    "seven-day growth and by how long it has run with no token. Every row carries a farm plan " +
    "costed and netted to the dollar.</p>" +
    '<div class="stats" id="stats"></div>' +
    "</header>" +
    '<div class="cards" id="cards"></div>' +
    '<div class="panels">' +
    '<div class="panel" id="panel-model"></div>' +
    '<div class="panel" id="panel-market"></div>' +
    '<div class="panel" id="panel-farm"></div>' +
    "</div>" +
    '<div class="controls">' +
    '<input type="search" id="search" placeholder="Search name, symbol, category, or slug..." aria-label="Search protocols">' +
    '<select id="sort" aria-label="Sort by">' +
    '<option value="rank">Sort: rank</option>' +
    '<option value="-implied">Sort: implied value (high first)</option>' +
    '<option value="implied">Sort: implied value (low first)</option>' +
    '<option value="-tvl">Sort: TVL (high first)</option>' +
    '<option value="-change_7d">Sort: 7-day change (high first)</option>' +
    '<option value="age_days">Sort: age (young first)</option>' +
    '<option value="-age_days">Sort: age (old first)</option>' +
    '<option value="name">Sort: name (A to Z)</option>' +
    "</select>" +
    '<select id="verdict" aria-label="Filter by verdict">' +
    '<option value="all">Verdict: all</option>' +
    '<option value="farm">Verdict: farm</option>' +
    '<option value="thin">Verdict: thin</option>' +
    '<option value="skip">Verdict: skip</option>' +
    "</select>" +
    '<label><input type="checkbox" id="wl-only"> Watchlist only</label>' +
    '<label><input type="checkbox" id="parent-only"> Possible parent only</label>' +
    '<span class="count" id="count"></span>' +
    "</div>" +
    "<table>" +
    "<thead><tr>" +
    '<th data-sort="rank">Rank</th>' +
    '<th data-sort="name">Protocol</th>' +
    '<th data-sort="category">Category</th>' +
    '<th data-sort="tvl">TVL</th>' +
    '<th data-sort="change_7d">7d</th>' +
    '<th data-sort="age_days">Age</th>' +
    '<th data-sort="implied">Implied value</th>' +
    '<th data-sort="verdict">Verdict</th>' +
    "</tr></thead>" +
    '<tbody id="tbody"></tbody>' +
    "</table>" +
    '<footer class="foot" id="foot"></footer>' +
    "</div>" +
    '<div class="drawer-backdrop" id="backdrop"></div>' +
    '<aside class="drawer" id="drawer" aria-label="Protocol detail"></aside>';

  // ---- formatting ---------------------------------------------------------

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(x) {
    if (x == null) return "—";
    if (x >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
    if (x >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
    if (x >= 1e3) return "$" + (x / 1e3).toFixed(1) + "K";
    return "$" + x.toFixed(0);
  }

  function money2(x) {
    if (x == null) return "—";
    var sign = x < 0 ? "-" : "";
    var abs = Math.abs(x);
    if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
    return sign + "$" + abs.toFixed(2);
  }

  function pct(x) {
    if (x == null) return "—";
    var sign = x > 0 ? "+" : "";
    return sign + x.toFixed(2) + "%";
  }

  function ageText(days) {
    if (days == null) return "unknown";
    if (days < 30) return days + "d";
    if (days < 365) return Math.round(days / 30) + "mo";
    return (days / 365).toFixed(1) + "y";
  }

  function log10(x) {
    return Math.log(x) / Math.LN10;
  }

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  // ---- the model, live on the page ---------------------------------------
  // Same formula the builder used. Base from the quadratic size curve,
  // adjusted by the row's own seven-day growth and by its age.

  function impliedOf(row) {
    var x = log10(Math.max(row.tvl, 1));
    var base = Math.pow(10, model.a + model.b * x + model.c * x * x);
    var growth = 1 + (clamp(row.change_7d == null ? 0 : row.change_7d, -50, 100) / 100) * 0.5;
    var age = row.age_days == null ? 365 : row.age_days;
    var maturity = 0.7 + 0.3 * (Math.min(age, 1095) / 1095);
    return Math.max(1, Math.round(base * growth * maturity));
  }

  // ---- header stats ------------------------------------------------------

  function renderStats() {
    var el = document.getElementById("stats");
    var wl = rows.filter(function (r) { return r.wl; }).length;
    var parent = rows.filter(function (r) { return r.parent; }).length;
    var vc = D.verdict_counts || { farm: 0, thin: 0, skip: 0 };
    el.innerHTML =
      stat("Protocols", rows.length, "on the board") +
      stat("Watchlist", wl + " / 40", "all covered") +
      stat("Possible parent", parent, "above the $50M floor") +
      stat("Median value", money(D.median_implied), "implied") +
      stat("Farm", vc.farm, "rows net over $50") +
      stat("Thin", vc.thin, "rows net $0 to $50") +
      stat("Skip", vc.skip, "rows net below $0");
    function stat(label, value, note) {
      return (
        '<div class="stat"><span>' + esc(label) + '</span><b>' + esc(value) +
        '</b><small>' + esc(note) + "</small></div>"
      );
    }
  }

  // ---- top 3 cards -------------------------------------------------------

  function renderCards() {
    var el = document.getElementById("cards");
    var top = rows.slice(0, 3);
    el.innerHTML = top
      .map(function (r) {
        var tags = "";
        if (r.wl) tags += '<span class="tag wl">Watchlist</span>';
        if (r.parent) tags += '<span class="tag parent">Possible parent</span>';
        return (
          '<div class="card" data-slug="' + esc(r.slug) + '">' +
          '<div class="rank">#' + r.rank + " " + esc(r.category) + "</div>" +
          "<h2>" + esc(r.name) + ' <span class="sym">' + esc(r.symbol || "") + "</span></h2>" +
          '<div class="val">' + money(r.implied) + "</div>" +
          '<div class="meta">TVL ' + money(r.tvl) + " &middot; 7d " + pct(r.change_7d) +
          " &middot; age " + ageText(r.age_days) + "</div>" +
          '<div class="meta">' + tags + "</div>" +
          "</div>"
        );
      })
      .join("");
    el.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("click", function () {
        openDrawer(card.getAttribute("data-slug"));
      });
    });
  }

  // ---- panels ------------------------------------------------------------

  function renderPanels() {
    // Model panel: comps set, fit, OOS miss, plain-language line.
    var m = document.getElementById("panel-model");
    var a = model.anchors || {};
    m.innerHTML =
      "<h3>Model — " + esc(model.version) + "</h3>" +
      "<p>These values come from the snapshot's own traded tokens, not from a fixed list of names. " +
      "The size curve is fitted to the " + model.comps_count +
      " protocols in this snapshot that already trade (market cap above zero and TVL above zero).</p>" +
      '<div class="formula">log10(mcap) = ' + model.a.toFixed(4) + " + " + model.b.toFixed(4) +
      " &middot; log10(TVL) + " + model.c.toFixed(4) + " &middot; (log10(TVL))^2</div>" +
      "<p class=\"small\">Fit on the " + model.comps_count + " comps: R&sup2; = " + model.r2.toFixed(3) +
      ". Each board value is the curve value times a growth factor from the protocol's own seven-day change " +
      "(clamped &minus;50% to +100%, half weight) and a maturity factor from how long it has run with no token " +
      "(0.70 for a brand-new protocol, 1.00 after three years).</p>" +
      "<p><b>Out-of-sample miss &times;" + model.oos_miss.toFixed(2) +
      "</b> &mdash; fit on " + model.oos_train + " tokens listed before 2025-01-01, tested on " +
      model.oos_test + " listed after. Leave-one-out miss &times;" + model.loo_miss.toFixed(2) + ".</p>" +
      "<p class=\"small\">Anchors, same measure: flat median multiple &times;" + (a.flat || 0).toFixed(2) +
      " &middot; v1 &times;" + (a.v1 || 0).toFixed(2) + " &middot; v5 &times;" + (a.v5 || 0).toFixed(2) +
      " &middot; v6 plain power law &times;" + (a.v6 || 0).toFixed(2) +
      " &middot; best known public result &times;" + (a.top || 0).toFixed(2) + ".</p>";

    // Market line panel: why a curve, not a flat multiple.
    var flat = a.flat || 0;
    var k = document.getElementById("panel-market");
    k.innerHTML =
      "<h3>Market line</h3>" +
      "<p>A flat multiple is the wrong shape. The median traded token is worth &times;" +
      flat.toFixed(2) + " its TVL, but that multiple is not constant: small protocols trade at a " +
      "higher multiple of TVL than large ones, and the curve bends. A flat &times;" + flat.toFixed(2) +
      " misses the comps by &times;" + flat.toFixed(2) + " on the median; the fitted curve misses by " +
      "&times;" + model.loo_miss.toFixed(2) + " leave-one-out.</p>" +
      "<p class=\"small\">The curve is fitted to this snapshot only. Nothing is imported from another " +
      "market, another chain, or a list of favourite names. If the snapshot changed, the curve would change with it.</p>";

    // Farm next panel: best farms by net per dollar of capital.
    var f = document.getElementById("panel-farm");
    var list = (D.farm_next || []).slice(0, 5);
    var items = list
      .map(function (item, i) {
        var cls = item.net_usd >= 0 ? "net" : "net neg";
        return (
          "<li><b>#" + (i + 1) + " " + esc(item.name) + "</b> &mdash; <span class=\"" + cls + "\">" +
          money2(item.net_usd) + " net</span> on " + money2(item.capital_usd) +
          " capital (" + item.net_per_capital.toFixed(2) + " per $1)</li>"
        );
      })
      .join("");
    f.innerHTML =
      "<h3>Farm next</h3>" +
      "<p class=\"small\">Ranked by net expected value per dollar of farm capital. " +
      "Net = expected airdrop (implied value &times; launch probability &times; 0.002% farmer share) " +
      "minus gas, time at $15/hour, and the opportunity cost of the capital.</p>" +
      "<ol>" + items + "</ol>";
  }

  // ---- table -------------------------------------------------------------

  var state = { q: "", sort: "rank", dir: 1, wlOnly: false, verdict: "all", parentOnly: false };

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.wlOnly && !r.wl) return false;
      if (state.parentOnly && !r.parent) return false;
      if (state.verdict !== "all" && r.farm.verdict !== state.verdict) return false;
      if (q) {
        var hay = (r.name + " " + (r.symbol || "") + " " + r.category + " " + r.slug).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var key = state.sort;
    out.sort(function (x, y) {
      var d = 0;
      if (key === "rank") d = x.rank - y.rank;
      else if (key === "name") d = x.name.localeCompare(y.name);
      else if (key === "category") d = x.category.localeCompare(y.category);
      else if (key === "tvl") d = x.tvl - y.tvl;
      else if (key === "change_7d") d = (x.change_7d || 0) - (y.change_7d || 0);
      else if (key === "age_days") d = (x.age_days == null ? 99999 : x.age_days) - (y.age_days == null ? 99999 : y.age_days);
      else if (key === "implied") d = x.implied - y.implied;
      else if (key === "verdict") d = x.farm.net_usd - y.farm.net_usd;
      return d * state.dir;
    });
    return out;
  }

  function renderTable() {
    var list = filteredRows();
    var tbody = document.getElementById("tbody");
    document.getElementById("count").textContent = list.length + " of " + rows.length + " rows";
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No rows match the current filters.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (r) {
        var chg = r.change_7d == null ? "—" : '<span class="' + (r.change_7d >= 0 ? "pos" : "neg") + '">' + pct(r.change_7d) + "</span>";
        var tags = "";
        if (r.wl) tags += ' <span class="tag wl">WL</span>';
        if (r.parent) tags += ' <span class="tag parent">Parent?</span>';
        var impCls = r.rank <= 10 ? "imp" : "imp low";
        return (
          '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num">' + r.rank + "</td>" +
          '<td><div class="name">' + esc(r.name) + "</div>" +
          '<div class="sub2">' + esc(r.symbol || "") + tags + "</div></td>" +
          "<td>" + esc(r.category) + "</td>" +
          '<td class="num">' + money(r.tvl) + "</td>" +
          '<td class="num">' + chg + "</td>" +
          '<td class="num">' + ageText(r.age_days) + "</td>" +
          '<td class="num"><span class="' + impCls + '">' + money(r.implied) + "</span></td>" +
          '<td><span class="verdict ' + r.farm.verdict + '">' + r.farm.verdict + "</span></td>" +
          "</tr>"
        );
      })
      .join("");
    tbody.querySelectorAll("tr[data-slug]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        openDrawer(tr.getAttribute("data-slug"));
      });
    });
  }

  function bindControls() {
    var search = document.getElementById("search");
    search.addEventListener("input", function () {
      state.q = search.value;
      renderTable();
    });
    document.getElementById("sort").addEventListener("change", function (e) {
      var v = e.target.value;
      if (v.charAt(0) === "-") {
        state.sort = v.slice(1);
        state.dir = -1;
      } else {
        state.sort = v;
        state.dir = 1;
      }
      renderTable();
    });
    document.getElementById("wl-only").addEventListener("change", function (e) {
      state.wlOnly = e.target.checked;
      renderTable();
    });
    document.getElementById("parent-only").addEventListener("change", function (e) {
      state.parentOnly = e.target.checked;
      renderTable();
    });
    document.getElementById("verdict").addEventListener("change", function (e) {
      state.verdict = e.target.value;
      renderTable();
    });
    document.querySelectorAll("thead th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sort === key) state.dir = -state.dir;
        else {
          state.sort = key;
          state.dir = key === "rank" || key === "name" || key === "category" ? 1 : -1;
        }
        renderTable();
      });
    });
  }

  // ---- drawer ------------------------------------------------------------

  var drawer = document.getElementById("drawer");
  var backdrop = document.getElementById("backdrop");

  function openDrawer(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].slug === slug) {
        r = rows[i];
        break;
      }
    }
    if (!r) return;
    var live = impliedOf(r);
    var match = live === r.implied;
    var f = r.farm;
    var stepsHtml = r.steps
      .map(function (s) {
        return "<li>" + esc(s) + "</li>";
      })
      .join("");
    var netCls = f.net_usd >= 0 ? "pos" : "neg";
    var verdictText =
      f.verdict === "farm"
        ? "Farm — the expected airdrop clears the cost by more than $50."
        : f.verdict === "thin"
          ? "Thin — the expected airdrop barely covers the cost. Farm only if you already use this protocol."
          : "Skip — the expected airdrop does not cover the cost of farming it.";
    drawer.innerHTML =
      '<button class="close" id="drawer-close">Close &times;</button>' +
      "<h2>" + esc(r.name) + ' <span class="sym">' + esc(r.symbol || "") + "</span></h2>" +
      '<div>' +
      (r.wl ? '<span class="tag wl">Watchlist</span>' : "") +
      (r.parent ? '<span class="tag parent">Possible parent</span>' : "") +
      '<span class="tag">#' + r.rank + "</span></div>" +
      '<div class="big" style="margin-top:10px">' + money(r.implied) + "</div>" +
      '<div class="note">Implied value. Base curve value ' + money(r.base) +
      " &times; growth " + r.growth.toFixed(3) + " &times; maturity " + r.maturity.toFixed(3) + ".</div>" +
      '<div class="note">Live recompute from the model on this page: <b>' + money(live) + "</b>" +
      (match ? " (matches the board)" : " (differs from the board — please report this)") + ".</div>" +
      '<div class="kv">' +
      "<div>TVL<b>" + money(r.tvl) + "</b></div>" +
      "<div>7-day change<b>" + pct(r.change_7d) + "</b></div>" +
      "<div>Age<b>" + ageText(r.age_days) + "</b></div>" +
      "<div>Category<b>" + esc(r.category) + "</b></div>" +
      "<div>Chains<b>" + esc(r.chains.join(", ") || "—") + "</b></div>" +
      "<div>Launch probability<b>" + Math.round(f.launch_probability * 100) + "%</b></div>" +
      "</div>" +
      "<h4>Farm plan</h4>" +
      '<ol class="steps">' + stepsHtml + "</ol>" +
      "<h4>Costed net</h4>" +
      '<div class="cost">' +
      costRow("Farm capital", money2(f.capital_usd)) +
      costRow("Gas (main + second + weekly + exit)", money2(f.gas_usd)) +
      costRow("Time (" + f.time_minutes + " min at $15/hour)", money2(f.time_usd)) +
      costRow("Opportunity cost of capital (5% APR)", money2(f.opportunity_usd)) +
      costRow("Total cost", money2(f.total_cost_usd), true) +
      costRow("Expected airdrop (implied &times; " + Math.round(f.launch_probability * 100) + "% &times; 0.002%)", money2(f.expected_airdrop_usd)) +
      '<div class="net-line ' + netCls + '">Net expected value: ' + money2(f.net_usd) + "</div>" +
      '<div class="note" style="margin-top:6px">' + esc(verdictText) + "</div>" +
      "</div>" +
      '<p class="note">Farmer share 0.002% is a stated assumption: the airdrop pool is taken as 10% of the ' +
      "implied value, split among about 5,000 serious farmers. If the pool is smaller or the crowd is larger, the net falls.</p>";
    function costRow(label, value, total) {
      return (
        '<div class="row' + (total ? " total" : "") + '"><span>' + esc(label) + "</span><span>" + esc(value) + "</span></div>"
      );
    }
    drawer.classList.add("open");
    backdrop.classList.add("open");
    document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
  }

  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  // ---- deep links --------------------------------------------------------
  // #detail-<slug> opens a row's drawer, #q=<text> searches,
  // #verdict=farm|thin|skip filters by verdict, #wl=1 shows watchlist only.

  function applyHash() {
    var h = location.hash || "";
    var m;
    var filtered = false;
    if ((m = h.match(/verdict=(farm|thin|skip)/))) {
      state.verdict = m[1];
      var sel = document.getElementById("verdict");
      if (sel) sel.value = m[1];
      filtered = true;
    }
    if (/(^|[&#])wl=1/.test(h)) {
      state.wlOnly = true;
      var cb = document.getElementById("wl-only");
      if (cb) cb.checked = true;
      filtered = true;
    }
    if ((m = h.match(/q=([^&#]*)/))) {
      var q = decodeURIComponent(m[1]);
      state.q = q;
      var search = document.getElementById("search");
      if (search) search.value = q;
      filtered = true;
    }
    renderTable();
    // A filtered deep link should show the filtered table, not the top of
    // the page: scroll the table into view once the filter is applied.
    if (filtered) {
      var table = document.querySelector("table");
      if (table) table.scrollIntoView();
    }
    if ((m = h.match(/detail-([a-z0-9-]+)/))) {
      openDrawer(m[1]);
    }
  }

  // ---- boot --------------------------------------------------------------

  renderStats();
  renderCards();
  renderPanels();
  renderTable();
  bindControls();
  applyHash();
  // Deep links also work when the hash changes without a reload.
  window.addEventListener("hashchange", applyHash);

  var foot = document.getElementById("foot");
  foot.textContent =
    "Token Radar " + model.version + " — snapshot " + D.as_of + ". " +
    "Model fitted to the " + model.comps_count + " traded protocols in the snapshot. " +
    "Out-of-sample miss x" + model.oos_miss.toFixed(2) + ", leave-one-out miss x" + model.loo_miss.toFixed(2) + ".";
})();
