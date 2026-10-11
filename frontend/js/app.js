// frontend/js/app.js

/* ============================================================
   STATE
   ============================================================ */
let products=[];
let sales=[];
let movements=[];
let forecasts=[];
let recommendations=[];
let selectedProduct=null, invFilter='All', importStep=1;
let importPreview=null;
let cmdSelected=0;
let repairedCsvBlob=null;
let repairedCsvFilename='repaired.csv';

/* Pagination state — one page index per table */
const PAGE_SIZE = 10;
const pageState = {};

/* ============================================================
   CATEGORY LIST
   ============================================================ */
const DEFAULT_CATEGORIES = [
  'Home Decor',
  'Home & Living',
  'Electronics',
  'Apparel',
  'Food & Beverage',
  'Health & Beauty',
  'Toys & Games',
  'Office Supplies',
  'Sports & Outdoors',
  'Pet Supplies'
];

/* ============================================================
   LOADERS
   ============================================================ */
async function loadProducts()       { products = await API.listProducts(); updateEligibility(); refreshCategoryFilter(); }
async function loadSales()          { sales = await API.listSales(); }
async function loadMovements()      { movements = await API.listMovements(); }
async function loadForecasts()      { forecasts = await API.listForecasts(); }
async function loadRecommendations(){ recommendations = await API.listRecommendations(); }

async function loadInventoryIntoProducts() {
  const inv = await API.listInventory();
  inv.forEach(row => {
    const p = products.find(x => x.sku === row.sku);
    if (p) { p.stock = row.current_stock; p.min = row.minimum_stock; }
  });
}

async function refreshAll() {
  const safe = (p) => p.catch(err => { console.warn('Loader failed:', err); return null; });

  await Promise.all([
    safe(loadProducts()),
    safe(loadSales()),
    safe(loadMovements()),
    safe(loadForecasts()),
    safe(loadRecommendations())
  ]);

  try { await loadInventoryIntoProducts(); } catch (e) { console.warn(e); }

  forecasts.forEach(f => {
    const p = products.find(x => x.sku === f.sku);
    if (p && (p.forecast == null)) p.forecast = f.predicted;
  });

  products.forEach(p => {
    if (p.forecast != null) p.forecast = Math.round(p.forecast);
  });
}

/* ============================================================
   PAGINATION HELPERS
   ============================================================ */
function paginate(rows, tableId) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let current = pageState[tableId] || 1;
  if (current > totalPages) current = totalPages;
  if (current < 1) current = 1;
  pageState[tableId] = current;

  const start = (current - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = rows.slice(start, end);

  return { pageRows, current, totalPages, total, start, end: Math.min(end, total) };
}

function paginationBar(tableId, current, totalPages, start, end, total) {
  if (total === 0) return '';
  return `
    <div class="pagination-bar">
      <div class="small muted">
        Showing <b>${total === 0 ? 0 : start + 1}</b>–<b>${end}</b> of <b>${total}</b>
      </div>
      <div class="pagination-controls">
        <button class="btn sm" onclick="setPage('${tableId}', ${current - 1})" ${current <= 1 ? 'disabled' : ''}>← Prev</button>
        <span class="small muted" style="padding:0 8px">
          Page <b>${current}</b> of <b>${totalPages}</b>
        </span>
        <button class="btn sm" onclick="setPage('${tableId}', ${current + 1})" ${current >= totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    </div>`;
}

function setPage(tableId, page) {
  pageState[tableId] = Math.max(1, page);
  if (tableId === 'products')   renderProducts();
  if (tableId === 'inventory')  renderInventory();
  if (tableId === 'sales')      renderSales();
  if (tableId === 'movements')  renderMovements();
  if (tableId === 'reorders')   renderReorderHistory();
  if (tableId === 'forecasts')  renderForecastHistory();
  if (tableId === 'attention')  renderDashboard();
}

/* ============================================================
   SEARCHABLE SELECT
   ============================================================ */
let lastSearchableToggle = 0;

function searchableSelect({ id, options, selected, placeholder = 'Search…', onChange = '' }) {
  const selectedOpt = options.find(o => String(o.value) === String(selected));
  const displayLabel = selectedOpt ? selectedOpt.label : (options[0]?.label || '');

  return `
    <div class="searchable-select" data-id="${id}" data-value="${selected || ''}">
      <button type="button" class="searchable-trigger"
              onclick="event.stopPropagation(); toggleSearchableSelect('${id}')">
        <span class="searchable-label" id="${id}_label">${displayLabel}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="searchable-panel" id="${id}_panel" style="display:none"
           onclick="event.stopPropagation()">
        <input type="text" class="searchable-search" id="${id}_search" placeholder="${placeholder}"
               oninput="filterSearchableOptions('${id}')"
               onkeydown="searchableKey(event, '${id}')"
               onclick="event.stopPropagation()">
        <div class="searchable-list" id="${id}_list">
          ${options.map(o => `
            <div class="searchable-option ${String(o.value)===String(selected)?'active':''}"
                 data-value="${o.value}"
                 data-label="${String(o.label).replace(/"/g,'&quot;')}"
                 onclick="event.stopPropagation(); selectSearchableOption('${id}', '${String(o.value).replace(/'/g,"\\'")}', ${onChange ? `'${onChange}'` : 'null'})">
              ${o.label}
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function toggleSearchableSelect(id){
  const panel = document.getElementById(`${id}_panel`);
  if(!panel) return;

  lastSearchableToggle = Date.now();

  const isOpen = panel.style.display !== 'none';

  // Close all panels first
  document.querySelectorAll('.searchable-panel').forEach(p => p.style.display = 'none');

  // If it wasn't open, open it now
  if(!isOpen){
    panel.style.display = 'block';
    const input = document.getElementById(`${id}_search`);
    if(input){
      input.value = '';
      filterSearchableOptions(id);
      setTimeout(() => input.focus(), 30);
    }
  }
}

function filterSearchableOptions(id){
  const input = document.getElementById(`${id}_search`);
  const list = document.getElementById(`${id}_list`);
  if(!input || !list) return;
  const q = input.value.trim().toLowerCase();
  const options = list.querySelectorAll('.searchable-option');
  options.forEach(opt => {
    const label = (opt.dataset.label || '').toLowerCase();
    opt.style.display = label.includes(q) ? '' : 'none';
  });
}

function searchableKey(e, id){
  if(e.key === 'Escape'){ toggleSearchableSelect(id); }
  if(e.key === 'Enter'){
    const list = document.getElementById(`${id}_list`);
    if(!list) return;
    const visible = [...list.querySelectorAll('.searchable-option')].filter(o => o.style.display !== 'none');
    if(visible.length === 1){ visible[0].click(); }
  }
}

function selectSearchableOption(id, value, onChange){
  const panel = document.getElementById(`${id}_panel`);
  const label = document.getElementById(`${id}_label`);
  if(!panel || !label) return;

  const opt = panel.querySelector(`.searchable-option[data-value="${value}"]`);
  if(opt){
    label.textContent = opt.dataset.label || opt.textContent.trim();
    panel.querySelectorAll('.searchable-option').forEach(o => o.classList.toggle('active', o === opt));
  }

  const wrapper = panel.closest('.searchable-select');
  if(wrapper) wrapper.dataset.value = value;

  panel.style.display = 'none';

  if(onChange && typeof window[onChange] === 'function'){
    window[onChange]();
  }
}

function getSearchableValue(id){
  const wrapper = document.querySelector(`.searchable-select[data-id="${id}"]`);
  if(wrapper && wrapper.dataset.value) return wrapper.dataset.value;
  const active = document.querySelector(`#${id}_list .searchable-option.active`);
  return active ? active.dataset.value : '';
}

document.addEventListener('click', (e) => {
  if(Date.now() - lastSearchableToggle < 100) return;
  if(!e.target.closest || !e.target.closest('.searchable-select')){
    document.querySelectorAll('.searchable-panel').forEach(p => p.style.display = 'none');
  }
});


/* ============================================================
   CATEGORY HELPERS
   ============================================================ */
function refreshCategoryFilter(){
  const sel = document.getElementById('categoryFilter');
  if(!sel) return;
  const current = sel.value;
  const unique = [...new Set(products.map(p => (p.category || '').trim()).filter(Boolean))].sort();
  sel.innerHTML = '<option value="All Categories">All Categories</option>' +
    unique.map(c => `<option value="${c}">${c}</option>`).join('');
  if([...sel.options].some(o => o.value === current)){
    sel.value = current;
  }
}

function toggleCustomCategory(){
  const sel = document.getElementById('mCat');
  const field = document.getElementById('mCatCustomField');
  if(!sel || !field) return;
  if(sel.value === '__custom__'){
    field.style.display = 'block';
    setTimeout(() => document.getElementById('mCatCustom')?.focus(), 50);
  } else {
    field.style.display = 'none';
  }
}

function getSelectedCategory(){
  const sel = document.getElementById('mCat');
  const custom = document.getElementById('mCatCustom');
  if(!sel) return '';
  if(sel.value === '__custom__'){
    return (custom?.value || '').trim();
  }
  return sel.value.trim();
}

