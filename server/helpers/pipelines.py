

def gene_category_stats_summary_pipeline(db_key: str):
    return  [
                {
                    "$match": {
                        f"features_statistics.gene_category_stats.{db_key}": {"$exists": True, "$ne": None}
                    }
                },
                {
                    "$project": {
                        "annotation_id": "$annotation_id",
                        "total_count": f"$features_statistics.gene_category_stats.{db_key}.total_count",
                        "mean_length": f"$features_statistics.gene_category_stats.{db_key}.length_stats.mean"
                    }
                }
            ]

def gene_category_details_pipeline(db_key: str):
    return [
                {
                    "$match": {
                        f"features_statistics.gene_category_stats.{db_key}": {"$exists": True, "$ne": None}
                    }
                },
                {
                    "$limit": 1
                }
            ]

def gene_category_values_pipeline(db_category: str):
    return [
        {
            "$match": {
                f"features_statistics.gene_category_stats.{db_category}": {"$exists": True, "$ne": None}
            }
        },
        {
            "$project": {
                "annotation_id": "$annotation_id",
                "category_data": f"$features_statistics.gene_category_stats.{db_category}"
            }
        }
    ]

def gene_category_metric_values_pipeline(field_path: str):

    return [
        {
            "$match": {
                field_path: {"$exists": True, "$ne": None}
            }
        },
        {
            "$project": {
                "annotation_id": "$annotation_id",
                "value": f"${field_path}",
                "is_empty": {
                    "$or": [
                        {"$eq": [{"$ifNull": [f"${field_path}", None]}, None]},
                        {"$eq": [{"$type": f"${field_path}"}, "missing"]}
                    ]
                }
            }
        },
        {
            "$facet": {
                "values": [
                    {
                        "$match": {
                            "is_empty": False
                        }
                    },
                    {
                        "$sort": {"annotation_id": 1}
                    },
                    {
                        "$project": {
                            "_id": 0,
                            "annotation_id": 1,
                            "value": 1
                        }
                    }
                ],
                "empty_annotations": [
                    {
                        "$match": {
                            "is_empty": True
                        }
                    },
                    {
                        "$sort": {"annotation_id": 1}
                    },
                    {
                        "$project": {
                            "_id": 0,
                            "annotation_id": 1
                        }
                    }
                ]
            }
        }
    ]


