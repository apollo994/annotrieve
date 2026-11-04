"""Plot BUSCO results for every Annotrieve annotation, sorted by completeness.

Stacked single / duplicated / fragmented / missing percentages, one column per
annotation (ordered by decreasing complete %). The y axis is annotated with the
BUSCO lineage. Layout inspired by apollo994/BUSCO-tracker.

Usage:
    pip install requests matplotlib numpy
    python busco_completeness.py
"""

import os

import numpy as np
import requests
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

API_URL = "https://genome.crg.es/annotrieve/api/v0/annotations"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "busco_completeness.png")
PAGE_SIZE = 1000  # API maximum

# Stacking order, bottom to top
CATEGORIES = [
    ("single_copy", "Complete, single-copy", "#56B4E9"),
    ("duplicated", "Complete, duplicated", "#3492C7"),
    ("fragmented", "Fragmented", "#F0E442"),
    ("missing", "Missing", "#F04442"),
]

def fetch_busco():
    """Return an (n, 4) percentage array and the sorted set of BUSCO lineages."""
    rows, lineages, offset = [], set(), 0
    while True:
        response = requests.post(
            API_URL,
            json={"limit": PAGE_SIZE, "offset": offset, "fields": "annotation_id,busco"},
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
        print(f"Fetched {min(offset, payload['total'])}/{payload['total']}", end="\r")
        if offset >= payload["total"]:
            break
    print()
    if not rows:
        raise SystemExit("No BUSCO values found in the API response")
    return np.array(rows, dtype=float), sorted(lineages)


def build_plot(data, lineages):
    complete = data[:, 0] + data[:, 1]
    # Sort by completeness (desc); break ties on single-copy so the order is stable
    order = np.lexsort((-data[:, 0], -complete))
    data = data[order]
    n = len(data)
    x = np.arange(n)

    fig, ax = plt.subplots(figsize=(9, 3), dpi=150)

    # Filled steps rather than 20k individual bars: identical look, far faster
    ax.stackplot(
        np.append(x, n), *[np.append(col, col[-1]) for col in data.T],
        colors=[c for _, _, c in CATEGORIES], step="post", linewidth=0,
    )
    ax.set_xlim(0, n)
    ax.set_ylim(0, 100)
    ax.set_ylabel(f"BUSCO genes (%)\n{', '.join(lineages)}", fontsize=8)
    ax.set_xlabel("Annotations, sorted by BUSCO completeness", fontsize=8)
    ax.tick_params(labelsize=7)
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:g}%")
    ax.xaxis.set_major_formatter(lambda v, _: f"{int(v):,}")

    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color("#bfbfbf")

    handles = [Patch(color=c, label=label) for _, label, c in CATEGORIES]
    ax.legend(handles=handles, loc="upper center", ncol=4, frameon=False, fontsize=7,
              bbox_to_anchor=(0.5, -0.28))
    fig.tight_layout()
    return fig


def main():
    data, lineages = fetch_busco()
    print(f"{len(data):,} annotations with BUSCO values; lineages: {', '.join(lineages)}")
    fig = build_plot(data, lineages)
    fig.savefig(OUTPUT_FILE, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
