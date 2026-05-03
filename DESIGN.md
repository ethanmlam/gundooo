# GUNDOOO Design System

Maritime dark vessel triage platform. Defense C2 aesthetic — operational, precise, restrained.

> Inspired by: Gallatin Navigator, Linear, Anduril Lattice
> Context: Hackathon demo for DoD/VC judges who see Palantir daily

---

## 1. Visual Theme & Atmosphere

- **Mood**: Operational calm. A tool someone uses at 3 AM on watch, not a dashboard someone demos at a conference
- **Density**: High — information-rich, not spacious. Every pixel earns its place
- **Philosophy**: The map IS the product. Everything else is subordinate. Chrome recedes, data speaks
- **Differentiator**: No decoration. No gradients. No glow. If it doesn't convey information, remove it

---

## 2. Color Palette & Roles

### Surfaces
| Token | Hex | Role |
|---|---|---|
| `--surface-0` | `#06090f` | Page / app background |
| `--surface-1` | `#0c1017` | Panel / sidebar background |
| `--surface-2` | `#12161f` | Card / elevated surface |
| `--surface-3` | `#1a1f2b` | Hover state / active row |

### Borders
| Token | Hex | Role |
|---|---|---|
| `--border-subtle` | `rgba(255,255,255,0.04)` | Panel edges, dividers |
| `--border-default` | `rgba(255,255,255,0.08)` | Input borders, card edges |
| `--border-emphasis` | `rgba(255,255,255,0.14)` | Selected state, focus ring |

### Text
| Token | Hex | Role |
|---|---|---|
| `--text-primary` | `#e2e8f0` | Primary content, headings |
| `--text-secondary` | `#8892a3` | Labels, descriptions, metadata |
| `--text-tertiary` | `#5a6375` | Disabled, placeholder |

### Semantic
| Token | Hex | Role |
|---|---|---|
| `--accent` | `#c4915c` | Amber — threat scores, selected vessel, warnings, primary CTA |
| `--danger` | `#e5484d` | Red — critical alerts, dark event markers on map |
| `--success` | `#46a758` | Green — healthy status, sensor update applied, after-polygon |
| `--info` | `#7c8694` | Neutral slate — informational badges, inactive |

### Map-Specific
| Token | Hex | Role |
|---|---|---|
| `--vessel-default` | `rgba(148,163,184,0.45)` | All non-selected, non-threat vessels |
| `--vessel-selected` | `#c4915c` | Currently selected vessel |
| `--vessel-threat` | `#e5484d` | Vessels with dark events |
| `--track-line` | `rgba(148,163,184,0.12)` | Historical vessel tracks — barely visible |
| `--polygon-before` | `rgba(196,145,92,0.15)` | Search region outline fill |
| `--polygon-before-stroke` | `rgba(196,145,92,0.6)` | Search region outline border |
| `--polygon-after` | `rgba(70,167,88,0.12)` | Collapsed region fill |
| `--polygon-after-stroke` | `rgba(70,167,88,0.5)` | Collapsed region border |
| `--particle-high` | `#e5484d` | Particle weight > 0.7 |
| `--particle-med` | `#c4915c` | Particle weight > 0.3 |
| `--particle-low` | `rgba(148,163,184,0.35)` | Particle weight < 0.3 |

---

## 3. Typography

### Font Stack
- **Data / Monospace**: `'IBM Plex Mono', 'Menlo', monospace` — ALL numbers, coordinates, MMSI, speeds, timestamps, scores
- **UI / Sans**: `'IBM Plex Sans', -apple-system, sans-serif` — headings, labels, body text

### Scale
| Element | Font | Size | Weight | Tracking | Transform |
|---|---|---|---|---|---|
| Page title | Plex Sans | 16px | 600 | -0.02em | none |
| Section label | Plex Sans | 9px | 700 | 0.12em | uppercase |
| Panel heading | Plex Sans | 13px | 600 | -0.01em | none |
| Body text | Plex Sans | 11px | 400 | 0 | none |
| Data value (large) | Plex Mono | 28px | 700 | -0.04em | none |
| Data value (medium) | Plex Mono | 13px | 600 | -0.01em | none |
| Data value (small) | Plex Mono | 10px | 500 | 0.02em | none |
| Badge / tag | Plex Mono | 9px | 600 | 0.06em | uppercase |
| Breadcrumb | Plex Sans | 11px | 500 | 0 | none |

### Rules
- Never use font-size above 28px in the application (landing page hero is the exception)
- Monospace for anything a human would read as "data" — if you'd copy-paste it, it's mono
- Labels are always uppercase, always secondary color, always 9-10px
- No italic anywhere in the application

---

## 4. Component Patterns

### Panels / Sidebars
```css
background: var(--surface-1);
border-right: 1px solid var(--border-subtle);
padding: 0;
```
- NO border-radius on panels — they are structural, not cards
- NO box-shadow — depth comes from surface color steps
- Sections within panels separated by 1px solid var(--border-subtle) horizontal lines
- Each section has padding: 10px 12px

### Data Sections (replaces "cards")
Instead of bordered cards, use labeled sections:
```html
<div class="data-section">
  <span class="section-label">THREAT SCORE</span>
  <span class="data-value-large">82</span>
</div>
```
- Section label: 9px uppercase secondary color
- Data value: Plex Mono, size appropriate to importance
- No background, no border, no border-radius
- Separated from next section by a subtle divider line

