// ============================================================
// UrbanMart Retail Analytics — Dashboard logic
// ============================================================
const COLORS = {
  blue: '#2563EB', blueDark:'#1D4ED8', blueLight:'#93B6F5', blueFaint:'#E7EEFC',
  green:'#16A34A', red:'#DC2626', orange:'#F0872B',
  ink:'#12172B', inkSoft:'#5B6472', inkFaint:'#94A0B2', grid:'#EEF1F6'
};
const SEGMENT_COLORS = { 'Champions':'#16A34A', 'Loyal Customers':'#2563EB', 'Potential Loyalist':'#F0872B', 'At Risk':'#DC2626' };
const SEGMENT_BADGE = { 'Champions':'champ', 'Loyal Customers':'loyal', 'Potential Loyalist':'pot', 'At Risk':'risk' };

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = COLORS.inkSoft;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 7;
Chart.defaults.plugins.legend.labels.boxHeight = 7;

const fmtMoney = (v, compact=true) => {
  if (compact && Math.abs(v) >= 1000) {
    return '$' + (v/1000).toFixed(v >= 100000 ? 0 : 1) + 'K';
  }
  return '$' + v.toLocaleString(undefined, {maximumFractionDigits:0});
};
const fmtMoneyFull = v => '$' + v.toLocaleString(undefined, {maximumFractionDigits:0});
const fmtPct = v => (v>=0?'+':'') + v.toFixed(1) + '%';
const fmtNum = v => v.toLocaleString();

// ---------------- Nav ----------------
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('page-' + item.dataset.page).classList.add('active');
    // Charts created while their page was display:none can be stuck at 0x0
    // (ResizeObserver doesn't reliably fire on display:none -> block). Force
    // every chart on the now-visible page to recompute its size.
    requestAnimationFrame(() => {
      Object.values(chartInstances).forEach(ch => { try { ch.resize(); } catch(e) {} });
    });
  });
});

// ---------------- Filters state ----------------
const state = { year: 'all', region: 'all', category: 'all', segment: 'all' };

function populateSelect(id, values, allLabel) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="all">${allLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}
populateSelect('f-year', DATA.filters.years, 'All Years');
populateSelect('f-region', DATA.filters.regions, 'All Regions');
populateSelect('f-category', DATA.filters.categories, 'All Categories');
populateSelect('f-segment', DATA.filters.segments, 'All Segments');

['year','region','category','segment'].forEach(k => {
  document.getElementById('f-'+k).addEventListener('change', e => {
    state[k] = e.target.value;
    renderAll();
  });
});
document.getElementById('f-reset').addEventListener('click', () => {
  state.year='all'; state.region='all'; state.category='all'; state.segment='all';
  ['year','region','category','segment'].forEach(k => document.getElementById('f-'+k).value='all');
  renderAll();
});

// as-of date
const allDates = DATA.historicalDaily.map(d=>d.date);
document.getElementById('asof-date').textContent = allDates[allDates.length-1];

// ---------------- Row-level filter engine ----------------
const L = DATA.lookups;
function filteredRowIndices() {
  const rows = DATA.rows;
  const n = rows.year.length;
  const idxs = [];
  const yearMatch = state.year === 'all' ? null : parseInt(state.year);
  const regionMatch = state.region === 'all' ? null : L.regions.indexOf(state.region);
  const catMatch = state.category === 'all' ? null : L.categories.indexOf(state.category);
  const segMatch = state.segment === 'all' ? null : L.segments.indexOf(state.segment);
  for (let i=0;i<n;i++){
    if (yearMatch!==null && rows.year[i]!==yearMatch) continue;
    if (regionMatch!==null && rows.regionIdx[i]!==regionMatch) continue;
    if (catMatch!==null && rows.categoryIdx[i]!==catMatch) continue;
    if (segMatch!==null && rows.segmentIdx[i]!==segMatch) continue;
    idxs.push(i);
  }
  return idxs;
}

