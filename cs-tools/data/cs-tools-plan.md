# CS Tools — Project Plan
**Location:** `boe6.net/cs-tools` → `public_html/cs-tools/`  
**Stack:** Plain HTML + Vanilla JS + Vanilla CSS (no frameworks, no build tools)  
**Theme:** CS2-inspired dark tactical UI

---

## Table of Contents
1. [File Structure](#file-structure)
2. [Design System](#design-system)
3. [Map Data Schema](#map-data-schema)
4. [Pages & Features](#pages--features)
   - [Index (Home)](#1-index--home)
   - [Browse Maps](#2-browse-maps)
   - [Choose Team](#4-choose-team)
   - [Choose Map (Picker + Veto)](#4-choose-map-picker--veto)
   - [Choose Both (Combined Flow)](#5-choose-both-combined-flow)
   - [Match Summary](#6-match-summary)
5. [Global Navigation](#global-navigation)
6. [Persistent State Strategy](#persistent-state-strategy)
7. [Implementation Order](#implementation-order)
8. [Open Questions](#open-questions)

---

## File Structure

```
cs-tools/
├── index.html                  ← Home page (4 big buttons)
├── browse-maps.html            ← Map browser grid
├── choose-team.html            ← Team/player assignment
├── choose-map.html             ← Map picker + veto flow
├── match-summary.html          ← Final result (Both flow)
│
├── css/
│   └── style.css               ← Single shared stylesheet
│
├── js/
│   ├── maps-data.js            ← Map data loader (reads maps.json)
│   ├── browse-maps.js          ← Browse maps logic
│   ├── choose-team.js          ← Team assignment logic
│   ├── choose-map.js           ← Picker + veto state machine
│   └── match-summary.js        ← Match summary display
│
└── data/
    └── maps.json               ← Canonical map data file (human-editable)

(Map thumbnail images TBD — hosted separately or as relative paths)
```

---

## Design System

### Palette
| Token | Value | Usage |
|---|---|---|
| `--bg-deep` | `#0a0b0d` | Page background |
| `--bg-card` | `#111318` | Card base |
| `--bg-panel` | `#161820` | Side panels, filter bars |
| `--accent-gold` | `#e6c97a` | CS2-style accent, active highlights |
| `--accent-green` | `#4caf76` | GO button, picks, confirm |
| `--accent-red` | `#c0392b` | Bans, remove actions |
| `--text-primary` | `#ffffff` | Titles |
| `--text-secondary` | `#9aa3b2` | Labels, metadata |
| `--border-selected` | `3px solid #ffffff` | Selected card border |

### Typography
- Font: **Barlow Condensed** (Google Fonts) — matches CS2's condensed style
- Fallback: `Impact, Arial Narrow, sans-serif`

### Card Component (shared)
- **Aspect ratio:** ~2:3 (tall vertical cards)
- **Background:** Map thumbnail image, full bleed
- **Overlay:** Dark gradient from bottom (`rgba(0,0,0,0.75)` → transparent)
- **Selected state:** Full brightness + thick white border + checkmark (top-right corner)
- **Unselected state:** `brightness(0.35)` filter, no border
- **Hover state:** `brightness(0.6)` transition

---

## Map Data Schema

**File:** `data/maps.json`  
**Format:** JSON array of map objects. Plain and easy to edit manually or via Python scripts.

```json
[
  {
    "id": "de_dust2",
    "name": "Dust II",
    "versions": ["CS1.6", "CS:S", "CS:GO", "CS2"],
    "added_date": "2001-03-13",
    "in_cs2": true,
    "cs2_type": "official",
    "workshop_links": [
      "https://steamcommunity.com/sharedfiles/filedetails/?id=XXXXXXX"
    ],
    "tags": [
      "bomb_defusal",
      "5v5",
      "active_duty",
      "competitive_pool",
      "official_casual"
    ],
    "thumbnail": "images/maps/de_dust2.jpg"
  }
]
```

### Tag Reference (non-exhaustive, extensible)
**Game Modes:** `bomb_defusal`, `hostage`, `wingman`, `arms_race`, `deathmatch`  
**Format:** `5v5`, `3v3`, `2v2`  
**Pool Status:** `active_duty`, `competitive_pool`, `former_competitive_pool`, `workshop_only`, `official_casual`  
**Operations:** `operation_bloodhound`, `operation_riptide`, `operation_broken_fang`, etc.  
**Misc:** `community_remake`, `valve_remake`, `classic_map`

> **Note:** Tags are free strings — add new ones without touching any code, just the JSON.

---

## Pages & Features

---

### 1. Index / Home

**File:** `index.html`

**Layout:**
- Full-screen dark background, possibly a subtle CS2-style tilted grid or blurred map collage
- Centered vertically/horizontally
- Site logo / title: **"CS TOOLS"** in condensed caps
- 4 large buttons arranged in a 2×2 grid (or 1 column on mobile):

| Button | Destination |
|---|---|
| **Browse Maps** | `browse-maps.html` |
| **Choose Team** | `choose-team.html` |
| **Choose Map** | `choose-map.html` |
| **Choose Both** | `choose-team.html?mode=both` |

- Buttons: large, dark bordered, with icon + label. Hover → subtle gold highlight.

---

### 2. Browse Maps

**File:** `browse-maps.html`

#### Filter Bar (sticky top)
Pinned above the scroll area. Contains:
- **Text search** — map name substring match
- **Game Version** dropdown — `CS1.6`, `CS:S`, `CS:GO`, `CS2`, `All`
- **Game Mode** dropdown — `Bomb Defusal`, `Hostage`, `Wingman`, `All`
- **Year** dropdown — populated from data (year ranges from `added_date`)
- **Operation** dropdown — populated from tags (all `operation_*` tags)
- **Pool Status** dropdown — Active Duty, Competitive, Workshop Only, All
- **Sort By** dropdown — `Newest First` (default), `Oldest First`, `A–Z`, `Z–A`

#### Card Grid
- CSS Grid, responsive columns (`auto-fill, minmax(160px, 1fr)` approx)
- Default sort: newest additions first
- All maps shown by default, no filters active
- Each card shows:
  - Map thumbnail (full bleed background)
  - Map name (bottom, white condensed text)
  - Game version badge (top-left, small pill)
  - "CS2" badge (top-right) if `in_cs2: true`
  - **(+) icon** (top-right corner) — opens the Map Detail Modal
- **Clicking the card itself** (not the + icon) also opens the Map Detail Modal in Browse Maps

#### Map Detail Modal (shared component)
Triggered by: clicking a card in Browse Maps, or clicking the **(+)** icon on any card in Picker/Veto screens.
- Full map name as header
- Large thumbnail
- All versions as pills
- Added date
- Tags listed as styled chips (grouped by category)
- CS2 status badge
- Workshop links as clickable `"Open in Steam Workshop"` buttons (one per link)
- Notes field (if populated)
- Close button / click-outside to dismiss

---

### 3. Choose Team

**File:** `choose-team.html`  
**URL Variants:** Normal → `choose-team.html` | Combined flow → `choose-team.html?mode=both`

#### Layout (3-panel)

```
┌─────────────────────────────────────────────────┐
│  [Team 1 Box — 50% width]  [Team 2 Box — 50%]  │  ← Top 75%
├─────────────────────────────────────────────────┤
│              [Player Pool Box]                  │  ← Bottom 25%
│  [________________________ Add Player ________] │  ← Text input
└─────────────────────────────────────────────────┘
```

#### Player Pool Box (bottom 25%)
- **Bordered floating panel**
- Displays all entered player names as inline "chips" with `[Name ×]` format
- Font size auto-scales so all names fit within the box (JS `ResizeObserver` approach)
- Text input at bottom: accepts comma-separated names or Enter to add
- Names are draggable from here into team boxes
- State saved to `localStorage`

#### Team Boxes (top 75%, side by side)
- **Each bordered floating panel**
- **Editable title** at top (click to edit, plain text input on focus)
  - Default: "Team 1" / "Team 2"
  - Auto-set to "[First Player]'s Team" when first player is dropped in (if title untouched)
- **Side selector button** — large round button showing:
  - 🔴 `T` (Terrorist)
  - 🔵 `CT` (Counter-Terrorist)
  - ⚪ `—` (Unset, default) — cycles on click
- **Drop zone** — player name chips dragged from pool land here
- Players are re-draggable between boxes and back to pool

#### Controls
- **"Lock In" toggle button** (prominent, bottom of page or top)
  - When toggled ON: UI dims/locks, no further changes
  - `mode=both`: navigates to `choose-map.html?mode=both` with team names in URL params
  - Normal mode: just a visual confirmation state
- **Reset button** — clears all assignments back to pool

#### Persistence
- All player names, team assignments, team titles, sides → `localStorage` key `cs-tools-teams`
- Loaded on page init

---

### 4. Choose Map (Picker + Veto)

**File:** `choose-map.html`  
**URL Variants:** Normal → `choose-map.html` | Combined flow → `choose-map.html?mode=both&team1=...&team2=...`

This page has **two sub-states** managed in JS:
1. **Config + Map Selection** screen
2. **Veto** screen

#### Sub-State 1: Config + Map Selection

**Top third — Config Panel:**

| Control | Details |
|---|---|
| Team 1 Name | Editable text field |
| Team 2 Name | Editable text field |
| Best-of Format | `Bo1`, `Bo3` (default), `Bo5` radio/toggle |
| Map Pool Size | `3`, `5`, `7` (default), `9`, `11`, `13`, `15` selector |
| Selection Mode | Player Veto OR "Veto to 3 + Random" |
| **GO Button** | Green if selected map count = pool size. Grey + disabled otherwise. |

> In `mode=both`, Team 1/Team 2 fields are pre-populated from URL params.

**Bottom two-thirds — Map Selection Grid:**
- Same card grid as Browse Maps (with same filter bar)
- Default: **7 current Active Duty maps pre-selected**
- Active Duty maps pinned to top of grid
- All other maps sorted newest-first after that
- Clicking a card toggles selected/unselected state
- Selected count shown prominently (e.g., `"7 / 7 maps selected"`)
- GO button turns green when count matches Pool Size setting

#### Sub-State 2: Veto Screen

**Layout:**
```
┌──────────┬───────────────────────────────────────┐
│ History  │  Current Turn: [Team Name] — [Action] │
│ Panel    ├───────────────────────────────────────┤
│ (slim    │                                       │
│  left)   │         Map Grid (full area)          │
│          │                                       │
│ [Undo]   │                                       │
│ [Redo]   │                                       │
│ [Reset]  │                                       │
└──────────┴───────────────────────────────────────┘
```

**Veto Format Options (dropdown in config panel):**
| Format | Description |
|---|---|
| **ESL** (default) | Alternating bans → alternating picks → decider. Standard tournament format. |
| **HLTV** | Similar to ESL but pick order differs; used in some majors. |
| **Faceit** | Stricter alternating structure, common in ranked play. |
| **Veto to 3 + Random** | Both teams alternate bans until 3 remain; one is randomly selected. |
| **Random Pick** | No veto — map chosen randomly from pool immediately. |

**Bo3, 7 maps, ESL example sequence:**
`Ban → Ban → Ban → Ban → Pick → Pick → Decider (remaining 1)`

- Sequence auto-configured based on selected format + Bo format + pool size

**Map Grid Behavior:**
- All maps shown, unresolved at start
- Hover: transparent X (ban turn) or ✓ (pick turn) over thumbnail
- Click: Solid red X overlay (ban) or green ✓ overlay (pick), card locked
- No white border for banned maps
- Picked maps get white border treatment

**History Panel:**
- Chronological list: `"Team 1 banned Dust II"`, `"Team 2 picked Mirage"`, etc.
- Undo/Redo buttons with stack (stored in `localStorage`)
- Reset button → confirmation dialog → clears veto back to Sub-State 1
- Reset button remains clickable when result overlay is shown

**Result Overlay (on veto completion):**
- Modal overlay, full-screen dark background
- Shows 1, 3, or 5 selected maps as large cards (CS2 "accept map" style)
- Map name text below each thumbnail
- `"Accept"` button → 
  - Normal mode: returns to `index.html`
  - `mode=both`: goes to `match-summary.html` with all state encoded

---

### 5. Choose Both (Combined Flow)

**Entry:** `index.html` "Choose Both" button → `choose-team.html?mode=both`

**Flow:**
1. User assigns players to teams on Choose Team page
2. User clicks "Lock In"
3. Auto-navigated to `choose-map.html?mode=both&team1=[name]&team2=[name]`
4. User configures map pool and runs veto
5. Result overlay shown → user clicks "Accept"
6. Navigated to `match-summary.html`

---

### 6. Match Summary

**File:** `match-summary.html`  
*(Only reached via "Choose Both" flow)*

**Layout:**
- Two team panels side by side showing team name, side icon, and player list
- Center or below: selected map(s) shown as large cards with names
- Bottom corner: small text showing veto history log (bans/picks only, no player action order)
- "Back to Home" button

**State Input:** URL params or `sessionStorage` from previous pages

---

## Global Navigation

**Hamburger Menu (all pages)**
- Floating top-left, always visible
- Opens a slide-in or dropdown panel with links:
  - Home
  - Browse Maps
  - Choose Team
  - Choose Map
  - Choose Both
- Closes on outside click or ESC
- No full nav bar — pages feel near fullscreen

---

## Persistent State Strategy

| Data | Storage | Key |
|---|---|---|
| Player names + assignments | `localStorage` | `cs-tools-teams` |
| Veto history (undo/redo stack) | `localStorage` | `cs-tools-veto` |
| Map selection config | `localStorage` | `cs-tools-map-config` |
| Flow state (both mode) | `sessionStorage` + URL params | — |

---

## Implementation Order

> [!IMPORTANT]
> Complete each phase before starting the next. Data must exist before UI is built.

### Phase 0 — Data
- [ ] Create `data/maps.json` with a seed set of ~20 well-known maps to develop against
- [ ] Finalize tag taxonomy
- [ ] Source/placeholder thumbnails

### Phase 1 — Foundation
- [ ] `css/style.css` — full design system, tokens, card component, grid, panels
- [ ] `js/maps-data.js` — fetch + parse `maps.json`, expose filter/sort utilities

### Phase 2 — Index + Navigation
- [ ] `index.html` — home page with 4 buttons
- [ ] Hamburger menu component (shared across all pages)

### Phase 3 — Browse Maps
- [ ] `browse-maps.html` + `js/browse-maps.js`
- [ ] Sticky filter bar, responsive card grid, all filter/sort logic

### Phase 4 — Choose Team
- [ ] `choose-team.html` + `js/choose-team.js`
- [ ] Player pool, drag-and-drop, auto-naming, side selector, lock-in, localStorage

### Phase 5 — Choose Map
- [ ] `choose-map.html` + `js/choose-map.js`
- [ ] Config panel, map selection grid (reuse Browse Maps components)
- [ ] Veto state machine, turn logic, history panel, undo/redo
- [ ] Result overlay

### Phase 6 — Match Summary + Both Flow
- [ ] `match-summary.html` + `js/match-summary.js`
- [ ] Wire up full Choose Both navigation chain

### Phase 7 — Polish
- [ ] Animations, transitions
- [ ] Mobile responsiveness
- [ ] Edge case handling (empty pools, refreshing mid-veto, etc.)

---

## Resolved Design Decisions

| # | Question | Answer |
|---|---|---|
| 1 | **Thumbnails** | Relative paths: `cs-tools/images/maps/<id>.jpg`. Path stored in map JSON. |
| 2 | **Map list input** | Web agent will supply CSV data; Python intake script converts it to `maps.json`. |
| 3 | **Veto sequence** | **ESL format is the default.** A dropdown will offer alternative formats (HLTV, Faceit, Custom). |
| 4 | **"Veto to 3 + Random"** | Both teams alternate bans until exactly 3 maps remain, then 1 is chosen randomly from those 3. |
| 5 | **Workshop links** | Clickable buttons in the map detail modal. |
| 6 | **Map detail** | Clicking a card in Browse Maps opens a full detail modal. All other pages (Picker, Veto) show a **(+)** icon in the card corner that opens the same modal. |
| 7 | **CS versions** | `CS1.6`, `CS:CZ`, `CS:S`, `CS:GO`, `CS2` — all separate tags. |
