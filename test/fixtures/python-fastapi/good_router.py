from fastapi import APIRouter, Depends

router = APIRouter()

@router.get("/users")
def get_users(service: UserService = Depends(get_user_service)):
    return service.get_users()