function aggregateKPIs(idxs) {
  const rows = DATA.rows;
  let revenue=0, profit=0;
  const orderSet = new Set(), custSet = new Set();
  for (const i of idxs) {
    revenue += rows.revenue[i];
    profit += rows.profit[i];
    orderSet.add(rows.orderIdx[i]);
    custSet.add(rows.custIdx[i]);
  }
  const orders = orderSet.size, customers = custSet.size;
  return { revenue, profit, margin: revenue? profit/revenue*100:0, orders, customers, aov: orders? revenue/orders:0 };
}

function groupBy(idxs, keyFn, labelsArr) {
  const rows = DATA.rows;
  const map = new Map();
  for (const i of idxs) {
    const k = keyFn(rows, i);
    if (!map.has(k)) map.set(k, {revenue:0, profit:0, orderSet:new Set()});
    const g = map.get(k);
    g.revenue += rows.revenue[i];
    g.profit += rows.profit[i];
    g.orderSet.add(rows.orderIdx[i]);
  }
  return map;
}

// ---------------- Chart instances registry ----------------
const chartInstances = {};
function upsertChart(id, config) {
  if (chartInstances[id]) chartInstances[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  chartInstances[id] = new Chart(ctx, config);
}

// ============================================================
// PAGE 1 — EXECUTIVE OVERVIEW
// ============================================================
function renderKPIs() {
  const idxs = filteredRowIndices();
  const cur = aggregateKPIs(idxs);

  // prior-year comparison only meaningful when a specific year OR all years selected
  let prevIdxs;
  if (state.year !== 'all') {
    const py = parseInt(state.year) - 1;
    prevIdxs = filteredRowIndices().filter(() => true); // placeholder, replaced below
    const rows = DATA.rows;
    prevIdxs = [];
    const regionMatch = state.region === 'all' ? null : L.regions.indexOf(state.region);
    const catMatch = state.category === 'all' ? null : L.categories.indexOf(state.category);
    const segMatch = state.segment === 'all' ? null : L.segments.indexOf(state.segment);
    for (let i=0;i<rows.year.length;i++){
      if (rows.year[i]!==py) continue;
      if (regionMatch!==null && rows.regionIdx[i]!==regionMatch) continue;
      if (catMatch!==null && rows.categoryIdx[i]!==catMatch) continue;
      if (segMatch!==null && rows.segmentIdx[i]!==segMatch) continue;
      prevIdxs.push(i);
    }
  } else {
    prevIdxs = null;
  }
  const prev = prevIdxs ? aggregateKPIs(prevIdxs) : null;

  const cards = [
    {label:'Revenue', val: fmtMoney(cur.revenue), key:'revenue'},
    {label:'Profit', val: fmtMoney(cur.profit), key:'profit'},
    {label:'Profit Margin', val: cur.margin.toFixed(1)+'%', key:'margin'},
    {label:'Orders', val: fmtNum(cur.orders), key:'orders'},
    {label:'Customers', val: fmtNum(cur.customers), key:'customers'},
    {label:'Avg Order Value', val: fmtMoneyFull(cur.aov), key:'aov'},
  ];

  const html = cards.map(c => {
    let deltaHtml = '';
    if (prev && prev[c.key] !== 0 && isFinite(prev[c.key])) {
      const delta = (cur[c.key]-prev[c.key])/Math.abs(prev[c.key])*100;
      const cls = delta > 0.5 ? 'pos' : (delta < -0.5 ? 'neg' : 'flat');
      const arrow = delta > 0.5 ? '▲' : (delta < -0.5 ? '▼' : '—');
      deltaHtml = `<span class="delta ${cls}">${arrow} ${fmtPct(delta)} YoY</span>`;
    } else if (!prev) {
      deltaHtml = `<span class="delta flat">All years</span>`;
    }
    return `<div class="card kpi">
      <div class="label">${c.label}</div>
      <div class="value num">${c.val}</div>
      ${deltaHtml}
    </div>`;
  }).join('');
  document.getElementById('kpi-row').innerHTML = html;
}

function renderTrendChart() {
  const idxs = filteredRowIndices();
  const rows = DATA.rows;
  const byMonth = new Map();
  for (const i of idxs) {
    const m = L.months[rows.monthIdx[i]];
    byMonth.set(m, (byMonth.get(m)||0) + rows.revenue[i]);
  }
  const months = [...byMonth.keys()].sort();
  const curYear = months.map(m => byMonth.get(m));

  // prior year overlay: shift each month back by 12
  const priorVals = months.map(m => {
    const [y,mo] = m.split('-');
    const py = (parseInt(y)-1) + '-' + mo;
    return byMonth.has(py) ? byMonth.get(py) : null;
  });
  // If filter isn't year-specific, better to just plot full series + trailing-12 comparison label
  const labels = months.map(m => m);

  upsertChart('chart-trend', {
    type:'line',
    data:{ labels, datasets:[
      {label:'Revenue', data:curYear, borderColor:COLORS.blue, backgroundColor:'rgba(37,99,235,0.08)', fill:true, tension:.35, pointRadius:2, pointBackgroundColor:COLORS.blue, borderWidth:2.5},
      {label:'Prior Year', data:priorVals, borderColor:COLORS.inkFaint, borderDash:[5,4], pointRadius:0, tension:.35, borderWidth:1.8}
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', align:'end'}, tooltip:{callbacks:{label: c => `${c.dataset.label}: ${fmtMoneyFull(c.raw)}`}} },
      scales:{ y:{grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}}, x:{grid:{display:false}} }
    }
  });
}

function renderCategoryChart() {
  const idxs = filteredRowIndices();
  const rows = DATA.rows;
  const map = new Map();
  for (const i of idxs) {
    const c = L.categories[rows.categoryIdx[i]];
    if (!map.has(c)) map.set(c, {revenue:0, profit:0});
    map.get(c).revenue += rows.revenue[i];
    map.get(c).profit += rows.profit[i];
  }
  const entries = [...map.entries()].sort((a,b)=>b[1].revenue-a[1].revenue);
  upsertChart('chart-category', {
    type:'bar',
    data:{ labels: entries.map(e=>e[0]), datasets:[{
      data: entries.map(e=>e[1].revenue), backgroundColor: COLORS.blue, borderRadius:5, barThickness:16,
      profit: entries.map(e=>e[1].profit)
    }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{
        label: c => {
          const p = c.dataset.profit[c.dataIndex];
          const margin = (p/c.raw*100).toFixed(1);
          return [`Revenue: ${fmtMoneyFull(c.raw)}`, `Profit: ${fmtMoneyFull(p)}`, `Margin: ${margin}%`];
        }
      }}},
      scales:{ x:{grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}}, y:{grid:{display:false}} }
    }
  });
}

