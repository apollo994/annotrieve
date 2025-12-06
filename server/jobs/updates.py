from celery import shared_task
from db.models import GenomeAssembly, GenomeAnnotation, AnnotationSequenceMap, BioProject, GFFStats, Organism, TaxonNode
from clients import ncbi_datasets as ncbi_datasets_client
import os
from .services import assembly as assembly_service
from .services.utils import create_batches
from .services import stats as stats_service
from .services import feature_stats as feature_stats_service
from helpers import file as file_helper
from .services import taxonomy as taxonomy_service


TMP_DIR = "/tmp"

ANNOTATIONS_PATH = os.getenv('LOCAL_ANNOTATIONS_DIR')


@shared_task(name='update_stats', ignore_result=False)
def update_stats():
    """
    Update the stats for the assemblies and annotations
    """
    stats_service.update_db_stats()


@shared_task(name='update_assembly_fields', ignore_result=False)
def update_assembly_fields():
    """
    Update the fields for the assemblies
    """
    pass


@shared_task(name='update_feature_stats', ignore_result=False)
def update_feature_stats():
    """
    Update the feature stats for all the annotations
    """
    annotations = GenomeAnnotation.objects()
    for annotation in annotations:
        if annotation.features_statistics:
            feat_stats = annotation.features_statistics
            gene_category_stats = feat_stats.gene_category_stats if feat_stats.gene_category_stats else {}
            transcript_type_stats = feat_stats.transcript_type_stats if feat_stats.transcript_type_stats else {}
            #remove old fields for backwards compatibility by directly modifying the document
            annotation.modify(features_statistics=GFFStats(gene_category_stats=gene_category_stats, transcript_type_stats=transcript_type_stats))
        else:
        #get full bgzipped path from the indexed file info
            bgzipped_path = file_helper.get_annotation_file_path(annotation)
            feature_stats = feature_stats_service.compute_features_statistics(bgzipped_path)
            annotation.modify(features_statistics=feature_stats)

@shared_task(name='update_bioprojects', ignore_result=False)
def update_bioprojects():
    """
    Import the bioprojects and update assemblies and annotations
    """
    accessions = GenomeAssembly.objects().scalar('assembly_accession')
    batches = create_batches(accessions, 5000)
    files_to_delete = []
    all_bp_accessions = set()
    bioprojects_to_save = dict() #accession: BioProject to ensure we don't save the same bioproject multiple times
    assembly_to_bp_accessions = dict() #assembly_accession: list[bioproject_accessions]
    for idx, accessions_batch in enumerate(batches):
        assemblies_path = os.path.join(TMP_DIR, f'assemblies_to_update_{idx}_{len(accessions_batch)}.txt')
        files_to_delete.append(assemblies_path)
        with open(assemblies_path, 'w') as f:
            for accession in accessions_batch: 
                f.write(accession + '\n')
        cmd = ['genome', 'accession', '--inputfile', assemblies_path]
        ncbi_report = ncbi_datasets_client.get_data_from_ncbi(cmd)
        report = ncbi_report.get('reports', [])    
        if not report:
            print(f"No report found for {assemblies_path}")
        for assembly in report:
            assembly_accession = assembly.get('accession')
            bioproject_accessions = assembly_service.parse_bioprojects(assembly.get('assembly_info', {}), bioprojects_to_save)
            assembly_to_bp_accessions[assembly_accession] = bioproject_accessions
            all_bp_accessions.update(bioproject_accessions)
    
    #filter out existing bioprojects
    existing_bioprojects = BioProject.objects(accession__in=list(all_bp_accessions)).scalar('accession')
    new_bioprojects = all_bp_accessions - set(existing_bioprojects)
    bioprojects_to_save = {accession: bioproject for accession, bioproject in bioprojects_to_save.items() if accession in new_bioprojects}
    #insert the bioprojects to the database
    if not new_bioprojects:
        print("No new bioprojects to insert")
        return
    try:
        BioProject.objects.insert(list(bioprojects_to_save.values()))
        for assembly_accession, bioproject_accessions in assembly_to_bp_accessions.items():
            GenomeAssembly.objects(assembly_accession=assembly_accession).update(bioprojects=bioproject_accessions)
        print(f"Updated {len(assembly_to_bp_accessions)} assemblies with new bioprojects")

        #update bp counts 

        for bp in BioProject.objects():
            bp.modify(assemblies_count=GenomeAssembly.objects(bioprojects__in=[bp.accession]).count())
    
    #update Bioprojects counts
    except Exception as e:
        print(f"Error inserting bioprojects: {e}")
        raise e
    finally:
        #delete the tmp files
        for file_to_delete in files_to_delete:
            os.remove(file_to_delete)
        print("Updated bioprojects")


@shared_task(name='update_annotation_fields', ignore_result=False)
def update_annotation_fields():
    """
    Update the fields for the annotations
    """
    annotations = GenomeAnnotation.objects()
    for annotation in annotations:
        mapped_regions = AnnotationSequenceMap.objects(annotation_id=annotation.annotation_id).scalar('sequence_id')
        if not mapped_regions:
            continue
        annotation.modify(mapped_regions=mapped_regions)



