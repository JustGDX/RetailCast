# backend/services/product_service.py
from datetime import datetime
from database import query, query_one, execute


def _with_derived(p: dict) -> dict:
    inv = query_one(
        "SELECT current_stock, minimum_stock FROM inventory WHERE product_id = ?",
        (p["product_id"],)
    )
    p["stock"] = inv["current_stock"] if inv else 0
    p["min"]   = inv["minimum_stock"] if inv else 0

    latest_f = query_one(
        "SELECT predicted_qty FROM forecasts WHERE product_id = ? ORDER BY forecast_id DESC LIMIT 1",
        (p["product_id"],)
    )
    p["forecast"] = latest_f["predicted_qty"] if latest_f else None
    p["id"]       = p["product_id"]
    p["active"]   = bool(p.get("is_active", 1))
    p["eligible"] = bool(p.get("eligible", 0))
    return p


def list_products():
    rows = query("SELECT * FROM products ORDER BY product_id DESC")
    return [_with_derived(r) for r in rows]


def get_product(product_id: int):
    p = query_one("SELECT * FROM products WHERE product_id = ?", (product_id,))
    return _with_derived(p) if p else None


def create_product(payload: dict):
    pid = execute(
        "INSERT INTO products (sku, name, category, minimum_stock, eligible) VALUES (?, ?, ?, ?, 0)",
        (payload["sku"], payload["name"], payload.get("category", ""), payload.get("min", 0))
    )
    execute(
        "INSERT INTO inventory (product_id, current_stock, minimum_stock) VALUES (?, ?, ?)",
        (pid, payload.get("stock", 0), payload.get("min", 0))
    )
    _recompute_eligibility(pid)
    return get_product(pid)


def update_product(product_id: int, payload: dict):
    execute(
        "UPDATE products SET sku=?, name=?, category=?, minimum_stock=? WHERE product_id=?",
        (payload["sku"], payload["name"], payload.get("category", ""),
         payload.get("min", 0), product_id)
    )
    execute(
        "UPDATE inventory SET current_stock=?, minimum_stock=?, last_updated=CURRENT_TIMESTAMP WHERE product_id=?",
        (payload.get("stock", 0), payload.get("min", 0), product_id)
    )
    _recompute_eligibility(product_id)
    return get_product(product_id)


def _recompute_eligibility(product_id: int):
    """
    Recompute SKU eligibility: >=180 day span AND >=30 nonzero days.

    Handles date strings with or without time components:
      - '2011-12-09'
      - '2011-12-09 18:06'
      - '12/09/2011'
      - '09/12/2011'
    """
    rows = query("""
        SELECT sale_date, quantity
        FROM sales
        WHERE product_id = ?
    """, (product_id,))

    if not rows:
        execute("UPDATE products SET eligible=0 WHERE product_id=?", (product_id,))
        return

    def parse_day(s):
        if s is None:
            return None
        s = str(s).strip()
        if not s:
            return None
        parts = s.split()
        if parts:
            s = parts[0]
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(s).date()
        except Exception:
            return None

    day_totals = {}
    for r in rows:
        d = parse_day(r["sale_date"])
        if d is None:
            continue
        day_totals[d] = day_totals.get(d, 0) + (r["quantity"] or 0)

    if len(day_totals) < 2:
        execute("UPDATE products SET eligible=0 WHERE product_id=?", (product_id,))
        return

    days_sorted = sorted(day_totals.keys())
    first_date = days_sorted[0]
    last_date  = days_sorted[-1]

    span_days = (last_date - first_date).days + 1
    nonzero   = sum(1 for q in day_totals.values() if q > 0)

    eligible = 1 if (span_days >= 180 and nonzero >= 30) else 0
    execute("UPDATE products SET eligible=? WHERE product_id=?", (eligible, product_id))


def recompute_all_eligibility():
    """
    Recompute eligibility for every product in the database.
    Called from the browser via POST /api/products/recompute-eligibility.
    """
    products = query("SELECT product_id, sku FROM products ORDER BY product_id")

    total = len(products)
    failed = 0

    execute("UPDATE products SET eligible = 0")

    for p in products:
        try:
            _recompute_eligibility(p["product_id"])
        except Exception as e:
            print(f"Recompute failed for {p['sku']}: {e}", flush=True)
            failed += 1

    row = query_one("SELECT COUNT(*) AS n FROM products WHERE eligible = 1")
    eligible_count = row["n"] if row else 0

    return {
        "total":      total,
        "eligible":   eligible_count,
        "ineligible": total - eligible_count,
        "failed":     failed,
    }