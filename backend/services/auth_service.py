# backend/services/auth_service.py
from werkzeug.security import generate_password_hash, check_password_hash
from database import query_one, execute


def register_user(full_name: str, email: str, password: str):
    if not full_name or not email or not password:
        raise ValueError("All fields are required.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")

    existing = query_one("SELECT user_id FROM users WHERE email = ?", (email,))
    if existing:
        raise ValueError("An account with this email already exists.")

    pw_hash = generate_password_hash(password)
    uid = execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'manager')",
        (full_name, email, pw_hash)
    )
    return {"user_id": uid, "full_name": full_name, "email": email, "role": "manager"}


def authenticate(email: str, password: str):
    user = query_one("SELECT * FROM users WHERE email = ?", (email,))
    if not user:
        raise ValueError("Invalid email or password.")
    if not check_password_hash(user["password_hash"], password):
        raise ValueError("Invalid email or password.")
    return {
        "user_id":   user["user_id"],
        "full_name": user["full_name"],
        "email":     user["email"],
        "role":      user["role"],
    }