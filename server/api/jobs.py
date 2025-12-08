from fastapi import APIRouter, Header
from services import jobs_service

router = APIRouter()

@router.post("/jobs/import/annotations")
async def trigger_import_annotations(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger import annotations job
    
    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_import_annotations(x_auth_key)

@router.post("/jobs/update/stats")
async def trigger_update_stats(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update stats job
    
    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_stats(x_auth_key)

@router.post("/jobs/update/annotations/feature-stats")
async def trigger_update_annotations_feature_stats(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update annotations feature stats job
    
    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_annotation_feature_stats_update(x_auth_key)


@router.post("/jobs/update/taxonomy")
async def trigger_update_taxonomy(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update taxonomy job
    This is done by fetching the ENA/EBI taxonomy and updating the database with the new taxonomy and lineages
    
    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_taxonomy(x_auth_key)