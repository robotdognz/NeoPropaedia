# Macropaedia 2010 Review Notes

Generated after the geometry-aware OCR and parser pass on 2026-03-28.

## Current extraction summary

- Parsed 2010 article candidates: `676`
- Matched to 2005 baseline: `610`
- Candidate new-in-2010 titles: `66`
- Candidate missing-from-2010 titles: `56`

These counts are useful for review, but they are still not final truth. The remaining uncertainty is
concentrated in a small number of OCR pairing failures and edition-title differences.

## Remaining extraction issues

### Volume 1

Current leftovers:

- `ACCOUNTING`
- `Ansel ADAMS`
- `John ADAMS`
- `AESTHETICS`
- `349`
- `441`

What this likely means:

- The first four page numbers on the contents page were not OCR'd cleanly, so the titles above are
  probably real entries with missing start pages before `24 AFGHANISTAN`.
- The orphan page numbers `349` and `441` likely belong to titles that OCR missed entirely.
- Based on 2005 ordering, the most plausible missing titles around those two page numbers are:
  - `Analysis (in Mathematics)`
  - `Anthropology`

This volume probably needs a quick manual read from the photo rather than more parser logic.

### Volume 13

Current leftovers:

- `Western PHILOSOPHICAL SCHOOLS AND DOCTRINES`
- `733`
- `Principles of PHYSICAL SCIENCE`
- `807`
- `Plato and PLATONISM`
- `893`

Most plausible intended pairings:

- `652 Western PHILOSOPHICAL SCHOOLS AND DOCTRINES`
- `733 The History of Western PHILOSOPHY`
- `807 The PHYSICAL SCIENCES`
- `828 Principles of PHYSICAL SCIENCE`
- `893 Plato and PLATONISM`
- `908 POISONS AND POISONING`

The current parser already recovers most of the `P` section correctly, but these rows still have
multi-entry alignment problems that are safer to finish by hand.

## Candidate new-in-2010 titles that look plausibly real

These appear more like real 2010 editorial additions or retitled modern-topic articles than OCR noise:

- `ARTIFICIAL INTELLIGENCE`
- `COMPUTER CRIME`
- `CONSERVATION OF SPECIES`
- `ELECTRONIC GAMES`
- `ENVIRONMENTALISM AND ENVIRONMENTAL LAW`
- `GLOBAL WARMING`
- `GLOBALIZATION AND CULTURE`
- `GRAPHIC DESIGN`
- `INFORMATION PROCESSING`
- `INFORMATION SYSTEMS`
- `INFORMATION THEORY`
- `NANOTECHNOLOGY`
- `NUMBER GAMES and Other Mathematical Recreations`

## Candidate new-in-2010 titles that still need skepticism

These may still be edition-difference phrasing, OCR normalization drift, or should be checked against
the 2005 baseline by hand:

- `ANTARCTICA`
- `CHILDHOOD DISEASES`
- `COLOUR`
- `HUNGARIAN LITERATURE`
- `Jackson PoLLOCK`
- `Los ANGELES`
- `MICHELANGELO`
- `MONET`

## Recommended next step

Use the remaining six leftovers in Volume 1 and six leftovers in Volume 13 as a short manual review list.
That is likely enough to make the 2010 dataset materially trustworthy without spending more time on parser
heuristics.
