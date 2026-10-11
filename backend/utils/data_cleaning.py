# backend/utils/data_cleaning.py
"""
Paper Section IV.A — cleaning rules for the UCI Online Retail dataset.
Used offline for model development. Not applied to live sales.

Only the columns needed for demand forecasting are kept:
InvoiceNo, StockCode, Quantity, InvoiceDate.
CustomerID and Country are dropped.
"""
import pandas as pd
from pathlib import Path

DATASET_PATH = Path(__file__).resolve().parents[2] / "dataset" / "online_retail.csv"


def load_and_clean(path: Path = DATASET_PATH) -> pd.DataFrame:
    # utf-8-sig automatically strips the BOM from Excel-exported CSVs
    df = pd.read_csv(path, encoding="utf-8-sig")

    # Normalize column names (strip BOM, whitespace)
    df.columns = [c.replace("\ufeff", "").strip() for c in df.columns]

    # Drop columns we don't use
    drop_cols = ["CustomerID", "Customer ID", "Country", "Unnamed: 6", "Unnamed: 7"]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns], errors="ignore")

    # 1. Invoices starting with "C" are cancellations
    df["InvoiceNo"] = df["InvoiceNo"].astype(str)
    df = df[~df["InvoiceNo"].str.startswith("C", na=False)]

    # 2. Nonpositive quantity → not positive demand
    df = df[df["Quantity"] > 0]

    # 3. Unusable StockCode / InvoiceDate
    df = df.dropna(subset=["StockCode", "InvoiceDate"])
    df = df[df["StockCode"].astype(str).str.strip() != ""]
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"], errors="coerce")
    df = df.dropna(subset=["InvoiceDate"])

    # 4. Remove exact duplicates before aggregation
    df = df.drop_duplicates()

    # 5. Aggregate quantity by StockCode and calendar date
    df["date"] = df["InvoiceDate"].dt.date
    agg = (
        df.groupby(["StockCode", "date"], as_index=False)["Quantity"]
        .sum()
        .rename(columns={"Quantity": "demand"})
    )

    # 6. Reindex missing calendar dates within each SKU history to zero
    filled = []
    for sku, grp in agg.groupby("StockCode"):
        g = grp[["date", "demand"]].copy()
        g["date"] = pd.to_datetime(g["date"])
        g = g.set_index("date").sort_index()
        full_idx = pd.date_range(g.index.min(), g.index.max(), freq="D")
        g = g.reindex(full_idx).fillna({"demand": 0})
        g["StockCode"] = sku
        g = g.reset_index().rename(columns={"index": "date"})
        filled.append(g)

    result = pd.concat(filled, ignore_index=True)
    result["date"] = pd.to_datetime(result["date"]).dt.date
    return result[["StockCode", "date", "demand"]]