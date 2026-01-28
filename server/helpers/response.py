from fastapi import HTTPException

def json_response_with_pagination(items, count, offset, limit):
    """Format response as JSON with pagination."""
    #force offset and limit to be int
    try:
        offset = int(offset)
        limit = int(limit)
    except:
        offset = 0
        limit = 20
    if limit == 0:
        limit = 20 # back to default limit
    elif limit > 1000:
        raise HTTPException(status_code=400, detail="Limit must be less or equal to 1000")
    
    paginated_items = items.skip(offset).limit(limit).exclude('id').as_pymongo()
    return {
        'total': count,
        'offset': offset,
        'limit': limit,
        'results': list(paginated_items)
    }
