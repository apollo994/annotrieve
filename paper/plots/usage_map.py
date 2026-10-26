"""Generate a world usage map from the Annotrieve country analytics API.

Usage:
    pip install requests geopandas matplotlib
    python usage_map.py
"""

import os

import requests
import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

API_URL = "https://genome.crg.es/annotrieve/api/v0/analytics/frequencies/country"
NE_URL = "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage_map.png")
TOP_N_LABELS = 10

# API name -> Natural Earth NAME column
COUNTRY_NAME_FIXES = {
    "United States": "United States of America",
    "Czechia": "Czech Rep.",
    "United Kingdom": "United Kingdom",
    "Bosnia and Herzegovina": "Bosnia and Herz.",
    "Dominican Republic": "Dominican Rep.",
    "South Korea": "South Korea",
}


def fetch_country_counts():
    response = requests.get(API_URL, timeout=30)
    response.raise_for_status()
    raw = response.json()
    return {
        COUNTRY_NAME_FIXES.get(name, name): count
        for name, count in raw.items()
        if name != "Unknown"
    }


def load_world():
    return gpd.read_file(NE_URL)


def build_map(counts, world):
    world = world[world["NAME"] != "Antarctica"].copy()
    world["count"] = world["NAME"].map(counts)

    cmap = LinearSegmentedColormap.from_list(
        "annotrieve",
        ["#cfeaf1", "#9ed8e6", "#5fb1c6", "#367f97", "#1f5d75"],
    )

    fig, ax = plt.subplots(figsize=(14, 7), dpi=150)

    # Base layer: all countries in white with light borders
    world.plot(ax=ax, color="white", edgecolor="#bfbfbf", linewidth=0.4)

    # Choropleth on top, only for countries with data
    has_data = world[world["count"].notna()]
    vmax = has_data["count"].max()
    has_data.plot(
        ax=ax,
        column="count",
        cmap=cmap,
        edgecolor="white",
        linewidth=0.4,
        vmin=0,
        vmax=vmax,
    )

    # Top N countries listed in the bottom-left corner
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:TOP_N_LABELS]
    lines = ["Top countries (unique IPs)"] + [
        f"{rank}. {country}: {count}" for rank, (country, count) in enumerate(top, 1)
    ]
    ax.text(
        0.01,
        0.03,
        "\n".join(lines),
        transform=ax.transAxes,
        fontsize=10,
        color="#111",
        ha="left",
        va="bottom",
        linespacing=1.5,
    )

    ax.set_xlim(-170, 180)
    ax.set_ylim(-60, 85)
    ax.set_axis_off()

    # Horizontal colorbar
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(vmin=0, vmax=vmax))
    sm.set_array([])
    cbar = fig.colorbar(
        sm,
        ax=ax,
        orientation="horizontal",
        fraction=0.035,
        pad=0.02,
        shrink=0.5,
        aspect=40,
    )
    cbar.set_label("Unique IP count", fontsize=10)
    cbar.ax.tick_params(labelsize=9)
    cbar.outline.set_visible(False)

    fig.tight_layout()
    return fig


def main():
    counts = fetch_country_counts()
    total_visits = sum(counts.values())
    n_countries = len(counts)
    print(f"Total visits: {total_visits}")
    print(f"Countries:    {n_countries}")
    world = load_world()
    fig = build_map(counts, world)
    fig.savefig(OUTPUT_FILE, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {os.path.abspath(OUTPUT_FILE)}")


if __name__ == "__main__":
    main()
