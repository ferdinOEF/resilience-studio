# Design tokens (from the approved mockups)

Source: Claude Design canvas "Resilience Studio — UI mockups" (artifact `5FbMoDBCUNYGx5M2hDGHBZ`), eight artboards:
0a State (Goa), 0b City (Panjim), 1 Ward risk, 2 Scenarios, 3 Solutions, 4 Policy, 5 Admin (Meta Mind), Component: Risk-rating card.
Felt is the UI standard: one map owns the screen, layers in a left rail, one selected thing in a right card, evidence under every number, no decoration.

## Type
- Inter 400/500/600, base 14 px, line-height 1.45; section labels 11 px, 600, uppercase, letter-spacing 0.06em, colour `--muted`.
- Headline numbers 18 px 600 (cards), 20 px 600 (page titles), 22–26 px 600 (stat tiles, rating tile).

## Colour
| Token | Hex | Use |
|---|---|---|
| `--ink` | #1A1D1F | text |
| `--muted` | #5B6468 | secondary text, labels |
| `--muted-2` | #3C4549 | body text in grey panels |
| `--hairline` | #E3E6E8 | borders |
| `--hairline-2` | #F0F2F3 | row dividers |
| `--panel` | #F6F7F8 | grey panels, selected rail rows |
| `--map-bg` | #EEF1F2 | map land / neutral |
| `--water` | #CFE0E6 | sea and estuary |
| `--teal` | #0F6E76 | primary, links, selected outline |
| `--teal-ink` | #0A4F55 | selected text |
| `--teal-bg` | #EAF3F4 | selected chip / nav background |
| `--risk-low` | #D9E6EC | risk class 1 |
| `--risk-moderate` | #F3D3A6 | risk class 2 / policy partial |
| `--risk-high` | #E9A96B | risk class 3 / policy gap |
| `--risk-very-high` | #D55A1F | risk class 4 / policy conflict |
| `--green` | #2E7D4F | solutions placed, healthy |
| `--green-ink` | #1F5A38 | positive deltas |
| `--green-bg` | #E6F2EA | nature-based tag, calibrated chip, policy covered (#CFE5D6) |
| `--warn-ink` | #8A3E0E | placeholder text, side effects |
| `--warn-bg` | #FFF1E6 | awaiting sign-off, placeholder tag |
| `--flood-shallow` | #4A8FB5 @ 0.5 | flooded < 0.5 m; "ready to run" dot |
| `--flood-deep` | #2D6A8E @ 0.6 | flooded ≥ 0.5 m |
| `--not-modelled` | #9AA4A8 | not yet modelled dot, breadcrumb chevrons |

## Layout
- Header 56 px: logo + name; place pill or breadcrumb (State › City › Ward chips); views nav (Risk, Scenarios, Solutions, Policy); Admin button right.
- Left rail 280 px (Scenarios 300, Solutions 320, Admin 220): Scale switcher (State | City | Ward segmented), Layers (checkbox rows 40 px), Show-risk-as (Combined | H | E | V), base-data note at the bottom in a grey panel.
- Map fills the rest; legend card bottom-left (title line, swatches, run/calibration line); zoom buttons top-right 36 px.
- Right card 360 px (Scenarios 340, Policy 420, Admin 280): one selected thing. Ranked list rows: rank · name · risk chip · people/status.
- Buttons: primary teal 44 px, radius 8; secondary white with hairline border. Chips radius 999.
- Risk-rating card: header (WARD / name / setting), 64 px rating tile with class number 1–4, factor bars (Hazard, Exposure, Vulnerability) with a one-line "why", key figures, calibration chip + "View evidence chain →".
- Bracketed values in the mockups are slots the model chain fills; nothing low-confidence is ever shown to a user.