### Stat Boxes (top-right pattern, from Gallatin)
```css
display: inline-flex;
gap: 1px;
background: var(--border-subtle);
```
Each stat box:
```css
background: var(--surface-2);
padding: 8px 14px;
text-align: center;
```
- Number: Plex Mono, 18px, weight 700, --text-primary
- Label: Plex Sans, 9px, uppercase, --text-secondary

### Buttons
Primary (action):
```css
background: var(--accent);
color: #06090f;
border: none;
border-radius: 2px;
padding: 6px 12px;
font: 600 10px/1 'IBM Plex Sans';
letter-spacing: 0.08em;
text-transform: uppercase;
```
Secondary:
```css
background: transparent;
color: var(--text-secondary);
border: 1px solid var(--border-default);
border-radius: 2px;
padding: 6px 12px;
font: 600 10px/1 'IBM Plex Sans';
letter-spacing: 0.08em;
text-transform: uppercase;
```
- No box-shadow, no hover glow
- Hover: background opacity increases slightly

### Badges / Status Pills
```css
display: inline-flex;
padding: 2px 6px;
border-radius: 2px;
font: 600 9px/1 'IBM Plex Mono';
letter-spacing: 0.06em;
text-transform: uppercase;
```
- HIGH: background rgba(229,72,77,0.12), color #e5484d, border 1px solid rgba(229,72,77,0.2)
- MEDIUM: background rgba(196,145,92,0.12), color #c4915c, border 1px solid rgba(196,145,92,0.2)
- ONLINE: background rgba(70,167,88,0.12), color #46a758, border 1px solid rgba(70,167,88,0.2)

### Ship Roster (list pattern)
Each row:
```css
padding: 6px 12px;
border-bottom: 1px solid var(--border-subtle);
cursor: pointer;
```
- Vessel name: Plex Sans, 12px, weight 600, --text-primary
- MMSI + detail: Plex Mono, 10px, --text-secondary
- Selected state: background var(--surface-3), border-left 2px solid var(--accent)
- No border-radius, no card styling — it's a list, not a card stack

### Breadcrumb Navigation (from Gallatin)
```
GUNDOOO / Long Beach / GRACEFUL LEADER
```
- Plex Sans, 11px, weight 500
- "/" separator in --text-tertiary
- Current item in --text-primary, parents in --text-secondary

### Evidence List
Each row:
```css
display: grid;
grid-template-columns: 6px 1fr;
gap: 8px;
align-items: start;
padding: 6px 0;
border-bottom: 1px solid var(--border-subtle);
font: 400 11px/1.4 'IBM Plex Sans';
color: var(--text-primary);
```
- Dot indicator: 6px circle, colored by severity (green/amber/red)

---

## 5. Layout Principles

### Spacing Scale
2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48 — no other values

### Grid (Mission View)
```css
grid-template-columns: 220px minmax(500px, 1fr) 280px;
grid-template-rows: 44px minmax(0, 1fr);
gap: 0;
```
- Left sidebar: 220px — narrow, dense
- Map: fills remaining — this IS the product
- Right panel: 280px — vessel detail
- Top bar: 44px — compact

### Hierarchy of Attention
1. Map — 60%+ of visual weight
2. Threat score — first thing in right panel, largest number
3. Evidence / reasoning — why this vessel matters
4. Ship roster — left sidebar, scrollable, scannable
5. Status indicators — top bar, smallest, least emphasis

---

## 6. Depth & Elevation

Almost none. Intentional.

| Level | Treatment |
|---|---|
| Base | --surface-0 |
| Panel | --surface-1 + border |
| Hover | --surface-3 |
| Overlay | --surface-2 + border-default |

- No box-shadow anywhere
- No backdrop-filter
- No gradients
- Depth = surface color steps only

---

## 7. Do's and Don'ts

### Do
- Use monospace for every number in the interface
- Use uppercase 9px labels to create section hierarchy
- Let the map be the visual centerpiece
- Use amber as the single accent color
- Use "/" as structural separator in navigation
- Make vessel tracks nearly invisible
- Use section numbers (01, 02) for sequential steps

### Don't
- Don't use more than 2 colors on the map (gray default + amber selected, red threats)
- Don't use border-radius above 2px
- Don't use box-shadow
- Don't use gradients (including on buttons)
- Don't use cyan, blue, or purple accents
- Don't make cards with visible borders — use typographic sections with dividers
- Don't use padding above 12px in sidebar sections
- Don't animate anything except map interactions
- Don't use italic text
- Don't center-align text in sidebars

---

## 8. Responsive Behavior

Desktop only. Minimum viewport: 1280px.
Below 1280px: collapse right panel to overlay.

---

## 9. Agent Prompt Guide

### Quick Reference
```
Background:      #06090f
Panel:           #0c1017
Accent (amber):  #c4915c
Danger (red):    #e5484d
Success (green): #46a758
Text primary:    #e2e8f0
Text secondary:  #8892a3
Border:          rgba(255,255,255,0.04)
Font data:       IBM Plex Mono
Font UI:         IBM Plex Sans
Border radius:   2px max
Box shadow:      none
Gradients:       none
```

### Prompt Pattern
"Build using DESIGN.md. IBM Plex Mono for data, IBM Plex Sans for labels. Background #0c1017, borders rgba(255,255,255,0.04). Accent #c4915c. No border-radius above 2px, no box-shadow, no gradients. Dense padding 6-10px. Labels uppercase 9px."
