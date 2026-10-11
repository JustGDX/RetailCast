# backend/routes/uci.py
from flask import Blueprint, jsonify, request, Response
from services import uci_service

bp = Blueprint("uci", __name__, url_prefix="/api/uci")


@bp.get("/candidates")
def candidates():
    """Return the top compatible SKUs from the UCI dataset."""
    try:
        limit = int(request.args.get("limit", 10))
        return jsonify(uci_service.list_candidates(limit))
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/status")
def status():
    """Check whether the verified records database has been loaded."""
    try:
        return jsonify(uci_service.get_uci_status())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/setup")
def setup():
    """Import all eligible UCI SKUs into the database (one-time setup)."""
    try:
        result = uci_service.setup_uci_database()
        return jsonify(result), 201
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/build-csv")
def build_csv():
    """Generate a CSV file for the given UCI SKU and return it as a download."""
    data = request.get_json(force=True)
    sku = (data.get("sku") or "").strip()
    target_sku = (data.get("target_sku") or sku).strip()

    if not sku:
        return jsonify({"error": "Provide a 'sku' field."}), 400

    try:
        csv_text = uci_service.build_csv(sku, target_sku)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    filename = f"uci_{sku}.csv"
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        }
    )


@bp.post("/repair")
def repair():
    """
    Accept an uploaded CSV (as JSON rows), detect what's missing,
    merge with UCI data, and return a repaired CSV as a string.
    """
    data = request.get_json(force=True)
    rows = data.get("rows", [])
    if not rows:
        return jsonify({"error": "No rows provided."}), 400

    try:
        repaired_csv, report = uci_service.repair_csv(rows)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "csv":    repaired_csv,
        "report": report,
    }), 200