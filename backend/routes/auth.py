# backend/routes/auth.py
from flask import Blueprint, jsonify, request
from services import auth_service

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/register")
def register():
    data = request.get_json(force=True)
    try:
        user = auth_service.register_user(
            data.get("full_name", "").strip(),
            data.get("email", "").strip().lower(),
            data.get("password", "")
        )
        return jsonify(user), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.post("/login")
def login():
    data = request.get_json(force=True)
    try:
        user = auth_service.authenticate(
            data.get("email", "").strip().lower(),
            data.get("password", "")
        )
        return jsonify(user), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 401