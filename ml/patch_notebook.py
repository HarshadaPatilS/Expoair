"""
Patches source_fingerprinter.ipynb to update the artifact-saving cell
so it exports fingerprinter_meta.json with:
  - human-readable label names ("Vehicular Emissions" etc.)
  - n_classes and model_accuracy fields
Run from the ml/ directory: python patch_notebook.py
"""
import json, pathlib

nb_path = pathlib.Path("source_fingerprinter.ipynb")
nb = json.loads(nb_path.read_text(encoding="utf-8"))

NEW_CELL_SOURCE = [
    "import os\n",
    "import json\n",
    "from sklearn.metrics import accuracy_score\n",
    "\n",
    "os.makedirs(\"models_saved\", exist_ok=True)\n",
    "\n",
    "# Save XGB model in native JSON format\n",
    "best_model.save_model(\"models_saved/source_fingerprinter.json\")\n",
    "\n",
    "# Human-readable label names matching the backend heuristic fallback labels\n",
    "label_names = {\n",
    "    \"0\": \"Vehicular Emissions\",\n",
    "    \"1\": \"Industrial Pollution\",\n",
    "    \"2\": \"Construction Dust\",\n",
    "    \"3\": \"Biomass Burning\",\n",
    "    \"4\": \"Mixed / Background\"\n",
    "}\n",
    "\n",
    "metadata = {\n",
    "    \"features\": features,\n",
    "    \"labels\": label_names,\n",
    "    \"n_classes\": len(label_names),\n",
    "    \"model_accuracy\": float(round(accuracy_score(y_test, y_pred), 4))\n",
    "}\n",
    "\n",
    "# Save metadata schema map\n",
    "with open(\"models_saved/fingerprinter_meta.json\", \"w\") as f:\n",
    "    json.dump(metadata, f, indent=2)\n",
    "\n",
    "print(\"Saved fingerprinter_meta.json:\")\n",
    "print(json.dumps(metadata, indent=2))",
]

# Find and replace the last code cell (the artifact-saving cell)
# Identify it by the presence of "fingerprinter_meta.json" in its source
replaced = False
for cell in nb["cells"]:
    if cell.get("cell_type") == "code":
        src = "".join(cell.get("source", []))
        if "fingerprinter_meta.json" in src or "save_model" in src:
            cell["source"] = NEW_CELL_SOURCE
            cell["outputs"] = []
            cell["execution_count"] = None
            replaced = True
            print(f"Patched saving cell.")

if not replaced:
    # append as new cell if not found
    nb["cells"].append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": NEW_CELL_SOURCE,
    })
    print("Appended new saving cell.")

nb_path.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
print("Done — notebook updated.")
