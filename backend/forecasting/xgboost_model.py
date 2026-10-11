# backend/forecasting/xgboost_model.py
# Uses XGBoost's native DMatrix/train API — no scikit-learn dependency.
import xgboost as xgb
import pandas as pd
from .feature_engineering import build_features, FEATURE_COLS, is_eligible


def train_on_sku_history(df: pd.DataFrame):
    feat = build_features(df).dropna(subset=FEATURE_COLS + ["target"])
    if feat.empty:
        return None, None

    X = feat[FEATURE_COLS]
    y = feat["target"]

    dtrain = xgb.DMatrix(X, label=y)
    params = {
        "objective": "reg:squarederror",
        "learning_rate": 0.05,
        "max_depth": 5,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "seed": 42,
        "verbosity": 0,
    }
    model = xgb.train(params, dtrain, num_boost_round=300)

    last = build_features(df).iloc[-1:][FEATURE_COLS]
    return model, xgb.DMatrix(last)


def predict_next_7(df: pd.DataFrame):
    if not is_eligible(df["demand"]):
        return None

    model, dlast = train_on_sku_history(df)
    if model is None:
        return None

    pred = float(model.predict(dlast)[0])
    return max(0.0, pred)