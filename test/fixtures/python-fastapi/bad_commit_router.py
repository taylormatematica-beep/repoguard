from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter()

@router.post("/users")
def create_user(db: Session = Depends(get_db), user: UserCreate = None):
    db.add(user)
    db.commit()
    return user
