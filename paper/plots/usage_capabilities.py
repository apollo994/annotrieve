"""Generate a horizontal bar plot of Annotrieve use cases from the analytics API.

Mirrors the "What people use" section of https://genome.crg.es/annotrieve/usage/:
unique users who used each part of Annotrieve at least once.

Usage:
    pip install requests matplotlib
    python usage_capabilities.py
"""

import os

import requests
import matplotlib.pyplot as plt

API_URL = "https://genome.crg.es/annotrieve/api/v0/analytics/capabilities"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage_capabilities.png")
BAR_COLOR = "#5fb1c6"


def fetch_capabilities():
    response = requests.get(API_URL, timeout=30)
    response.raise_for_status()
    items = response.json()["items"]
    return sorted(items, key=lambda item: item["unique_users"], reverse=True)


def build_plot(items):
    labels = [item["label"] for item in items]
    users = [item["unique_users"] for item in items]

    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150)

    # Reversed so the most used case is at the top
    bars = ax.barh(labels[::-1], users[::-1], color=BAR_COLOR, height=0.6)

    for bar, value in zip(bars, users[::-1]):
        ax.text(
            bar.get_width() + max(users) * 0.01,
            bar.get_y() + bar.get_height() / 2,
            f"{value:,}",
            va="center",
            ha="left",
            fontsize=10,
            color="#111",
        )

    ax.set_xlim(0, max(users) * 1.12)
    ax.set_xlabel("Unique users", fontsize=10)
    ax.tick_params(axis="y", length=0, labelsize=10)
    ax.tick_params(axis="x", labelsize=9)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#bfbfbf")

    fig.tight_layout()
    return fig


def main():
    items = fetch_capabilities()
    for item in items:
        print(f"{item['label']}: {item['unique_users']}")
    fig = build_plot(items)
    fig.savefig(OUTPUT_FILE, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {os.path.abspath(OUTPUT_FILE)}")


if __name__ == "__main__":
    main()
