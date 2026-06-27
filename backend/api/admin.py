from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from database.connection import get_db
from database.seeds.seed_data import seed_db

router = APIRouter(prefix="/admin", tags=["Admin Operations"])
logger = logging.getLogger(__name__)

@router.post("/seed")
async def trigger_db_seed(db: Session = Depends(get_db)):
    """Triggers the SQLite database seeding process to insert stations, users, and historical AQI records."""
    try:
        logger.info("Admin triggered database seeding.")
        # Execute the seeder function
        seed_db()
        return {
            "status": "success",
            "message": "Database seeded successfully! Created stations, users, and 1,000+ historical telemetry logs."
        }
    except Exception as e:
        logger.error(f"Error during seeded database operation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database seeding failed: {str(e)}"
        )
