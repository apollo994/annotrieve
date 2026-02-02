from typing import Optional
from db.models import TaxonNode
from helpers import response as response_helper, query_visitors as query_visitors_helper
from fastapi import HTTPException

def get_taxon_nodes(filter: str = None, rank: str = None, offset: int = 0, limit: int = 20, taxids: Optional[str] = None, sort_by: str = None, sort_order: str = 'desc'):
    query=dict()
    if rank:
        query['rank'] = rank
    if taxids:
        query['taxid__in'] = taxids.split(',') if isinstance(taxids, str) else taxids
    taxon_nodes = TaxonNode.objects(**query) if query else TaxonNode.objects()
    if filter:
        q_filter = query_visitors_helper.taxon_query(filter) if filter else None
        taxon_nodes = taxon_nodes.filter(q_filter)
    if sort_by:
        sort = '-' + sort_by if sort_order == 'desc' else sort_by
        taxon_nodes = taxon_nodes.order_by(sort)
    taxon_nodes = taxon_nodes.exclude('id').skip(offset).limit(limit).as_pymongo()
    return response_helper.json_response_with_pagination(taxon_nodes, taxon_nodes.count(), offset, limit)

def get_rank_frequencies():
    ranks = TaxonNode.objects().item_frequencies('rank')
    return ranks

def get_taxon_node(taxid: str):
    taxon_node = TaxonNode.objects(taxid=taxid).exclude('id').first()
    if not taxon_node:
        raise HTTPException(status_code=404, detail=f"Taxon node {taxid} not found")
    return taxon_node

def get_taxon_node_children(taxid: str):
    taxon_node = get_taxon_node(taxid)
    children = TaxonNode.objects(taxid__in=taxon_node['children']).exclude('id').as_pymongo()
    return response_helper.json_response_with_pagination(children, children.count(), 0, len(children))

def get_ancestors(taxid: str):
    taxon = get_taxon_node(taxid)
    ancestors = [taxon.to_mongo().to_dict()]
    parent = TaxonNode.objects(children=taxid).exclude('id').first()
    while parent:
        ancestors.append(parent.to_mongo().to_dict())
        parent = TaxonNode.objects(children=parent.taxid).exclude('id').first()
    ancestors.reverse()
    return {
        "results": ancestors,
        "total": len(ancestors)
    }

def get_flattened_tree():

    taxon_coll = TaxonNode._get_collection()

    parent_by_child = {}
    #skip cellular organism we use Eukaryota as root
    for doc in taxon_coll.find({"taxid": {"$ne": "131567"}}, {"taxid": 1, "children": 1}):
        parent_taxid = doc["taxid"]
        for child_taxid in doc.get("children", []):
            parent_by_child[child_taxid] = parent_taxid

    rows = []
    projection = {
        "taxid": 1,
        "scientific_name": 1,
        "annotations_count": 1,
        "assemblies_count": 1,
        "organisms_count": 1,
        "_id": 0
    }
    for doc in taxon_coll.find({"taxid": {"$ne": "131567"}}, projection):
        taxid = doc["taxid"]
        rows.append([
            taxid,
            parent_by_child.get(taxid),  # None if root
            doc.get("scientific_name"),
            doc.get("annotations_count", 0),
            doc.get("assemblies_count", 0),
            doc.get("organisms_count", 0)
        ])

    return {
        "fields": [
            "taxid",
            "parent_taxid",
            "scientific_name",
            "annotations_count",
            "assemblies_count",
            "organisms_count"
        ],
        "rows": rows
    }
