# CODESTYLE.md — Extra-Detailed Edition

## Project: NaviCore AI
**Scope**: Kotlin (Android app, Phase 3), C++ (native fusion core, Phase 2 stretch), Python (training pipeline, Phase 1), and ROS2 C++ (post-hackathon). Tooling setup is tagged by the Roadmap week it should be in place, so linting isn't retrofitted after the fact.

The team is small and the timeline is tight — these rules exist to keep handoffs between AI/ML, systems, and Android roles cheap. When a rule and the deadline conflict, prefer something that compiles and is documented over something perfectly formatted.

---

## 1. General Principles (apply from Day 1, all phases)

- **Match the honesty standard set in the project docs.** A function named `estimateDriftMeters()` must not silently return a hardcoded target from PRD §3.2 — if not measured yet, return `null`/`Optional` or throw `NotYetMeasuredException`.
- **No magic sample rates.** Because of the 10 Hz (training, Phase 1) vs. up-to-100 Hz (device, Phase 3) mismatch (ML spec §2.1), any function touching a sample count or window length takes the rate as an explicit parameter — never a bare literal `100` or `10`. This is checked in code review starting Phase 1 Day 3 (windowing module).
- **Fail toward visible uncertainty, not confident silence** (SECURITY.md §7).
- **One unit system, always labeled.** SI units only; every variable holding a physical quantity carries its unit in the name (`speedMps`, `headingRad`).

---

## 2. Python (Training Pipeline) — Roadmap Phase 1, Weeks 1–2

**Tooling setup — Day 1, before any training code is written**:
1. Initialize the repo with `black` (default settings) and `ruff` configured as pre-commit hooks.
2. Add `mypy` with strict mode for the preprocessing/export pipeline modules.
3. Set up a `requirements.txt`/lockfile with pinned versions (SECURITY.md §6).

**Style rules, applied through Phase 1**:
- `snake_case` throughout; tensor shape and unit conventions documented in every function docstring (e.g. `# shape: [batch, 6, window_len] at training_rate_hz`) — non-optional given the rate-mismatch risk.
- `window_len`, `stride`, and `training_rate_hz` are configuration values (dataclass or YAML config), never literals scattered across preprocessing (Day 3), model (Day 6), and export (Day 9) code — the single biggest code-review checkpoint for this project.
- Reproducibility: every training run (Day 7–8) logs the exact dataset version/commit (Day 1), random seed, and config — a reported RMSE (Day 9) must be traceable back to the exact run that produced it.
- Notebooks stay exploratory (Day 5 EDA); anything feeding the actual training/export pipeline (Days 6–10) is a plain `.py` module under version control.
- Type hints required on all preprocessing/export functions, `mypy`-checked.
- **Required test, written Day 10**: assert the exported `.tflite` model's expected input shape matches the on-device `window_len`/rate configuration documented in API.md §3 — the single test most likely to catch the training/deployment mismatch before it ships.

---

## 3. Kotlin (Android App) — Roadmap Phase 2 (fusion, if Kotlin-first) & Phase 3 (app)

**Tooling setup — Phase 2 Day 11 / Phase 3 Day 26, before module code is written**:
1. Configure `ktlint` and Android Lint in the build, wired into CI.
2. Set up the module structure matching API.md's module map (§1): `calibration/`, `odometer/`, `fusion/`, `mapmatch/`, `ui/`.

**Style rules**:
- Official Kotlin coding conventions + `ktlint`.
- `camelCase` functions/variables, `PascalCase` classes/interfaces, `UPPER_SNAKE_CASE` constants (e.g. `const val ZUPT_CONFIDENCE_THRESHOLD = 0.85f`, ML spec §5).
- Nullability: prefer explicit nullable types (`RotationMatrix?`) over sentinel values — see API.md §2, where `currentRotation()` returns `null` deliberately (Phase 2, Day 11–15).
- Coroutines over raw threads for the sensor-ingestion foreground service (Phase 3, Day 29); avoid blocking the main thread with inference or fusion calls (PRD §5.1 latency budget).
- Data classes for all cross-module contracts (`ImuSample`, `FusionState`, etc.) — no loose `Map<String, Any>` payloads, enforced at the Phase 2/Phase 3 integration boundary (Day 28).
- No hardcoded UI copy implying unmeasured certainty — strings implying a specific drift number must be interpolated from a real measured value (Phase 3, Day 37 telemetry overlay), never a static string repeating a PRD target.
- **Testing gate per phase**:
  - Phase 2 exit (Day 23): unit tests for calibration math, fusion state transitions, ZUPT trigger logic.
  - Phase 3 exit (Day 39): integration tests / manual QA pass on the live demo path.
