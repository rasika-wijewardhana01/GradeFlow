# GradeFlow

**Smart grade & marks management for teachers — offline-first, no account needed.**

GradeFlow is a browser-based Progressive Web App that helps teachers record student marks, generate ranked results, analyse subject performance, and produce PDF report cards — all without an internet connection or a server account. Data stays on the device. Nothing is sent anywhere.

> Built for the Sri Lankan G.C.E. O/L classroom context, but flexible enough for any marks-based grading system.

---

## Live Demo

🌐 **[gradeflow1.netlify.app](https://gradeflow1.netlify.app/)** *(deployed on Netlify)*

---

## Features

### Core Workflow
- **6-step guided flow** — Setup → Students → Subjects → Marks → Results → Analytics
- **Class Setup** — exam name, academic year, teacher name, school name, grading scale, pass mark
- **Student Management** — add/remove/reorder students; custom index numbers; sample data loader
- **Subject Management** — subjects grouped into categories (Academic, Aesthetic, Sports, Languages); mandatory vs. elective toggle; drag-to-reorder within and across groups

### Marks Entry
- Spreadsheet-like marks table with full keyboard navigation (↑ ↓ ← → Tab Enter)
- **Absent (AB) marking** — distinct from blank and zero; excluded from averages and analytics
- Elective subject locking — when a student picks one subject in an elective group, siblings auto-lock
- Mobile numeric toolbar with digit pad, stepper buttons, and swipe gestures
- **CSV / Excel import** — fuzzy column mapping, preview before confirm, downloadable template

### Results & Exports
- Auto-ranked results table with totals, percentages, and letter grades
- Filter and sort by grade, rank, name, or score
- **Excel export** — full results sheet with per-subject breakdown; filterable export
- **PDF export** — A3-landscape report card rendered via html2canvas + jsPDF; includes school branding, logo, signature line

### Analytics
- Per-subject stats: average, median, highest, lowest, fail rate, pass rate
- Canvas bar chart with colour-coded grade distribution
- Mobile card view / desktop table toggle
- Subject compare drill-down across exam terms

### Exam Manager (Multi-Term)
- Create, rename, duplicate, archive, and switch between multiple exam sessions
- Drag-to-reorder exam list
- Exam Type metadata field with filter bar
- Ctrl+K quick-switcher
- Completion progress bars and pass rate pills
- Compare terms side-by-side in a modal; export compare results to Excel

### School Branding
- Logo upload (stored as base64), primary colour picker
- School name, address, term label, principal name, signature toggle
- Applied to PDF exports automatically

### Storage & Offline
- **Three-tier StorageEngine**: IndexedDB (primary) → File System Access API (optional folder sync) → localStorage (fallback)
- IDB is always the source of truth — session restores reliably on page reload even when File System permission lapses
- Autosave every 20 seconds with dirty-state tracking
- Manual JSON backup export/import (works on every browser including iOS Safari and Firefox)
- Full PWA: installable, offline-capable, service worker with pre-cached assets

### UX & Accessibility
- Glassmorphism dark theme with CSS custom property tokens
- Cinematic splash screen with WebGL-style ambient canvas, floating educational symbols, and expo-out animations
- Interactive guided tour (60-second onboarding)
- Keyboard shortcut reference modal (Ctrl+?)
- Undo system for marks entry
- Toast notification system
- WCAG AA colour contrast; ARIA labels throughout
- Responsive layout — sidebar on desktop, bottom nav + More sheet on mobile/tablet
- Swipe gestures for step navigation on touch screens
- Reduced-motion respected

---

## Tech Stack

| Layer | Choice |
|---|---|
| Build tool | [Vite 8](https://vitejs.dev/) (Rolldown / ESM) |
| Language | Vanilla JavaScript (ES modules) |
| Styling | CSS custom properties, no framework |
| Storage | IndexedDB + File System Access API + localStorage |
| PDF | html2canvas + jsPDF |
| Excel | SheetJS (xlsx) |
| PWA | Service Worker + Web App Manifest |
| Hosting | [Netlify](https://netlify.com) |

No runtime framework. No backend. No database server.

---

## Project Structure

```
gradeflow/
├── index.html                  # Single-page app entry point
├── style.css                   # Global base styles
├── sw.js                       # Service worker (pre-cache + offline)
├── manifest.json               # PWA manifest
├── netlify.toml                # Build config + headers + SPA redirects
├── vite.config.js              # Vite build with manual chunk splitting
├── package.json
│
├── public/                     # Static assets → copied to dist/ as-is
│   ├── icons/                  # PWA icons (16px – 1024px)
│   ├── manifest.json
│   └── sw.js
│
└── src/
    ├── app.js                  # App bootstrap and init
    ├── splash-screen.js        # Animated splash (canvas + symbols)
    ├── splash.js / .css
    ├── tour.js / .css          # Guided onboarding tour
    ├── swipe-gestures.js       # Touch swipe navigation
    ├── subject-autocomplete.js
    ├── main.css                # Core layout
    ├── *.css                   # Feature-scoped stylesheets
    │
    ├── modules/                # Feature modules (ES modules)
    │   ├── state.js            # Global state + window.* exports
    │   ├── storage.js          # StorageEngine (IDB / FS / LS)
    │   ├── autosave.js         # Auto-save, session persist, reload guard
    │   ├── students.js         # Student CRUD
    │   ├── subjects.js         # Subjects & categories CRUD
    │   ├── marks-table.js      # Marks entry table render
    │   ├── keyboard-nav.js     # Keyboard navigation for marks table
    │   ├── grading.js          # Grading scale + pass mark panel
    │   ├── results.js          # Compute & render results, Excel export
    │   ├── analytics.js        # Subject analytics, bar chart
    │   ├── exam-manager.js     # Multi-exam (multi-term) CRUD
    │   ├── import.js           # CSV/Excel import with column mapping
    │   ├── backup.js           # JSON backup export/import
    │   ├── print.js            # PDF export (html2canvas + jsPDF)
    │   ├── branding.js         # School branding settings
    │   ├── consent.js          # Cookie / storage consent banner
    │   ├── feedback.js         # In-app feedback form
    │   ├── reset.js            # Full reset dialogs
    │   ├── undo.js             # Undo stack
    │   ├── ui-theme.js         # Dark/light mode, CSS vars
    │   ├── ui-helpers.js       # Toast, modal helpers
    │   ├── context-menu.js     # Right-click fill context menu
    │   ├── shortcut-modal.js   # Keyboard shortcut reference
    │   ├── student-card.js     # Per-student detail card
    │   ├── class-template.js   # Class template save/load
    │   ├── subject-grades.js   # Subject-level grade breakdown
    │   └── sw-registration.js  # Service worker registration
    │
    ├── styles/
    │   └── motion.css          # Animation tokens
    │
    └── templates/              # HTML template partials (loaded at runtime)
        ├── splash-screen.html
        ├── sidebar.html
        ├── bottom-nav.html
        ├── main-content.html
        ├── panels-grading.html
        ├── modal-exam-manager.html
        ├── modal-import.html
        ├── modal-share-export.html
        ├── modal-backup.html
        ├── modal-compare-terms.html
        ├── modal-student-card.html
        ├── modal-shortcuts-help.html
        ├── modal-reset-dialogs.html
        ├── modal-legal.html
        ├── modal-restore-session.html
        ├── more-sheet.html
        ├── mobile-numeric-toolbar.html
        ├── mobile-undo-fab.html
        ├── fill-context-menu.html
        ├── consent-banner.html
        ├── toast.html
        ├── swipe-indicators.html
        └── tour-overlay.html
```

---

## Getting Started (Local Development)

### Prerequisites
- Node.js ≥ 18

### Install & run

```bash
git clone https://github.com/rasika-wijewardhana01/GradeFlow
cd gradeflow
npm install
npm run dev        
```

### Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

---

## Deployment (Netlify)

The repo includes a `netlify.toml` that handles everything:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **SPA routing:** all routes redirect to `index.html` (status 200)
- **Security headers:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- **Caching strategy:**
  - `index.html` and `sw.js` → `no-cache` (always fresh)
  - Hashed JS/CSS assets → `immutable` (1-year cache)

To deploy your own instance, connect the repo to Netlify and it will build and deploy automatically on every push to `main`.

> **Note on the Vite build:** Vite wraps all modules in closures, which means functions are not automatically available as globals. GradeFlow resolves this by explicitly exporting every function that HTML `onclick=` attributes call onto `window.*` inside each module. If you add new modules, follow the same pattern.

---

## Browser Support

| Browser | Marks entry | PDF export | File System sync |
|---|---|---|---|
| Chrome / Edge (desktop) | ✅ | ✅ | ✅ |
| Firefox (desktop) | ✅ | ✅ | ❌ (no FSAPI) |
| Safari (macOS) | ✅ | ✅ | ❌ |
| Chrome (Android) | ✅ | ✅ | ✅ |
| Safari (iOS) | ✅ | ✅ | ❌ |

File System sync is an enhancement — the app works fully without it. JSON backup/restore works on every browser.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` | Save manually |
| `Ctrl + Z` | Undo last mark change |
| `Ctrl + K` | Open exam quick-switcher |
| `Ctrl + ?` | Open keyboard shortcuts reference |
| `↑ ↓ ← →` | Navigate marks table cells |
| `Tab / Enter` | Move to next cell |
| `F5 / Ctrl+R` | Intercepted — shows safe-reload dialog |

---

## Roadmap

- [ ] Multi-class support (multiple class rosters under one school)
- [ ] Teacher-to-teacher data share via QR code or share link
- [ ] O/L subject preset library (auto-populate common Sri Lankan subjects)
- [ ] Remarks/comments column per student
- [ ] Google Drive backup integration

---

## Author

Built by **Rasika Wijewardhana** 

Feedback, bug reports, and feature suggestions are welcome via the in-app **Send Feedback** button or by opening a GitHub issue.
