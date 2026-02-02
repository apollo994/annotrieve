from fastapi import APIRouter
from services import analytics_service

router = APIRouter()


@router.get("/analytics/frequencies/country")
async def get_country_frequencies():
    """
    Get frequency counts of unique users by country.
    
    Returns a dictionary mapping country names to the count of unique users per country.
    Each user is identified by a unique fingerprint (HMAC hash of their IP address).
    """
    return analytics_service.get_country_frequencies()
