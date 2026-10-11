# backend/routes/recommendations.py
from flask import Blueprint, jsonify, request
from services import reorder_service

bp = Blueprint("recommendations", __name__, url_prefix="/api/reorder")


@bp.post("")
def save():
    data = request.get_json(force=True)
    try:
        return jsonify(reorder_service.save_recommendation(data)), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.get("/history")
def history():
    return jsonify(reorder_service.list_recommendation_history())