# backend/services/inventory_service.py
from database import query, query_one, execute


def list_inventory():
    return query("""
        SELECT p.sku, p.name, i.current_stock, i.minimum_stock
        FROM inventory i JOIN products p ON p.product_id = i.product_id
        ORDER BY p.product_id DESC
    """)


def compute_reorder(current_stock: int, minimum_stock: int, forecast_7d: float) -> dict:
    """Paper Section V.A — the rule engine."""
    required = forecast_7d + minimum_stock
    reorder  = max(0, required - current_stock)
    status   = "Restock Recommended" if reorder > 0 else "Stock Sufficient"
    return {
        "required_stock": required,
        "reorder_qty":    reorder,
        "status":         status,
    }


def create_movement(payload: dict):
    p = query_one("SELECT product_id, name FROM products WHERE sku=?", (payload["sku"],))
    if not p:
        raise ValueError(f"Unknown SKU: {payload['sku']}")

    inv = query_one("SELECT current_stock FROM inventory WHERE product_id=?", (p["product_id"],))
    prev = inv["current_stock"] if inv else 0

    t = payload["type"]
    q = int(payload["quantity"])
    if t in ("Stock In", "Return"):
        delta = q
    elif t == "Sale / Stock Out":
        delta = -q
    else:
        delta = q

    new = max(0, prev + delta)
    execute(
        "UPDATE inventory SET current_stock=?, last_updated=CURRENT_TIMESTAMP WHERE product_id=?",
        (new, p["product_id"])
    )
    mid = execute("""
        INSERT INTO stock_movements
        (product_id, movement_type, quantity, previous_stock, new_stock, notes, user_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (p["product_id"], t, delta, prev, new,
          payload.get("notes", ""), payload.get("user", "Retail Manager")))
    return {"id": mid, "prev": prev, "next": new}


def list_movements():
    return query("""
        SELECT m.movement_id AS id, m.created_at AS date,
               p.sku, p.name, m.movement_type AS type,
               m.quantity AS qty, m.previous_stock AS prev,
               m.new_stock AS next, m.notes, m.user_name AS user
        FROM stock_movements m JOIN products p ON p.product_id = m.product_id
        ORDER BY m.movement_id DESC
    """)