/* ============================================================
   RECOMPUTE ELIGIBILITY
   ============================================================ */
async function recomputeEligibility(){
  const btn = event?.target;
  const original = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Recomputing…'; }

  try {
    const res = await fetch('/api/products/recompute-eligibility', { method: 'POST' });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    toast(
      `Recomputed ${data.total} products — ` +
      `${data.eligible} eligible, ${data.ineligible} ineligible` +
      (data.failed ? `, ${data.failed} failed` : '') + '.'
    );

    await refreshAll();
    renderProducts();
    renderInventory();
    renderDashboard();
    fillForecastSelect();
  } catch (err) {
    toast('Recompute failed: ' + err.message, 'error');
    console.error(err);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = original; }
  }
}

/* ============================================================
   ICONS
   ============================================================ */
const icons={
dashboard:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
'products-inventory':'<svg viewBox="0 0 24 24"><path d="M21 8.5 12 13 3 8.5"/><path d="M3 8.5 12 4l9 4.5"/><path d="M3 8.5V16l9 4 9-4V8.5"/><path d="M12 13v7"/></svg>',
sales:'<svg viewBox="0 0 24 24"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
import:'<svg viewBox="0 0 24 24"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>',
movements:'<svg viewBox="0 0 24 24"><polyline points="8 7 12 3 16 7"/><line x1="12" y1="3" x2="12" y2="14"/><polyline points="16 17 12 21 8 17"/><line x1="12" y1="10" x2="12" y2="21"/></svg>',
'forecast-history':'<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1-.34 1.7 1.7 0 0 0-1.08.4l-.06.06A2 2 0 1 1 4.03 16.7l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.08-.4H2.9a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.51-1.64l-.06-.06A2 2 0 0 1 6.86 4.5l.06.06A1.7 1.7 0 0 0 8 5.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.08V3.9a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15 5.6a1.7 1.7 0 0 0 1 .34 1.7 1.7 0 0 0 1.08-.4l.06-.06A2 2 0 1 1 19.97 7.3l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.08.4h.08a2 2 0 1 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15z"/></svg>'
};

const kpiIcons = {
  products: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5 12 13 3 8.5"/><path d="M3 8.5 12 4l9 4.5"/><path d="M3 8.5V16l9 4 9-4V8.5"/><path d="M12 13v7"/></svg>',
  stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg>',
  restock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  sufficient: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  forecasts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>'
};

/* ============================================================
   NAVIGATION
   ============================================================ */
const navItems=[
['dashboard','dashboard','Dashboard'],
['products-inventory','products-inventory','Products & Inventory'],
['forecast-history','forecast-history','Forecast & Reorder'],
['sales','sales','Sales Records'],
['import','import','Data Import'],
['movements','movements','Stock Movements'],
['settings','settings','Settings']
];

const cmdCommands=[
{label:'Go to Dashboard',page:'dashboard',keys:'D'},
{label:'Go to Products & Inventory',page:'products-inventory',keys:'P'},
{label:'Go to Forecast & Reorder',page:'forecast-history',keys:'F'},
{label:'Go to Sales Records',page:'sales',keys:'S'},
{label:'Go to Data Import',page:'import',keys:'I'},
{label:'Go to Stock Movements',page:'movements',keys:'M'},
{label:'Go to Settings',page:'settings',keys:','},
{label:'Toggle Theme',action:()=>toggleTheme(),keys:'T'},
{label:'Add New Product',action:()=>openProductModal(),keys:'A'},
{label:'Add Sales Record',action:()=>openSaleModal(),keys:'N'},
{label:'Record Stock Movement',action:()=>openMovementModal(),keys:'R'},
{label:'Generate Forecast',page:'forecast-history',sub:'forecast',keys:'G'},
{label:'View Reorder History',page:'forecast-history',sub:'reorder',keys:'H'}
];

/* ============================================================
   HELPERS
   ============================================================ */
function today(){return new Date().toISOString().slice(0,10)}
function nowText(){return new Date().toLocaleString()}
function updateEligibility(){ /* backend owns eligibility */ }
function required(p){return Math.round((p.forecast??0)+p.min)}
function reorder(p){return Math.max(0,required(p)-p.stock)}
function getStatus(p){if(p.forecast==null)return 'No Forecast';return p.stock<required(p)?'Restock Recommended':'Stock Sufficient'}
function badge(s){
  const c=s==='Restock Recommended'?'danger':s==='Stock Sufficient'?'success':s==='No Forecast'?'gray':'warning';
  const icon=s==='Stock Sufficient'?'✓':s==='Restock Recommended'?'!':'•';
  return `<span class="badge ${c}">${icon} ${s}</span>`;
}
function money(v){return '₱'+Number(v).toLocaleString()}

function toast(msg,type='success'){
  const d=document.createElement('div');
  d.className='toast '+(type==='error'?'error':'');
  d.innerHTML=`<b>${type==='error'?'Notice':'Success'}</b><div class="sm muted">${msg}</div>`;
  document.getElementById('toasts').appendChild(d);
  setTimeout(()=>d.remove(),3200);
}

function togglePassword(id='loginPwd'){
  const p=document.getElementById(id);
  if(!p)return;
  p.type=p.type==='password'?'text':'password';
}

function switchAuthTab(tab){
  const signin=document.getElementById('loginForm');
  const signup=document.getElementById('registerForm');
  const tabIn=document.getElementById('tabSignIn');
  const tabUp=document.getElementById('tabSignUp');
  if(!signin||!signup)return;
  if(tab==='signin'){
    signin.style.display='block';
    signup.style.display='none';
    tabIn.classList.add('active');
    tabUp.classList.remove('active');
    const e=document.getElementById('loginEmail');
    if(e)setTimeout(()=>e.focus(),50);
  }else{
    signin.style.display='none';
    signup.style.display='block';
    tabIn.classList.remove('active');
    tabUp.classList.add('active');
    const n=document.getElementById('regName');
    if(n)setTimeout(()=>n.focus(),50);
  }
}

function logout(){
  localStorage.removeItem('retailml_token');
  localStorage.removeItem('retailml_user');
  document.getElementById('app').classList.remove('show');
  document.getElementById('login').classList.remove('hidden');
  switchAuthTab('signin');
  const p=document.getElementById('loginPwd'); if(p)p.value='';
}

/* ============================================================
   SIDEBAR / MOBILE
   ============================================================ */
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('main').classList.toggle('collapsed');
}

function ensureSidebarOverlay(){
  let overlay = document.getElementById('sidebarOverlay');
  if(overlay && !overlay._wired){
    overlay.addEventListener('click', closeMobileSidebar);
    overlay._wired = true;
  }
  return overlay;
}

function openMobileSidebar(){
  const sidebar = document.getElementById('sidebar');
  const overlay = ensureSidebarOverlay();
  sidebar.classList.add('open');
  overlay.classList.add('show');
  document.body.classList.add('sidebar-open');
}

function closeMobileSidebar(){
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  if(overlay) overlay.classList.remove('show');
  document.body.classList.remove('sidebar-open');
}

function toggleMobile(){
  const isMobile = window.innerWidth <= 820;
  if(isMobile){
    const sidebar = document.getElementById('sidebar');
    if(sidebar.classList.contains('open')) closeMobileSidebar();
    else openMobileSidebar();
  } else {
    toggleSidebar();
  }
}

function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
  toast(`Switched to ${next} theme.`);
}

function buildNav(){
  document.getElementById('nav').innerHTML=navItems.map((n,i)=>
    `<button data-page="${n[0]}" class="${i===0?'active':''}" onclick="go('${n[0]}')">
      <span class="ico" aria-hidden="true">${icons[n[1]]||''}</span>
      <span class="label">${n[2]}</span>
    </button>`).join('');
}

async function go(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const p=document.getElementById(id); if(p)p.classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  const item=navItems.find(x=>x[0]===id);
  document.getElementById('headerTitle').textContent=item?item[2]:(id==='product-details'?'Product Details':'Retail ML');

  closeMobileSidebar();

  try {
    if(id==='dashboard')          { await refreshAll(); renderDashboard(); }
    if(id==='sales')              { await loadSales(); renderSales(); }
    if(id==='movements')          { await loadMovements(); renderMovements(); }
    if(id==='products-inventory') { await loadProducts(); await loadInventoryIntoProducts(); renderProducts(); renderInventory(); }
    if(id==='forecast-history')   { await loadProducts(); await loadForecasts(); fillForecastSelect(); renderReorderHistory(); }
  } catch (err) {
    toast('Failed to load data.', 'error');
    console.error(err);
  }
}

