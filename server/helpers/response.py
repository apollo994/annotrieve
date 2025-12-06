
def json_response_with_pagination(items, count, offset, limit):
    """Format response as JSON with pagination."""
    #force offset and limit to be int
    try:
        offset = int(offset)
        limit = int(limit)
    except:
        offset = 0
        limit = 20
    paginated_items = items.skip(offset).limit(limit).exclude('id').as_pymongo()
    return {
        'total': count,
        'offset': offset,
        'limit': limit,
        'results': list(paginated_items)
    }