def transcript_stats_summary_pipeline():
    return [
        {
            "$match": {
                "features_statistics.transcript_type_stats": {"$exists": True, "$ne": None}
            }
        },
        {
            "$project": {
                "transcript_types": {"$objectToArray": "$features_statistics.transcript_type_stats"}
            }
        },
        {
            "$unwind": "$transcript_types"
        },
        {
            "$group": {
                "_id": "$transcript_types.k",
                "annotations": {"$addToSet": "$_id"},  # Track unique annotations
                "total_counts": {"$push": "$transcript_types.v.total_count"},
                "mean_lengths": {"$push": "$transcript_types.v.length_stats.mean"},
                "has_cds_stats": {
                    "$max": {
                        "$cond": [
                            {"$ifNull": ["$transcript_types.v.cds_stats", False]},
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            "$project": {
                "type": "$_id",
                "annotations_count": {"$size": "$annotations"},
                "total_count_sum": {
                    "$reduce": {
                        "input": "$total_counts",
                        "initialValue": 0,
                        "in": {"$add": ["$$value", {"$ifNull": ["$$this", 0]}]}
                    }
                },
                "mean_length_sum": {
                    "$reduce": {
                        "input": "$mean_lengths",
                        "initialValue": 0,
                        "in": {"$add": ["$$value", {"$ifNull": ["$$this", 0]}]}
                    }
                },
                "mean_length_count": {
                    "$size": {
                        "$filter": {
                            "input": "$mean_lengths",
                            "as": "ml",
                            "cond": {"$ne": ["$$ml", None]}
                        }
                    }
                },
                "has_cds_stats": {"$eq": ["$has_cds_stats", 1]}
            }
        },
        {
            "$sort": {"type": 1}
        }
    ]


def transcript_type_details_pipeline(transcript_type: str):
    return [
        {
            "$match": {
                f"features_statistics.transcript_type_stats.{transcript_type}": {"$exists": True, "$ne": None}
            }
        },
        {
            "$limit": 1
        }
    ]

def transcript_type_details_values_pipeline(transcript_type: str):
    return [
        {
            "$match": {
                f"features_statistics.transcript_type_stats.{transcript_type}": {"$exists": True, "$ne": None}
            }
        },
        {
            "$project": {
                "annotation_id": "$annotation_id",
                "type_data": f"$features_statistics.transcript_type_stats.{transcript_type}"
            }
        }
    ]

def transcript_type_metric_values_pipeline(field_path: str):
    return [
        {
            "$match": {
                field_path: {"$exists": True, "$ne": None}
            }
        },
        {
            "$project": {
                "annotation_id": "$annotation_id",
                "value": f"${field_path}",
                "is_empty": {
                    "$or": [
                        {"$eq": [{"$ifNull": [f"${field_path}", None]}, None]},
                        {"$eq": [{"$type": f"${field_path}"}, "missing"]}
                    ]
                }
            }
        },
        {
            "$facet": {
                "values": [
                    {
                        "$match": {
                            "is_empty": False
                        }
                    },
                    {
                        "$sort": {"annotation_id": 1}
                    },
                    {
                        "$project": {
                            "_id": 0,
                            "annotation_id": 1,
                            "value": 1
                        }
                    }
                ],
                "empty_annotations": [
                    {
                        "$match": {
                            "is_empty": True
                        }
                    },
                    {
                        "$sort": {"annotation_id": 1}
                    },
                    {
                        "$project": {
                            "_id": 0,
                            "annotation_id": 1
                        }
                    }
                ]
            }
        }
    ]



# Collection names for $lookup (MongoEngine default snake_case)
GENOME_ANNOTATION_COLLECTION = "genome_annotation"


def aggregate_by_taxon_pipeline(rank: str):
    """
    Aggregate annotation gene-category counts by taxon at the given rank.
    Returns per-taxon: avg coding/non_coding/pseudogene counts and annotation count.

    Optimized for scale: runs on taxon_node (e.g. ~8k docs at rank "class") and does
    one $lookup per taxon into genome_annotation (indexed by taxon_lineage), instead
    of one lookup per annotation (~14k). Run with TaxonNode.objects.aggregate(...).
    """
    return [
        {"$match": {"rank": rank}},
        {
            "$lookup": {
                "from": GENOME_ANNOTATION_COLLECTION,
                "let": {"taxid": "$taxid"},
                "pipeline": [
                    {"$match": {"$expr": {"$in": ["$$taxid", "$taxon_lineage"]}}},
                    {
                        "$project": {
                            "_id": 0,
                            "coding": "$features_statistics.gene_category_stats.coding.total_count",
                            "non_coding": "$features_statistics.gene_category_stats.non_coding.total_count",
                            "pseudogene": "$features_statistics.gene_category_stats.pseudogene.total_count",
                        }
                    },
                ],
                "as": "annotations",
            }
        },
        {
            "$addFields": {
                "count": {"$size": "$annotations"},
                "avg_coding_genes_count": {
                    "$round": [
                        {
                            "$avg": {
                                "$map": {
                                    "input": {
                                        "$filter": {
                                            "input": "$annotations",
                                            "as": "a",
                                            "cond": {
                                                "$and": [
                                                    {"$ne": ["$$a.coding", None]},
                                                    {"$ne": [{"$type": "$$a.coding"}, "missing"]},
                                                ]
                                            },
                                        }
                                    },
                                    "as": "b",
                                    "in": "$$b.coding",
                                }
                            }
                        },
                        2,
                    ]
                },
                "avg_non_coding_genes_count": {
                    "$round": [
                        {
                            "$avg": {
                                "$map": {
                                    "input": {
                                        "$filter": {
                                            "input": "$annotations",
                                            "as": "a",
                                            "cond": {
                                                "$and": [
                                                    {"$ne": ["$$a.non_coding", None]},
                                                    {"$ne": [{"$type": "$$a.non_coding"}, "missing"]},
                                                ]
                                            },
                                        }
                                    },
                                    "as": "b",
                                    "in": "$$b.non_coding",
                                }
                            }
                        },
                        2,
                    ]
                },
                "avg_pseudogenes_count": {
                    "$round": [
                        {
                            "$avg": {
                                "$map": {
                                    "input": {
                                        "$filter": {
                                            "input": "$annotations",
                                            "as": "a",
                                            "cond": {
                                                "$and": [
                                                    {"$ne": ["$$a.pseudogene", None]},
                                                    {"$ne": [{"$type": "$$a.pseudogene"}, "missing"]},
                                                ]
                                            },
                                        }
                                    },
                                    "as": "b",
                                    "in": "$$b.pseudogene",
                                }
                            }
                        },
                        2,
                    ]
                },
            }
        },
        {
            "$project": {
                "_id": "$taxid",
                "taxon_name": "$scientific_name",
                "avg_coding_genes_count": 1,
                "avg_non_coding_genes_count": 1,
                "avg_pseudogenes_count": 1,
                "count": 1,
            }
        },
        {"$match": {"count": {"$gt": 0}}},
        {"$sort": {"taxon_name": 1}},
    ]