- `ktlint` + Android Lint clean (warnings reviewed, not blindly suppressed) before a PR merges into the demo-build branch.

---

## 4. C++ (Native Fusion Core / JNI) — Roadmap Phase 2, Day 25 (stretch), only if the Kotlin path already meets exit criteria

**Tooling setup — before any native code is written**:
1. Check in a `.clang-format` (Google C++ Style Guide base, 2-space indent, 100-column soft limit).
2. Set up GoogleTest for native unit tests, independent of the Android build.

**Style rules**:
- `snake_case` functions/variables, `PascalCase` classes, `kPascalCase` constants.
- Memory safety: no raw `new`/`delete` in the fusion core — RAII (`std::unique_ptr`, Eigen's stack-allocated fixed-size matrices) given SECURITY.md §6 flags this layer as the broadest memory-safety surface.
- JNI boundary discipline: every JNI-exposed function validates buffer sizes/lengths from the Kotlin side before touching native memory — the zero-copy `DirectByteBuffer` bridge is a real crash surface if sizes mismatch.
- Eigen usage: prefer fixed-size matrices (`Eigen::Matrix<float, 15, 15>` for the ESKF state) over dynamic-size where the dimension is known at compile time.
- No exceptions across the JNI boundary — catch at the native/JNI edge and convert to an error code, since an uncaught C++ exception crossing into the JVM crashes the app.
- **Testing**: ESKF and NHC/ZUPT logic get native unit tests independent of the Android build — written alongside the native port itself (Day 25), not deferred.

**Explicit note**: because this track only starts Day 25 and only if Phase 2's Kotlin exit criteria (Roadmap §3) are already met, no demo-critical feature may depend on this track landing. Treat it as a pure performance optimization.

---

## 5. Python/GIS (Map-Matching, Stretch) — Roadmap Phase 3, Days 35–36

- Same Python style rules as §2 (black/ruff/mypy) if the map-matching module is Python-based; if implemented in Kotlin instead, follow §3.
- OSM parsing and HMM/Viterbi code gets the same "no magic constants" treatment — emission/transition probability parameters are named, documented constants, not inline literals.
- **Testing**: at minimum one test verifying `match()` returns `null` (not a forced snap) on a synthetic off-road trajectory (API.md §5 contract note).

---

## 6. ROS2 C++ (Post-Hackathon)

Not part of the SIH prototype (Roadmap §6). Documented here only so a future contributor doesn't invent conflicting conventions:
- Follow ROS2's standard C++ style guide (`ament_lint`, `uncrustify`) rather than this project's Google-style native core, since ROS2 tooling assumes it.
- Topic/message naming matches API.md §6 exactly — do not rename without updating that contract.
- Any covariance published on `/navicore/pose` must come from the real fusion-core state (API.md §6 note); a placeholder/identity covariance is a bug, not a stub.

---

## 7. Commit & Review Conventions (all phases)

- **Commit messages**: `<module>: <short imperative summary>` (e.g. `fusion: add heading uncertainty growth during blackout`), referencing the relevant PRD/Roadmap section/day when it closes a specific milestone (e.g. `Closes Roadmap Phase 2 Day 19-20 heading-correction milestone`).
- **PRs touching accuracy claims** (drift numbers, latency, battery) must link to the actual benchmark run/log that produced the number — reviewer rejects a PR that copies a target number into a log message, UI string, or comment as though measured.
- **Definition of done** for any Roadmap checklist item: code merged, tests passing, and — where the item involves a number (RMSE, latency, drift) — that number recorded from an actual run, not left as the PRD's target value.
- **Phase-gate reviews**: at the end of each Roadmap phase (Day 10, Day 25, Day 40, Day 50), a short review confirms the phase's Exit Criteria (Roadmap §2–5) are met before the next phase's integration work begins in earnest.