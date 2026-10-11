# backend/routes/inventory.py
from flask import Blueprint, jsonify, request
from services import inventory_service

bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")


@bp.get("")
def list_inv():
    return jsonify(inventory_service.list_inventory())


@bp.post("/movement")
def movement():
    data = request.get_json(force=True)
    try:
        return jsonify(inventory_service.create_movement(data)), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.get("/movements")
def list_movements():
    return jsonify(inventory_service.list_movements())