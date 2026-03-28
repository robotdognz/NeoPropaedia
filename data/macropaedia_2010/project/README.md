# Macropaedia 2010 Project Outputs

This folder contains the long-running 2010 Macropaedia review workspace.

Tracked canonical files:

- `../manual_review_fill_in.txt`
- `../2010_article_candidates_reviewed.json`
- `../2010_vs_2005_comparison_reviewed.json`
- `*.csv` in this folder

The SQLite database is a local working index regenerated from the tracked files above.

- database: `macropaedia_2010_project.sqlite`
- seeded volumes: `17`
- seeded articles: `685`
- articles with blank page length: `17`

Generated files:

- `article_identity_worklist.csv`
- `article_contents_capture_worklist.csv`
- `propaedia_mapping_worklist.csv`
- `britannica_breakdown_worklist.csv`
- `volume_contents_index.csv`

The database is the intended source of truth for this project. The CSV files are fill-in worklists
for manual capture and review.

Useful commands:

```bash
python3 pipeline/macropaedia_2010/export_project_worklists.py
python3 pipeline/macropaedia_2010/apply_project_worklists.py
```
