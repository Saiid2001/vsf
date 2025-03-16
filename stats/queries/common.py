import sys
import os
import json
import numpy as np
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

__dir__ = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(__dir__, ".."))

RESULTS_DIR = Path(__dir__).parent / "results"

from db import db, accf_db


def percent(part, whole):
    return f"{part/whole*100:.2f}%"


plt.style.use(
    {
        "axes.spines.left": True,
        "axes.spines.bottom": True,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "xtick.bottom": True,
        "ytick.left": True,
        "axes.grid": True,
        "grid.linestyle": ":",
        "grid.linewidth": 0.5,
        "grid.alpha": 0.5,
        "grid.color": "k",
        "axes.edgecolor": "k",
        "axes.linewidth": 0.5,
    }
)

# # use serif font
plt.rcParams["font.family"] = "serif"
plt.rcParams["font.serif"] = ["Times New Roman"] + plt.rcParams["font.serif"]

# # change text scaling
plt.rcParams.update({"font.size": 18})

# gray scale colors
plt.rcParams["axes.prop_cycle"] = plt.cycler(
    color=[
        "#5099E9",
        "#4CA48A",
        "#DF5536",
        "#B16EC6",
        "#666666",
        "#999999",
        "#000000",
    ]
)