function renderRegionChart() {
  const idxs = filteredRowIndices();
  const rows = DATA.rows;
  const map = new Map();
  for (const i of idxs) {
    const r = L.regions[rows.regionIdx[i]];
    map.set(r, (map.get(r)||0) + rows.revenue[i]);
  }
  const entries = [...map.entries()].sort((a,b)=>b[1]-a[1]);
  const palette = [COLORS.blue, COLORS.blueLight, COLORS.orange, COLORS.green, '#7C3AED'];
  upsertChart('chart-region', {
    type:'doughnut',
    data:{ labels: entries.map(e=>e[0]), datasets:[{ data: entries.map(e=>e[1]), backgroundColor: palette, borderWidth:2, borderColor:'#fff' }]},
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{position:'right'}, tooltip:{callbacks:{label:c=>`${c.label}: ${fmtMoneyFull(c.raw)}`}} }
    }
  });
}

function renderScatterChart() {
  const idxs = filteredRowIndices();
  const rows = DATA.rows;
  const map = new Map();
  for (const i of idxs) {
    const c = L.categories[rows.categoryIdx[i]];
    if (!map.has(c)) map.set(c, {revenue:0, profit:0, orderSet:new Set()});
    const g = map.get(c);
    g.revenue += rows.revenue[i]; g.profit += rows.profit[i]; g.orderSet.add(rows.orderIdx[i]);
  }
  const entries = [...map.entries()];
  const maxOrders = Math.max(...entries.map(e=>e[1].orderSet.size), 1);
  upsertChart('chart-scatter', {
    type:'bubble',
    data:{ datasets: entries.map((e,i)=>({
      label: e[0],
      data: [{x: e[1].revenue, y: e[1].profit, r: 6 + (e[1].orderSet.size/maxOrders)*18}],
      backgroundColor: ['#2563EB','#16A34A','#F0872B','#DC2626','#7C3AED','#0EA5E9'][i%6] + 'CC'
    }))},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'right', labels:{boxWidth:8}}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: Rev ${fmtMoneyFull(c.raw.x)}, Profit ${fmtMoneyFull(c.raw.y)}`}} },
      scales:{
        x:{title:{display:true,text:'Revenue',font:{size:10}}, grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}},
        y:{title:{display:true,text:'Profit',font:{size:10}}, grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}}
      }
    }
  });
}

function renderMarginChart() {
  const idxs = filteredRowIndices();
  const rows = DATA.rows;
  const revMap = new Map(), profMap = new Map();
  for (const i of idxs) {
    const m = L.months[rows.monthIdx[i]];
    revMap.set(m, (revMap.get(m)||0)+rows.revenue[i]);
    profMap.set(m, (profMap.get(m)||0)+rows.profit[i]);
  }
  const months = [...revMap.keys()].sort();
  const margins = months.map(m => revMap.get(m) ? (profMap.get(m)/revMap.get(m)*100) : 0);
  upsertChart('chart-margin', {
    type:'line',
    data:{ labels:months, datasets:[{ data:margins, borderColor:COLORS.orange, backgroundColor:'rgba(240,135,43,0.1)', fill:true, tension:.35, pointRadius:2, borderWidth:2.5 }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>`Margin: ${c.raw.toFixed(1)}%`}} },
      scales:{ y:{grid:{color:COLORS.grid}, ticks:{callback:v=>v+'%'}}, x:{grid:{display:false}} }
    }
  });
}

function renderInsights() {
  const idxs = filteredRowIndices();
  const cur = aggregateKPIs(idxs);
  const rows = DATA.rows;

  // top category by margin
  const catMap = new Map();
  for (const i of idxs) {
    const c = L.categories[rows.categoryIdx[i]];
    if (!catMap.has(c)) catMap.set(c, {revenue:0, profit:0});
    catMap.get(c).revenue += rows.revenue[i]; catMap.get(c).profit += rows.profit[i];
  }
  let topMarginCat = null, topMarginVal = -Infinity;
  let topRevCat = null, topRevVal = -Infinity;
  for (const [c,v] of catMap) {
    const m = v.revenue ? v.profit/v.revenue*100 : 0;
    if (m > topMarginVal) { topMarginVal = m; topMarginCat = c; }
    if (v.revenue > topRevVal) { topRevVal = v.revenue; topRevCat = c; }
  }

  // fastest growing region YoY (only meaningful without year filter)
  const regRevByYear = new Map();
  for (const i of idxs) {
    const r = L.regions[rows.regionIdx[i]];
    const y = rows.year[i];
    const key = r+'|'+y;
    regRevByYear.set(key, (regRevByYear.get(key)||0)+rows.revenue[i]);
  }
  const years = [...new Set(rows.year)].sort();
  let fastestRegion = null, fastestGrowth = -Infinity;
  if (years.length >= 2) {
    const y2 = years[years.length-1], y1 = years[years.length-2];
    for (const r of L.regions) {
      const v2 = regRevByYear.get(r+'|'+y2) || 0;
      const v1 = regRevByYear.get(r+'|'+y1) || 0;
      if (v1 > 0) {
        const g = (v2-v1)/v1*100;
        if (g > fastestGrowth) { fastestGrowth = g; fastestRegion = r; }
      }
    }
  }

  const items = [];
  if (topRevCat) items.push({dot:COLORS.blue, html:`<b>${topRevCat}</b> <span class="txt">generated the highest revenue in the current filter.</span>`});
  if (topMarginCat) items.push({dot:COLORS.green, html:`<b>${topMarginCat}</b> <span class="txt">has the strongest profit margin at ${topMarginVal.toFixed(1)}%.</span>`});
  if (fastestRegion) items.push({dot:COLORS.orange, html:`<b>${fastestRegion}</b> <span class="txt">region grew fastest YoY at ${fmtPct(fastestGrowth)}.</span>`});
  items.push({dot:COLORS.blueLight, html:`Avg order value is <b>${fmtMoneyFull(cur.aov)}</b> <span class="txt">across ${fmtNum(cur.orders)} orders.</span>`});

  document.getElementById('insights-list').innerHTML = items.map(it =>
    `<div class="insight-row"><div class="dot" style="background:${it.dot}"></div><div>${it.html}</div></div>`
  ).join('');
}

// ============================================================
// PAGE 2 — CUSTOMER ANALYTICS  (static — not affected by page-1 filters)
// ============================================================
function renderSegDonut() {
  const d = DATA.segmentCounts;
  upsertChart('chart-segdonut', {
    type:'doughnut',
    data:{ labels:d.map(s=>s.segment), datasets:[{ data:d.map(s=>s.count), backgroundColor:d.map(s=>SEGMENT_COLORS[s.segment]), borderWidth:2, borderColor:'#fff' }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{legend:{position:'bottom', labels:{boxWidth:8, font:{size:10.5}}}} }
  });
}

function renderSegStack() {
  const d = DATA.segmentByYear;
  const years = [...new Set(d.map(r=>r.year))].sort();
  const segments = Object.keys(SEGMENT_COLORS);
  const datasets = segments.map(seg => ({
    label: seg,
    data: years.map(y => { const r = d.find(x=>x.year===y && x.segment===seg); return r? r.net_sales : 0; }),
    backgroundColor: SEGMENT_COLORS[seg],
    borderRadius:4
  }));
  upsertChart('chart-segstack', {
    type:'bar',
    data:{ labels: years, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', align:'end'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtMoneyFull(c.raw)}`}} },
      scales:{ x:{stacked:true, grid:{display:false}}, y:{stacked:true, grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}} }
    }
  });
}

