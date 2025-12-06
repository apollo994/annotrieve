from db.models import GenomeAssembly, GenomeAnnotation, Organism, TaxonNode, BioProject

def update_db_stats():
    """
    update all the db stats, #slow operation but safe
    """
    print("Updating db stats")
    #ASSEMBLIES
    print("Updating assemblies stats")
    for assembly in GenomeAssembly.objects():
        assembly.modify(
            annotations_count=GenomeAnnotation.objects(assembly_accession=assembly.assembly_accession).count()
        )
    orphan_assemblies = GenomeAssembly.objects(annotations_count=0)
    orphan_assemblies_count = orphan_assemblies.count()
    if orphan_assemblies_count > 0:
        print(f"Found {orphan_assemblies_count} orphan assemblies, deleting them")
        orphan_assemblies.delete()
    else:
        print("No orphan assemblies found")
    #ORGANISMS
    print("Updating organisms stats")
    for organism in Organism.objects():
        organism.modify(
            annotations_count=GenomeAnnotation.objects(taxid=organism.taxid).count(),
            assemblies_count=GenomeAssembly.objects(taxid=organism.taxid).count()
        )
    orphan_organisms = Organism.objects(annotations_count=0)
    orphan_organisms_count = orphan_organisms.count()
    if orphan_organisms_count > 0:
        print(f"Found {orphan_organisms_count} orphan organisms, deleting them")
        orphan_organisms.delete()
    else:
        print("No orphan organisms found")

    #TAXON NODES
    print("Updating taxon nodes stats")
    for taxon_node in TaxonNode.objects():
        annotations_count = GenomeAnnotation.objects(taxon_lineage__in=[taxon_node.taxid]).count()
        print(f"Found {annotations_count} annotations for taxon node {taxon_node.scientific_name}")
        assemblies_count = GenomeAssembly.objects(taxon_lineage__in=[taxon_node.taxid]).count()
        organisms_count = Organism.objects(taxon_lineage__in=[taxon_node.taxid]).count()
        taxon_node.modify(
            annotations_count=annotations_count,
            assemblies_count=assemblies_count,
            organisms_count=organisms_count
        )
    
    #delete taxon nodes without annotations
    taxon_nodes_to_delete = TaxonNode.objects(annotations_count=0)
    taxon_nodes_to_delete_count = taxon_nodes_to_delete.count()
    if taxon_nodes_to_delete_count > 0:
        print(f"Found {taxon_nodes_to_delete_count} taxon nodes without annotations, deleting them")
        taxon_nodes_to_delete.delete()
    else:
        print("No taxon nodes without annotations found")
    
    print("Updating children of taxon nodes to ensure tree is correct")
    #update children of taxon nodes to ensure tree is correct
    for taxon_node in TaxonNode.objects():
        taxon_node.modify(
            children=TaxonNode.objects(taxid__in=taxon_node.children if taxon_node.children else []).scalar('taxid')
        )
    
    #update assemblies count for bioprojects
    for bioproject in BioProject.objects():
        bioproject.modify(
            assemblies_count=GenomeAssembly.objects(bioprojects__in=[bioproject.accession]).count()
        )
    orphan_bioprojects = BioProject.objects(assemblies_count=0)
    orphan_bioprojects_count = orphan_bioprojects.count()
    if orphan_bioprojects_count > 0:
        print(f"Found {orphan_bioprojects_count} orphan bioprojects, deleting them")
        orphan_bioprojects.delete()
    else:
        print("No orphan bioprojects found")
    
    print("DB stats updated")

