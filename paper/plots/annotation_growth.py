"""Generate a cumulative annotation count plot per source from the Annotrieve API.

Mirrors the release timeline on https://genome.crg.es/annotrieve/ with an added
dashed total line and a right-hand axis giving the share of the current total.

Usage:
    pip install requests matplotlib
    python annotation_growth.py
"""

import os
from collections import Counter

import requests
import matplotlib.pyplot as plt

API_URL = "https://genome.crg.es/annotrieve/api/v0/annotations/frequencies/release_date"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "annotation_growth.png")
START_YEAR = 2010
END_YEAR = 2026

# API db_sources value -> (display label, color)
SOURCES = {
    "RefSeq": ("RefSeq", "#10b981"),
    "Ensembl": ("Ensembl", "#6366f1"),
    "GenBank": ("GenBank", "#f59e0b"),
    "CommunityRegistry": ("Community registry", "#0d9488"),
}


def fetch_yearly_counts(db_source):
    response = requests.get(API_URL, params={"db_sources": db_source}, timeout=30)
    response.raise_for_status()
    per_year = Counter()
    for date, count in response.json().items():
        per_year[int(date[:4])] += count
    return per_year


def cumulative(per_year, years):
    # Releases before START_YEAR are part of the starting baseline
    running = sum(n for year, n in per_year.items() if year < years[0])
    series = []
    for year in years:
        running += per_year.get(year, 0)
        series.append(running)
    return series


def build_plot(series_by_source, years):
    total = [sum(values) for values in zip(*series_by_source.values())]
    final_total = total[-1]

    fig, ax = plt.subplots(figsize=(9, 5), dpi=150)

    for db_source, values in series_by_source.items():
        label, color = SOURCES[db_source]
        ax.plot(years, values, color=color, linewidth=2, label=label)

    ax.plot(years, total, color="#111", linewidth=2, linestyle="--", label="Total")

    ax.set_xlim(years[0], years[-1])
    ax.set_ylim(0, final_total * 1.05)
    ax.set_xticks(years[::2] if years[-1] - years[0] > 10 else years)
    ax.set_xlabel("Release year", fontsize=10)
    ax.set_ylabel("Cumulative annotations", fontsize=10)
    ax.yaxis.set_major_formatter(lambda x, _: f"{int(x):,}")
    ax.grid(axis="y", color="#e5e5e5", linewidth=0.8)
    ax.set_axisbelow(True)

    # Right axis: share of the current (latest) total
    share_ax = ax.secondary_yaxis(
        "right",
        functions=(lambda y: y / final_total * 100, lambda p: p * final_total / 100),
    )
    share_ax.set_ylabel(f"Share of current total ({final_total:,}) (%)", fontsize=10)
    share_ax.yaxis.set_major_formatter(lambda x, _: f"{x:g}%")

    for ax_ in (ax, share_ax):
        ax_.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    share_ax.spines["right"].set_color("#bfbfbf")
    ax.spines["left"].set_color("#bfbfbf")
    ax.spines["bottom"].set_color("#bfbfbf")

    ax.legend(frameon=False, loc="upper left", fontsize=10)
    fig.tight_layout()
    return fig


def main():
    years = list(range(START_YEAR, END_YEAR + 1))
    series_by_source = {}
    for db_source, (label, _) in SOURCES.items():
        series_by_source[db_source] = cumulative(fetch_yearly_counts(db_source), years)
        print(f"{label}: {series_by_source[db_source][-1]}")
    fig = build_plot(series_by_source, years)
    fig.savefig(OUTPUT_FILE, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {os.path.abspath(OUTPUT_FILE)}")


if __name__ == "__main__":
    main()
