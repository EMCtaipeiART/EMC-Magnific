import sqlite3
from contextlib import contextmanager
from .config import DB_PATH, DATA_DIR
import os

SCHEMA = """
CREATE TABLE IF NOT EXISTS balance_snapshots(
  id INTEGER PRIMARY KEY, taken_at TEXT NOT NULL, balance REAL NOT NULL);
CREATE TABLE IF NOT EXISTS generations(
  work_id TEXT PRIMARY KEY, created_at TEXT, tool TEXT, credits REAL,
  prompt TEXT, person TEXT DEFAULT '', project TEXT DEFAULT '', note TEXT DEFAULT '');
"""

@contextmanager
def conn():
    os.makedirs(DATA_DIR, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    try:
        yield c
        c.commit()
    finally:
        c.close()
