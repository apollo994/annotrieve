from fastapi import HTTPException
import os
from jobs.import_annotations import import_annotations
from jobs.updates import update_feature_stats, update_stats, update_taxonomy



def trigger_annotation_feature_stats_update(auth_key: str):
    """

    update the features_statistics field of all the annotations
    """
    if auth_key != os.getenv('AUTH_KEY'):
        raise HTTPException(status_code=401, detail="Unauthorized")
    #queue both tasks
    update_feature_stats.delay()
    return {"message": "Update feature stats task triggered"}

def trigger_import_annotations(auth_key: str):
    """
    import annotations and update db stats
    """
    if auth_key != os.getenv('AUTH_KEY'):
        raise HTTPException(status_code=401, detail="Unauthorized")
    import_annotations.delay()
    return {"message": "Import annotations task triggered"}

def trigger_update_stats(auth_key: str):
    """
    update db stats

    """
    if auth_key != os.getenv('AUTH_KEY'):
        raise HTTPException(status_code=401, detail="Unauthorized")
    update_stats.delay()
    return {"message": "Update stats task triggered"}


def trigger_update_taxonomy(auth_key: str):
    """
    update the taxonomy in the database
    """
    if auth_key != os.getenv('AUTH_KEY'):
        raise HTTPException(status_code=401, detail="Unauthorized")
    update_taxonomy.delay()
    return {"message": "Update taxonomy task triggered"}