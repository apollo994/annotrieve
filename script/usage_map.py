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
OUTPUT_FILE = "usage_map.png"
TOP_N_LABELS = 5

# API name -> Natural Earth NAME column
COUNTRY_NAME_FIXES = {
    "United States": "United States of America",
    "Czechia": "Czech Rep.",
    "United Kingdom": "United Kingdom",
    "Bosnia and Herzegovina": "Bosnia and Herz.",
    "Dominican Republic": "Dominican Rep.",
    "South Korea": "South Korea",
}

# Hand-picked label offsets in axis (degree) units for the top countries.
# (dx, dy): offset from country centroid to the pill center.
LABEL_OFFSETS = {
    "United States of America": (-30, 8),
    "Spain": (-18, -12),
    "United Kingdom": (-22, 10),
    "Germany": (20, 10),
    "Sri Lanka": (20, -6),
    "France": (-18, -8),
    "Italy": (16, -10),
    "China": (22, 10),
    "Sweden": (18, 6),
    "Japan": (18, -6),
    "Mexico": (-22, -10),
    "Netherlands": (-18, 8),
    "Ireland": (-18, 6),
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

    # Pill labels for top N
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:TOP_N_LABELS]
    for country, count in top:
        row = world[world["NAME"] == country]
        if row.empty:
            continue
        centroid = row.geometry.representative_point().iloc[0]
        dx, dy = LABEL_OFFSETS.get(country, (25, 15))
        ax.annotate(
            f"{country}: {count}",
            xy=(centroid.x, centroid.y),
            xytext=(centroid.x + dx, centroid.y + dy),
            fontsize=10,
            fontweight="bold",
            color="#111",
            ha="center",
            va="center",
            bbox=dict(
                boxstyle="round,pad=0.4,rounding_size=0.6",
                facecolor="white",
                edgecolor="#5fb1c6",
                linewidth=1.3,
            ),
            arrowprops=dict(
                arrowstyle="-",
                color="#5fb1c6",
                linewidth=1.2,
                shrinkA=4,
                shrinkB=6,
            ),
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
