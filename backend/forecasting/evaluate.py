# backend/forecasting/evaluate.py
"""Paper Section IV.C — MAE, RMSE, MASE."""
import numpy as np
import pandas as pd


def mae(actual, pred): return float(np.mean(np.abs(actual - pred)))
def rmse(actual, pred): return float(np.sqrt(np.mean((actual - pred) ** 2)))


def mase(actual, pred, train) -> float:
    if len(train) < 2:
        return float("nan")
    naive_err = np.mean(np.abs(np.diff(train)))
    if naive_err == 0:
        return float("nan")
    return float(np.mean(np.abs(actual - pred)) / naive_err)


def chronological_split(df: pd.DataFrame, train=0.7, val=0.15):
    n = len(df)
    i_train = int(n * train)
    i_val = int(n * (train + val))
    return df.iloc[:i_train], df.iloc[i_train:i_val], df.iloc[i_val:]