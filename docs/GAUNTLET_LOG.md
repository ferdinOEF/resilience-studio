# Gauntlet log (studio UI against the Felt-standard rubric)

Spec §8 step 9: a review loop on the studio UI, 8-round cap, screenshots logged here. Each round: screenshot every view at 1440 × 900, score the six criteria, fix the worst, repeat until no criterion scores below 4 or the cap is reached.

## Rubric (score 1–5 per criterion, per view)

| Criterion | 5 means |
|---|---|
| Map dominance | The map fills the screen between the rails; nothing floats over it except the legend card, zoom buttons and A/B pills; no decorative panels on the map. |
| Rail restraint | The left rail holds controls only (scale, layers, show-as, scenario summary, base-data note); no prose, no charts; at most 5 groups; the right card shows one selected thing. |
| Type | Inter only; 14 px body, 11 px uppercase labels at 0.06em, 18–20 px headline numbers; no more than three sizes on a card; tabular numerals in lists. |
| Colour | Tokens only (docs/DESIGN_TOKENS.md); teal for selection and primary actions; the four-step risk ramp only for risk; warn colours only for placeholders and unsigned results; no gradients, no shadows. |
| Density | Rows 40–48 px; 16 px padding; lists ranked and scannable; no empty cards; a single "Not yet modelled" notice per view, not a banner on every element. |
| Evidence visibility | Every number shows its bound (low · central · high where the run gives them), the level used ("city value") and a grounding chip where it comes from the registry; the legend names the run, calibration state, terrain and basemap; "View evidence chain →" is one click away. |

## Rounds

_Filled in at step 9. Screenshots in `docs/gauntlet/round-N/<view>.png`._
