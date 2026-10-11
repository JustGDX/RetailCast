# backend/services/sales_service.py
from database import query, query_one, execute, get_connection


def list_sales(limit: int = 500):
    """Return the most recent sales, limited to avoid overloading the browser."""
    return query("""
        SELECT s.sale_id AS id, s.sale_date AS date, p.sku, p.name,
               s.quantity AS qty, s.unit_price AS price, s.source
        FROM sales s JOIN products p ON p.product_id = s.product_id
        ORDER BY s.sale_id DESC
        LIMIT ?
    """, (limit,))


def create_sale(payload: dict):
    p = query_one("SELECT product_id FROM products WHERE sku = ?", (payload["sku"],))
    if not p:
        raise ValueError(f"Unknown SKU: {payload['sku']}")

    sid = execute(
        "INSERT INTO sales (product_id, sale_date, quantity, unit_price, source) "
        "VALUES (?, ?, ?, ?, ?)",
        (p["product_id"], payload["date"], payload["qty"],
         payload.get("price", 0), payload.get("source", "Manual"))
    )
    _recompute_eligibility(p["product_id"])
    return {"id": sid}


def delete_sale(sale_id: int):
    row = query_one("SELECT product_id FROM sales WHERE sale_id=?", (sale_id,))
    execute("DELETE FROM sales WHERE sale_id=?", (sale_id,))
    if row:
        _recompute_eligibility(row["product_id"])
    return {"ok": True}


def bulk_import_sales(rows: list):
    """
    Efficiently insert many sales rows using a single connection and batched
    executemany() calls. Creates products on the fly if the SKU is new.
    Returns a summary of what happened.
    """
    if not isinstance(rows, list):
        raise ValueError("Expected a list of rows.")

    inserted = 0
    created_products = 0
    skipped = 0
    sku_cache = {}

    with get_connection() as conn:
        # Pre-load existing SKUs to avoid per-row lookups
        existing = {
            r["sku"]: r["product_id"]
            for r in conn.execute("SELECT sku, product_id FROM products").fetchall()
        }

        sales_batch = []
        BATCH_SIZE = 500

        for r in rows:
            # Validate row fields
            try:
                sku   = str(r.get("sku", "")).strip()
                date  = str(r.get("date", "")).strip()
                name  = str(r.get("name", "") or sku).strip()
                qty   = int(r.get("qty", 0) or 0)
                price = float(r.get("price", 0) or 0)
            except (ValueError, TypeError):
                skipped += 1
                continue

            if not sku or not date or qty <= 0:
                skipped += 1
                continue

            # Look up or create the product
            if sku in sku_cache:
                product_id = sku_cache[sku]
            elif sku in existing:
                product_id = existing[sku]
                sku_cache[sku] = product_id
            else:
                cur = conn.execute(
                    "INSERT INTO products (sku, name, category, minimum_stock, eligible) "
                    "VALUES (?, ?, '', 0, 0)",
                    (sku, name[:200])
                )
                product_id = cur.lastrowid
                conn.execute(
                    "INSERT INTO inventory (product_id, current_stock, minimum_stock) "
                    "VALUES (?, 0, 0)",
                    (product_id,)
                )
                sku_cache[sku] = product_id
                created_products += 1

            sales_batch.append((product_id, date, qty, price))
            inserted += 1

            # Flush the batch every 500 rows
            if len(sales_batch) >= BATCH_SIZE:
                conn.executemany(
                    "INSERT INTO sales (product_id, sale_date, quantity, unit_price, source) "
                    "VALUES (?, ?, ?, ?, 'Imported')",
                    sales_batch
                )
                sales_batch = []

        # Flush the final partial batch
        if sales_batch:
            conn.executemany(
                "INSERT INTO sales (product_id, sale_date, quantity, unit_price, source) "
                "VALUES (?, ?, ?, ?, 'Imported')",
                sales_batch
            )

        conn.commit()

    # Recompute eligibility once per affected product (outside the write txn)
    from services.product_service import _recompute_eligibility
    for pid in set(sku_cache.values()):
        try:
            _recompute_eligibility(pid)
        except Exception as e:
            print(f"Eligibility recompute failed for product {pid}: {e}", flush=True)

    return {
        "imported":         inserted,
        "created_products": created_products,
        "skipped":          skipped,
    }