@shared_task(name='ensure_indexes', ignore_result=False)
def ensure_indexes():
    """
    Ensure the indexes are created
    """
    for doc in [GenomeAnnotation, GenomeAssembly]:
        doc.ensure_indexes()

@shared_task(name='check_orphan_files', ignore_result=False)
def check_orphan_files():
    """
    Scan the annotations directory and clean up potentially orphaned files:
    Dir structure is the following:
    - <taxid>
      - <assembly_accession>
        - <annotation_id>.gff.gz
        - <annotation_id>.gff.gz.csi
    
    """
    orphan_files = []
    files_to_verify = []
    for taxid in os.listdir(ANNOTATIONS_PATH):
        if not os.path.isdir(os.path.join(ANNOTATIONS_PATH, taxid)):
            continue
        for assembly_accession in os.listdir(os.path.join(ANNOTATIONS_PATH, taxid)):
            if not os.path.isdir(os.path.join(ANNOTATIONS_PATH, taxid, assembly_accession)):
                continue
            for file in os.listdir(os.path.join(ANNOTATIONS_PATH, taxid, assembly_accession)):
                if file.endswith(".gff.gz"):
                    bgzipped_path = f"/{taxid}/{assembly_accession}/{file}"
                    files_to_verify.append(bgzipped_path)
    #check if the related annotation exists in the database (batches of 1k)
    batches = create_batches(files_to_verify, 1000)
    for batch in batches:
        annotations = GenomeAnnotation.objects(indexed_file_info__bgzipped_path__in=batch).scalar('indexed_file_info__bgzipped_path')
        for annotation in annotations:
            if annotation.indexed_file_info.bgzipped_path not in batch:
                orphan_files.append(annotation.indexed_file_info.bgzipped_path)
    
    
    
    print(f"Found {len(orphan_files)} orphan files")
    return orphan_files


@shared_task(name='update_taxonomy', ignore_result=False)
def update_taxonomy():
    """
    Periodically update the taxonomy in the database mirroring the ENA taxonomy
    This is done by fetching the ENA/EBI taxonomy and updating the database with the new taxonomy and lineages
    """
    organisms_taxids = Organism.objects().scalar('taxid')
    organisms_to_process = taxonomy_service.fetch_new_organisms(list(organisms_taxids), TMP_DIR, 5000)
    
    for organism in organisms_to_process:
        #update lineage, scientific name and common name
        taxon_lineage = organism.taxon_lineage
        if not taxon_lineage:
            #skip those without a lineage, potentially malformed organisms
            continue
        #update organisms in the db
        old_organism = Organism.objects(taxid=organism.taxon_id).first()
        name_changed = old_organism.organism_name != organism.organism_name
        old_organism.modify(taxon_lineage=taxon_lineage, organism_name=organism.organism_name, common_name=organism.common_name)
        
        #update name in related assemblies and annotations
        update_payload = dict(taxon_lineage=taxon_lineage)
        if name_changed:
            update_payload['organism_name'] = organism.organism_name
        GenomeAssembly.objects(taxid=organism.taxon_id).update(**update_payload)
        GenomeAnnotation.objects(taxid=organism.taxon_id).update(**update_payload)

        #check if all the taxons already exists in the db and save the new ones
        existing_taxons = TaxonNode.objects(taxid__in=taxon_lineage)
        new_taxons = set(taxon_lineage) - set(existing_taxons.scalar('taxid'))
        if new_taxons:
            taxons_to_save = [taxon for taxon in organism.parsed_taxon_lineage if taxon.taxid in new_taxons]
            try:
                TaxonNode.objects.insert(taxons_to_save)
                print(f"Saved {len(taxons_to_save)} new taxons")
                #update new taxons counts
            except Exception as e:
                print(f"Error saving new taxons: {e}")
                raise e
            #update new taxons counts
            for taxon in taxons_to_save:
                taxon.modify(
                    assemblies_count=GenomeAssembly.objects(taxon_lineage__in=[taxon.taxid]).count(),
                    annotations_count=GenomeAnnotation.objects(taxon_lineage__in=[taxon.taxid]).count(),
                    organisms_count=Organism.objects(taxon_lineage__in=[taxon.taxid]).count()
                )
        # Update the existing taxons with the new rank and scientific name
        taxon_lineage_lookup = {item.taxid: item for item in organism.parsed_taxon_lineage}
        for taxon in existing_taxons:
            if taxon.taxid in taxon_lineage_lookup:
                lineage_item = taxon_lineage_lookup[taxon.taxid]
                taxon.modify(scientific_name=lineage_item.scientific_name, rank=lineage_item.rank)

        #reload taxons and update the hierarchy
        ordered_taxons = taxonomy_service.get_ordered_taxons(taxon_lineage)
        taxonomy_service.update_taxon_hierarchy(ordered_taxons)