function renderCustomerTable() {
  const rows = DATA.customerMatrix;
  const maxRev = Math.max(...rows.map(r=>r.revenue));
  const html = `<thead><tr><th>Customer</th><th>Revenue</th><th>Freq.</th><th>Last Purchase</th><th>Segment</th></tr></thead><tbody>` +
    rows.map(r => `<tr>
      <td>${r.customer_name}</td>
      <td><div class="bar-cell" style="width:110px;"><div class="fill" style="width:${(r.revenue/maxRev*100).toFixed(0)}%"></div></div><span class="num" style="font-size:11px;">${fmtMoneyFull(r.revenue)}</span></td>
      <td class="num">${r.frequency}</td>
      <td class="num">${r.last_purchase}</td>
      <td><span class="badge ${SEGMENT_BADGE[r.segment]||''}">${r.segment||'—'}</span></td>
    </tr>`).join('') + `</tbody>`;
  document.getElementById('tbl-customers').innerHTML = html;
}

function renderCLVChart() {
  const d = DATA.clvTop20;
  upsertChart('chart-clv', {
    type:'bar',
    data:{ labels:d.map(c=>c.customer_name), datasets:[{ data:d.map(c=>c.revenue), backgroundColor:COLORS.blue, borderRadius:4, barThickness:11 }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>fmtMoneyFull(c.raw)}} },
      scales:{ x:{grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}} }
    }
  });
}

