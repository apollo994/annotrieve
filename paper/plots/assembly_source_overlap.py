"""UpSet plot of the assemblies annotated by each source in Annotrieve.

Each assembly accession is assigned to the sources that provide at least one
annotation for it. Bars show how many assemblies are annotated by exactly each
combination of sources, so the overlap between sources is read from the matrix.

Usage:
    pip install requests pandas matplotlib upsetplot
    python assembly_source_overlap.py
"""

import io
import os
from collections import Counter, defaultdict

import pandas as pd
import requests
import matplotlib.pyplot as plt
from upsetplot import UpSet, from_memberships

API_URL = "https://genome.crg.es/annotrieve/api/v0/annotations/report"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assembly_source_overlap.png")

# API db_sources value -> (display label, color); same as annotation_growth.py
SOURCES = {
    "RefSeq": ("RefSeq", "#10b981"),
    "Ensembl": ("Ensembl", "#6366f1"),
    "GenBank": ("GenBank", "#f59e0b"),
    "CommunityRegistry": ("Community registry", "#0d9488"),
}


def fetch_assemblies(db_source):
    response = requests.post(API_URL, json={"db_sources": db_source}, timeout=300)
    response.raise_for_status()
    report = pd.read_csv(io.StringIO(response.text), sep="\t")
    return set(report["assembly_accession"].dropna())


def build_plot(sets):
    # assembly accession -> sources that annotate it
    memberships = defaultdict(list)
    for db_source, accessions in sets.items():
        label = SOURCES[db_source][0]
        for accession in accessions:
            memberships[accession].append(label)
    counts = Counter(tuple(m) for m in memberships.values())
    data = from_memberships([list(m) for m in counts], data=list(counts.values()))

    fig = plt.figure(figsize=(9, 4.5), dpi=150)
    upset = UpSet(data, sort_by="cardinality", min_subset_size=1,
                  element_size=None, intersection_plot_elements=8)
    for label, color in SOURCES.values():
        upset.style_categories(label, bar_facecolor=color)
    axes = upset.plot(fig)

    # counts are written by hand: upsetplot's own show_counts fails with this pandas
    for ax, horizontal in ((axes["intersections"], False), (axes["totals"], True)):
        for bar in ax.patches:
            if horizontal:
                ax.text(bar.get_width(), bar.get_y() + bar.get_height() / 2,
                        f"{int(bar.get_width()):,} ", ha="right", va="center", fontsize=7)
            else:
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(),
                        f"{int(bar.get_height()):,}", ha="center", va="bottom", fontsize=7)
    axes["intersections"].set_ylabel("Assemblies", fontsize=9)
    axes["totals"].set_xlabel("Assemblies per source", fontsize=8)
    axes["intersections"].yaxis.set_major_formatter(lambda v, _: f"{int(v):,}")
    for ax in axes.values():
        ax.tick_params(labelsize=8)
    return fig, memberships


def main():
    sets = {}
    for db_source, (label, _) in SOURCES.items():
        sets[db_source] = fetch_assemblies(db_source)
        print(f"{label}: {len(sets[db_source]):,} assemblies")
    fig, memberships = build_plot(sets)
    shared = sum(len(m) > 1 for m in memberships.values())
    print(f"{len(memberships):,} assemblies, {shared:,} annotated by more than one source")
    fig.savefig(OUTPUT_FILE, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
