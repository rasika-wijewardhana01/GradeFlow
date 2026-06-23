// ═══════════════════════════════════════════════════════════════
//  src/modules/state.js
//  Global mutable state and navigation helpers
//  All other modules import from here. Nothing else should hold
//  top-level copies of students/subjects/marks/results/categories.
// ═══════════════════════════════════════════════════════════════

// ── Core data ──
let students = [];
let subjects  = [];
let marks     = {};
let results   = [];
let categories = [
  { name: 'Academic',  mandatory: true  },
  { name: 'Aesthetic', mandatory: false },
  { name: 'Sports',    mandatory: false },
  { name: 'Languages', mandatory: false },
];

// ── UI state ──
let currentStep      = 0;
let autoIndexCounter = 1;

// ── Visual-column navigation maps ──
// Populated by renderMarksTable(). Maps visual column ↔ subjects[] index.
// Required because category-grouped column order ≠ subjects[] insertion order.
let _navColOrder = [];   // _navColOrder[vcol] = sj
let _navSjToVcol = {};   // _navSjToVcol[sj]   = vcol

const stepMeta = [
  { title: 'Class Setup',       sub: 'Enter your class information to get started' },
  { title: 'Add Students',      sub: 'Build your class roster' },
  { title: 'Add Subjects',      sub: 'Define subjects and maximum marks' },
  { title: 'Enter Marks',       sub: 'Record scores for every student' },
  { title: 'Results',           sub: 'View rankings, averages and download report' },
  { title: 'Subject Analytics', sub: 'Class-level performance insights per subject' },
];

// Expose everything on window so HTML onclick= attributes work unchanged
Object.assign(window, {
  get students()        { return students; },
  set students(v)       { students = v; },
  get subjects()        { return subjects; },
  set subjects(v)       { subjects = v; },
  get marks()           { return marks; },
  set marks(v)          { marks = v; },
  get results()         { return results; },
  set results(v)        { results = v; },
  get categories()      { return categories; },
  set categories(v)     { categories = v; },
  get currentStep()     { return currentStep; },
  set currentStep(v)    { currentStep = v; },
  get autoIndexCounter(){ return autoIndexCounter; },
  set autoIndexCounter(v){ autoIndexCounter = v; },
  get _navColOrder()    { return _navColOrder; },
  set _navColOrder(v)   { _navColOrder = v; },
  get _navSjToVcol()    { return _navSjToVcol; },
  set _navSjToVcol(v)   { _navSjToVcol = v; },
  stepMeta,
});

export {
  students, subjects, marks, results, categories,
  currentStep, autoIndexCounter,
  _navColOrder, _navSjToVcol,
  stepMeta,
};
