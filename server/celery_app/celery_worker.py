from .celery_utils import create_celery
from db.database import connect_to_db
from jobs.import_annotations import import_annotations
from jobs.updates import update_taxon_stats, update_records
from jobs.track_users import track_unique_users_by_country

app = create_celery()

connect_to_db()
