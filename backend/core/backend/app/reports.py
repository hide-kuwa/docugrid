from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from . import crud, database, models, schemas
from .journals import get_active_user

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["reports"],
)


@router.get(
    "/general-ledger/{account_id}",
    response_model=schemas.GeneralLedgerResponse,
)
def get_general_ledger_report(
    account_id: int,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_active_user),
) -> schemas.GeneralLedgerResponse:
    ledger_data = crud.get_general_ledger(
        db=db,
        account_id=account_id,
        user_id=user.id,
    )

    if not ledger_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account (ID: {account_id}) was not found.",
        )

    return ledger_data


@router.get(
    "/trial-balance",
    response_model=schemas.TrialBalanceResponse,
)
def get_trial_balance_report(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_active_user),
) -> schemas.TrialBalanceResponse:
    return crud.get_trial_balance(db=db, user_id=user.id)
