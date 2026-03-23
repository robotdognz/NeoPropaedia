# Propaedia — Outline of Knowledge

A web version of the Encyclopaedia Britannica's **Propaedia**, the hierarchical "Outline of Knowledge" that classifies all human understanding into **10 Parts, 41 Divisions, and 177 Sections**.

Each section includes its original subject outline, cross-references to related sections, Macropaedia article recommendations, and curated [Oxford Very Short Introduction](https://global.oup.com/academic/content/series/v/very-short-introductions-702/) book suggestions.

## Built With

- [Astro](https://astro.build/) — static site framework
- [Preact](https://preactjs.com/) — lightweight interactive components
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [Pagefind](https://pagefind.app/) — static search

## Data Sources

This project was made entirely with information freely available online. The Propaedia's structure, section outlines, and cross-references are derived from publicly accessible descriptions of the Propaedia's organisational scheme. The Oxford VSI catalog was compiled from the [Wikipedia listing of Very Short Introductions](https://en.wikipedia.org/wiki/List_of_Very_Short_Introductions).

## Development

```bash
npm install
npm run dev
```

## AI Mapping Pipeline

The repository includes AI-assisted pipeline scripts for generating `summaryAI` and exact-leaf Propaedia mappings for VSI, Wikipedia, and BBC In Our Time:

- `scripts/generate-summary-ai.mjs`
- `scripts/generate-mappings-ai.mjs`

Useful operator commands:

```bash
# Summary generation / validation
node scripts/generate-summary-ai.mjs --type vsi
node scripts/generate-summary-ai.mjs --type iot
node scripts/generate-summary-ai.mjs --validate

# Mapping validation / coverage
node scripts/generate-mappings-ai.mjs --validate
node scripts/generate-mappings-ai.mjs --coverage --type vsi
node scripts/generate-mappings-ai.mjs --coverage --type wikipedia

# Combined pipeline status
node scripts/generate-mappings-ai.mjs --mode status --type vsi
node scripts/generate-mappings-ai.mjs --mode status --type wikipedia

# Gap planning
node scripts/generate-mappings-ai.mjs --mode gap-fill --type vsi --unresolved-only --top-sections 10 --top-targets 5
node scripts/generate-mappings-ai.mjs --mode gap-fill --type wikipedia --unresolved-only --top-sections 10 --top-targets 5

# Repair planning
node scripts/generate-mappings-ai.mjs --mode repair-queue --type vsi --top-sections 15
node scripts/generate-mappings-ai.mjs --mode repair-queue --type wikipedia --top-sections 15
```

Notes:

- Coverage is measured at exact leaf-path level.
- Broader ancestor-path matches count as controlled fallback debt, not exact coverage.
- Reports under `scripts/output/` are generated artifacts and are ignored by git.

## Deployment

The site is configured for GitHub Pages. Push to `main` and the GitHub Actions workflow will build and deploy automatically.

## License

This is an educational project. The organisational structure of the Propaedia is used for reference and study purposes. All Oxford VSI recommendations link to publicly available book information.
