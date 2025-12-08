from fastapi import HTTPException
import os
import secrets
from jobs.import_annotations import import_annotations
from jobs.updates import update_feature_stats, update_stats, update_taxonomy


def _validate_auth_key(auth_key: str) -> None:
    """
    Validate authentication key using constant-time comparison to prevent timing attacks.
    
    Raises HTTPException with 401 status if key is invalid.
    """
    expected_key = os.getenv('AUTH_KEY', '')
    if not secrets.compare_digest(auth_key, expected_key):
        raise HTTPException(status_code=401, detail="Unauthorized")


def trigger_annotation_feature_stats_update(auth_key: str):
    """
    Update the features_statistics field of all the annotations
    """
    _validate_auth_key(auth_key)
    #queue both tasks
    update_feature_stats.delay()
    return {"message": "Update feature stats task triggered"}

def trigger_import_annotations(auth_key: str):
    """
    Import annotations and update db stats
    """
    _validate_auth_key(auth_key)
    import_annotations.delay()
    return {"message": "Import annotations task triggered"}

def trigger_update_stats(auth_key: str):
    """
    Update db stats
    """
    _validate_auth_key(auth_key)
    update_stats.delay()
    return {"message": "Update stats task triggered"}


def trigger_update_taxonomy(auth_key: str):
    """
    Update the taxonomy in the database
    """
    _validate_auth_key(auth_key)
    update_taxonomy.delay()
    return {"message": "Update taxonomy task triggered"}