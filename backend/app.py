# backend/app.py
import sys
from pathlib import Path

# Make `backend/` importable as a package root
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask, send_from_directory
from flask_cors import CORS

from routes.auth import bp as auth_bp
from routes.products import bp as products_bp
from routes.sales import bp as sales_bp
from routes.inventory import bp as inventory_bp
from routes.forecasts import bp as forecasts_bp
from routes.recommendations import bp as recommendations_bp
from routes.uci import bp as uci_bp

FRONTEND_DIR = BACKEND_DIR.parent / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)

app.register_blueprint(auth_bp)
app.register_blueprint(products_bp)
app.register_blueprint(sales_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(forecasts_bp)
app.register_blueprint(recommendations_bp)
app.register_blueprint(uci_bp)

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(FRONTEND_DIR, path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)