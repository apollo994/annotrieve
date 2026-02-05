

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


def aggregate_by_taxon_pipeline(rank: str):
    return [
        # 1. lookup taxon info for each annotation
        {
            "$lookup": {
                "from": "taxon_node",
                "localField": "taxon_lineage",
                "foreignField": "taxid",
                "as": "taxons",
            }
        },
        {"$unwind": "$taxons"},
        {"$match": {"taxons.rank": rank}},

        # 2. group by taxon
        {
            "$group": {
                "_id": "$taxons.taxid",
                "taxon_name": {"$first": "$taxons.scientific_name"},
                "avg_coding_genes_count": {"$avg": "$features_statistics.gene_category_stats.coding.total_count"},
                "avg_non_coding_genes_count": {"$avg": "$features_statistics.gene_category_stats.non_coding.total_count"},
                "avg_pseudogenes_count": {"$avg": "$features_statistics.gene_category_stats.pseudogene.total_count"},
                "count": {"$sum": 1},
            }
        },

        # 3. round averages
        {
            "$project": {
                "_id": 1,
                "taxon_name": 1,
                "avg_coding_genes_count": {"$round": ["$avg_coding_genes_count", 2]},
                "avg_non_coding_genes_count": {"$round": ["$avg_non_coding_genes_count", 2]},
                "avg_pseudogenes_count": {"$round": ["$avg_pseudogenes_count", 2]},
                "count": 1,
            }
        },

        # 4. sort by name
        {"$sort": {"taxon_name": 1}},
    ]

    """
    Aggregate annotation gene-category counts by taxon at the given rank.
    Returns per-taxon: avg coding/non_coding/pseudogene counts (rounded to 2 decimals)
    and annotation count. Annotations without a value for a category are skipped
    for that category's average (not counted as 0).
    Run with GenomeAnnotation.objects.aggregate(...).
    """
    return [
        {
            "$lookup": {
                "from": "taxon_node",
                "let": {"lineage": "$taxon_lineage", "rank_filter": rank},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$in": ["$taxid", "$$lineage"]},
                                    {"$eq": ["$rank", "$$rank_filter"]},
                                ]
                            }
                        }
                    },
                    {"$limit": 1},
                ],
                "as": "taxon",
            }
        },
        {"$unwind": {"path": "$taxon", "preserveNullAndEmptyArrays": False}},
        {
            "$group": {
                "_id": "$taxon.taxid",
                "taxon_name": {"$first": "$taxon.scientific_name"},
                "avg_coding_genes_count": {
                    "$avg": {
                        "$cond": [
                            {
                                "$and": [
                                    {
                                        "$ne": [
                                            "$features_statistics.gene_category_stats.coding.total_count",
                                            None,
                                        ]
                                    },
                                    {
                                        "$ne": [
                                            {
                                                "$type": "$features_statistics.gene_category_stats.coding.total_count"
                                            },
                                            "missing",
                                        ],
                                    },
                                ]
                            },
                            "$features_statistics.gene_category_stats.coding.total_count",
                            None,
                        ]
                    }
                },
                "avg_non_coding_genes_count": {
                    "$avg": {
                        "$cond": [
                            {
                                "$and": [
                                    {
                                        "$ne": [
                                            "$features_statistics.gene_category_stats.non_coding.total_count",
                                            None,
                                        ]
                                    },
                                    {
                                        "$ne": [
                                            {
                                                "$type": "$features_statistics.gene_category_stats.non_coding.total_count"
                                            },
                                            "missing",
                                        ],
                                    },
                                ]
                            },
                            "$features_statistics.gene_category_stats.non_coding.total_count",
                            None,
                        ]
                    }
                },
                "avg_pseudogenes_count": {
                    "$avg": {
                        "$cond": [
                            {
                                "$and": [
                                    {
                                        "$ne": [
                                            "$features_statistics.gene_category_stats.pseudogene.total_count",
                                            None,
                                        ]
                                    },
                                    {
                                        "$ne": [
                                            {
                                                "$type": "$features_statistics.gene_category_stats.pseudogene.total_count"
                                            },
                                            "missing",
                                        ],
                                    },
                                ]
                            },
                            "$features_statistics.gene_category_stats.pseudogene.total_count",
                            None,
                        ]
                    }
                },
                "count": {"$sum": 1},
            }
        },
        {
            "$project": {
                "_id": 1,
                "taxon_name": 1,
                "avg_coding_genes_count": {"$round": ["$avg_coding_genes_count", 2]},
                "avg_non_coding_genes_count": {"$round": ["$avg_non_coding_genes_count", 2]},
                "avg_pseudogenes_count": {"$round": ["$avg_pseudogenes_count", 2]},
                "count": 1,
            }
        },
        {"$sort": {"taxon_name": 1}},
    ]