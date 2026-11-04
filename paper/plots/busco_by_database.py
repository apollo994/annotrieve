"""Boxplots of BUSCO categories for Annotrieve annotations, faceted by BUSCO category.

One panel per BUSCO category, with one box per database (RefSeq, Ensembl, GenBank).

Usage:
    pip install requests matplotlib numpy
    python busco_by_database.py
"""

import os

import numpy as np
import requests
import matplotlib.pyplot as plt

API_URL = "https://genome.crg.es/annotrieve/api/v0/annotations"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "busco_by_database.png")
PAGE_SIZE = 1000  # API maximum

# API db_sources value -> panel title
DATABASES = {
    "RefSeq": "RefSeq",
    "Ensembl": "Ensembl",
    "GenBank": "GenBank",
}

# API busco key, axis label, color
CATEGORIES = [
    ("single_copy", "Single-copy", "#56B4E9"),
    ("duplicated", "Duplicated", "#3492C7"),
    ("fragmented", "Fragmented", "#F0E442"),
    ("missing", "Missing", "#F04442"),
]


def fetch_busco(db_source):
    """Return an (n, 4) array of category percentages and the set of BUSCO lineages."""
    rows, lineages, offset = [], set(), 0
    while True:
        response = requests.post(
            API_URL,
            json={
                "db_sources": db_source,
                "limit": PAGE_SIZE,
                "offset": offset,
                "fields": "annotation_id,busco",
            },
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        for record in payload["results"]:
            busco = record.get("busco") or {}
            values = [busco.get(key) for key, _, _ in CATEGORIES]
            if all(v is not None for v in values):
                rows.append(values)
                lineages.add(busco.get("busco_lineage") or "unknown")
        offset += PAGE_SIZE
        if offset >= payload["total"]:
            break
    if not rows:
        raise SystemExit(f"No BUSCO values found for {db_source}")
    return np.array(rows, dtype=float), lineages


def build_plot(data_by_db, lineages):
    fig, axes = plt.subplots(
        1, len(CATEGORIES), figsize=(9, 3.2), dpi=150, gridspec_kw={"wspace": 0.45},
    )

    # y limits are free per panel: the categories span very different ranges
    for i, (ax, (_, label, color)) in enumerate(zip(axes, CATEGORIES)):
        boxes = ax.boxplot(
            [data[:, i] for data in data_by_db.values()],
            patch_artist=True, widths=0.6, showfliers=False,
            medianprops={"color": "#111", "linewidth": 1.2},
            whiskerprops={"color": "#7f7f7f", "linewidth": 0.8},
            capprops={"color": "#7f7f7f", "linewidth": 0.8},
        )
        for patch in boxes["boxes"]:
            patch.set(facecolor=color, edgecolor="#7f7f7f", linewidth=0.8)

        ax.set_title(label.replace("\n", " "), fontsize=8)
        ax.set_xticks(range(1, len(data_by_db) + 1), [DATABASES[d] for d in data_by_db])
        ax.tick_params(labelsize=7)
        ax.yaxis.set_major_formatter(lambda v, _: f"{v:g}%")
        ax.grid(axis="y", color="#e5e5e5", linewidth=0.8)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color("#bfbfbf")

    axes[0].set_ylabel(f"BUSCO genes (%)\n{', '.join(sorted(lineages))}", fontsize=8)
    return fig


def main():
    data_by_db, lineages = {}, set()
    for db_source in DATABASES:
        data_by_db[db_source], db_lineages = fetch_busco(db_source)
        lineages |= db_lineages
        print(f"{db_source}: {len(data_by_db[db_source]):,} annotations with BUSCO values")
    fig = build_plot(data_by_db, lineages)
    fig.savefig(OUTPUT_FILE, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
