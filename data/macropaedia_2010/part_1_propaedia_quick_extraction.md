# Part 1 Propaedia Quick Extraction

This note summarizes what could be extracted quickly from the first batch of Part 1 Propaedia
photos under:

- `Macropaedia 2010/propaedia_pages/part_1/`

The OCR scratch output used for this pass is in:

- `pipeline/output/macropaedia_2010/propaedia_part_1_ocr/`

## What is already extractable

- Propaedia page references for all 13 photos
- Part and section context from the running headers
- Hierarchy text on each page
- `Suggested reading in the Encyclopædia Britannica` blocks
- Macropaedia major article titles with good enough accuracy for review-assisted capture

## What is not yet normalized here

- exact subsection-path structure in database form
- cross-page continuation stitching
- Micropaedia term normalization
- article-to-web target breakdowns

## Page-by-page summary

- `22`
  Topic: atomic weights, atomic spectra, X rays, antimatter, physical constants
  Major Macropaedia articles: `Analysis and Measurement, Physical and Chemical`; `Atoms: Their Structure, Properties, and Component Particles`; `Physical Science, Principles of`; `Physical Sciences, The`

- `26`
  Topic: atomic nucleus and elementary particles; radiation detection
  Major Macropaedia articles: `Radiation`; `Analysis and Measurement, Physical and Chemical`; `Subatomic Particles`; `Atoms: Their Structure, Properties, and Component Particles`; `Physical Sciences, The`

- `28`
  Topic: chemical elements and periodic variation
  Major Macropaedia articles: `Chemical Compounds`; `Chemical Elements`

- `32`
  Topic: chemical compounds, molecular structure, chemical bonding
  Major Macropaedia articles: `Biochemical Components of Organisms`; `Chemical Compounds`

- `36`
  Topic: chemical reactions
  Major Macropaedia articles: `Chemical Reactions`; `Physical Sciences, The`

- `39`
  Topic: heat, thermodynamics, and nonsolid states of matter
  Major Macropaedia articles: `Matter: Its Properties, States, Varieties, and Behaviour`; `Physical Sciences, The`; `Thermodynamics, Principles of`

- `42`
  Topic: solid state of matter
  Major Macropaedia articles: `Matter: Its Properties, States, Varieties, and Behaviour`; `Minerals and Rocks`

- `44`
  Topic: mechanics of particles, rigid bodies, deformable bodies, elasticity, vibrations, flow
  Major Macropaedia articles: `Energy Conversion`; `Matter: Its Properties, States, Varieties, and Behaviour`; `Mechanics: Energy, Forces, and Their Effects`

- `47`
  Header context: `Division II. Section 127`
  Topic: electricity and magnetism
  Major Macropaedia articles: `Energy Conversion`; `Electricity and Magnetism`; `Electromagnetic Radiation`

- `50`
  Topic: waves and wave motion
  Major Macropaedia articles: `Colour`; `Electromagnetic Radiation`; `Optics, Principles of`; `Sound`; `Light`

- `53`
  Header context: `Division III. Section 132`
  Topic: the cosmos
  Major Macropaedia articles: `Analysis and Measurement, Physical and Chemical`; `Cosmos, The`; `Gravitation`; `Physical Sciences, The`; `Relativity`

- `55`
  Header context: `Division III. Section 132`
  Topic: galaxies and stars
  Major Macropaedia articles: `Cosmos, The`; `Galaxies`; `Nebula`; `Physical Sciences, The`; `Stars and Star Clusters`

- `58`
  Topic: the solar system
  Major Macropaedia articles: `Calendar`; `Earth, The: Its Properties, Composition, and Structure`; `Eclipse, Occultation, and Transit`; `Physical Sciences, The`; `Solar System, The`

## Initial assessment

This image set is good enough to support:

- filling `propaedia_page_reference`
- deriving `propaedia_name` evidence
- building Part 1 mapping evidence from the actual Propaedia hierarchy
- collecting likely Macropaedia recommendation relationships page by page

The OCR quality is strong enough that the next step can be review-assisted extraction rather than
manual transcription from scratch.
