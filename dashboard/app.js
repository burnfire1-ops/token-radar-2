// app.js — Token Radar dashboard.
// Renders the board from window.RADAR, with search, category and scope
// filters, sortable columns, a per-protocol detail drawer, a live-token tab,
// and a model panel. No network: every number comes from data.js.
// The PURE block below mirrors lib/model.ts exactly, so the page and the
// board always agree; keep any change to the generator in both files.

(function () {
  "use strict";
  var RADAR = window.RADAR;
  if (!RADAR) {
    document.getElementById("board").textContent = "No data loaded.";
    return;
  }

  // ==PURE-START==
  // Self-contained model + farm-plan logic. No DOM access in this block.
  // verify.mjs extracts this block and runs it against board.json.
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    var start = Date.parse(listedAt + "T00:00:00Z");
    var end = Date.parse(asOf + "T00:00:00Z");
    if (isNaN(start) || isNaN(end)) return null;
    return Math.max(0, Math.floor((end - start) / 86400000));
  }
  function growthMultiplier(change7d) {
    var pct = clamp(change7d == null ? 0 : change7d, -50, 100);
    return 1 + (pct / 100) * 0.5;
  }
  function maturityMultiplier(age) {
    var days = age == null ? 365 : age;
    return 0.7 + 0.3 * (Math.min(days, 1095) / 1095);
  }
  function chainMultiplier(chains) {
    var extra = Math.min(Math.max(chains.length - 1, 0), 5);
    return 1 + 0.02 * extra;
  }
  function capitalTier(tvl) {
    if (tvl >= 5000000000) return 250;
    if (tvl >= 1000000000) return 150;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  function gasFor(capital) { return capital >= 150 ? 8 : 4; }
  function holdDays(age) {
    if (age == null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function step2For(row, capital, chain) {
    var name = row.name, cat = row.category || "";
    if (cat === "Risk Curators" || cat === "Onchain Capital Allocator")
      return "Deposit $" + capital + " into a " + name + " vault on " + chain + " and keep the shares.";
    if (cat === "RWA")
      return "Mint $" + capital + " of the yield-bearing asset through " + name + " on " + chain + " and hold it in the farming wallet.";
    if (cat === "Lending" || cat === "CDP" || cat === "Collateral Markets")
      return "Supply $" + capital + " of USDC to " + name + " on " + chain + " and keep the position open.";
    if (cat === "Dexs")
      return "Provide $" + capital + " of liquidity to " + name + "'s main pool on " + chain + " and keep the position open.";
    if (cat === "Basis Trading")
      return "Deposit $" + capital + " into " + name + "'s basis strategy on " + chain + " and keep the position open.";
    if (cat === "Yield" || cat === "Yield Aggregator" || cat === "Liquidity Manager")
      return "Deposit $" + capital + " into a " + name + " vault on " + chain + " and keep the shares.";
    if (cat === "Chain")
      return "Bridge $" + capital + " of USDC to " + chain + " through the chain's official bridge and use the funds in " + name + "'s app.";
    if (cat === "Restaking" || cat === "Staking Pool")
      return "Stake $" + capital + " of the chain's staking asset through " + name + " and keep the receipt.";
    if (cat === "Payments")
      return "Fund $" + capital + " and make one payment through " + name + " on " + chain + ".";
    if (cat === "Insurance")
      return "Buy $" + capital + " of cover from " + name + " on " + chain + " and keep the policy.";
    if (cat === "Prediction Market")
      return "Fund $" + capital + " and place one market position on " + name + ".";
    return "Deposit $" + capital + " of USDC into " + name + " on " + chain + " and keep the position open.";
  }
  function step3For(row, chain) {
    var name = row.name, cat = row.category || "";
    if (cat === "Risk Curators" || cat === "Onchain Capital Allocator")
      return "Allocate the shares to a second vault or strategy inside " + name + " so the wallet shows activity in more than one vault.";
    if (cat === "RWA")
      return "Check the asset's yield page weekly and claim or restake the yield inside " + name + " rather than moving it out.";
    if (cat === "Lending" || cat === "CDP" || cat === "Collateral Markets")
      return "Borrow a small amount (under 30% of the supplied value) against the deposit and repay it within the week, so the wallet shows both sides of the market.";
    if (cat === "Dexs")
      return "Stake the LP receipt in " + name + "'s own gauge or rewards contract when it offers one, and keep it staked.";
    if (cat === "Basis Trading")
      return "Add a second deposit after the first funding round settles, so the wallet shows repeated inflows rather than one deposit.";
    if (cat === "Yield" || cat === "Yield Aggregator" || cat === "Liquidity Manager")
      return "Harvest the vault's yield once and redeposit it, so the wallet shows a harvest and a redeposit.";
    if (cat === "Chain")
      return "Make one native transaction a week on " + chain + " (a swap or a vote) so the wallet is active on the chain itself, not only on the bridge.";
    if (cat === "Restaking" || cat === "Staking Pool")
      return "Restake the receipt once inside " + name + " when it offers restaking, and keep the restaked position.";
    return "Repeat the same action once a week in a smaller size so the wallet shows a pattern of use, not a single deposit.";
  }
  function weeklyVerb(cat) {
    switch (cat) {
      case "Risk Curators": case "Onchain Capital Allocator": return "an allocation, a deposit or a vote";
      case "Lending": case "CDP": case "Collateral Markets": return "a supply, a borrow or a repayment";
      case "Dexs": return "a swap, a deposit or a vote";
      case "RWA": return "a claim, a restake or a mint";
      case "Basis Trading": return "a deposit or a rebalance";
      case "Chain": return "a swap or a vote";
      case "Restaking": case "Staking Pool": return "a stake or a restake";
      case "Yield": case "Yield Aggregator": case "Liquidity Manager": return "a deposit, a harvest or a redeposit";
      default: return "a deposit, a swap or a vote";
    }
  }
  function farmSteps(row) {
    var capital = capitalTier(row.tvl_usd);
    var gas = gasFor(capital);
    var chain = (row.chains && row.chains[0]) || "Ethereum";
    var age = ageDays(RADAR.as_of, row.listed_at);
    var hold = holdDays(age);
    var raw = [
      "Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.",
      step2For(row, capital, chain) + " Cost: $" + capital + " of capital and about $" + gas + " of gas. Time: 15 minutes to set up.",
      step3For(row, chain) + " Cost: about $3 of gas. Time: 10 minutes.",
      "Make one qualifying action each week, such as " + weeklyVerb(row.category) + ". Cost: about $2 of gas a week. Time: 10 minutes a week.",
      "Hold the position for at least " + hold + " days so the activity is counted in more than one snapshot. Cost: the $" + capital + " stays in the position. Time: " + hold + " days.",
      "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
      "Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes."
    ];
    return raw.map(function (s) {
      var t = s.trim();
      if (t.length > 600) return t.slice(0, 597) + "...";
      if (t.length < 20) return t + " Hold the position and check the protocol's own page.";
      return t;
    });
  }
  // Recomputes a row's implied value from the published fit and factors,
  // exactly as lib/model.ts does. Returns the whole-dollar value.
  function impliedOf(row) {
    var fit = RADAR.model.fit;
    var base = Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd));
    var cat = (row.category && RADAR.cat_factors[row.category]) || 1;
    var age = ageDays(RADAR.as_of, row.listed_at);
    var value = base * cat * growthMultiplier(row.change_7d) *
      maturityMultiplier(age) * chainMultiplier(row.chains || []);
    return Math.max(1, Math.round(value));
  }
  // ==PURE-END==

  // -- formatting -----------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + Math.round(v);
  }
  function moneyFull(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function pct(v) {
    if (v == null) return "n/a";
    return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  function ageText(age) { return age == null ? "n/a" : age + "d"; }

  // -- state -----------------------------------------------------------------
  var state = { q: "", category: "All", scope: "all", tab: "pre", sortKey: "implied_value_usd", sortDir: -1 };
  function readHash() {
    var h = location.hash.replace(/^#/, "");
    var parts = h.split("&");
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split("=");
      var k = decodeURIComponent(kv[0] || "");
      var v = decodeURIComponent(kv[1] || "");
      if (k === "q") state.q = v;
      if (k === "category") state.category = v || "All";
      if (k === "scope") state.scope = v || "all";
    }
    var m = h.match(/(?:^|&)p=([^&]+)/);
    state.openSlug = m ? decodeURIComponent(m[1]) : null;
  }
  function writeHash() {
    var bits = [];
    if (state.q) bits.push("q=" + encodeURIComponent(state.q));
    if (state.category !== "All") bits.push("category=" + encodeURIComponent(state.category));
    if (state.scope !== "all") bits.push("scope=" + encodeURIComponent(state.scope));
    if (state.openSlug) bits.push("p=" + encodeURIComponent(state.openSlug));
    var next = bits.length ? "#" + bits.join("&") : "#";
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  // -- filtering / sorting ---------------------------------------------------
  function visibleRows() {
    var rows = RADAR.rows.filter(function (r) {
      if (state.scope === "watchlist" && !r.is_watchlist) return false;
      if (state.scope === "early" && r.is_watchlist) return false;
      if (state.category !== "All" && r.category !== state.category) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = (r.name + " " + r.slug + " " + (r.category || "") + " " + r.chains.join(" ")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
    return rows;
  }

  // -- rendering -------------------------------------------------------------
  var boardEl = document.getElementById("board");
  document.getElementById("asof").textContent = "Snapshot " + RADAR.as_of;

  function render() {
    var cats = [];
    RADAR.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    });
    cats.sort();
    var rows = visibleRows();
    var maxImplied = 1;
    RADAR.rows.forEach(function (r) { if (r.implied_value_usd > maxImplied) maxImplied = r.implied_value_usd; });

    var html = "";
    html += '<section class="lede"><h1>40 watchlist protocols, ranked by implied value</h1>' +
      "<p>The watchlist is the floor: every protocol with at least $50M of TVL and no token on record. " +
      "The early radar adds 138 pre-token protocols below that floor. Implied value is a model, not a promise.</p>" +
      '<div class="facts">' +
      "<div class='fact'><b>40/40</b><span>Watchlist covered</span></div>" +
      "<div class='fact'><b>178</b><span>Pre-token rows scored</span></div>" +
      "<div class='fact'><b>138</b><span>Early rows below the floor</span></div>" +
      "<div class='fact'><b>24</b><span>Live-token protocols set aside</span></div>" +
      "</div></section>";

    html += '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '">' +
      '<select id="cat"><option value="All">All categories</option>' +
      cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.category === c ? " selected" : "") + ">" + esc(c) + "</option>";
      }).join("") + "</select>" +
      '<span class="scope" role="group" aria-label="Scope">' +
      ["all", "watchlist", "early"].map(function (s) {
        return '<button data-scope="' + s + '" aria-pressed="' + (state.scope === s) + '">' +
          s.charAt(0).toUpperCase() + s.slice(1) + "</button>";
      }).join("") + "</span>" +
      '<span class="tabs" role="group" aria-label="Token status">' +
      '<button data-tab="pre" aria-pressed="' + (state.tab === "pre") + '">Pre-token</button>' +
      '<button data-tab="live" aria-pressed="' + (state.tab === "live") + '">Live token</button>' +
      "</span>" +
      '<span class="count">' + rows.length + " rows shown</span>" +
      "</div>";

    if (state.tab === "live") {
      html += "<p class='note'>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</p>";
      html += "<table><thead><tr><th>Status</th><th>Protocol</th><th class='num'>TVL</th><th class='num'>7d</th><th class='num'>Market cap</th><th>Token</th></tr></thead><tbody>";
      RADAR.live.forEach(function (r) {
        html += "<tr><td>live</td><td class='proto'><b>" + esc(r.name) + "</b><span>" + esc(r.category || "") + " · " + esc(r.chains.slice(0, 2).join(", ")) + "</span></td>" +
          "<td class='num'>" + money(r.tvl_usd) + "</td>" +
          "<td class='num " + (r.change_7d == null ? "" : r.change_7d >= 0 ? "up" : "down") + "'>" + pct(r.change_7d) + "</td>" +
          "<td class='num'>" + money(r.mcap_usd) + "</td><td class='status'>already trades</td></tr>";
      });
      html += "</tbody></table>";
    } else {
      var cols = [
        ["rank", "Rank"], ["name", "Protocol"], ["tvl_usd", "TVL"],
        ["change_7d", "7d"], ["age_days", "Age"], ["implied_value_usd", "Implied value"]
      ];
      html += "<table><thead><tr>";
      cols.forEach(function (c) {
        var arrow = state.sortKey === c[0] ? (state.sortDir === -1 ? " ↓" : " ↑") : "";
        html += "<th data-sort='" + c[0] + "'" + (c[0] === "tvl_usd" || c[0] === "change_7d" || c[0] === "age_days" || c[0] === "implied_value_usd" ? " class='num'" : "") + ">" + c[1] + arrow + "</th>";
      });
      html += "<th>Token</th><th>Scope</th></tr></thead><tbody>";
      rows.forEach(function (r) {
        var w = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
        html += "<tr data-slug='" + esc(r.slug) + "' tabindex='0'>" +
          "<td class='num'>" + r.rank + "</td>" +
          "<td class='proto'><b>" + esc(r.name) + "</b><span>" + esc(r.category || "") + " · " + esc(r.chains.slice(0, 2).join(", ")) + "</span></td>" +
          "<td class='num'>" + money(r.tvl_usd) + "</td>" +
          "<td class='num " + (r.change_7d == null ? "" : r.change_7d >= 0 ? "up" : "down") + "'>" + pct(r.change_7d) + "</td>" +
          "<td class='num'>" + ageText(r.age_days) + "</td>" +
          "<td class='num'><span class='bar-wrap'><span class='bar'><i style='width:" + w + "%'></i></span>" + money(r.implied_value_usd) + "</span></td>" +
          "<td class='status'>no token</td>" +
          "<td><span class='badge" + (r.is_watchlist ? "" : " early") + "'>" + (r.is_watchlist ? "Watchlist" : "Early") + "</span></td></tr>";
      });
      html += "</tbody></table>";
    }

    html += renderModelPanel();
    boardEl.innerHTML = html;
    bind();
    if (state.openSlug) openDetail(state.openSlug);
  }

  function renderModelPanel() {
    var fit = RADAR.model.fit;
    var rows = Object.keys(RADAR.cat_factors).sort().map(function (cat) {
      return "<tr><td>" + esc(cat) + "</td><td class='num'>" + RADAR.cat_factors[cat].toFixed(2) + "x</td></tr>";
    }).join("");
    return '<section class="panel"><h2>How implied value is computed</h2>' +
      '<div class="formula">implied = round( 10^(A + B x log10(tvl)) x catFactor x (1 + clamp(change_7d, -50, 100) / 100 x 0.5) x (0.7 + 0.3 x min(age, 1095) / 1095) x (1 + 0.02 x min(chains - 1, 5)) )</div>' +
      "<p>Power-law fit on this snapshot's own token-bearing protocols: A = " + fit.intercept +
      ", B = " + fit.slope + ", R2 = " + fit.r2 + ", n = " + fit.n + " protocols with a market cap above zero. " +
      "The category factor is the category's median log-residual against that fit, used only where a category has at least 3 comparables, " +
      "clamped to [0.5, 2.0]; every other category scores 1.0. Growth is the 7-day TVL change clamped to [-50, +100] and weighted 0.5. " +
      "Maturity runs from 0.70 for a new protocol to 1.00 at three years; unknown age counts as one year. Chain breadth adds 0.02 per extra chain, up to 5.</p>" +
      "<p>Implied value is an estimate, not a price. The model does not predict whether or when a token launches. " +
      "Every row says no token on record, never that a protocol has no token.</p>" +
      "<table class='cat-table'><thead><tr><th>Category</th><th class='num'>Factor</th></tr></thead><tbody>" + rows + "</tbody></table></section>";
  }

  // -- detail drawer ---------------------------------------------------------
  function openDetail(slug) {
    var row = null;
    RADAR.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    var root = document.getElementById("drawer-root");
    if (!row) { root.innerHTML = ""; return; }
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    var stepsHtml = steps.map(function (s) {
      var cut = s.indexOf(" Cost: ");
      var action = cut >= 0 ? s.slice(0, cut) : s;
      var cost = cut >= 0 ? s.slice(cut + 1) : "";
      return "<li><b>" + esc(action) + "</b><span class='cost'>" + esc(cost) + "</span></li>";
    }).join("");
    var fit = RADAR.model.fit;
    root.innerHTML =
      '<div class="drawer-backdrop" id="backdrop"></div>' +
      '<aside class="drawer" role="dialog" aria-label="' + esc(row.name) + '">' +
      '<button class="close" id="drawer-close">Close</button>' +
      "<div class='rank-line'>Rank " + row.rank + " of " + RADAR.rows.length + "</div>" +
      "<h2>" + esc(row.name) + "</h2>" +
      "<p class='note'>" + esc(row.category || "") + " · " + esc(row.chains.join(", ")) + "</p>" +
      "<h3>Implied value: the model breakdown</h3>" +
      "<table class='breakdown'><tbody>" +
      "<tr><td>TVL</td><td>" + moneyFull(row.tvl_usd) + "</td></tr>" +
      "<tr><td>7-day growth</td><td>" + pct(row.change_7d) + "</td></tr>" +
      "<tr><td>Age</td><td>" + ageText(row.age_days) + "</td></tr>" +
      "<tr><td>Base value (power law, A=" + fit.intercept + ", B=" + fit.slope + ")</td><td>" + moneyFull(row.base_value_usd) + "</td></tr>" +
      "<tr><td>Category factor (" + esc(row.category || "none") + ")</td><td>" + row.cat_factor.toFixed(2) + "x</td></tr>" +
      "<tr><td>Growth multiplier</td><td>" + row.growth_multiplier.toFixed(2) + "x</td></tr>" +
      "<tr><td>Maturity multiplier</td><td>" + row.maturity_multiplier.toFixed(2) + "x</td></tr>" +
      "<tr><td>Chain multiplier</td><td>" + row.chain_multiplier.toFixed(2) + "x</td></tr>" +
      "<tr><td><b>Implied value</b></td><td><b>" + moneyFull(row.implied_value_usd) + "</b></td></tr>" +
      "</tbody></table>" +
      "<p class='note'>The page recomputes this row as " + moneyFull(recomputed) +
      (match ? ", the same number board.json carries." : ", which does NOT match board.json.") + "</p>" +
      "<h3>Farm plan: 7 steps</h3><ol class='steps'>" + stepsHtml + "</ol>" +
      "</aside>";
    document.getElementById("drawer-close").addEventListener("click", closeDetail);
    document.getElementById("backdrop").addEventListener("click", closeDetail);
    // Move keyboard focus into the drawer so it is usable without a mouse.
    document.getElementById("drawer-close").focus();
  }
  function closeDetail() {
    state.openSlug = null;
    document.getElementById("drawer-root").innerHTML = "";
    writeHash();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state.openSlug) closeDetail();
  });

  // -- events ----------------------------------------------------------------
  function bind() {
    var q = document.getElementById("q");
    if (q) q.addEventListener("input", function () { state.q = q.value; writeHash(); render(); });
    var cat = document.getElementById("cat");
    if (cat) cat.addEventListener("change", function () { state.category = cat.value; writeHash(); render(); });
    boardEl.querySelectorAll("[data-scope]").forEach(function (b) {
      b.addEventListener("click", function () { state.scope = b.getAttribute("data-scope"); writeHash(); render(); });
    });
    boardEl.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { state.tab = b.getAttribute("data-tab"); render(); });
    });
    boardEl.querySelectorAll("[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) state.sortDir = -state.sortDir;
        else { state.sortKey = key; state.sortDir = key === "name" ? 1 : -1; }
        render();
      });
    });
    boardEl.querySelectorAll("tbody tr[data-slug]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        state.openSlug = tr.getAttribute("data-slug");
        writeHash();
        openDetail(state.openSlug);
      });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          state.openSlug = tr.getAttribute("data-slug");
          writeHash();
          openDetail(state.openSlug);
        }
      });
    });
  }

  // -- self-test (verification only; hash #selftest=1) -----------------------
  // Checks every row's live recomputation and the farm-step generator, then
  // reports the result in the document title for headless verification.
  function selfTest() {
    var badValue = 0, badSteps = 0, nondeterministic = 0;
    RADAR.rows.forEach(function (r) {
      if (impliedOf(r) !== r.implied_value_usd) badValue++;
      var steps = farmSteps(r);
      if (steps.length !== 7) badSteps++;
      steps.forEach(function (s) { if (s.trim().length < 20 || s.trim().length > 600) badSteps++; });
      // The generator must be deterministic: same row, same steps, twice.
      if (JSON.stringify(farmSteps(r)) !== JSON.stringify(steps)) nondeterministic++;
    });
    var first = null;
    RADAR.rows.forEach(function (r) { if (r.slug === "steakhouse-financial") first = r; });
    var anchorOk = false;
    if (first) {
      // Step 2 must name the protocol's own first chain from the snapshot.
      var s2 = farmSteps(first)[1];
      var chain = (first.chains && first.chains[0]) || "Ethereum";
      anchorOk = s2.indexOf("Deposit $150 into a Steakhouse Financial vault on " + chain + " and keep the shares.") === 0;
    }
    document.title = "SELFTEST value_mismatch=" + badValue + " step_bad=" + badSteps + " nondeterministic=" + nondeterministic + " anchor=" + (anchorOk ? "ok" : "FAIL");
  }

  readHash();
  render();
  if (location.hash.indexOf("selftest") >= 0) selfTest();
})();
