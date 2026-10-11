# backend/routes/sales.py
from flask import Blueprint, jsonify, request
from services import sales_service

bp = Blueprint("sales", __name__, url_prefix="/api/sales")


@bp.get("")
def list_all():
    return jsonify(sales_service.list_sales())


@bp.post("")
def create():
    data = request.get_json(force=True)
    try:
        return jsonify(sales_service.create_sale(data)), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.delete("/<int:sale_id>")
def delete(sale_id):
    return jsonify(sales_service.delete_sale(sale_id))


@bp.post("/import")
def bulk_import():
    data = request.get_json(force=True)
    rows = data.get("rows", [])

    if not rows:
        return jsonify({"error": "No rows provided.", "imported": 0}), 200

    try:
        result = sales_service.bulk_import_sales(rows)
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500