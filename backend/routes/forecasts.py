# backend/routes/forecasts.py
from flask import Blueprint, jsonify
from services import forecast_service

bp = Blueprint("forecasts", __name__, url_prefix="/api/forecast")


@bp.post("/<int:product_id>")
def generate(product_id):
    try:
        return jsonify(forecast_service.generate_forecast(product_id)), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.get("/history")
def history():
    return jsonify(forecast_service.list_forecast_history())