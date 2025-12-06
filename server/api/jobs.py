from fastapi import APIRouter
from services import jobs_service

router = APIRouter()

@router.get("/jobs/import/annotations/{auth_key}")
async def trigger_import_annotations(auth_key: str):
    """
    Trigger import annotations job
    """
    return jobs_service.trigger_import_annotations(auth_key)

@router.get("/jobs/update/stats/{auth_key}")
async def trigger_update_stats(auth_key: str):
    """
    Trigger update stats job
    """
    return jobs_service.trigger_update_stats(auth_key)

@router.get("/jobs/update/annotations/feature-stats/{auth_key}")
async def trigger_update_annotations_feature_stats(auth_key: str):
    """
    Trigger update annotations feature stats job
    """
    return jobs_service.trigger_annotation_feature_stats_update(auth_key)


@router.get("/jobs/update/taxonomy/{auth_key}")
async def trigger_update_taxonomy(auth_key: str):
    """
    Trigger update taxonomy job
    This is done by fetching the ENA/EBI taxonomy and updating the database with the new taxonomy and lineages
    """
    return jobs_service.trigger_update_taxonomy(auth_key)