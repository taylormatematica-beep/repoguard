from fastapi import APIRouter, Depends
from sqlmodel import Session, select

router = APIRouter()

@router.get("/users")
def get_users(session: Session = Depends(get_session)):
    statement = select(User)
    return session.exec(statement).all()