"""Protein-coding genes and lncRNAs in NCBI vs Ensembl annotations of the same reference genomes.

Genomes are the 400 reference assemblies annotated by both pipelines
(analyses/pipeline_vs_taxonomy). Rows: coding genes, lncRNAs (lnc_RNA + lncRNA).
Columns: number per annotation, mean length (linear scales). One pair of boxes per class.

Each class and panel is tested with a paired two-sided Wilcoxon signed-rank test (same genome, NCBI vs
Ensembl); p-values are Benjamini-Hochberg adjusted across all tests. Stars: * q<0.05, ** q<0.01, *** q<0.001,
ns otherwise. Genomes lacking the feature in either pipeline are dropped from that pair. Test results are
also written to pipeline_coding_vs_lncrna_tests.tsv.

Usage (after analyses/pipeline_vs_taxonomy/00_fetch.py and 01_distances.py):
    python pipeline_coding_vs_lncrna.py
"""

import csv
import json
import os
from collections import Counter

import matplotlib.pyplot as plt
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "..", "analyses", "pipeline_vs_taxonomy")
OUTPUT_FILE = os.path.join(HERE, "pipeline_coding_vs_lncrna.png")
TESTS_FILE = os.path.join(HERE, "pipeline_coding_vs_lncrna_tests.tsv")
TOP_CLASSES = 6
COLORS = {"NCBI": "#2a78d6", "Ensembl": "#eb6834"}


def coding(rec):
    c = ((rec.get("features_statistics") or {}).get("gene_category_stats") or {}).get("coding")
    return (c["total_count"], c["length_stats"]["mean"]) if c and c.get("total_count") else (np.nan, np.nan)


def lncrna(rec):
    types = (rec.get("features_statistics") or {}).get("transcript_type_stats") or {}
    n = length = 0
    for key in ("lnc_RNA", "lncRNA"):
        if key in types:
            n += types[key]["total_count"]
            length += types[key]["total_count"] * types[key]["length_stats"]["mean"]
    return (n, length / n) if n else (np.nan, np.nan)  # no lncRNA annotated -> not plotted, counted in legend


def stars(q):
    return "***" if q < 0.001 else "**" if q < 0.01 else "*" if q < 0.05 else "ns"


def main():
    annotations = {r["annotation_id"]: r for r in json.load(open(os.path.join(WORK, "work", "annotations.json")))}
    ranks = json.load(open(os.path.join(WORK, "work", "rank_taxa.json")))["class"]
    genomes = list(csv.DictReader(open(os.path.join(WORK, "results", "reference", "genomes.tsv")), delimiter="\t"))

    top = [t for t, _ in Counter(g["class"] for g in genomes).most_common(TOP_CLASSES)]
    groups = {t: [g for g in genomes if g["class"] == t] for t in top}
    groups["other"] = [g for g in genomes if g["class"] not in top]
    names = [f"{ranks.get(t, t)}\n(n={len(groups[t])})" for t in top] + [f"Other\n(n={len(groups['other'])})"]
    order = top + ["other"]

    panels = [
        (coding, 0, "Protein-coding genes: number", False),
        (coding, 1, "Protein-coding genes: mean length (bp)", True),
        (lncrna, 0, "lncRNAs: number", True),
        (lncrna, 1, "lncRNAs: mean length (bp)", True),
    ]
    tests = []  # (panel index, class index, n pairs, median log2(Ensembl/NCBI), p)
    for pi, (fn, idx, title, log) in enumerate(panels):
        for ci, t in enumerate(order):
            pairs = np.array([[fn(annotations[g[c]])[idx] for c in ("ncbi_annotation", "ensembl_annotation")]
                              for g in groups[t]], float)
            pairs = pairs[~np.isnan(pairs).any(axis=1)]
            diff = pairs[:, 1] - pairs[:, 0]
            p = stats.wilcoxon(diff).pvalue if np.any(diff != 0) else 1.0
            tests.append((pi, ci, len(pairs), float(np.median(np.log2(pairs[:, 1] / pairs[:, 0]))), p))
    qvals = stats.false_discovery_control([t[4] for t in tests], method="bh")
    qmap = {(t[0], t[1]): q for t, q in zip(tests, qvals)}
    with open(TESTS_FILE, "w") as fh:
        fh.write("panel\tclass\tn_pairs\tmedian_log2_ens_over_ncbi\tp\tq_bh\n")
        for t, q in zip(tests, qvals):
            fh.write(f"{panels[t[0]][2]}\t{ranks.get(order[t[1]], order[t[1]])}\t{t[2]}\t{t[3]:.3f}\t{t[4]:.3g}\t{q:.3g}\n")

    fig, axes = plt.subplots(2, 2, figsize=(12, 7.5), sharex=True)
    for pi, (ax, (fn, idx, title, log)) in enumerate(zip(axes.flat, panels)):
        for k, (pipe, col) in enumerate((("NCBI", "ncbi_annotation"), ("Ensembl", "ensembl_annotation"))):
            data = []
            for t in order:
                v = np.array([fn(annotations[g[col]])[idx] for g in groups[t]], float)
                data.append(v[~np.isnan(v)])
            pos = np.arange(len(order)) + (k - 0.5) * 0.36
            bp = ax.boxplot(data, positions=pos, widths=0.32, patch_artist=True, showfliers=False,
                            medianprops={"color": "black", "linewidth": 1.2})
            for box in bp["boxes"]:
                box.set(facecolor=COLORS[pipe], alpha=0.8, edgecolor=COLORS[pipe])
            for part in ("whiskers", "caps"):
                for line in bp[part]:
                    line.set(color=COLORS[pipe])
        ax.margins(y=0.12)
        for ci in range(len(order)):
            q = qmap[(pi, ci)]
            ax.annotate(stars(q), (ci, 1.0), xycoords=("data", "axes fraction"), ha="center", va="bottom",
                        fontsize=9 if q < 0.05 else 8, fontweight="bold" if q < 0.05 else "normal",
                        color="black" if q < 0.05 else "#888888")
        ax.set_title(title, loc="left", fontsize=10, pad=16)
        ax.set_xticks(range(len(order)))
        ax.set_xticklabels(names, fontsize=8)
        ax.grid(axis="y", alpha=0.3)
        ax.spines[["top", "right"]].set_visible(False)

    handles = [plt.Rectangle((0, 0), 1, 1, color=c, alpha=0.8) for c in COLORS.values()]
    fig.legend(handles, ["NCBI RefSeq", "Ensembl"], loc="upper right", ncol=2, frameon=False)
    n_no_lnc = {p: sum(np.isnan(lncrna(annotations[g[c]])[0]) for g in genomes)
                for p, c in (("NCBI", "ncbi_annotation"), ("Ensembl", "ensembl_annotation"))}
    fig.suptitle("Same reference genomes, two annotation pipelines: protein-coding genes vs lncRNAs "
                 f"({len(genomes)} genomes)", x=0.01, ha="left", fontsize=12)
    fig.text(0.01, 0.005, f"Genomes with no lncRNA annotated (not drawn): NCBI {n_no_lnc['NCBI']}, "
             f"Ensembl {n_no_lnc['Ensembl']}. Boxes: median and IQR. Above each pair: paired Wilcoxon test, BH-adjusted\n(* q<0.05, ** q<0.01, *** q<0.001, ns not significant).", fontsize=8)
    fig.tight_layout(rect=(0, 0.04, 1, 0.95))
    fig.savefig(OUTPUT_FILE, dpi=200)
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()
