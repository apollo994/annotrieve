from job import retrieve_annotations
from werkzeug.exceptions import NotFound, BadRequest,Unauthorized
from celery.result import AsyncResult
import os

USER = os.getenv('USER')
PWD = os.getenv('PWD')

def launch_matrix_job(request):
    data = request.json if request.is_json else request.form
    check_credentials(data)
    task = retrieve_annotations.get_annotations.delay()
    return dict(id=task.id, state=task.state )

def check_credentials(data):
    fields = ['username', 'password']
    missing_fields = [field for field in fields if field not in data]
    if missing_fields:
        raise BadRequest(description=f"Missing required files: {', '.join(missing_fields)}")

    user = data.get('username')
    pwd = data.get('password')
    if user != USER or pwd != PWD:
        raise Unauthorized(description=f"Bad username or password")
    
def get_task_status(task_id):
    task = AsyncResult(task_id)
    if task.result:
        return dict(messages=task.result['messages'], state=task.state )
    raise NotFound(description=f'{task_id} not found')