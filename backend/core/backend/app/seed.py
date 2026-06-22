from __future__ import annotations

from sqlalchemy.orm import Session

from .app import crud, models

from .app import schemas

# ベースラインとなる勘定科目のサンプルデータ
DEFAULT_ACCOUNTS: list[dict[str, str]] = [
    {"code": "101", "name": "現金", "category": "資産"},
    {"code": "102", "name": "普通預金", "category": "資産"},
    {"code": "120", "name": "売掛金", "category": "資産"},
    {"code": "201", "name": "買掛金", "category": "負債"},
    {"code": "202", "name": "未払費用", "category": "負債"},
    {"code": "210", "name": "仮受消費税", "category": "負債"},
    {"code": "301", "name": "資本金", "category": "純資産"},
    {"code": "401", "name": "売上高", "category": "収益"},
    {"code": "402", "name": "雑収入", "category": "収益"},
    {"code": "501", "name": "仕入高", "category": "費用"},
    {"code": "502", "name": "通信費", "category": "費用"},
    {"code": "503", "name": "消耗品費", "category": "費用"},
    {"code": "504", "name": "旅費交通費", "category": "費用"},
]

DEMO_USER = schemas.UserCreate(email="demo@example.com", name="Demo User")


def init_db(db: Session) -> None:
    """Seed baseline master data for a new database."""
    if db.query(models.Account).count() == 0:
        for account_data in DEFAULT_ACCOUNTS:
            account = schemas.AccountCreate(**account_data)
            crud.create_account(db=db, account=account)
    if db.query(models.User).count() == 0:
        crud.create_user(db=db, user=DEMO_USER)
