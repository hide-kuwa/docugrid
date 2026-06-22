from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from . import crud, database
from . import schemas
from typing import List

router = APIRouter(
    prefix="/api/v1/accounts",
    tags=["accounts"],
)

@router.post("/", response_model=schemas.Account)
def create_account(account: schemas.AccountCreate, db: Session = Depends(database.get_db)):
    db_account = crud.get_account_by_code(db, code=account.code)
    if db_account:
        raise HTTPException(status_code=400, detail="Account code already registered")
    return crud.create_account(db=db, account=account)

@router.get("/", response_model=List[schemas.Account])
def read_accounts(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    accounts = crud.get_accounts(db, skip=skip, limit=limit)
    return accounts