function renderRecencyChart() {
  const d = DATA.recencyHistogram;
  upsertChart('chart-recency', {
    type:'bar',
    data:{ labels:d.map(r=>r.bucket+'d'), datasets:[{ data:d.map(r=>r.count), backgroundColor:COLORS.blueLight, borderRadius:4 }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>`${fmtNum(c.raw)} customers`}} },
      scales:{ y:{grid:{color:COLORS.grid}}, x:{grid:{display:false}} }
    }
  });
}

function renderGrowthChart() {
  const d = DATA.customerGrowth;
  upsertChart('chart-growth', {
    type:'line',
    data:{ labels:d.map(r=>r.month), datasets:[
      {label:'New', data:d.map(r=>r.new), borderColor:COLORS.green, backgroundColor:'rgba(22,163,74,0.08)', fill:true, tension:.3, pointRadius:0, borderWidth:2},
      {label:'Returning', data:d.map(r=>r.returning), borderColor:COLORS.blue, backgroundColor:'rgba(37,99,235,0.08)', fill:true, tension:.3, pointRadius:0, borderWidth:2}
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', align:'end'} },
      scales:{ y:{grid:{color:COLORS.grid}}, x:{grid:{display:false}, ticks:{maxTicksLimit:8}} }
    }
  });
}

function renderCohortHeatmap() {
  const cohorts = DATA.cohortRetention.cohorts;
  const periods = DATA.cohortRetention.periods;
  const el = document.getElementById('cohort-heatmap');
  const colWidth = 44;
  let html = `<div class="heatmap" style="grid-template-columns:78px repeat(${periods.length},${colWidth}px);">`;
  html += `<div></div>` + periods.map(p=>`<div class="hcol-label">M${p}</div>`).join('');
  for (const row of cohorts) {
    html += `<div class="hrow-label">${row.cohort}</div>`;
    for (const v of row.values) {
      if (v===null) { html += `<div></div>`; continue; }
      const alpha = Math.max(0.12, v/100);
      html += `<div class="hcell" style="background:rgba(37,99,235,${alpha});">${v.toFixed(0)}</div>`;
    }
  }
  html += `</div>`;
  el.innerHTML = html;
}

// ============================================================
// PAGE 3 — FORECAST & TRENDS
// ============================================================
function renderForecastKPIs() {
  const fs = DATA.forecastSummary;
  const cards = [
    {label:'Expected Revenue (90d)', val: fmtMoneyFull(fs.expectedRevenue90d)},
    {label:'Growth vs. Prior 90d', val: fmtPct(fs.growthVsLast90d), pos: fs.growthVsLast90d>=0},
    {label:'Avg Daily Forecast', val: fmtMoneyFull(fs.avgDailyForecast)},
  ];
  document.getElementById('fcst-kpi-row').innerHTML = cards.map(c => `
    <div class="card kpi" style="grid-column:span 3;">
      <div class="label">${c.label}</div>
      <div class="value num">${c.val}</div>
      ${c.pos!==undefined ? `<span class="delta ${c.pos?'pos':'neg'}">${c.pos?'▲':'▼'} vs last period</span>` : ''}
    </div>`).join('');
}

function renderForecastChart() {
  const hist = DATA.historicalDaily;
  const fcst = DATA.forecast;
  const allLabels = [...hist.map(h=>h.date), ...fcst.map(f=>f.date)];
  const histData = [...hist.map(h=>h.revenue), ...fcst.map(()=>null)];
  const fcstData = [...hist.map(()=>null), ...fcst.map(f=>f.forecast_revenue)];
  // connect the two lines at the boundary
  if (hist.length) fcstData[hist.length-1] = hist[hist.length-1].revenue;

  upsertChart('chart-forecast', {
    type:'line',
    data:{ labels: allLabels, datasets:[
      {label:'Actual', data:histData, borderColor:COLORS.ink, backgroundColor:'rgba(18,23,43,0.04)', fill:true, tension:.25, pointRadius:0, borderWidth:2},
      {label:'Forecast', data:fcstData, borderColor:COLORS.orange, borderDash:[6,4], pointRadius:0, tension:.25, borderWidth:2.5}
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', align:'end'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtMoneyFull(c.raw)}`}} },
      scales:{ y:{grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}}, x:{grid:{display:false}, ticks:{maxTicksLimit:10}} }
    }
  });
}

function updateWhatIf() {
  const pct = parseInt(document.getElementById('whatif-slider').value);
  document.getElementById('whatif-pct').textContent = (pct>=0?'+':'') + pct + '%';
  const base = DATA.forecastSummary.expectedRevenue90d;
  const elasticity = DATA.whatIf.elasticity;
  const demandChange = elasticity * (pct/100);
  const priceEffect = (1 + pct/100);
  const projected = base * priceEffect * (1 + demandChange);
  document.getElementById('whatif-base').textContent = fmtMoneyFull(base);
  document.getElementById('whatif-proj').textContent = fmtMoneyFull(projected);
  const projEl = document.getElementById('whatif-proj');
  projEl.style.color = projected >= base ? COLORS.green : COLORS.red;
}
document.getElementById('whatif-slider').addEventListener('input', updateWhatIf);

function renderSeasonHeatmap() {
  const s = DATA.seasonality;
  const el = document.getElementById('season-heatmap');
  const flat = s.values.flat().filter(v=>v!==null);
  const max = Math.max(...flat), min = Math.min(...flat);
  const colWidth = 58;
  let html = `<div class="heatmap" style="grid-template-columns:38px repeat(${s.weekdays.length},${colWidth}px);">`;
  html += `<div></div>` + s.weekdays.map(w=>`<div class="hcol-label">${w.slice(0,3)}</div>`).join('');
  s.months.forEach((m, mi) => {
    html += `<div class="hrow-label">${m}</div>`;
    s.weekdays.forEach((w, wi) => {
      const v = s.values[mi][wi];
      const t = max>min ? (v-min)/(max-min) : 0.5;
      const alpha = 0.15 + t*0.85;
      html += `<div class="hcell" style="background:rgba(37,99,235,${alpha.toFixed(2)});" title="${m} ${w}: ${fmtMoneyFull(v)}">${(v/1000).toFixed(1)}K</div>`;
    });
  });
  html += `</div>`;
  el.innerHTML = html;
}

// ---- Decomposition tree (Category -> Region -> Product) ----
let decompPath = []; // e.g. ['Electronics'] or ['Electronics','West']
function decompFilter() {
  return DATA.decomposition.filter(d => {
    if (decompPath[0] && d.category !== decompPath[0]) return false;
    if (decompPath[1] && d.region !== decompPath[1]) return false;
    return true;
  });
}
function renderDecomp() {
  const rows = decompFilter();
  let level, keyFn;
  if (decompPath.length === 0) { level='category'; keyFn = r=>r.category; }
  else if (decompPath.length === 1) { level='region'; keyFn = r=>r.region; }
  else { level='product_name'; keyFn = r=>r.product_name; }

  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k)||0) + r.net_sales);
  }
  const entries = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);

  upsertChart('chart-decomp', {
    type:'bar',
    data:{ labels: entries.map(e=>e[0]), datasets:[{ data: entries.map(e=>e[1]), backgroundColor: decompPath.length===0?COLORS.blue:(decompPath.length===1?COLORS.orange:COLORS.green), borderRadius:5, barThickness:16 }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      onClick:(evt, elements) => {
        if (!elements.length || level==='product_name') return;
        const idx = elements[0].index;
        const label = entries[idx][0];
        decompPath.push(label);
        renderDecomp();
      },
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>fmtMoneyFull(c.raw)}} },
      scales:{ x:{grid:{color:COLORS.grid}, ticks:{callback:v=>fmtMoney(v)}}, y:{grid:{display:false}, ticks:{font:{size:10}}} }
    }
  });

  const crumbs = ['All Categories', ...decompPath];
  document.getElementById('decomp-path').innerHTML = crumbs.map((c,i) =>
    `<span class="step" data-i="${i}">${c}</span>` + (i<crumbs.length-1 ? '<span class="sep">›</span>' : '')
  ).join('');
  document.querySelectorAll('#decomp-path .step').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.i);
      decompPath = decompPath.slice(0, i);
      renderDecomp();
    });
  });
}

