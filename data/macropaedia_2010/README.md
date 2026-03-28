# Macropaedia 2010 Canonical Data

This folder holds the tracked source-of-truth files for the separate 2010 Macropaedia project.

Keep here:

- reviewed JSON outputs
- manual review input files
- review notes and summaries
- editable CSV worklists

Do not treat `pipeline/output/macropaedia_2010/` as canonical. That folder is scratch space for:

- raw OCR
- intermediate parsing outputs
- transient rebuild artifacts

The local SQLite database is regenerated from the tracked files in this folder and is intentionally
not treated as the canonical git-tracked record.

The current 2005 dataset is only used to generate comparison reports. It is not imported into this
2010 project data layer.
