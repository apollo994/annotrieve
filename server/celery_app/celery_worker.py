from .celery_utils import create_celery
from db.database import connect_to_db
from jobs.import_annotations import import_annotations
from jobs.updates import update_assembly_fields, update_annotation_fields, update_feature_stats, update_bioprojects, update_stats, update_taxonomy, update_assemblies_from_ncbi
from jobs.track_users import track_unique_users_by_country

app = create_celery()

connect_to_db()
