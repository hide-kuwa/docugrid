from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- Users -----------------------------------------------------------------
class UserBase(BaseModel):
    email: str
    name: str | None = None


class UserCreate(UserBase):
    pass


class User(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Accounts ---------------------------------------------------------------
class AccountBase(BaseModel):
    name: str
    code: str
    category: str


class AccountCreate(AccountBase):
    pass


class Account(AccountBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Tax Categories ---------------------------------------------------------
class TaxCategoryBase(BaseModel):
    code: str
    name: str


class TaxCategoryCreate(TaxCategoryBase):
    pass


class TaxCategory(TaxCategoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Departments ------------------------------------------------------------
class DepartmentBase(BaseModel):
    code: str
    name: str


class DepartmentCreate(DepartmentBase):
    pass


class Department(DepartmentBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Sub Accounts -----------------------------------------------------------
class SubAccountBase(BaseModel):
    account_id: int
    code: str
    name: str


class SubAccountCreate(SubAccountBase):
    pass


class SubAccount(SubAccountBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Journal Details --------------------------------------------------------
class JournalDetailBase(BaseModel):
    is_debit: bool
    amount: int
    tax_category_id: Optional[int] = None
    account_id: int
    department_id: Optional[int] = None
    sub_account_id: Optional[int] = None
    detail_description: Optional[str] = None
    tax_amount: Optional[int] = None


class JournalDetailCreate(JournalDetailBase):
    pass


class JournalDetail(JournalDetailBase):
    id: int
    journal_id: int
    account: Account
    tax_category: Optional[TaxCategory] = None
    department: Optional[Department] = None
    sub_account: Optional[SubAccount] = None

    model_config = ConfigDict(from_attributes=True)


# --- Journals ---------------------------------------------------------------
class JournalBase(BaseModel):
    date: date
    description: Optional[str] = None
    is_closing_entry: bool = False
    attachment_url: Optional[str] = None


class JournalCreate(JournalBase):
    details: List[JournalDetailCreate] = Field(default_factory=list)


class Journal(JournalBase):
    id: int
    user_id: int
    details: List[JournalDetail] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# --- General Ledger --------------------------------------------------------
class GeneralLedgerEntry(BaseModel):
    """Single line item in the general ledger report."""

    date: date
    journal_id: int
    journal_description: Optional[str] = None
    detail_id: int
    is_debit: bool
    amount: int
    detail_description: Optional[str] = None
    balance: int

    model_config = ConfigDict(from_attributes=True)


class GeneralLedgerResponse(BaseModel):
    """General ledger API response payload."""

    account: Account
    entries: List[GeneralLedgerEntry]
    debit_total: int
    credit_total: int
    final_balance: int

    model_config = ConfigDict(from_attributes=True)


# --- Trial Balance ---------------------------------------------------------
class TrialBalanceEntry(BaseModel):
    """Single row inside the trial balance."""

    account_id: int
    account_code: str
    account_name: str
    account_category: str
    debit_total: int
    credit_total: int
    balance_debit: int
    balance_credit: int

    model_config = ConfigDict(from_attributes=True)


class TrialBalanceResponse(BaseModel):
    """Trial balance API response payload."""

    entries: List[TrialBalanceEntry]
    total_debit_total: int
    total_credit_total: int
    total_balance_debit: int
    total_balance_credit: int

    model_config = ConfigDict(from_attributes=True)
