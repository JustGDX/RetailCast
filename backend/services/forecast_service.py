# backend/services/forecast_service.py
import pandas as pd
from datetime import date
from database import query, query_one, execute
from forecasting.xgboost_model import predict_next_7
from forecasting.feature_engineering import is_eligible


def _load_sku_daily(product_id: int) -> pd.DataFrame:
    rows = query("""
        SELECT sale_date AS date, SUM(quantity) AS demand
        FROM sales WHERE product_id=?
        GROUP BY sale_date ORDER BY sale_date
    """, (product_id,))
    if not rows:
        return pd.DataFrame(columns=["date", "demand"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").reindex(
        pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    ).fillna({"demand": 0}).reset_index().rename(columns={"index": "date"})
    return df


def generate_forecast(product_id: int) -> dict:
    p = query_one("SELECT product_id, sku, name FROM products WHERE product_id=?", (product_id,))
    if not p:
        raise ValueError("Unknown product")

    df = _load_sku_daily(product_id)
    if df.empty or not is_eligible(df["demand"]):
        raise ValueError(
            "SKU not eligible for forecasting. "
            "Needs ≥180 days of sales history and ≥30 nonzero-demand days."
        )

    pred = predict_next_7(df)
    if pred is None:
        raise ValueError("Model could not train on this SKU")

    fid = execute("""
        INSERT INTO forecasts (product_id, forecast_date, horizon_days, predicted_qty, model_name)
        VALUES (?, ?, 7, ?, 'XGBoost Regressor')
    """, (product_id, date.today().isoformat(), pred))

    return {
        "forecast_id": f"FC-{fid:05d}",
        "product_id":  product_id,
        "sku":         p["sku"],
        "predicted":   round(pred, 2),
        "model":       "XGBoost Regressor",
        "date":        date.today().isoformat(),
    }


def list_forecast_history():
    return query("""
        SELECT 'FC-' || printf('%05d', f.forecast_id) AS id,
               f.forecast_date AS date, p.sku, p.name,
               f.horizon_days AS horizon, f.predicted_qty AS predicted,
               f.model_name AS model
        FROM forecasts f JOIN products p ON p.product_id = f.product_id
        ORDER BY f.forecast_id DESC
    """)