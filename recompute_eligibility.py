# recompute_eligibility.py
"""
One-time script: recompute eligibility for all products using the
corrected logic. Run once after replacing product_service.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))

from database import query, execute
from services.product_service import _recompute_eligibility

# Reset all eligibility flags first
execute("UPDATE products SET eligible = 0")

products = query("SELECT product_id, sku, name FROM products ORDER BY product_id")
print(f"Recomputing eligibility for {len(products)} products...\n")

errors = 0
for p in products:
    try:
        _recompute_eligibility(p["product_id"])
    except Exception as e:
        print(f"  ✗ {p['sku']}: {e}")
        errors += 1

# Summary
total = len(products)
eligible_n = query("SELECT COUNT(*) AS n FROM products WHERE eligible=1")[0]["n"]
print(f"\nEligible: {eligible_n} / {total}")
if errors:
    print(f"Errors: {errors}")

# Show eligible products
print("\nEligible products (top 10):")
top = query("""
    SELECT p.sku, p.name,
           COUNT(DISTINCT date(s.sale_date)) AS distinct_days
    FROM products p
    LEFT JOIN sales s ON s.product_id = p.product_id
    WHERE p.eligible = 1
    GROUP BY p.product_id
    ORDER BY distinct_days DESC
    LIMIT 10
""")
for r in top:
    print(f"  {r['sku']:<12} {r['distinct_days']:>5} days   {r['name'][:50]}")

# Show ineligible products with data
print("\nIneligible products with sales data (sample):")
bad = query("""
    SELECT p.sku, p.name,
           COUNT(DISTINCT date(s.sale_date)) AS distinct_days
    FROM products p
    LEFT JOIN sales s ON s.product_id = p.product_id
    WHERE p.eligible = 0
    GROUP BY p.product_id
    HAVING distinct_days > 0
    ORDER BY distinct_days DESC
    LIMIT 10
""")
for r in bad:
    print(f"  {r['sku']:<12} {r['distinct_days']:>5} days   {r['name'][:50]}")