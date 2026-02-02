from db.models import UserAnalytics
from fastapi import HTTPException
from typing import Dict


def get_country_frequencies() -> Dict[str, int]:
    """
    Get frequency counts of unique users by country.
    
    Returns a dictionary mapping country names to the count of unique users (fingerprints) per country.
    Since each document represents a unique fingerprint-country combination, we count distinct
    fingerprints per country to get the number of unique users.
    """
    try:
        results = UserAnalytics.objects().item_frequencies('country')
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching country frequencies: {e}")
