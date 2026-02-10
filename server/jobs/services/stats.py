from db.models import GenomeAssembly, GenomeAnnotation, Organism, TaxonNode, BioProject
from db.embedded_documents import DistributionStats, TaxonAnnotationStats, TaxonGeneStats, TaxonGeneCategoryStats
import math
from typing import List
from collections import defaultdict
from .utils import create_batches

def update_assemblies_counts():
    """
    Update the assemblies counts for the assemblies
    """
    counts = defaultdict(int)

    pipeline = [
        {"$group": {"_id": "$assembly_accession", "count": {"$sum": 1}}}
    ]

    for row in GenomeAnnotation.objects.aggregate(*pipeline):
        counts[row["_id"]] = row["count"]

    for assembly in GenomeAssembly.objects():
        assembly.modify(
            annotations_count=counts.get(assembly.assembly_accession, 0)
        )

    orphan_qs = GenomeAssembly.objects(annotations_count=0)
    orphan_qs_count = orphan_qs.count()
    if orphan_qs_count > 0:
        print(f"Found {orphan_qs_count} orphan assemblies, deleting them")
        orphan_qs.delete()
    print("Assemblies counts updated")

def update_organisms_counts():
    """
    Update the organisms counts for the organisms
    """
    assembly_counts = defaultdict(int)
    annotation_counts = defaultdict(int)
    pipeline = [
        {"$group": {"_id": "$taxid", "count": {"$sum": 1}}}
    ]

    for row in GenomeAssembly.objects.aggregate(*pipeline):
        assembly_counts[row["_id"]] = row["count"]

    for row in GenomeAnnotation.objects.aggregate(*pipeline):
        annotation_counts[row["_id"]] = row["count"]

    for organism in Organism.objects():
        organism.modify(
            annotations_count=annotation_counts.get(organism.taxid, 0),
            assemblies_count=assembly_counts.get(organism.taxid, 0),
        )

    orphan_qs = Organism.objects(annotations_count=0)
    orphan_qs_count = orphan_qs.count()
    if orphan_qs_count > 0:
        print(f"Found {orphan_qs_count} orphan organisms, deleting them")
        orphan_qs.delete()
    print("Organisms counts updated")

def update_taxon_nodes_counts():
    """
    Update the taxon nodes counts for the taxon nodes
    """
    print("Updating taxon nodes stats")
    annotation_counts = defaultdict(int)
    assembly_counts = defaultdict(int)
    organism_counts = defaultdict(int)
    pipeline = [
        {"$unwind": "$taxon_lineage"},
        {"$group": {"_id": "$taxon_lineage", "count": {"$sum": 1}}}
    ]
    for row in GenomeAnnotation.objects.aggregate(*pipeline):
        annotation_counts[row["_id"]] = row["count"]
    for row in GenomeAssembly.objects.aggregate(*pipeline):
        assembly_counts[row["_id"]] = row["count"]
    for row in Organism.objects.aggregate(*pipeline):
        organism_counts[row["_id"]] = row["count"]
    # Update taxon nodes in batches to avoid loading all into memory
    batch_size = 1000
    taxon_taxids = list(TaxonNode.objects().scalar('taxid'))
    for batch_taxids in create_batches(taxon_taxids, batch_size):
        taxon_nodes_batch = TaxonNode.objects(taxid__in=batch_taxids)
        for taxon_node in taxon_nodes_batch:
            taxon_node.modify(
                annotations_count=annotation_counts.get(taxon_node.taxid, 0),
                assemblies_count=assembly_counts.get(taxon_node.taxid, 0),
                organisms_count=organism_counts.get(taxon_node.taxid, 0)
            )
    #delete taxon nodes without annotations and update children
    taxon_nodes_to_delete = TaxonNode.objects(annotations_count=0)
    taxons_to_delete_count = taxon_nodes_to_delete.count()
    if taxons_to_delete_count > 0:
        print(f"Found {taxons_to_delete_count} taxon nodes without annotations, deleting them")
        taxids_to_delete = list(taxon_nodes_to_delete.scalar("taxid"))
        #delete taxon nodes and then update parents to remove deleted taxids from their children lists
        taxon_nodes_to_delete.delete()
        # Update all parent taxons that have any of the deleted taxids in their children list
        # pull_all__children removes all matching values from the children array
        TaxonNode.objects(children__in=taxids_to_delete).update(
            pull_all__children=taxids_to_delete
        )
    print("Taxon nodes counts updated")

