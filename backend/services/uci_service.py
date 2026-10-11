# backend/services/uci_service.py
"""
UCI Online Retail extraction + repair service.
"""
import io
import csv
from pathlib import Path
import pandas as pd

DATASET_PATH = Path(__file__).resolve().parents[2] / "dataset" / "online_retail.csv"

MIN_SPAN_DAYS    = 180
MIN_NONZERO_DAYS = 30


def _load_and_clean() -> pd.DataFrame:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Missing dataset at {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH, encoding="utf-8-sig")
    df.columns = [str(c).replace("\ufeff", "").strip() for c in df.columns]
    df = df.loc[:, ~df.columns.str.startswith("Unnamed")]

    for c in ["CustomerID", "Customer ID", "Country"]:
        if c in df.columns:
            df = df.drop(columns=[c])

    df["InvoiceNo"] = df["InvoiceNo"].astype(str)
    df = df[~df["InvoiceNo"].str.startswith("C", na=False)]
    df = df[df["Quantity"] > 0]
    df = df.dropna(subset=["StockCode", "InvoiceDate"])
    df = df[df["StockCode"].astype(str).str.strip() != ""]
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"], errors="coerce")
    df = df.dropna(subset=["InvoiceDate"])
    df = df.drop_duplicates()

    df["StockCode"] = df["StockCode"].astype(str)
    df["date"] = df["InvoiceDate"].dt.date
    return df


def _rank_skus(df: pd.DataFrame) -> pd.DataFrame:
    ranked = (
        df.groupby("StockCode")
          .agg(n_days=("date", "nunique"),
               n_nonzero=("Quantity", lambda q: (q > 0).sum()),
               first=("date", "min"),
               last=("date", "max"),
               desc=("Description", "first"))
          .reset_index()
    )
    ranked["span"] = (
        pd.to_datetime(ranked["last"]) - pd.to_datetime(ranked["first"])
    ).dt.days
    ranked["eligible"] = (
        (ranked["span"] >= MIN_SPAN_DAYS) & (ranked["n_nonzero"] >= MIN_NONZERO_DAYS)
    )
    ranked = ranked.sort_values(
        by=["eligible", "n_nonzero"], ascending=[False, False]
    ).reset_index(drop=True)
    return ranked


def list_candidates(limit: int = 10) -> dict:
    df = _load_and_clean()
    ranked = _rank_skus(df)
    eligible_count = int(ranked["eligible"].sum())
    top = ranked.head(limit).copy()

    return {
        "dataset_rows": int(len(df)),
        "total_skus":   int(len(ranked)),
        "eligible":     eligible_count,
        "candidates": [
            {
                "sku":         str(row["StockCode"]),
                "description": str(row["desc"] or row["StockCode"]),
                "n_days":      int(row["n_days"]),
                "n_nonzero":   int(row["n_nonzero"]),
                "span":        int(row["span"]),
                "eligible":    bool(row["eligible"]),
            }
            for _, row in top.iterrows()
        ],
    }


def get_uci_status() -> dict:
    from database import query_one
    row = query_one("""
        SELECT
            (SELECT COUNT(DISTINCT product_id) FROM sales WHERE source='UCI') AS products,
            (SELECT COUNT(*) FROM sales WHERE source='UCI') AS sales
    """)
    products = int(row["products"]) if row and row["products"] else 0
    sales    = int(row["sales"])    if row and row["sales"]    else 0
    return {
        "loaded":   products > 0,
        "products": products,
        "sales":    sales,
    }


def setup_uci_database() -> dict:
    from database import get_connection
    from datetime import datetime

    started = datetime.now()
    df = _load_and_clean()
    eligible = _rank_skus(df)
    eligible = eligible[eligible["eligible"]].reset_index(drop=True)

    codes = set(eligible["StockCode"].astype(str))
    df = df[df["StockCode"].isin(codes)]

    with get_connection() as conn:
        existing = {r["sku"] for r in conn.execute("SELECT sku FROM products").fetchall()}

    sku_to_pid = {}
    created = 0

    with get_connection() as conn:
        for _, row in eligible.iterrows():
            sku = str(row["StockCode"]).strip()
            if not sku:
                continue
            if sku in existing:
                cur = conn.execute("SELECT product_id FROM products WHERE sku=?", (sku,))
                r = cur.fetchone()
                if r:
                    sku_to_pid[sku] = r["product_id"]
                continue

            cur = conn.execute(
                "INSERT INTO products (sku, name, category, minimum_stock, eligible) "
                "VALUES (?, ?, '', 0, 1)",
                (sku, (row["desc"] or f"UCI {sku}")[:200])
            )
            pid = cur.lastrowid
            conn.execute(
                "INSERT INTO inventory (product_id, current_stock, minimum_stock) "
                "VALUES (?, 0, 0)",
                (pid,)
            )
            sku_to_pid[sku] = pid
            created += 1
        conn.commit()

    with get_connection() as conn:
        for r in conn.execute("SELECT sku, product_id FROM products").fetchall():
            sku_to_pid.setdefault(r["sku"], r["product_id"])

    with get_connection() as conn:
        conn.execute("DELETE FROM sales WHERE source = 'UCI'")
        conn.commit()

        inserted = 0
        batch = []
        BATCH_SIZE = 5000

        for _, row in df.iterrows():
            sku = str(row["StockCode"]).strip()
            pid = sku_to_pid.get(sku)
            if not pid:
                continue

            batch.append((pid, str(row["date"]), int(row["Quantity"]), 0.0, "UCI"))
            inserted += 1

            if len(batch) >= BATCH_SIZE:
                conn.executemany(
                    "INSERT INTO sales (product_id, sale_date, quantity, unit_price, source) "
                    "VALUES (?, ?, ?, ?, ?)",
                    batch
                )
                batch = []

        if batch:
            conn.executemany(
                "INSERT INTO sales (product_id, sale_date, quantity, unit_price, source) "
                "VALUES (?, ?, ?, ?, ?)",
                batch
            )
        conn.commit()

    elapsed = (datetime.now() - started).total_seconds()
    return {
        "products_created": created,
        "sales_inserted":   inserted,
        "elapsed_seconds":  round(elapsed, 1),
    }


