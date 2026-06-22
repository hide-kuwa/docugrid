from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    journals = relationship("Journal", back_populates="user")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    category = Column(String, nullable=False)

    sub_accounts = relationship(
        "SubAccount", back_populates="account", cascade="all, delete-orphan"
    )
    journal_details = relationship("JournalDetail", back_populates="account")


class TaxCategory(Base):
    __tablename__ = "tax_categories"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)

    journal_details = relationship("JournalDetail", back_populates="tax_category")


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)

    journal_details = relationship("JournalDetail", back_populates="department")


class SubAccount(Base):
    __tablename__ = "sub_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    code = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)

    account = relationship("Account", back_populates="sub_accounts")
    journal_details = relationship("JournalDetail", back_populates="sub_account")


class Journal(Base):
    __tablename__ = "journals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, default=date.today, nullable=False)
    description = Column(Text, nullable=True)
    is_closing_entry = Column(Boolean, default=False, nullable=False)
    attachment_url = Column(String, nullable=True)

    user = relationship("User", back_populates="journals")
    details = relationship(
        "JournalDetail",
        back_populates="journal",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class JournalDetail(Base):
    __tablename__ = "journal_details"

    id = Column(Integer, primary_key=True, index=True)
    journal_id = Column(Integer, ForeignKey("journals.id", ondelete="CASCADE"), nullable=False)
    is_debit = Column(Boolean, nullable=False)
    amount = Column(Integer, nullable=False)
    tax_category_id = Column(Integer, ForeignKey("tax_categories.id"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    sub_account_id = Column(Integer, ForeignKey("sub_accounts.id"), nullable=True)
    detail_description = Column(Text, nullable=True)
    tax_amount = Column(Integer, nullable=True)

    journal = relationship("Journal", back_populates="details")
    account = relationship("Account", back_populates="journal_details")
    tax_category = relationship("TaxCategory", back_populates="journal_details")
    department = relationship("Department", back_populates="journal_details")
    sub_account = relationship("SubAccount", back_populates="journal_details")
