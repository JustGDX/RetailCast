# RetailCast

**Machine Learning-Based Retail Demand Forecasting and Rule-Based Inventory Reorder Decision Support System**

A full-stack web application that combines a 7-day SKU demand forecast (XGBoost) with a transparent, rule-based inventory reorder engine. The forecast and the inventory decision are kept strictly separate: the model predicts demand, the user maintains stock, and a simple rule produces the restocking recommendation.

---

## 📋 Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Setup](#6-setup)
7. [Using the System](#7-using-the-system)
8. [API Endpoints](#8-api-endpoints)
9. [Forecasting Methodology](#9-forecasting-methodology)
10. [Reorder Rule](#10-reorder-rule)
11. [CSV Import & Repair](#11-csv-import--repair)
12. [Limitations](#12-limitations)
13. [Notes](#13-notes)
14. [Author](#14-author)

---

## 1. Overview

Retail inventory planning requires enough stock to meet demand without creating unnecessary holding cost. Forecast errors contribute to both stockouts and excess inventory. The problem is harder at SKU level because products differ in sales frequency, seasonality, and intermittency.

RetailCast addresses this by:

1. **Forecasting 7-day SKU demand** with an XGBoost Regressor trained per SKU on lag features, rolling statistics, and calendar variables.
2. **Evaluating inventory sufficiency** using a deterministic rule:

   ```
   RequiredStock(i, t) = D(i, t, 7) + M(i, t)
   ReorderQty(i, t)    = max(0, RequiredStock(i, t) - C(i, t))
   ```

   where `D` is the 7-day forecast, `M` is user-defined minimum stock, and `C` is current stock.

3. **Recording every decision** with the forecast ID and stock snapshot at decision time, so any past recommendation can be reconstructed.

The system is a **decision-support tool** — the final replenishment decision remains with the store owner or inventory manager.

---

## 2. System Architecture

The application has five logical layers:

| Layer | Purpose |
|-------|---------|
| **Web Interface** | Products, inventory, sales, forecasts, dashboard |
| **Application Services** | Validates requests, manages database operations |
| **Forecasting Service** | Prepares features and returns a 7-day demand estimate |
| **SQLite Storage** | Operational data (products, sales, inventory, forecasts, etc.) |
| **Rule Engine** | Combines the forecast with live inventory to produce a reorder recommendation |

---

## 3. Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | HTML, CSS, JavaScript (no frameworks) |
| **Backend** | Python 3.12+ with Flask |
| **Machine Learning** | XGBoost Regressor (native API) |
| **Feature Engineering** | pandas, NumPy |
| **Database** | SQLite (managed via DB Browser for SQLite) |

---

## 4. Project Structure

```
RetailML/
│
├── backend/
│   ├── __pycache__/                    # Python bytecode (auto-generated)
│   ├── forecasting/                    # Model pipeline
│   │   ├── feature_engineering.py      # Lags, rolling means/std, calendar fields, eligibility
│   │   ├── xgboost_model.py            # XGBoost training + 7-day prediction
│   │   ├── baselines.py                # Seasonal-naive + linear regression (offline)
│   │   └── evaluate.py                 # MAE, RMSE, MASE (offline)
│   │
│   ├── routes/                         # HTTP boundary (Flask blueprints)
│   │   ├── auth.py                     # /api/auth/*
│   │   ├── products.py                 # /api/products
│   │   ├── sales.py                    # /api/sales
│   │   ├── inventory.py                # /api/inventory
│   │   ├── forecasts.py                # /api/forecast
│   │   ├── recommendations.py          # /api/reorder
│   │   └── uci.py                      # /api/uci/*
│   │
│   ├── services/                       # Business logic
│   │   ├── auth_service.py             # Register + login (hashed passwords)
│   │   ├── product_service.py          # Product CRUD + eligibility recompute
│   │   ├── sales_service.py            # Sales CRUD + CSV bulk import
│   │   ├── inventory_service.py        # Inventory snapshot + stock movements + rule engine
│   │   ├── forecast_service.py         # Orchestrates the forecast pipeline
│   │   ├── reorder_service.py          # Reorder recommendation persistence
│   │   └── uci_service.py              # UCI extraction + repair service
│   │
│   ├── utils/                          # Offline helpers
│   │   └── data_cleaning.py            # UCI cleaning rules
│   │
│   ├── app.py                          # Flask entry point
│   ├── database.py                     # SQLite connection helpers
│   └── requirements.txt                # Python dependencies
│
├── database/
│   ├── retailcast.db                   # SQLite database (open in DB Browser)
│   └── schema.sql                      # Table definitions (8 tables)
│
├── dataset/
│   └── online_retail.csv               # UCI Online Retail dataset (offline development)
│
├── frontend/
│   ├── css/
│   │   └── styles.css                  # Shared styles
│   ├── js/
│   │   ├── api.js                      # fetch() wrappers for backend endpoints
│   │   └── app.js                      # UI logic, event handlers, renderers
│   └── index.html                      # Login + Register + App Shell
│
├── README.md                           # This file
└── recompute_eligibility.py            # One-time utility script
```

---

## 5. Database Schema

Eight tables:

| # | Table | Purpose |
|---|-------|---------|
| 1 | `users` | Authentication and profile records |
| 2 | `products` | SKU master data + forecasting eligibility flag |
| 3 | `sales` | Historical demand |
| 4 | `inventory` | Current stock snapshot + manager-defined minimum |
| 5 | `stock_movements` | Audit trail of stock-in, sale-out, return, adjustment |
| 6 | `forecasts` | 7-day demand predictions |
| 7 | `reorder_recommendations` | Rule-based decisions with historical snapshots |
| 8 | `model_metrics` | MAE / RMSE / MASE storage |

Full DDL is in `database/schema.sql`.

---

## 6. Setup

### Requirements

- Python 3.12 or newer
- DB Browser for SQLite (for inspecting/editing the database)
- A modern web browser

### Step 1 — Install Python dependencies

```bash
pip install -r backend/requirements.txt
```

Required packages:

```
Flask==3.1.3
flask-cors==4.0.1
pandas==2.3.3
numpy==2.3.2
scikit-learn==1.7.2
xgboost==3.3.0
joblib==1.4.2
```

### Step 2 — Create the database

1. Open **DB Browser for SQLite**
2. **New Database** → save as `database/retailcast.db`
3. Go to the **Execute SQL** tab
4. Paste the contents of `database/schema.sql`
5. Click **Run** (or F5)
6. Click **Write Changes** (💾) to persist

You should now see 8 tables in the **Database Structure** tab.

### Step 3 — Start the server

From the project root:

```bash
python backend/app.py
```

Expected output:

```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

Flask serves **both** the frontend and the API on the same origin.

### Step 4 — Open the app

In your browser:

```
http://127.0.0.1:5000/
```

---

## 7. Using the System

### First-time setup

1. **Sign Up** — create an account (password must be at least 6 characters)
2. **Sign In** with the same credentials

### Typical workflow

1. **Add products** — Products & Inventory → **+ Add Product**
   - Fill in SKU, name, category (with custom option), current stock, minimum stock
2. **Record sales** — Sales Records → **+ Add Sale**, or import via Data Import
3. **Record stock movements** — Stock Movements → **+ Record Movement**
   - Types: Stock In, Sale / Stock Out, Adjustment, Return
4. **Generate a forecast** — Forecast & Reorder → select product → **Generate 7-Day Forecast**
5. **Evaluate inventory** — after forecast, click **Evaluate Inventory**
6. **Save the recommendation** — the decision is recorded in **Reorder History**

### SKU eligibility rule

A SKU is eligible for supervised forecasting only if its history spans **at least 180 calendar days** and contains **at least 30 nonzero-demand days**. Ineligible SKUs are flagged with a yellow badge instead of receiving an unreliable forecast.

### Searchable dropdowns

All product selectors (Forecast, Sales, Stock Movements) have a built-in **search bar** — type any part of the SKU or product name to filter quickly.

### Pagination

All tables (Products, Inventory, Sales, Movements, Forecasts, Reorder History, Dashboard attention) are paginated at **10 rows per page** with Prev/Next buttons.

### Recompute Eligibility

If eligibility flags look wrong, go to **Products & Inventory** → click **Recompute Eligibility**. The system recomputes eligibility for all products based on the current sales data.

---

## 8. API Endpoints

### Authentication

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |

### Products

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/products` | List products |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| POST | `/api/products/recompute-eligibility` | Recompute all eligibility flags |

### Sales

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sales` | List sales (limited) |
| POST | `/api/sales` | Add sale |
| DELETE | `/api/sales/:id` | Delete sale |
| POST | `/api/sales/import` | Bulk import sales from CSV |

### Inventory

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/inventory` | Inventory snapshot |
| POST | `/api/inventory/movement` | Record stock movement |
| GET | `/api/inventory/movements` | Movement history |

### Forecasting

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/forecast/:product_id` | Generate 7-day forecast |
| GET | `/api/forecast/history` | Forecast history |

### Reorder

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/reorder` | Save reorder recommendation |
| GET | `/api/reorder/history` | Recommendation history |

### UCI Dataset (for import repair)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/uci/candidates` | List compatible reference SKUs |
| GET | `/api/uci/status` | Check setup status |
| POST | `/api/uci/setup` | One-time import of reference data |
| POST | `/api/uci/repair` | Merge uploaded file with reference history |
| POST | `/api/uci/build-csv` | Generate a downloadable CSV for a single SKU |

---

## 9. Forecasting Methodology

### Feature engineering

For each SKU, daily demand series is zero-filled to a continuous calendar. The following features are computed (all shifted so only information available before the forecast origin is used):

- **Demand lags:** 1, 7, 14, 28 days
- **Rolling means:** 7, 14, 28 days
- **Rolling standard deviations:** 7, 28 days
- **Count of nonzero-demand days** in previous 28 days
- **Calendar:** day of week, month, weekend indicator

### Model

XGBoost Regressor trained **per SKU** on its own history. Configuration:

```
n_estimators      = 300
learning_rate     = 0.05
max_depth         = 5
subsample         = 0.8
colsample_bytree  = 0.8
objective         = reg:squarederror
```

Target: total valid demand over the next 7 calendar days.

### Evaluation (offline)

Chronological split — earliest 70% for training, next 15% for validation, final 15% held for testing. Rolling-origin evaluation on validation and test periods. Metrics: **MAE, RMSE, MASE**. MAPE is not used as a primary metric because zero actual demand can make percentage error undefined or unstable.

---

## 10. Reorder Rule

The decision rule is deterministic and stored with each recommendation:

```
RequiredStock(i, t) = D(i, t, 7) + M(i, t)
ReorderQty(i, t)    = max(0, RequiredStock(i, t) - C(i, t))
```

Where:

| Symbol | Meaning |
|--------|---------|
| `D(i, t, 7)` | 7-day demand forecast for product `i` at time `t` |
| `M(i, t)` | Manager-defined minimum stock |
| `C(i, t)` | Current recorded stock |

Status:

- **`Restock Recommended`** if `ReorderQty > 0`
- **`Stock Sufficient`** if `ReorderQty = 0`

The forecast ID and stock snapshot used in the calculation are stored with each recommendation, so later stock edits cannot change the historical explanation of a past decision.

---

## 11. CSV Import & Repair

The Data Import page has two tabs:

### Upload CSV

Upload your own sales data. The system:

1. Validates each row (checks for missing SKU, date, quantity)
2. Filters cancellations (InvoiceNo starting with "C")
3. Filters nonpositive quantities
4. Removes duplicates
5. Imports valid records and creates products on the fly

### Repair Import File

If a CSV fails to import (missing history, wrong format), upload it here. The system:

1. Reads the file
2. Finds the matching SKUs in the bundled UCI Online Retail dataset
3. Merges the UCI history into the user's data (skipping duplicate dates)
4. Generates a repaired CSV that will pass import validation

**One-time setup required:** click **Setup Verified Records Database** to import the reference data used for repair (2,228 eligible UCI SKUs, ~234,000 sales rows).

---

## 12. Limitations

- **Domain mismatch.** The UCI Online Retail dataset is used only for offline model development. It does not represent a local store's live inventory. A deployed version must be retrained and validated on the target store's own sales history.
- **Short observation span** for multi-year seasonality.
- **Simple reorder rule** — does not account for lead time, pending orders, service-level targets, or cost optimization.
- **Highly intermittent SKUs** may require methods designed specifically for sparse demand.
- **Model performance** is not claimed before implementation and testing.

---

## 13. Notes

- Runs on a standard development computer.
- Passwords are hashed with `werkzeug.security` (`pbkdf2:sha256`).
- The interface is fully responsive — works on desktop, tablet, and mobile.
- The sidebar collapses to an icons-only column on desktop and becomes a slide-in drawer on mobile.
- The app is served by Flask on a single origin; no CORS configuration needed.
- All tables support pagination and all product selectors have a search bar.

---

## 👤 Author

**GDX**