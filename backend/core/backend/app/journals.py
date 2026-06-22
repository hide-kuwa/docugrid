from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from . import crud, database, models, schemas

router = APIRouter(
    prefix="/api/v1/journals",
    tags=["journals"],
)


def get_active_user(db: Session = Depends(database.get_db)) -> models.User:
    """Return the first available user or provision a demo user on the fly."""
    user = db.query(models.User).first()
    if user:
        return user

    demo_user = models.User(email="demo@example.com", name="Demo User")
    db.add(demo_user)
    db.commit()
    db.refresh(demo_user)
    return demo_user


def _ensure_balanced(journal: schemas.JournalCreate) -> None:
    if not journal.details:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仕訳明細を1件以上入力してください。",
        )

    debit_lines = [detail for detail in journal.details if detail.is_debit]
    credit_lines = [detail for detail in journal.details if not detail.is_debit]

    if not debit_lines or not credit_lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="借方と貸方の両方に明細を追加してください。",
        )

    if any(detail.amount <= 0 for detail in journal.details):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="金額は1円以上を入力してください。",
        )

    debit_total = sum(detail.amount for detail in debit_lines)
    credit_total = sum(detail.amount for detail in credit_lines)

    if debit_total <= 0 or credit_total <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="借方と貸方の両方に金額を入力してください。",
        )

    if debit_total != credit_total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="借方と貸方の合計金額が一致していません。",
        )


@router.post(
    "/",
    response_model=schemas.Journal,
    status_code=status.HTTP_201_CREATED,
)
def create_journal_entry(
    journal: schemas.JournalCreate,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_active_user),
) -> schemas.Journal:
    """Register a new journal entry together with its detail rows."""
    _ensure_balanced(journal)
    return crud.create_journal(db=db, journal=journal, user_id=user.id)


@router.get("/", response_model=List[schemas.Journal])
def list_journal_entries(
    limit: int = 50,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_active_user),
) -> List[schemas.Journal]:
    """Retrieve the latest journal entries for the active user."""
    limit = max(1, min(limit, 200))
    return crud.list_journals(db=db, user_id=user.id, limit=limit)


@router.get("/{journal_id}", response_model=schemas.Journal)
def get_journal_entry(
    journal_id: int,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_active_user),
) -> schemas.Journal:
    journal_obj = crud.get_journal(db=db, journal_id=journal_id, user_id=user.id)
    if not journal_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="仕訳が見つかりません。",
        )
    return journal_obj