function renderProductTables() {
  const top = DATA.topProducts, bottom = DATA.bottomProducts;
  const rowsHtml = (arr) => `<thead><tr><th>Product</th><th>Revenue</th><th>Profit</th><th>Units</th></tr></thead><tbody>` +
    arr.map(p => `<tr><td>${p.product_name}</td><td class="num">${fmtMoneyFull(p.revenue)}</td><td class="num">${fmtMoneyFull(p.profit)}</td><td class="num">${fmtNum(p.units)}</td></tr>`).join('') + `</tbody>`;
  document.getElementById('tbl-topprod').innerHTML = rowsHtml(top);
  document.getElementById('tbl-bottomprod').innerHTML = rowsHtml(bottom);
}

// ============================================================
// Init
// ============================================================
function renderAll() {
  renderKPIs();
  renderTrendChart();
  renderCategoryChart();
  renderRegionChart();
  renderScatterChart();
  renderMarginChart();
  renderInsights();
}

renderAll();
renderSegDonut();
renderSegStack();
renderCustomerTable();
renderCLVChart();
renderRecencyChart();
renderGrowthChart();
renderCohortHeatmap();
renderForecastKPIs();
renderForecastChart();
updateWhatIf();
renderSeasonHeatmap();
renderDecomp();
renderProductTables();
