from fastapi import APIRouter
router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

@router.get("/")
def get_leaderboard():
    return {"leaderboard": []}