# backend/services/reorder_service.py
from database import query, query_one, execute
from services.inventory_service import compute_reorder


def save_recommendation(payload: dict) -> dict:
    p = query_one("SELECT product_id, name FROM products WHERE sku=?", (payload["sku"],))
    if not p:
        raise ValueError(f"Unknown SKU: {payload['sku']}")

    # Recompute on the server — do not trust client math.
    r = compute_reorder(
        current_stock=int(payload["current_stock"]),
        minimum_stock=int(payload["minimum_stock"]),
        forecast_7d=float(payload["forecasted_demand"]),
    )

    f = query_one(
        "SELECT forecast_id FROM forecasts WHERE product_id=? ORDER BY forecast_id DESC LIMIT 1",
        (p["product_id"],)
    )

    rid = execute("""
        INSERT INTO reorder_recommendations
        (product_id, forecast_id, current_stock, minimum_stock, required_stock, reorder_qty, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        p["product_id"],
        f["forecast_id"] if f else None,
        int(payload["current_stock"]),
        int(payload["minimum_stock"]),
        int(round(r["required_stock"])),
        int(round(r["reorder_qty"])),
        r["status"]
    ))

    return {
        "id":             rid,
        "required_stock": int(round(r["required_stock"])),
        "reorder_qty":    int(round(r["reorder_qty"])),
        "status":         r["status"],
    }


def list_recommendation_history():
    return query("""
        SELECT 'RR-' || printf('%05d', rr.recommendation_id) AS id,
               rr.created_at AS date, p.sku, p.name,
               rr.current_stock AS stock, rr.minimum_stock AS min,
               cast(round(f.predicted_qty) as integer) AS forecast,
               rr.required_stock AS required, rr.reorder_qty AS reorder,
               rr.status
        FROM reorder_recommendations rr
        JOIN products p  ON p.product_id  = rr.product_id
        LEFT JOIN forecasts f ON f.forecast_id = rr.forecast_id
        ORDER BY rr.recommendation_id DESC
    """)