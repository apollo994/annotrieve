from celery.schedules import crontab

# Celery Beat Schedule
# Timezone is set to 'Europe/Madrid' in celery_utils.py
beat_schedule = {
     'import-annotations-daily': {
        'task': 'import_annotations',  # Task name as defined in @shared_task decorator
        'schedule': crontab(day_of_week=6, hour=0, minute=0),  # Every Saturday at midnight
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
    'update_assemblies_from_ncbi': {
        'task': 'update_taxonomy',  # Task name as defined in @shared_task decorator
        'schedule': crontab(day_of_week=1, hour=0, minute=0),  # Every Monday at 00:00
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
    'track-unique-users-by-country-daily': {
        'task': 'track_unique_users_by_country',  # Task name as defined in @shared_task decorator
        'schedule': crontab(hour=0, minute=0),  # Every day at midnight
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
    'update-assemblies-from-ncbi-monthly': {
        'task': 'update_assemblies_from_ncbi',  # Task name as defined in @shared_task decorator
        'schedule': crontab(day_of_month=1, hour=0, minute=0),  # Every first day of the month at 00:00
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    }
} 