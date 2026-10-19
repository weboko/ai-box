# Themes

Pick a theme by the subject and the mood of the investigation. `new-report.sh` copies the
chosen one to `site/assets/css/theme.css`, and that copy belongs to the report: restyle it as
much as the topic calls for.

| Theme | Use for | Character |
|---|---|---|
| `blueprint` | Architecture, systems, engineering, protocols, how-it-works | Drafting-table blue, grid paper, IBM Plex, mono section numbers, dashed frames; yellow accent, cyan links |
| `editorial` | Strategy, analysis, people, history of ideas, opinionated essays | Magazine serif on paper, drop cap in the TL;DR, rules above sections; deep-red accent, navy secondary |
| `explorer` | Travel, places, history, culture, nature, anything you'd photograph | Parchment, Cormorant + Lora, full-bleed hero photo; terracotta accent, forest-green secondary |
| `dashboard` | Business ideas, markets, finance, metrics, benchmarks, data-heavy comparisons | Dark panels, KPI-first, Inter + mono figures; cyan accent, violet secondary |

## Customizing

`report.css` reads only these variables. Each theme sets the ones it changes, and the rest
fall back to the defaults in `report.css`:

```css
--bg --bg-2 --bg-3          /* page, panels, insets */
--ink --ink-2 --ink-3       /* text: primary, secondary, muted */
--line --accent --accent-ink --accent-2
--font-body --font-head --font-mono --radius --shadow --measure
--c1 … --c6 --grid          /* chart series (fixed order) and gridlines */
--good --warn --serious --bad   /* status: reserved for meaning, never decoration */
--ev-fact --ev-estimate --ev-assumption --ev-interp
```

- A different mood (medieval, retro, newspaper, space, …): start from the closest theme and
  change the variables, fonts and the body background. Add decorative CSS at the end of
  `theme.css`. Keep body text at 4.5:1 contrast or better against `--bg` and `--bg-2`.
- Keep the chart series `--c1…--c6` in the given order: it is a validated colorblind-safe
  palette (dark steps for dark themes, light steps for light ones). Only change them together
  with the background, and then keep the hues the same and just shift their lightness.
- Fonts come from Google Fonts, with system fallbacks, so text never depends on them.
- Mermaid diagrams and charts take their colors from these variables when the page loads, so
  they follow the theme automatically.
