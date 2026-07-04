// ═══════════════════════════════════════════════════════════════
//  src/app.js  —  GradeFlow Entry Point
//
//  Before modularisation: 13,057 lines, 287 functions, 1 file.
//  After modularisation:  ~80 lines here + 19 focused modules.
//
//  CSS is imported here so Vite bundles and fingerprints it.
//  All inline <style> blocks have been moved to src/*.css files.
// ─────────────────────────────────────────────────────────────
import './main.css';
import './styles/sync.css';

// ── Splash screen & swipe (self-contained IIFEs, load early) ──
import './splash-screen.js';
import './swipe-gestures.js';
import './tour.js';
import './subject-autocomplete.js';
//
//  Import order follows dependency graph:
//    state → storage → ui-helpers
//    → students, subjects → marks-table → keyboard-nav
//    → subject-grades, branding → results, print
//    → autosave → exam-manager
//    → import, class-template, analytics
//    → undo → student-card, grading, context-menu
//    → backup, reset, consent, shortcut-modal, sw-registration
//
//  All functions are exposed via window.* inside each module so
//  HTML onclick= attributes in index.html work without changes.
// ═══════════════════════════════════════════════════════════════

// ── Phase 1: Foundation ──
import './modules/state.js';
import './modules/storage.js';
import './modules/ui-helpers.js';

// ── Phase 1b: Theme & UI chrome ──
import './modules/ui-theme.js';

// ── Phase 2: Core data modules ──
import './modules/students.js';
import './modules/subjects.js';
import './modules/marks-table.js';
import './modules/keyboard-nav.js';

// ── Phase 2: Grade helpers and branding (results depends on both) ──
import './modules/subject-grades.js';
import './modules/branding.js';

// ── Phase 3: Feature modules ──
import './modules/results.js';
import './modules/print.js';
import './modules/autosave.js';
import './modules/exam-manager.js';
import './modules/import.js';
import './modules/class-template.js';
import './modules/analytics.js';

// ── Phase 3: Undo (loads after all mutating functions are defined) ──
import './modules/undo.js';

// ── Phase 3: Remaining features ──
import './modules/student-card.js';
import './modules/grading.js';
import './modules/context-menu.js';

// ── Phase 4: Utilities & background services ──
import './modules/backup.js';
import './modules/sync.js';
import './modules/reset.js';
import './modules/progress-tracker.js';
import './modules/attendance.js';
import './modules/class-broadcast.js';
import './modules/ocr-import.js';
import './modules/consent.js';
import './modules/shortcut-modal.js';
import './modules/feedback.js';
import './modules/save-location-prompt.js';
import './modules/sw-registration.js';