def build_csv(sku: str, target_sku: str | None = None) -> str:
    df = _load_and_clean()
    ranked = _rank_skus(df)

    sku_clean = sku.strip().upper()
    match = ranked[ranked["StockCode"].astype(str).str.upper() == sku_clean]
    if match.empty:
        raise ValueError(f"SKU '{sku}' not found in UCI dataset.")

    row = match.iloc[0]
    if not row["eligible"]:
        raise ValueError(f"UCI SKU '{sku}' does not have enough history itself.")

    sku_rows = df[df["StockCode"] == row["StockCode"]].copy()
    daily = (
        sku_rows.groupby(["StockCode", "date"], as_index=False)
            .agg(Quantity=("Quantity", "sum"),
                 UnitPrice=("UnitPrice", "mean"),
                 Description=("Description", "first"))
    )
    daily = daily.rename(columns={"date": "InvoiceDate"})
    daily["InvoiceDate"] = pd.to_datetime(daily["InvoiceDate"])

    output_sku = (target_sku or str(row["StockCode"])).strip()
    daily["StockCode"] = output_sku
    daily["InvoiceNo"] = ["UCI" + str(i).zfill(6) for i in range(len(daily))]
    daily["UnitPrice"] = daily["UnitPrice"].fillna(0)

    daily = daily[["InvoiceNo", "StockCode", "Description",
                   "InvoiceDate", "Quantity", "UnitPrice"]]

    return daily.to_csv(index=False)


def repair_csv(rows: list):
    by_sku = {}
    for r in rows:
        sku = str(r.get("sku", "")).strip()
        if not sku:
            continue
        by_sku.setdefault(sku, []).append(r)

    if not by_sku:
        raise ValueError("No valid rows found. Each row needs a 'sku' field.")

    uci_df = _load_and_clean()
    uci_ranked = _rank_skus(uci_df)

    report = {
        "input_skus": len(by_sku),
        "repaired":   [],
        "unchanged":  [],
        "unmatched":  [],
    }

    output_rows = []

    for sku, user_rows in by_sku.items():
        existing_dates = {str(r.get("date", "")).strip() for r in user_rows if r.get("date")}

        for r in user_rows:
            output_rows.append({
                "InvoiceNo":   r.get("invoice") or f"USER{len(output_rows):06d}",
                "StockCode":   sku,
                "Description": r.get("name") or sku,
                "InvoiceDate": r.get("date", ""),
                "Quantity":    r.get("qty", 0),
                "UnitPrice":   r.get("price", 0),
            })

        match = uci_ranked[uci_ranked["StockCode"].astype(str).str.upper() == sku.upper()]
        if match.empty:
            report["unmatched"].append({
                "sku": sku,
                "reason": "No matching SKU in UCI dataset.",
            })
            continue

        uci_row = match.iloc[0]
        if not uci_row["eligible"]:
            report["unmatched"].append({
                "sku": sku,
                "reason": "UCI SKU has insufficient history.",
            })
            continue

        sku_rows = uci_df[uci_df["StockCode"] == uci_row["StockCode"]].copy()
        daily = (
            sku_rows.groupby(["StockCode", "date"], as_index=False)
                .agg(Quantity=("Quantity", "sum"),
                     UnitPrice=("UnitPrice", "mean"),
                     Description=("Description", "first"))
        )

        added = 0
        for _, row in daily.iterrows():
            date_str = str(row["date"])
            if date_str in existing_dates:
                continue
            output_rows.append({
                "InvoiceNo":   f"UCI{len(output_rows):06d}",
                "StockCode":   sku,
                "Description": row["Description"] or sku,
                "InvoiceDate": date_str,
                "Quantity":    int(row["Quantity"]),
                "UnitPrice":   float(row["UnitPrice"]) if pd.notna(row["UnitPrice"]) else 0,
            })
            added += 1

        if added > 0:
            report["repaired"].append({
                "sku":             sku,
                "user_rows":       len(user_rows),
                "uci_rows_added":  added,
                "uci_source_sku":  str(uci_row["StockCode"]),
                "uci_description": str(uci_row["desc"] or ""),
            })
        else:
            report["unchanged"].append({"sku": sku, "reason": "No new dates to add."})

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["InvoiceNo","StockCode","Description","InvoiceDate","Quantity","UnitPrice"],
    )
    writer.writeheader()
    for r in output_rows:
        writer.writerow(r)

    return output.getvalue(), report