# backend/database.py
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "database" / "retailcast.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def query(sql, params=()):
    with get_connection() as conn:
        cur = conn.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def query_one(sql, params=()):
    with get_connection() as conn:
        cur = conn.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def execute(sql, params=()):
    with get_connection() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid


def execute_many(sql, seq_of_params):
    with get_connection() as conn:
        cur = conn.executemany(sql, seq_of_params)
        conn.commit()
        return cur.rowcount