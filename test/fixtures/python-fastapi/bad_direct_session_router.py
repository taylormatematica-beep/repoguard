from fastapi import APIRouter
from database import SessionLocal

router = APIRouter()

@router.get("/users")
def get_users():
    db = SessionLocal()
    return db.query(User).all()
