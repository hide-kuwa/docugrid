from __future__ import annotations
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

from . import models
from . import schemas

# --- Users -----------------------------------------------------------------
def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    db_user = models.User(email=user.email, name=user.name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# --- Accounts --------------------------------------------------------------
def get_account_by_code(db: Session, code: str) -> Optional[models.Account]:
    return db.query(models.Account).filter(models.Account.code == code).first()


def get_accounts(db: Session, skip: int = 0, limit: int = 100) -> List[models.Account]:
    return db.query(models.Account).offset(skip).limit(limit).all()


def create_account(db: Session, account: schemas.AccountCreate) -> models.Account:
    db_account = models.Account(**account.model_dump())
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account


# --- Journals --------------------------------------------------------------
def create_journal(
    db: Session,
    journal: schemas.JournalCreate,
    user_id: int,
) -> models.Journal:
    """Persist a journal header together with its detail rows."""
    header_data = journal.model_dump(exclude={"details"})
    db_journal = models.Journal(**header_data, user_id=user_id)
    db_journal.details = [
        models.JournalDetail(**detail.model_dump()) for detail in journal.details
    ]

    try:
        db.add(db_journal)
        db.commit()
        db.refresh(db_journal)
    except Exception:  # pragma: no cover - rethrow for caller handling
        db.rollback()
        raise

    return db_journal


def get_journal(db: Session, journal_id: int, user_id: int) -> Optional[models.Journal]:
    return (
        db.query(models.Journal)
        .options(
            joinedload(models.Journal.details)
            .joinedload(models.JournalDetail.account),
            joinedload(models.Journal.details).joinedload(
                models.JournalDetail.tax_category
            ),
            joinedload(models.Journal.details).joinedload(
                models.JournalDetail.department
            ),
            joinedload(models.Journal.details).joinedload(
                models.JournalDetail.sub_account
            ),
        )
        .filter(models.Journal.id == journal_id, models.Journal.user_id == user_id)
        .first()
    )


def list_journals(
    db: Session,
    user_id: int,
    limit: int = 100,
) -> List[models.Journal]:
    return (
        db.query(models.Journal)
        .options(
            joinedload(models.Journal.details)
            .joinedload(models.JournalDetail.account),
            joinedload(models.Journal.details).joinedload(
                models.JournalDetail.tax_category
            ),
            joinedload(models.Journal.details).joinedload(
                models.JournalDetail.department
            ),
            joinedload(models.Journal.details).joinedload(
                models.JournalDetail.sub_account
            ),
        )
        .filter(models.Journal.user_id == user_id)
        .order_by(models.Journal.date.desc(), models.Journal.id.desc())
        .limit(limit)
        .all()
    )
def get_general_ledger(db: Session, account_id: int, user_id: int) -> schemas.GeneralLedgerResponse:
    """
    指定された勘定科目の総勘定元帳データを計算して取得する
    """
    
    # 1. 対象の勘定科目を取得
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        return None # (API側で 404 Not Found になる)

    # 2. 関連する仕訳明細を、日付順に取得
    #    Journal(日付) と JournalDetail(金額) をJOINして取得
    #    user_id で絞り込むことも忘れない
    query_results = (
        db.query(models.Journal, models.JournalDetail)
        .join(models.JournalDetail, models.Journal.id == models.JournalDetail.journal_id)
        .filter(
            models.Journal.user_id == user_id,
            models.JournalDetail.account_id == account_id
        )
        .order_by(models.Journal.date.asc(), models.Journal.id.asc()) # 日付順、同じ日付ならID順
        .all()
    )

    # 3. 実行残高と合計を計算しながら、レスポンスの形に組み立てる
    entries: List[schemas.GeneralLedgerEntry] = []
    running_balance = 0
    debit_total = 0
    credit_total = 0

    for journal, detail in query_results:
        amount = detail.amount
        
        if detail.is_debit:
            # 借方（資産の増加 or 負債/費用の減少）
            # ※ account_type に応じて残高の増減は変わるが、
            #   MVPでは「借方ならプラス、貸方ならマイナス」で計算する
            running_balance += amount
            debit_total += amount
        else:
            # 貸方
            running_balance -= amount
            credit_total += amount
            
        entry = schemas.GeneralLedgerEntry(
            date=journal.date,
            journal_id=journal.id,
            journal_description=journal.description,
            detail_id=detail.id,
            is_debit=detail.is_debit,
            amount=amount,
            detail_description=detail.detail_description,
            balance=running_balance # その時点での実行残高
        )
        entries.append(entry)

    # 4. 最終的なレスポンスオブジェクトを作成
    response = schemas.GeneralLedgerResponse(
        account=account,
        entries=entries,
        debit_total=debit_total,
        credit_total=credit_total,
        final_balance=running_balance
    )
    
    return response