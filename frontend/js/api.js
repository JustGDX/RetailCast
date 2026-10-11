// frontend/js/api.js
// Thin wrappers around the Python backend. Every UI mutation goes through here.

const API_BASE = '/api';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${detail}`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}

const API = {
  // ---- Auth ----
  login:    (payload) => apiPost('/auth/login', payload),
  register: (payload) => apiPost('/auth/register', payload),

  // ---- Products ----
  listProducts:   ()        => apiGet('/products'),
  createProduct:  (payload) => apiPost('/products', payload),
  updateProduct:  (id, p)   => apiPut(`/products/${id}`, p),

  // ---- Sales ----
  listSales:       ()       => apiGet('/sales'),
  createSale:      (payload)=> apiPost('/sales', payload),
  deleteSale:      (id)     => apiDelete(`/sales/${id}`),
  bulkImportSales: (rows)   => apiPost('/sales/import', { rows }),

  // ---- Inventory ----
  listInventory:  ()        => apiGet('/inventory'),
  createMovement: (payload) => apiPost('/inventory/movement', payload),
  listMovements:  ()        => apiGet('/inventory/movements'),

  // ---- Forecasts ----
  listForecasts:    ()          => apiGet('/forecast/history'),
  generateForecast: (productId) => apiPost(`/forecast/${productId}`),

  // ---- Reorder ----
  listRecommendations: ()        => apiGet('/reorder/history'),
  saveRecommendation:  (payload) => apiPost('/reorder', payload)
};