function switchCombinedTab(tab){
  document.querySelectorAll('#combinedProducts, #combinedInventory').forEach(el=>el.style.display='none');
  document.getElementById('tabProducts').classList.remove('active');
  document.getElementById('tabInventory').classList.remove('active');
  if(tab==='products'){document.getElementById('combinedProducts').style.display='block';document.getElementById('tabProducts').classList.add('active');renderProducts();}
  if(tab==='inventory'){document.getElementById('combinedInventory').style.display='block';document.getElementById('tabInventory').classList.add('active');renderInventory();}
}
function switchCombinedTab2(tab){
  document.querySelectorAll('#combinedForecast, #combinedReorder').forEach(el=>el.style.display='none');
  document.getElementById('tabForecast').classList.remove('active');
  document.getElementById('tabReorder').classList.remove('active');
  if(tab==='forecast'){document.getElementById('combinedForecast').style.display='block';document.getElementById('tabForecast').classList.add('active');fillForecastSelect();}
  if(tab==='reorder'){document.getElementById('combinedReorder').style.display='block';document.getElementById('tabReorder').classList.add('active');renderReorderHistory();}
}

/* ============================================================
   DATA IMPORT TABS
   ============================================================ */
function switchImportTab(tab){
  const upload = document.getElementById('importUpload');
  const repair = document.getElementById('importRepair');
  const tUp    = document.getElementById('tabUploadCsv');
  const tRep   = document.getElementById('tabRepairFile');
  if(!upload || !repair) return;

  if(tab === 'upload'){
    upload.style.display = 'block';
    repair.style.display = 'none';
    tUp.classList.add('active');
    tRep.classList.remove('active');
  } else {
    upload.style.display = 'none';
    repair.style.display = 'block';
    tUp.classList.remove('active');
    tRep.classList.add('active');
    checkRepairSetup();
  }
}

async function checkRepairSetup(){
  const setupBox = document.getElementById('repairSetupBox');
  const mainBox  = document.getElementById('repairMain');
  if(!setupBox || !mainBox) return;

  setupBox.style.display = 'none';
  mainBox.style.display = 'none';

  try {
    const res = await fetch('/api/uci/status');
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if(data.loaded){
      setupBox.style.display = 'none';
      mainBox.style.display = 'block';
      loadRepairCandidates();
    } else {
      setupBox.style.display = 'block';
      mainBox.style.display = 'none';
    }
  } catch (err) {
    toast('Could not check setup status: ' + err.message, 'error');
    setupBox.style.display = 'block';
    console.error(err);
  }
}

