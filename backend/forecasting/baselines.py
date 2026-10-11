# backend/forecasting/baselines.py
"""Paper Section IV.C — seasonal-naive and linear-regression baselines."""
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from .feature_engineering import build_features, FEATURE_COLS


def seasonal_naive(df: pd.DataFrame, horizon: int = 7) -> float:
    if len(df) < 14:
        return float(df["demand"].mean() * horizon) if len(df) else 0.0
    return float(df["demand"].iloc[-7:].sum())


def linear_regression(df: pd.DataFrame) -> float:
    feat = build_features(df).dropna(subset=FEATURE_COLS + ["target"])
    if feat.empty:
        return float(df["demand"].mean() * 7)
    model = LinearRegression()
    model.fit(feat[FEATURE_COLS].values, feat["target"].values)
    last = build_features(df).iloc[-1:][FEATURE_COLS].values
    return max(0.0, float(model.predict(last)[0]))