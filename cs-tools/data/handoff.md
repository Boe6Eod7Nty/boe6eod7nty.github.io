# CS Tools — Handoff & Continuation Plan

This document summarizes the current status of the **CS Tools** project and provides a clear roadmap for the next implementation phases.

## 📋 Status Summary

- [x] **Data Intake**: CSV data provided by the user has been successfully converted to the canonical `maps.json` format.
- [x] **File Structure**: Core directories created (`cs-tools/data/`, `cs-tools/css/`, `cs-tools/js/`).
- [x] **Seed Data**: `maps.json` contains 100+ maps with complete metadata (tags, versions, CS2 status, etc.).

## 📂 Current File State
- [maps.csv](file:///d:/Documents/boe6.net%20static%20versions/current_www/boe6eod7nty.github.io/cs-tools/data/maps.csv) — Source data.
- [maps.json](file:///d:/Documents/boe6.net%20static%20versions/current_www/boe6eod7nty.github.io/cs-tools/data/maps.json) — **Active data source** for the application.
- [cs-tools-plan.md](file:///d:/Documents/boe6.net%20static%20versions/current_www/boe6eod7nty.github.io/cs-tools/data/cs-tools-plan.md) — The master implementation plan.

---

## 🚀 Next Steps (Continuation)

The next agent/session should proceed with **Phase 1** and **Phase 2** of the implementation plan.

### 1. Phase 1: Foundation (CSS & Data Loader)
- **Create `css/style.css`**: Implement the design system tokens (colors, typography, shared card components) as defined in the [plan](file:///d:/Documents/boe6.net%20static%20versions/current_www/boe6eod7nty.github.io/cs-tools/data/cs-tools-plan.md#design-system).
- **Create `js/maps-data.js`**: 
    - Fetch `data/maps.json`.
    - Provide utility functions: `getAllMaps()`, `filterMaps(filters)`, `getMapById(id)`.

### 2. Phase 2: Home Page (`index.html`)
- Implement the 2x2 grid layout with 4 major entry points:
    - Browse Maps
    - Choose Team
    - Choose Map
    - Choose Both (Combined flow)
- Ensure the CS2-inspired dark tactical UI is consistent.

### 3. Phase 3: Browse Maps
- Create `browse-maps.html` and `js/browse-maps.js`.
- Implement the sticky filter bar and responsive card grid.

---

## ⚠️ Important Implementation Notes
- **No Frameworks**: Stick to Vanilla JS, Vanilla CSS, and Plain HTML.
- **Paths**: Use relative paths for all internal links to ensure portability.
- **Thumbnails**: Map images are referenced as `images/maps/<id>.jpg`. If images are missing, use a styled placeholder with the map name.
- **State**: Use `localStorage` for persistent team and veto data as specified in the plan.