async function runUciSetup(){
  const btn = document.getElementById('setupBtn');
  const box = document.getElementById('setupProgress');

  btn.disabled = true;
  btn.textContent = 'Setting up…';
  box.innerHTML = '<div class="skeleton" style="height:60px"></div><p class="muted small" style="margin-top:8px">Importing reference data. This may take 10–30 seconds…</p>';

  try {
    const res = await fetch('/api/uci/setup', { method: 'POST' });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    box.innerHTML = `
      <div class="notice" style="background:var(--success-soft);border-color:#a7f3d0;color:#065f46">
        <b>Setup complete.</b>
        ${data.products_created.toLocaleString()} products created,
        ${data.sales_inserted.toLocaleString()} sales rows inserted in
        ${data.elapsed_seconds}s.
      </div>`;
    toast('Verified records loaded successfully.');

    await refreshAll();
    checkRepairSetup();
  } catch (err) {
    box.innerHTML = `<div class="notice warning">Setup failed: ${err.message}</div>`;
    toast('Setup failed: ' + err.message, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Setup Verified Records Database';
  }
}

async function loadRepairCandidates(){
  const statusEl = document.getElementById('repairStatus');
  const box      = document.getElementById('repairCandidates');
  if(!statusEl || !box) return;

  statusEl.textContent = 'Loading…';
  box.innerHTML = '<div class="skeleton" style="height:160px"></div>';

  try {
    const res = await fetch('/api/uci/candidates?limit=10');
    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();

    statusEl.textContent =
      `${data.eligible.toLocaleString()} verified SKUs available — ` +
      `each has enough history to pass import validation.`;

    const rows = data.candidates.map(c => [
      `<span class="mono">${c.sku}</span>`,
      c.description,
      c.n_days,
      c.n_nonzero,
      c.span,
      c.eligible
        ? '<span class="badge success">✓ Compatible</span>'
        : '<span class="badge warning">• Insufficient</span>'
    ]);

    box.innerHTML = table(
      ['SKU','Description','Distinct Days','Nonzero Days','Span (days)','Compatibility'],
      rows
    );
  } catch (err) {
    statusEl.textContent = 'Failed to load compatible records.';
    box.innerHTML = `<div class="notice warning">${err.message}</div>`;
    console.error(err);
  }
}

async function analyzeAndRepair(){
  const fileInput = document.getElementById('repairFile');
  const file = fileInput?.files?.[0];
  if(!file){ toast('Choose a CSV file first.', 'error'); return }

  const reportBox = document.getElementById('repairReportBox');
  reportBox.style.display = 'block';
  reportBox.innerHTML = '<div class="skeleton" style="height:160px"></div>';

  const text = await file.text();
  const parsed = parseCSV(text);

  const rows = [];
  parsed.rows.forEach(r => {
    const sku = (r.StockCode || r.SKU || r.sku || '').trim();
    if(!sku) return;
    rows.push({
      sku,
      name:  (r.Description || r.Product || r.ProductName || sku).trim(),
      qty:   Number(r.Quantity ?? r.QuantitySold ?? r.quantity ?? 0),
      date:  (r.InvoiceDate || r.SaleDate || r.Date || r.date || '').trim(),
      price: Number(r.UnitPrice ?? r.Price ?? r.price ?? 0),
    });
  });

  if(!rows.length){
    reportBox.innerHTML = '<div class="notice warning">No usable rows found in the file.</div>';
    return;
  }

  try {
    const res = await fetch('/api/uci/repair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const rep = data.report;

    const repairedRows = rep.repaired.map(x => [
      `<span class="mono">${x.sku}</span>`,
      x.user_rows,
      `+${x.uci_rows_added}`,
      `<span class="mono">${x.uci_source_sku}</span>`,
      x.uci_description
    ]);

    const unmatchedRows = rep.unmatched.map(x => [
      `<span class="mono">${x.sku}</span>`,
      x.reason
    ]);

    reportBox.innerHTML = `
      <div class="card">
        <h3>Repair Summary</h3>
        <div class="grid cols-3" style="margin-top:12px">
          <div class="card"><div class="kpi-label">SKUs in your file</div>
            <div style="font-size:26px;font-weight:800;margin-top:6px">${rep.input_skus}</div></div>
          <div class="card"><div class="kpi-label">Repaired with verified data</div>
            <div style="font-size:26px;font-weight:800;margin-top:6px;color:var(--success)">${rep.repaired.length}</div></div>
          <div class="card"><div class="kpi-label">Could not repair</div>
            <div style="font-size:26px;font-weight:800;margin-top:6px;color:var(--danger)">${rep.unmatched.length}</div></div>
        </div>

        ${repairedRows.length ? `
          <h4 style="margin-top:20px">Repaired SKUs</h4>
          ${table(['SKU','Your rows','Rows added','Source SKU','Description'], repairedRows)}
        ` : ''}

        ${unmatchedRows.length ? `
          <h4 style="margin-top:20px">Not repaired</h4>
          ${table(['SKU','Reason'], unmatchedRows)}
        ` : ''}

        <div class="actions" style="margin-top:18px;gap:8px;flex-wrap:wrap">
          <button class="btn" onclick="resetRepair()">Import Another File</button>
          <button class="btn primary" onclick="downloadRepairedCsv()">Download Repaired CSV</button>
        </div>
      </div>`;

    repairedCsvBlob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
    repairedCsvFilename = `repaired_${file.name}`;

    toast('Repair complete. Click "Download Repaired CSV".');
  } catch (err) {
    reportBox.innerHTML = `<div class="notice warning">${err.message}</div>`;
    toast('Repair failed: ' + err.message, 'error');
    console.error(err);
  }
}

function resetRepair(){
  const fileInput = document.getElementById('repairFile');
  if(fileInput) fileInput.value = '';
  const reportBox = document.getElementById('repairReportBox');
  if(reportBox) reportBox.style.display = 'none';
  repairedCsvBlob = null;
  repairedCsvFilename = 'repaired.csv';
  toast('Ready for a new file.');
}

function downloadRepairedCsv(){
  if(!repairedCsvBlob){ toast('No repaired CSV available.', 'error'); return }
  const url = URL.createObjectURL(repairedCsvBlob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = repairedCsvFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Downloaded. Upload it via the Upload CSV tab.');
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard(){
  const assessed=products.filter(p=>p.forecast!=null);
  const restock=assessed.filter(p=>getStatus(p)==='Restock Recommended').length;
  const sufficient=assessed.filter(p=>getStatus(p)==='Stock Sufficient').length;
  const totalStock=products.reduce((sum,p)=>sum+(Number(p.stock)||0),0);

  const k=[
    {label:'Total Products', value:String(products.length), icon:kpiIcons.products, tone:'primary'},
    {label:'Current Stock', value:totalStock.toLocaleString(), unit:'units', icon:kpiIcons.stock, tone:'info'},
    {label:'Restock Recommended', value:String(restock), unit:'products', icon:kpiIcons.restock, tone:'danger'},
    {label:'Stock Sufficient', value:String(sufficient), unit:'products', icon:kpiIcons.sufficient, tone:'success'},
    {label:'Forecasts Generated', value:String(forecasts.length), icon:kpiIcons.forecasts, tone:'violet'},
    {label:'Historical Sales Records', value:String(sales.length), icon:kpiIcons.sales, tone:'cyan'}
  ];

  document.getElementById('kpis').innerHTML=k.map(x=>`
    <div class="card kpi kpi-${x.tone}">
      <div class="kpi-body">
        <div class="kpi-label">${x.label}</div>
        <div class="value">${x.value}${x.unit?` <span class="unit">${x.unit}</span>`:''}</div>
      </div>
      <div class="kpi-icon">${x.icon}</div>
    </div>`).join('');

  const forecasted=products.filter(p=>p.forecast!=null).slice(0,5);
  document.getElementById('forecastBars').innerHTML=forecasted.length
    ?forecasted.map(p=>`<div class="bar" style="height:${Math.max(25,Math.min(200,Number(p.forecast)*2.5))}px"><span>${p.forecast}</span></div>`).join('')
    :'<div class="muted sm" style="align-self:center;width:100%;text-align:center">No forecasts generated yet.</div>';

  const stockItems=products.filter(p=>p.forecast!=null).slice(0,4);
  document.getElementById('stockBars').innerHTML=stockItems.length
    ?stockItems.map(p=>`<div style="display:flex;align-items:flex-end;gap:4px;flex:1;height:100%"><div class="bar" style="height:${Math.max(10,Math.min(210,Number(p.stock)*1.6))}px"></div><div class="bar alt" style="height:${Math.max(10,Math.min(210,required(p)*1.6))}px"></div></div>`).join('')
    :'<div class="muted sm" style="align-self:center;width:100%;text-align:center">No inventory assessment data yet.</div>';

  const att=products.filter(p=>getStatus(p)==='Restock Recommended');
  const attPag = paginate(att, 'attention');
  document.getElementById('attentionTable').innerHTML=table(
    ['SKU','Product','Current Stock','Minimum Stock','Forecast','Required Stock','Reorder','Status','Action'],
    attPag.pageRows.map(p=>[
      `<span class="mono">${p.sku}</span>`,
      p.name,
      p.stock,
      p.min,
      Math.round(p.forecast),
      required(p),
      `<b style="color:var(--danger)">${reorder(p)}</b>`,
      badge(getStatus(p)),
      `<button class="btn sm" onclick="openProduct(${p.id})">View Details</button>`
    ])
  ) + paginationBar('attention', attPag.current, attPag.totalPages, attPag.start, attPag.end, attPag.total);

  const activities=[];
  forecasts.slice(-2).forEach(f=>activities.push([`Forecast generated for ${f.sku}`,`${Math.round(f.predicted)} units predicted for next 7 days`,f.date]));
  movements.slice(-2).forEach(m=>activities.push([`${m.type} recorded for ${m.sku}`,`Stock changed from ${m.prev} to ${m.next}`,m.date]));
  recommendations.slice(-2).forEach(r=>activities.push([`Inventory assessment saved for ${r.sku}`,`${Math.round(r.reorder)} units recommended`,r.date]));
  document.getElementById('activity').innerHTML=activities.length
    ?activities.reverse().map(a=>`<div class="activity"><div class="dot"></div><div><b class="sm">${a[0]}</b><div class="small muted">${a[1]}</div><div class="small muted">${a[2]}</div></div></div>`).join('')
    :'<div class="muted sm">No recent activity yet.</div>';

  const sorted=[...sales].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-12);
  const trend=document.getElementById('demandTrendChart'), trendLabel=document.getElementById('demandTrendLabel');
  if(sorted.length){
    trendLabel.textContent='Historical sales quantity';
    const vals=sorted.map(s=>Number(s.qty)||0), max=Math.max(...vals,1), w=700, h=240;
    const pts=vals.map((v,i)=>`${vals.length===1?w/2:i*(w/(vals.length-1))},${h-20-(v/max)*(h-50)}`).join(' ');
    trend.style.display='block';
    trend.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4c6ef5" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#4c6ef5" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon fill="url(#lineGrad)" points="0,${h} ${pts} ${w},${h}"/>
      <polyline fill="none" stroke="#3b5bdb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>
    </svg>`;
  }else{
    trendLabel.textContent='No historical demand data';
    trend.style.display='grid';
    trend.innerHTML='<span class="muted sm" style="place-self:center">No sales records available.</span>';
  }

  const donut=document.getElementById('statusDonut'),legend=document.getElementById('statusLegend'),total=restock+sufficient;
  donut.dataset.total=String(total);
  if(total){
    const pct=(sufficient/total)*100;
    donut.style.background=`conic-gradient(from -90deg, #10b981 0 ${pct}%, #ef4444 ${pct}% 100%)`;
    legend.innerHTML=`<span><i style="background:#10b981"></i>Stock Sufficient ${sufficient}</span><span><i style="background:#ef4444"></i>Restock Recommended ${restock}</span>`;
  }else{
    donut.style.background='var(--surface-2)';
    legend.innerHTML='<span class="muted">No inventory assessments yet.</span>';
  }
}

function table(headers,rows){
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="muted" style="text-align:center;padding:36px">No records found.</td></tr>`}</tbody></table>`;
}

/* ============================================================
   PRODUCTS
   ============================================================ */
function renderProducts(){
  const q=(document.getElementById('productSearch')?.value||'').toLowerCase(), cat=document.getElementById('categoryFilter')?.value||'All Categories';
  const allRows = products.filter(p=>(p.name.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q))&&(cat==='All Categories'||p.category===cat));
  const { pageRows, current, totalPages, total, start, end } = paginate(allRows, 'products');

  const rows = pageRows.map(p=>[
    `<span class="mono">${p.sku}</span>`,p.name,p.category,p.stock,p.min,
    p.eligible?'<span class="badge success">✓ Eligible</span>':'<span class="badge warning">• Insufficient Data</span>',
    p.active?'<span class="badge success">Active</span>':'<span class="badge gray">Inactive</span>',
    `<div class="actions"><button class="btn sm" onclick="openProduct(${p.id})">View</button><button class="btn sm" onclick="openProductModal(products.find(x=>x.id===${p.id}))">Edit</button><button class="btn sm" onclick="selectForecastInCombined(${p.id})">Forecast</button></div>`
  ]);

  document.getElementById('productsTable').innerHTML =
    table(['SKU','Product Name','Category','Current Stock','Minimum Stock','Forecast Eligibility','Status','Actions'], rows) +
    paginationBar('products', current, totalPages, start, end, total);
}
function selectForecastInCombined(id){
  selectedProduct = products.find(p => p.id === id);
  go('forecast-history');
  switchCombinedTab2('forecast');
  fillForecastSelect();
}

function openProduct(id){
  selectedProduct=products.find(p=>p.id===id)||products[0];
  if(!selectedProduct){toast('Product not found.','error');return}
  document.getElementById('detailSku').textContent=selectedProduct.sku;
  document.getElementById('detailName').textContent=selectedProduct.name;
  document.getElementById('detailCategory').textContent=selectedProduct.category;
  document.getElementById('detailKpis').innerHTML=[
    ['Current Stock',selectedProduct.stock+' units'],
    ['Minimum Stock',selectedProduct.min+' units'],
    ['Latest Forecast',selectedProduct.forecast==null?'No Forecast':Math.round(selectedProduct.forecast)+' units'],
    ['Inventory Status',getStatus(selectedProduct)]
  ].map(x=>`<div class="card"><div class="kpi-label">${x[0]}</div><div style="font-size:22px;font-weight:800;margin-top:8px;letter-spacing:-.025em">${x[1]}</div></div>`).join('');
  detailTab('overview');go('product-details');
}
function detailTab(name,btn){
  if(!selectedProduct){document.getElementById('detailTabContent').innerHTML='<div class="muted">No product selected.</div>';return}
  if(btn){btn.parentElement.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}
  const p=selectedProduct; let html='';
  if(name==='overview')html=`<div class="grid cols-2"><div><h3>Product Overview</h3><p><b>SKU:</b> <span class="mono">${p.sku}</span></p><p><b>Category:</b> ${p.category}</p><p><b>Forecast Eligibility:</b> ${p.eligible?'Eligible':'Insufficient Historical Data'}</p></div><div><h3>Inventory Summary</h3><p><b>Required Stock:</b> ${p.forecast==null?'—':required(p)}</p><p><b>Recommended Reorder:</b> ${p.forecast==null?'—':reorder(p)}</p>${badge(getStatus(p))}</div></div>`;
  if(name==='sales')html=table(['Date','Quantity Sold','Unit Price','Total'],sales.filter(s=>s.sku===p.sku).map(s=>[s.date,s.qty,money(s.price),money(s.qty*s.price)]));
  if(name==='inventory')html=`<div class="notice">Current stock is digitally maintained by authorized users and is not physically detected by the system.</div><div class="calc"><div class="calc-box">Current Stock<strong>${p.stock}</strong></div><div class="op">+</div><div class="calc-box">Minimum Stock<strong>${p.min}</strong></div></div>`;
  if(name==='movements')html=table(['Date','Type','Quantity','Previous','New','Notes'],movements.filter(m=>m.sku===p.sku).map(m=>[m.date,m.type,m.qty,m.prev,m.next,m.notes]));
  if(name==='forecasts')html=table(['Forecast ID','Date','Horizon','Predicted Demand','Model'],forecasts.filter(f=>f.sku===p.sku).map(f=>[f.id,f.date,f.horizon+' days',Math.round(f.predicted),f.model]));
  if(name==='recommendations')html=table(['Recommendation ID','Date','Required','Reorder','Status'],recommendations.filter(r=>r.sku===p.sku).map(r=>[r.id,r.date,r.required,r.reorder,badge(r.status)]));
  document.getElementById('detailTabContent').innerHTML=html;
}

function openProductModal(p=null){
  const edit=!!p;
  const currentCat = (p?.category || '').trim();
  const isCustom = currentCat && !DEFAULT_CATEGORIES.includes(currentCat);

  openModal(`<div class="modal-head"><h3>${edit?'Edit':'Add'} Product</h3><button class="icon-btn" onclick="closeModal()">×</button></div>

    <div class="grid cols-2">
      <div class="field"><label>SKU / Stock Code</label><input id="mSku" class="input" value="${p?.sku||''}"></div>
      <div class="field"><label>Product Name</label><input id="mName" class="input" value="${p?.name||''}"></div>
    </div>

    <div class="field">
      <label>Category</label>
      <select id="mCat" class="input" onchange="toggleCustomCategory()">
        <option value="">— Select category —</option>
        ${DEFAULT_CATEGORIES.map(c => `<option value="${c}" ${currentCat===c?'selected':''}>${c}</option>`).join('')}
        <option value="__custom__" ${isCustom?'selected':''}>+ Custom category…</option>
      </select>
    </div>

    <div class="field" id="mCatCustomField" style="display:${isCustom?'block':'none'}">
      <label>Custom Category Name</label>
      <input id="mCatCustom" class="input" placeholder="e.g. Kitchenware"
             value="${isCustom ? currentCat : ''}">
    </div>

    <div class="grid cols-2">
      <div class="field"><label>Current Stock</label><input id="mStock" type="number" min="0" class="input" value="${p?.stock??0}"></div>
      <div class="field"><label>Minimum Stock</label><input id="mMin" type="number" min="0" class="input" value="${p?.min??0}"></div>
    </div>

    <div class="actions" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveProduct(${p?.id||'null'})">${edit?'Save Changes':'Add Product'}</button>
    </div>`);
}

async function saveProduct(id){
  const sku = document.getElementById('mSku').value.trim();
  const name = document.getElementById('mName').value.trim();
  const category = getSelectedCategory();

  if(!sku || !name){ toast('SKU and Product Name are required.','error'); return }
  if(!category){ toast('Please select or enter a category.','error'); return }

  const payload = {
    sku,
    name,
    category,
    stock: +document.getElementById('mStock').value,
    min:   +document.getElementById('mMin').value
  };

  try {
    if (id) await API.updateProduct(id, payload);
    else    await API.createProduct(payload);

    await refreshAll();
    closeModal();
    renderProducts(); renderInventory(); renderDashboard(); fillForecastSelect();
    toast(id ? 'Product updated successfully.' : 'Product added successfully.');
  } catch (err) {
    toast('Failed to save product.', 'error');
    console.error(err);
  }
}

/* ============================================================
   SALES
   ============================================================ */
function renderSales(){
  const q=(document.getElementById('salesSearch')?.value||'').toLowerCase();
  const allRows = sales.filter(s=>s.name.toLowerCase().includes(q)||s.sku.toLowerCase().includes(q));
  const { pageRows, current, totalPages, total, start, end } = paginate(allRows, 'sales');

  const rows = pageRows.map(s=>[
    `<span class="mono">${s.id}</span>`,s.date,`<span class="mono">${s.sku}</span>`,s.name,s.qty,
    money(s.price),`<b>${money(s.qty*s.price)}</b>`,s.source,
    `<button class="btn sm danger" onclick="deleteSale('${s.id}')">Delete</button>`
  ]);

  document.getElementById('salesTable').innerHTML = table(
    ['Sale ID','Date','SKU','Product','Quantity Sold','Unit Price','Total','Source','Actions'],
    rows
  ) + paginationBar('sales', current, totalPages, start, end, total);
}

function openSaleModal(){
  if(!products.length){toast('Add a product before recording a sale.','error');return}

  const productOptions = products.map(p => ({
    value: p.id,
    label: `${p.sku} — ${p.name}`
  }));

  openModal(`<div class="modal-head"><h3>Add Sales Record</h3><button class="icon-btn" onclick="closeModal()">×</button></div>

    <div class="field">
      <label>Product</label>
      ${searchableSelect({
        id: 'saleProduct',
        options: productOptions,
        selected: products[0].id,
        placeholder: 'Search SKU or product name…'
      })}
    </div>

    <div class="grid cols-2">
      <div class="field"><label>Sale Date</label><input id="saleDate" class="input" type="date" value="${today()}"></div>
      <div class="field"><label>Quantity Sold</label><input id="saleQty" class="input" type="number" min="1" value="1"></div>
    </div>

    <div class="field"><label>Unit Price</label><input id="salePrice" class="input" type="number" min="0" value="0"></div>

    <div class="actions" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveSale()">Save Record</button>
    </div>`);
}

async function saveSale(){
  const productId = +getSearchableValue('saleProduct');
  const p = products.find(x => x.id === productId);
  if(!p){ toast('Select a product.','error'); return }

  const payload = {
    sku: p.sku,
    date: document.getElementById('saleDate').value,
    qty: +document.getElementById('saleQty').value,
    price: +document.getElementById('salePrice').value,
    source: 'Manual'
  };

  try {
    await API.createSale(payload);
    await refreshAll();
    closeModal();
    renderSales(); renderProducts(); renderDashboard(); fillForecastSelect();
    toast('Sales record saved.');
  } catch (err) {
    toast('Failed to save sale.', 'error');
    console.error(err);
  }
}
async function deleteSale(id){
  try {
    await API.deleteSale(id);
    await refreshAll();
    renderSales(); renderProducts(); renderDashboard(); fillForecastSelect();
    toast('Sales record deleted.');
  } catch (err) {
    toast('Failed to delete sale.', 'error');
    console.error(err);
  }
}

/* ============================================================
   CSV IMPORT
   ============================================================ */
function parseCSV(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim());
  if(!lines.length)return {headers:[],rows:[]};
  const parseLine=line=>{const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out};
  const headers=parseLine(lines[0]).map(h=>h.trim());
  const rows=lines.slice(1).map(line=>{const vals=parseLine(line),obj={};headers.forEach((h,i)=>obj[h]=vals[i]??'');return obj});
  return {headers,rows};
}
function parseCSVLine(line){
  const out = [];
  let cur = '';
  let quoted = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){
      if(quoted && line[i+1] === '"'){ cur += '"'; i++; }
      else quoted = !quoted;
    } else if(ch === ',' && !quoted){
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(x => x.trim());
}

function renderImport(){
  document.querySelectorAll('.step').forEach((s,i)=>s.classList.toggle('active',i+1===importStep));
  const box=document.getElementById('importStage');
  if(!box)return;

  if(importStep===1){
    box.innerHTML=`
      <div class="dropzone">
        <div style="font-size:44px;margin-bottom:10px">⇧</div>
        <h3 style="margin:0 0 6px">Drag and drop your CSV file here</h3>
        <p class="muted" style="margin:0 0 4px">or browse files • Accepted: .csv</p>
        <input id="csvInput" type="file" accept=".csv,text/csv"
               style="display:block;margin:18px auto;max-width:280px">
        <button class="btn primary" onclick="validateCsv()">Validate Data</button>
      </div>`;
  }

  if(importStep===2 && importPreview){
    const s=importPreview.summary;
    box.innerHTML=`
      <h3>Validate Dataset</h3>
      <p><b>${importPreview.name}</b> • ${s.total.toLocaleString()} records</p>
      <div class="grid cols-3" style="margin-top:16px">
        <div class="card"><div class="kpi-label">Usable Records</div>
          <div style="font-size:28px;font-weight:800;margin-top:8px">${s.valid.toLocaleString()}</div></div>
        <div class="card"><div class="kpi-label">Cancelled</div>
          <div style="font-size:28px;font-weight:800;margin-top:8px">${s.cancelled.toLocaleString()}</div></div>
        <div class="card"><div class="kpi-label">Negative Qty</div>
          <div style="font-size:28px;font-weight:800;margin-top:8px">${s.negative.toLocaleString()}</div></div>
      </div>
      <div class="actions" style="margin-top:18px;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="resetImport()">Import Another File</button>
        <button class="btn" onclick="importStep=1;renderImport()">Back</button>
        <button class="btn primary" onclick="importStep=3;renderImport()">Continue to Review</button>
      </div>`;
  }

  if(importStep===3 && importPreview){
    const s=importPreview.summary;
    box.innerHTML=`
      <h3>Review Validation Summary</h3>
      ${table(
        ['Issue','Count','Treatment'],
        [
          ['Missing Required Fields',s.missing,'Exclude / inspect'],
          ['Cancelled Invoices',s.cancelled,'Exclude from positive demand'],
          ['Negative Quantities',s.negative,'Handle as returns/corrections'],
          ['Invalid Rows',s.invalid,'Exclude / inspect']
        ]
      )}
      <div class="actions" style="margin-top:18px;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="resetImport()">Import Another File</button>
        <button class="btn" onclick="importStep=2;renderImport()">Back</button>
        <button class="btn primary" onclick="commitCsvImport()">Import Valid Records</button>
      </div>`;
  }

  if(importStep===4){
    box.innerHTML=`
      <div style="text-align:center;padding:32px">
        <div style="font-size:52px;margin-bottom:8px">✓</div>
        <h2 style="margin:0 0 8px">Import Completed</h2>
        <p class="muted">Validated sales records were added.</p>
        <div class="actions" style="justify-content:center;margin-top:18px;gap:8px;flex-wrap:wrap">
          <button class="btn" onclick="resetImport()">Import Another File</button>
          <button class="btn" onclick="go('sales')">View Sales Records</button>
          <button class="btn primary" onclick="go('dashboard')">Go to Dashboard</button>
        </div>
      </div>`;
  }
}

function resetImport(){
  importStep = 1;
  importPreview = null;
  const csvInput = document.getElementById('csvInput');
  if(csvInput) csvInput.value = '';
  renderImport();
  toast('Ready for a new file.');
}

async function commitCsvImport(){
  if(!importPreview || !importPreview.usable || !importPreview.usable.length){
    toast('No valid rows to import.', 'error');
    return;
  }

  const btn = document.querySelector('#importStage .btn.primary');
  const original = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Importing…'; }

  try {
    const result = await API.bulkImportSales(importPreview.usable);
    await refreshAll();
    renderProducts(); renderSales(); renderInventory(); renderDashboard(); fillForecastSelect();

    importStep = 4;
    renderImport();

    const summary = result && typeof result.imported === 'number'
      ? `${result.imported} records imported`
      : 'Import successful';
    toast(summary + '.');
  } catch (err) {
    toast('Import failed: ' + (err.message || 'unknown error'), 'error');
    console.error(err);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = original; }
  }
}

function validateCsv(){
  const file = document.getElementById('csvInput')?.files?.[0];
  if(!file){ toast('Choose a CSV file first.', 'error'); return }

  if(file.size > 5 * 1024 * 1024){
    toast('File is large (' + (file.size/1024/1024).toFixed(1) + ' MB). This may take a few seconds.', 'error');
  }

  const reader = new FileReader();

  reader.onload = () => {
    const text = String(reader.result || '');
    const lines = text.replace(/\r/g, '').split('\n');

    const MAX_VALIDATE = 5000;
    const linesToProcess = lines.length > MAX_VALIDATE
      ? lines.slice(0, MAX_VALIDATE + 1)
      : lines;

    const filtered = linesToProcess.filter(x => x.trim());
    if(!filtered.length){
      toast('File is empty.', 'error');
      return;
    }

    const headers = parseCSVLine(filtered[0]);
    const usable = [];
    let cancelled = 0, negative = 0, missing = 0, invalid = 0;

    for(let i = 1; i < filtered.length; i++){
      const vals = parseCSVLine(filtered[i]);
      const r = {};
      headers.forEach((h, idx) => r[h] = vals[idx] ?? '');

      const sku   = (r.StockCode || r.SKU || r.sku || '').trim();
      const name  = (r.Description || r.Product || r.ProductName || sku).trim();
      const qty   = Number(r.Quantity ?? r.QuantitySold ?? r.quantity);
      const date  = (r.InvoiceDate || r.SaleDate || r.Date || r.date || '').trim();
      const price = Number(r.UnitPrice ?? r.Price ?? r.price ?? 0);
      const invoice = (r.InvoiceNo || r.Invoice || '').trim();
      const isCancelled = /^C/i.test(invoice);

      if(isCancelled) cancelled++;
      if(Number.isFinite(qty) && qty < 0) negative++;
      if(!sku || !date || !Number.isFinite(qty)) missing++;
      if(!Number.isFinite(qty) || !Number.isFinite(price)) invalid++;

      if(sku && date && Number.isFinite(qty) && qty > 0 && !isCancelled){
        usable.push({ sku, name: name || sku, qty, date, price: Number.isFinite(price) ? price : 0 });
      }
    }

    const truncated = lines.length > MAX_VALIDATE;

    importPreview = {
      name: file.name,
      usable,
      summary: {
        total: lines.length - 1,
        processed: filtered.length - 1,
        valid: usable.length,
        cancelled, negative, missing, invalid,
        truncated
      }
    };

    importStep = 2;
    renderImport();

    if(truncated){
      toast('Showing first ' + MAX_VALIDATE + ' rows only (file has ' + (lines.length - 1) + ' total).', 'error');
    }
  };

  reader.readAsText(file);
}

/* ============================================================
   INVENTORY
   ============================================================ */
function renderInventory(){
  const el=document.getElementById('inventoryTable');
  if(!el)return;
  let list=products;
  if(invFilter==='Restock Recommended'||invFilter==='Stock Sufficient'||invFilter==='No Forecast')list=list.filter(p=>getStatus(p)===invFilter);
  if(invFilter==='Low Stock')list=list.filter(p=>p.stock<=p.min);

  const { pageRows, current, totalPages, total, start, end } = paginate(list, 'inventory');

  const rows = pageRows.map(p=>[
    `<span class="mono">${p.sku}</span>`,p.name,p.stock,p.min,p.forecast??'—',
    p.forecast==null?'—':required(p),
    p.forecast==null?'—':`<b style="color:var(--danger)">${reorder(p)}</b>`,
    badge(getStatus(p)),
    `<div class="actions"><button class="btn sm" onclick="assessForecast(${p.id})">Assess</button><button class="btn sm" onclick="openMovementModal(${p.id})">Movement</button></div>`
  ]);

  el.innerHTML = table(
    ['SKU','Product','Current Stock','Minimum Stock','Latest Forecast','Required Stock','Reorder Qty','Status','Actions'],
    rows
  ) + paginationBar('inventory', current, totalPages, start, end, total);
}
function assessForecast(id){
  selectedProduct = products.find(p => p.id === id);
  go('forecast-history');
  switchCombinedTab2('forecast');
  fillForecastSelect();
  document.getElementById('inventoryStatusPanel').style.display = 'block';
  renderStatus();
}
function setInvFilter(v,btn){
  invFilter=v;
  pageState.inventory=1;
  btn.parentElement.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  renderInventory();
}

/* ============================================================
   MOVEMENTS
   ============================================================ */
function renderMovements(){
  const el=document.getElementById('movementTable');
  if(!el)return;

  const { pageRows, current, totalPages, total, start, end } = paginate(movements, 'movements');

  const rows = pageRows.map(m=>[
    `<span class="mono">${m.id}</span>`,m.date,`<span class="mono">${m.sku}</span>`,m.name,
    m.type,m.qty,m.prev,m.next,m.notes,m.user
  ]);

  el.innerHTML = table(
    ['Movement ID','Date / Time','SKU','Product','Type','Quantity','Previous Stock','New Stock','Notes','User'],
    rows
  ) + paginationBar('movements', current, totalPages, start, end, total);
}

function openMovementModal(id=null){
  if(!products.length){toast('Add a product before recording stock movement.','error');return}
  const current=id?products.find(p=>p.id===id):products[0];

  const productOptions = products.map(p => ({
    value: p.id,
    label: `${p.sku} — ${p.name}`
  }));

  openModal(`<div class="modal-head"><h3>Record Stock Movement</h3><button class="icon-btn" onclick="closeModal()">×</button></div>

    <div class="field">
      <label>Product</label>
      ${searchableSelect({
        id: 'mvProduct',
        options: productOptions,
        selected: current.id,
        placeholder: 'Search SKU or product name…',
        onChange: 'updateMvPreview'
      })}
    </div>

    <div class="grid cols-2">
      <div class="field">
        <label>Movement Type</label>
        <select id="mvType" onchange="updateMvPreview()">
          <option>Stock In</option>
          <option>Sale / Stock Out</option>
          <option>Adjustment</option>
          <option>Return</option>
        </select>
      </div>
      <div class="field">
        <label>Quantity</label>
        <input id="mvQty" class="input" type="number" min="1" value="" oninput="updateMvPreview()">
      </div>
    </div>

    <div id="mvPreview" class="notice"></div>
    <div class="field" style="margin-top:16px"><label>Notes</label><textarea id="mvNotes" rows="3" placeholder="Reason or notes"></textarea></div>

    <div class="actions" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveMovement()">Confirm Movement</button>
    </div>`);

  updateMvPreview();
}

function updateMvPreview(){
  const productId = +getSearchableValue('mvProduct');
  const p = products.find(x => x.id === productId);
  if(!p) return;
  const q = +document.getElementById('mvQty').value || 0;
  const t = document.getElementById('mvType').value;
  let delta = (t === 'Stock In' || t === 'Return') ? q : (t === 'Sale / Stock Out' ? -q : q);
  if(t === 'Adjustment') delta = q;
  document.getElementById('mvPreview').innerHTML =
    `Previous Stock: <b>${p.stock}</b> &nbsp; → &nbsp; Resulting Stock: <b>${Math.max(0, p.stock + delta)}</b>`;
}

async function saveMovement(){
  const productId = +getSearchableValue('mvProduct');
  const p = products.find(x => x.id === productId);
  const q = +document.getElementById('mvQty').value;
  const t = document.getElementById('mvType').value;
  const notes = document.getElementById('mvNotes').value || 'Manual update';

  if (!p || !q || q <= 0) { toast('Enter a valid quantity.', 'error'); return }

  try {
    await API.createMovement({ sku: p.sku, type: t, quantity: q, notes, user: 'Retail Manager' });
    await refreshAll();
    closeModal();
    renderInventory(); renderMovements(); renderDashboard();
    toast('Stock movement recorded successfully.');
  } catch (err) {
    toast('Failed to record movement.', 'error');
    console.error(err);
  }
}

/* ============================================================
   FORECAST
   ============================================================ */
function fillForecastSelect(){
  const container = document.getElementById('forecastProductContainer');
  if(!container) return;

  if(!products.length){
    container.innerHTML = '<div class="notice warning">Add a product and historical sales records before forecasting.</div>';
    selectedProduct = null;
    document.getElementById('forecastProductInfo').innerHTML = '';
    document.getElementById('forecastBtn').disabled = true;
    document.getElementById('forecastResult').innerHTML = '';
    return;
  }

  // Build product options
  const productOptions = products.map(p => ({
    value: p.id,
    label: `${p.sku} — ${p.name}`
  }));

  // Preserve current selection if still valid
  let currentId = selectedProduct?.id;
  if(!currentId || !products.some(p => p.id === currentId)){
    currentId = products[0].id;
  }

  // Render searchable dropdown
  container.innerHTML = searchableSelect({
    id: 'forecastProduct',
    options: productOptions,
    selected: currentId,
    placeholder: 'Search SKU or product name…',
    onChange: 'onForecastProductChange'
  });

  // Sync selectedProduct to the current value
  selectedProduct = products.find(p => p.id === currentId) || products[0];

  renderForecastProduct();
}

function onForecastProductChange(){
  const productId = +getSearchableValue('forecastProduct');
  selectedProduct = products.find(p => p.id === productId) || null;
  renderForecastProduct();
}
function renderForecastProduct(){
  if(!selectedProduct){
    document.getElementById('forecastProductInfo').innerHTML = '<div class="muted">No product selected.</div>';
    document.getElementById('forecastBtn').disabled = true;
    return;
  }
  const p = selectedProduct;
  const ps = sales.filter(s => s.sku === p.sku).sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const range = ps.length ? `${ps[0].date} to ${ps[ps.length-1].date}` : 'No historical sales';

  document.getElementById('forecastProductInfo').innerHTML = `
    <p><b>SKU:</b> <span class="mono">${p.sku}</span></p>
    <p><b>Historical Observations:</b> ${ps.length}</p>
    <p><b>Historical Date Range:</b> ${range}</p>
    <p><b>Current Stock:</b> ${p.stock}</p>
    <p><b>Minimum Stock:</b> ${p.min}</p>
    <p><b>Forecast Eligibility:</b> ${p.eligible
      ? '<span class="badge success">✓ Eligible for Forecasting</span>'
      : '<span class="badge warning">Insufficient Historical Data</span>'}</p>`;

  document.getElementById('forecastBtn').disabled = !p.eligible;
  document.getElementById('forecastResult').innerHTML = '';
}
async function generateForecast(){
  const p = selectedProduct;
  if (!p) { toast('Select a product first.', 'error'); return }

  document.getElementById('forecastResult').innerHTML =
    `<div class="card"><div class="skeleton" style="height:26px;width:45%;margin-bottom:12px"></div><div class="skeleton" style="height:100px"></div><p class="muted" style="margin-top:12px">Generating demand forecast…</p></div>`;

  try {
    const result = await API.generateForecast(p.id);
    p.forecast = Math.round(result.predicted);
    await loadForecasts();

    document.getElementById('forecastResult').innerHTML = `<div class="card">
      <div class="grid cols-2">
        <div>
          <div class="kpi-label">Predicted 7-Day Demand</div>
          <div style="font-size:52px;font-weight:900;letter-spacing:-.04em;margin:6px 0;background:linear-gradient(135deg,var(--primary) 0%,var(--accent-violet) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">${Math.round(result.predicted)} <span style="font-size:22px;font-weight:700;-webkit-text-fill-color:var(--muted)">units</span></div>
          <p class="muted">Expected demand during the next seven days.</p>
        </div>
        <div>
          <p><b>Forecast ID:</b> <span class="mono">${result.forecast_id}</span></p>
          <p><b>Forecast Date:</b> ${result.date}</p>
          <p><b>Forecast Horizon:</b> 7 Days</p>
          <p><b>Model:</b> ${result.model}</p>
        </div>
      </div>
      <div class="actions" style="margin-top:18px"><button class="btn primary" onclick="assessForecast(${p.id})">Evaluate Inventory</button><button class="btn" onclick="switchCombinedTab2('reorder')">View Reorder History</button></div>
    </div>`;

    renderDashboard();
    toast('Forecast generated successfully.');
  } catch (err) {
    document.getElementById('forecastResult').innerHTML =
      `<div class="card"><p class="muted">Forecast failed. Check the backend logs.</p></div>`;
    toast('Forecast failed.', 'error');
    console.error(err);
  }
}

/* ============================================================
   INVENTORY STATUS / RECOMMENDATION
   ============================================================ */
function renderStatus(){
  const p=selectedProduct||products[0];
  const container=document.getElementById('statusContent');
  if(!container)return;
  if(!p){container.innerHTML=`<div class="card"><h3>No Product Available</h3><p class="muted">Add a product first, then generate a forecast before evaluating inventory.</p></div>`;return}
  if(p.forecast==null){container.innerHTML=`<div class="card"><h3>No Forecast Available</h3><p class="muted">Generate a seven-day demand forecast before evaluating inventory.</p><button class="btn primary" onclick="switchCombinedTab2('forecast')">Generate Forecast</button></div>`;return}
  const r=required(p),q=reorder(p),s=getStatus(p),danger=s==='Restock Recommended';
  const fc=Math.round(p.forecast);
  container.innerHTML=`
  <div class="grid cols-3">
    <div class="card"><div class="kpi-label">Current Stock</div><div style="font-size:32px;font-weight:800;margin-top:8px;letter-spacing:-.035em">${p.stock} <span style="font-size:15px;font-weight:600;color:var(--muted)">units</span></div><div class="small muted">Digitally Recorded Inventory</div></div>
    <div class="card"><div class="kpi-label">Minimum Stock</div><div style="font-size:32px;font-weight:800;margin-top:8px;letter-spacing:-.035em">${p.min} <span style="font-size:15px;font-weight:600;color:var(--muted)">units</span></div><div class="small muted">User-Defined Inventory Buffer</div></div>
    <div class="card"><div class="kpi-label">Forecasted Demand</div><div style="font-size:32px;font-weight:800;margin-top:8px;letter-spacing:-.035em">${fc} <span style="font-size:15px;font-weight:600;color:var(--muted)">units</span></div><div class="small muted">Next 7 Days</div></div>
  </div>
  <div class="card" style="margin-top:18px"><h3>Inventory Requirement Calculation</h3>
    <div class="calc"><div class="calc-box">Forecasted Demand<strong>${fc}</strong></div><div class="op">+</div><div class="calc-box">Minimum Stock<strong>${p.min}</strong></div><div class="op">=</div><div class="calc-box">Required Stock<strong>${r}</strong></div></div>
    <div class="calc"><div class="calc-box">Required Stock<strong>${r}</strong></div><div class="op">−</div><div class="calc-box">Current Stock<strong>${p.stock}</strong></div><div class="op">=</div><div class="calc-box">Recommended Reorder<strong>${q}</strong></div></div>
  </div>
  <div class="result ${danger?'danger':'success'}" style="margin-top:18px">
    <h2>${s.toUpperCase()}</h2>
    <b style="font-size:15px">Recommended Reorder Quantity: ${q} units</b>
    <p style="margin:10px 0 0">${danger?'The currently recorded inventory is insufficient to satisfy the forecasted seven-day demand while maintaining the specified minimum stock level.':'The currently recorded inventory is sufficient to satisfy the forecasted seven-day demand while maintaining the specified minimum stock level.'}</p>
    <button class="btn ${danger?'danger':''}" style="margin-top:14px" onclick="saveRecommendation()">Save Recommendation</button>
  </div>
  <div class="card accordion" id="calcAcc" style="margin-top:18px">
    <button class="btn ghost" onclick="document.getElementById('calcAcc').classList.toggle('open')" style="font-weight:700;padding:0">▸ How was this recommendation calculated?</button>
    <div class="body">
      <p>Forecasted Demand = ${fc}</p><p>Minimum Stock = ${p.min}</p><p>Required Stock = ${r}</p><p>Current Stock = ${p.stock}</p><p>${r} - ${p.stock} = ${r-p.stock}</p><p><b>Recommended Reorder = ${q} units</b></p>
      <div class="notice">Formula: max(0, Forecasted Demand + Minimum Stock - Current Stock)</div>
    </div>
  </div>
  <div class="notice" style="margin-top:18px"><div><b>Decision Support Notice:</b> This recommendation is advisory. The final replenishment decision remains with the authorized store owner or inventory manager.</div></div>`;
}
async function saveRecommendation(){
  const p = selectedProduct;
  if (!p || p.forecast == null) return;

  const payload = {
    sku: p.sku,
    current_stock: p.stock,
    minimum_stock: p.min,
    forecasted_demand: p.forecast
  };

  try {
    await API.saveRecommendation(payload);
    await loadRecommendations();
    toast('Recommendation saved.');
    renderReorderHistory();
    switchCombinedTab2('reorder');
  } catch (err) {
    toast('Failed to save recommendation.', 'error');
    console.error(err);
  }
}
function renderReorderHistory(){
  const el=document.getElementById('reorderHistoryTable');
  if(!el)return;

  const { pageRows, current, totalPages, total, start, end } = paginate(recommendations, 'reorders');

  const rows = pageRows.map(r=>[
    `<span class="mono">${r.id}</span>`,r.date,`<span class="mono">${r.sku}</span>`,r.name,
    r.stock,r.min,Math.round(r.forecast),r.required,
    `<b style="color:var(--danger)">${r.reorder}</b>`,badge(r.status)
  ]);

  el.innerHTML = table(
    ['Recommendation ID','Date','SKU','Product','Current Stock at Assessment','Minimum Stock','Forecasted Demand','Required Stock','Recommended Reorder','Status'],
    rows
  ) + paginationBar('reorders', current, totalPages, start, end, total);
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(html){document.getElementById('modal').innerHTML=html;document.getElementById('modalBackdrop').classList.add('show')}
function closeModal(){document.getElementById('modalBackdrop').classList.remove('show')}

/* ============================================================
   COMMAND PALETTE
   ============================================================ */
function openCmd(){
  document.getElementById('cmdBackdrop').classList.add('show');
  const inp=document.getElementById('cmdInput');
  inp.value='';inp.focus();
  cmdSelected=0;filterCmd();
}
function closeCmd(){document.getElementById('cmdBackdrop').classList.remove('show')}
function filterCmd(){
  const q=(document.getElementById('cmdInput').value||'').toLowerCase();
  const filtered=cmdCommands.filter(c=>c.label.toLowerCase().includes(q));
  cmdSelected=0;
  const list=document.getElementById('cmdList');
  if(!filtered.length){list.innerHTML='<div class="muted sm" style="padding:20px;text-align:center">No results</div>';return}
  list.innerHTML=filtered.map((c,i)=>`<div class="cmd-item ${i===0?'selected':''}" data-idx="${i}" onclick="runCmd('${c.label.replace(/'/g,"\\'")}')">${c.label}${c.keys?`<span class="kbd">${c.keys}</span>`:''}</div>`).join('');
}
function cmdKey(e){
  const items=document.querySelectorAll('.cmd-item');
  if(!items.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();cmdSelected=Math.min(cmdSelected+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('selected',i===cmdSelected));items[cmdSelected].scrollIntoView({block:'nearest'});}
  else if(e.key==='ArrowUp'){e.preventDefault();cmdSelected=Math.max(cmdSelected-1,0);items.forEach((el,i)=>el.classList.toggle('selected',i===cmdSelected));items[cmdSelected].scrollIntoView({block:'nearest'});}
  else if(e.key==='Enter'){e.preventDefault();if(items[cmdSelected])items[cmdSelected].click();}
  else if(e.key==='Escape'){closeCmd();}
}
function runCmd(label){
  const c=cmdCommands.find(x=>x.label===label);
  if(!c)return;
  closeCmd();
  if(c.action)c.action();
  else if(c.page){go(c.page);if(c.sub)switchCombinedTab2(c.sub);}
}

document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCmd();}
  if(e.key==='Escape')closeCmd();
});

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const saved=localStorage.getItem('theme');
  if(saved)document.documentElement.setAttribute('data-theme',saved);

  buildNav();
  renderImport();
  updateEligibility();

  // ---- SIGN IN ----
  const loginForm=document.getElementById('loginForm');
  if(loginForm){
    loginForm.addEventListener('submit', async e=>{
      e.preventDefault();
      const email=document.getElementById('loginEmail').value.trim();
      const password=document.getElementById('loginPwd').value;
      if(!email||!password){ toast('Enter email and password.','error'); return }

      const btn=document.getElementById('loginSubmitBtn');
      const original=btn.textContent;
      btn.disabled=true; btn.textContent='Signing in…';

      let user;
      try {
        user = await API.login({ email, password });
      } catch (err) {
        toast('Invalid email or password.','error');
        console.error('Login error:', err);
        btn.disabled=false; btn.textContent=original;
        return;
      }

      localStorage.setItem('retailml_user', JSON.stringify(user));

      const initials=user.full_name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
      document.getElementById('userAvatar').textContent=initials;
      document.getElementById('userName').textContent=user.full_name;
      const sn=document.getElementById('settingsName'); if(sn)sn.value=user.full_name;
      const se=document.getElementById('settingsEmail'); if(se)se.value=user.email;

      document.getElementById('login').classList.add('hidden');
      document.getElementById('app').classList.add('show');
      toast(`Welcome back, ${user.full_name}.`);

      btn.disabled=false; btn.textContent=original;

      try {
        await refreshAll();
        renderDashboard();
        renderProducts();
        renderInventory();
        renderSales();
        renderMovements();
        fillForecastSelect();
        renderReorderHistory();
      } catch (err) {
        console.warn('Some data failed to load:', err);
      }
    });
  }

  // ---- SIGN UP ----
  const registerForm=document.getElementById('registerForm');
  if(registerForm){
    registerForm.addEventListener('submit', async e=>{
      e.preventDefault();
      const full_name=document.getElementById('regName').value.trim();
      const email=document.getElementById('regEmail').value.trim();
      const password=document.getElementById('regPwd').value;
      const confirm=document.getElementById('regPwd2').value;
      const terms=document.getElementById('regTerms').checked;

      if(!full_name||!email||!password){ toast('All fields are required.','error'); return }
      if(password.length<6){ toast('Password must be at least 6 characters.','error'); return }
      if(password!==confirm){ toast('Passwords do not match.','error'); return }
      if(!terms){ toast('Please accept the terms to continue.','error'); return }

      const btn=document.getElementById('regSubmitBtn');
      const original=btn.textContent;
      btn.disabled=true; btn.textContent='Creating account…';

      try {
        await API.register({ full_name, email, password });
        toast('Account created. You can now sign in.');

        registerForm.reset();
        switchAuthTab('signin');
        document.getElementById('loginEmail').value=email;
        document.getElementById('loginPwd').value='';
        document.getElementById('loginPwd').focus();
      } catch (err) {
        const raw=err.message||'';
        const msg=raw.includes('already exists')?'That email is already registered.':
                  raw.includes('6 characters')?'Password must be at least 6 characters.':
                  'Registration failed.';
        toast(msg,'error');
        console.error('Register error:', err);
      } finally {
        btn.disabled=false; btn.textContent=original;
      }
    });
  }

  // ---- AUTO-LOGIN ----
  const cachedUser=localStorage.getItem('retailml_user');
  if(cachedUser){
    try {
      const user=JSON.parse(cachedUser);
      const initials=user.full_name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
      document.getElementById('userAvatar').textContent=initials;
      document.getElementById('userName').textContent=user.full_name;
      const sn=document.getElementById('settingsName'); if(sn)sn.value=user.full_name;
      const se=document.getElementById('settingsEmail'); if(se)se.value=user.email;

      document.getElementById('login').classList.add('hidden');
      document.getElementById('app').classList.add('show');

      try {
        await refreshAll();
        renderDashboard();
        renderProducts();
        renderInventory();
        renderSales();
        renderMovements();
        fillForecastSelect();
        renderReorderHistory();
      } catch (err) {
        console.warn('Some data failed to load:', err);
      }
    } catch (err) {
      console.error('Auto-login failed:', err);
      localStorage.removeItem('retailml_user');
    }
  }
});