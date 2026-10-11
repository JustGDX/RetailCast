# backend/routes/products.py
from flask import Blueprint, jsonify, request
from services import product_service

bp = Blueprint("products", __name__, url_prefix="/api/products")


@bp.get("")
def list_all():
    return jsonify(product_service.list_products())


@bp.post("")
def create():
    data = request.get_json(force=True)
    return jsonify(product_service.create_product(data)), 201


@bp.put("/<int:product_id>")
def update(product_id):
    data = request.get_json(force=True)
    p = product_service.update_product(product_id, data)
    if not p:
        return jsonify({"error": "Not found"}), 404
    return jsonify(p)


@bp.post("/recompute-eligibility")
def recompute_eligibility():
    try:
        result = product_service.recompute_all_eligibility()
        return jsonify(result), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500