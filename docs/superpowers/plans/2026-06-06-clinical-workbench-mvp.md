# Clinical Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable web MVP for PKU/MMA rare disease case structuring, timeline review, metric trends, evidence page classification, and doctor-reviewed AI draft summaries.

**Architecture:** A dependency-free static web app backed by local JSON and small pure JavaScript data utilities. The first version demonstrates the clinical workflow and data model without claiming automated OCR or autonomous diagnosis.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Node.js built-in test runner.

---

### Task 1: Core Data Model And Tests

**Files:**
- Create: `package.json`
- Create: `tests/clinicalData.test.js`
- Create: `src/clinicalData.js`

- [ ] **Step 1: Write failing tests**

Create tests for page classification, timeline sorting, metric trend extraction, and decision signals.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `src/clinicalData.js` does not exist yet.

- [ ] **Step 3: Implement minimal data utilities**

Create pure functions that operate on structured case objects.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

### Task 2: Seed Rare Disease Case Data

**Files:**
- Create: `data/cases.json`

- [ ] **Step 1: Add anonymized PKU and MMA case records**

Use the observed PDF structure as seed data while avoiding patient-identifying details.

- [ ] **Step 2: Validate JSON loads**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/cases.json','utf8')); console.log('ok')"`
Expected: `ok`.

### Task 3: Doctor Workbench UI

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`

- [ ] **Step 1: Build the dashboard shell**

Create a case list, summary panel, timeline, metric trend chart, evidence page list, review checklist, and AI draft section.

- [ ] **Step 2: Wire interactions**

Case selection, metric switching, doctor review toggles, and local upload queue should update without page refresh.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

### Task 4: Local Verification

**Files:**
- Modify: none unless verification finds defects.

- [ ] **Step 1: Start static server**

Run: `python3 -m http.server 8000`
Expected: server available at `http://localhost:8000`.

- [ ] **Step 2: Browser verification**

Open `http://localhost:8000`, inspect desktop and mobile layouts, and confirm the app renders nonblank with no obvious overlap.
