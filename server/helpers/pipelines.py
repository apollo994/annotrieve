

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