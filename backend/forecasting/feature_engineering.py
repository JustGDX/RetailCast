# backend/forecasting/feature_engineering.py
"""Paper Section IV.B — candidate predictors for the 7-day target."""
import pandas as pd

MIN_HISTORY_DAYS = 180
MIN_NONZERO_DAYS = 30
HORIZON = 7


def is_eligible(series: pd.Series) -> bool:
    """SKU eligibility: ≥180 calendar days AND ≥30 nonzero-demand days."""
    if len(series) < MIN_HISTORY_DAYS:
        return False
    return (series > 0).sum() >= MIN_NONZERO_DAYS


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    df: columns [date, demand] for ONE SKU, daily zero-filled.
    Adds lag, rolling, and calendar features. Target = next 7-day total.
    All rolling features are shifted so only past info is used.
    """
    df = df.sort_values("date").reset_index(drop=True)
    d = df["demand"]

    df["lag_1"]   = d.shift(1)
    df["lag_7"]   = d.shift(7)
    df["lag_14"]  = d.shift(14)
    df["lag_28"]  = d.shift(28)

    df["roll_mean_7"]  = d.shift(1).rolling(7).mean()
    df["roll_mean_14"] = d.shift(1).rolling(14).mean()
    df["roll_mean_28"] = d.shift(1).rolling(28).mean()

    df["roll_std_7"]   = d.shift(1).rolling(7).std()
    df["roll_std_28"]  = d.shift(1).rolling(28).std()

    df["nonzero_28"] = d.shift(1).rolling(28).apply(lambda x: (x > 0).sum(), raw=True)

    dt = pd.to_datetime(df["date"])
    df["dow"]     = dt.dt.dayofweek
    df["month"]   = dt.dt.month
    df["weekend"] = (dt.dt.dayofweek >= 5).astype(int)

    df["target"] = d.shift(-HORIZON).rolling(HORIZON).sum().shift(-(HORIZON - 1))
    return df


FEATURE_COLS = [
    "lag_1", "lag_7", "lag_14", "lag_28",
    "roll_mean_7", "roll_mean_14", "roll_mean_28",
    "roll_std_7", "roll_std_28",
    "nonzero_28",
    "dow", "month", "weekend",
]