def update_bioprojects_counts():
    """
    Update the bioprojects counts for the bioprojects
    """
    assembly_counts = defaultdict(int)
    pipeline = [
        {"$unwind": "$bioprojects"},
        {"$group": {"_id": "$bioprojects", "count": {"$sum": 1}}}
    ]
    for row in GenomeAssembly.objects.aggregate(*pipeline):
        assembly_counts[row["_id"]] = row["count"]
    for bioproject in BioProject.objects():
        bioproject.modify(
            assemblies_count=assembly_counts.get(bioproject.accession, 0),
        )
    orphan_bioprojects = BioProject.objects(assemblies_count=0)
    orphan_bioprojects_count = orphan_bioprojects.count()
    if orphan_bioprojects_count > 0:
        print(f"Found {orphan_bioprojects_count} orphan bioprojects, deleting them")
        orphan_bioprojects.delete()
    print("Bioprojects counts updated")

def update_db_stats():
    """
    update all the db stats, #slow operation but safe
    """
    print("Updating db stats")
    #ASSEMBLIES
    update_assemblies_counts()
    
    #ORGANISMS
    update_organisms_counts()

    #TAXON NODES
    update_taxon_nodes_counts()

    #BIOPROJECTS
    update_bioprojects_counts()
    
    print("DB stats updated")

def compute_distribution_stats(values: List[int]) -> DistributionStats:
    n = len(values)
    if n == 0:
        return DistributionStats(mean=0, median=0, std=0, min=0, max=0, n=0)

    # mean
    mean = round(sum(values) / n, 2)

    # median
    sorted_vals = sorted(values)
    if n % 2 == 1:
        median = round(sorted_vals[n // 2], 2)
    else:
        median = round((sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2, 2)

    # population standard deviation
    variance = sum((x - mean) ** 2 for x in values) / n
    std = round(math.sqrt(variance), 2)

    return DistributionStats(
        mean=mean,
        median=median,
        std=std,
        min=min(values),
        max=max(values),
        n=n,
    )

def update_taxon_gene_stats():
    """
    Update the taxon gene stats for the taxon nodes.
    Uses MongoDB aggregation to efficiently collect all gene stats in a single pass.
    """
    print("Updating taxon gene stats")
    
    # Use aggregation to collect all gene category counts grouped by taxid
    # This avoids O(n) queries where n is the number of taxons
    taxon_counts = defaultdict(lambda: {"coding": [], "non_coding": [], "pseudogene": []})
    
    # Aggregation pipeline to unwind taxon_lineage and extract gene_category_stats
    pipeline = [
        {"$match": {
            "taxon_lineage": {"$ne": [], "$exists": True},
            "features_statistics.gene_category_stats": {"$exists": True}
        }},
        {"$unwind": "$taxon_lineage"},
        {"$project": {
            "taxid": "$taxon_lineage",
            "gene_category_stats": "$features_statistics.gene_category_stats"
        }},
        {"$match": {"gene_category_stats": {"$ne": None}}}
    ]
    
    # Process annotations and collect counts by taxid
    for doc in GenomeAnnotation.objects.aggregate(*pipeline):
        taxid = doc.get("taxid")
        gene_stats = doc.get("gene_category_stats")
        
        if not taxid or not gene_stats:
            continue
        
        # Extract total_count for each category
        for category in ['coding', 'non_coding', 'pseudogene']:
            category_stats = gene_stats.get(category)
            if category_stats and category_stats.get('total_count'):
                taxon_counts[taxid][category].append(category_stats['total_count'])
    
    # Update taxon nodes in batches
    batch_size = 1000
    
    # Also get all taxon taxids that might not have any annotations
    all_taxon_taxids = set(TaxonNode.objects().scalar('taxid'))
    
    for batch_taxids in create_batches(list(all_taxon_taxids), batch_size):
        taxon_nodes_batch = TaxonNode.objects(taxid__in=batch_taxids)
        for taxon in taxon_nodes_batch:
            counts = taxon_counts.get(taxon.taxid, {"coding": [], "non_coding": [], "pseudogene": []})
            
            coding = TaxonGeneCategoryStats(count=compute_distribution_stats(counts.get("coding", [])))
            non_coding = TaxonGeneCategoryStats(count=compute_distribution_stats(counts.get("non_coding", [])))
            pseudogene = TaxonGeneCategoryStats(count=compute_distribution_stats(counts.get("pseudogene", [])))
            
            taxon.modify(stats=TaxonAnnotationStats(
                genes=TaxonGeneStats(coding=coding, non_coding=non_coding, pseudogene=pseudogene)
            ))

    print("Taxon gene stats updated")