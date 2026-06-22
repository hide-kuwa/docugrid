from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

# 修正箇所: backend. を追加
from backend.database import get_db
from backend import models

router = APIRouter()

# スキーマ定義 (簡易的にここに記述)
from pydantic import BaseModel

class IssueCreate(BaseModel):
    file_id: str
    page_index: int
    x: float
    y: float
    comment: str

class IssueUpdate(BaseModel):
    status: str = None
    comment: str = None

# --- Endpoints ---

@router.post("/", response_model=dict)
def create_issue(issue: IssueCreate, db: Session = Depends(get_db)):
    db_issue = models.Issue(
        file_id=issue.file_id,
        page_index=issue.page_index,
        x=issue.x,
        y=issue.y,
        comment=issue.comment
    )
    db.add(db_issue)
    db.commit()
    db.refresh(db_issue)
    return {"id": db_issue.id, "status": "created"}

@router.get("/{file_id}")
def read_issues(file_id: str, db: Session = Depends(get_db)):
    return db.query(models.Issue).filter(models.Issue.file_id == file_id).all()

@router.patch("/{issue_id}")
def update_issue(issue_id: int, update: IssueUpdate, db: Session = Depends(get_db)):
    db_issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    if update.status:
        db_issue.status = update.status
    if update.comment:
        db_issue.comment = update.comment
        
    db.commit()
    return {"status": "updated"}

@router.delete("/{issue_id}")
def delete_issue(issue_id: int, db: Session = Depends(get_db)):
    db_issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Issue not found")
        
    db.delete(db_issue)
    db.commit()
    return {"status": "deleted"}