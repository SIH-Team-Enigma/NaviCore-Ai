# CODESTYLE.md

## Project: NaviCore AI
**Scope**: Kotlin (Android app), C++ (native fusion core, JNI, stretch goal per Roadmap §2 Phase 2), Python (training pipeline, ML spec §2–§3), and ROS2 C++ (post-hackathon).

The team is small (Roadmap §5) and the timeline is tight (Roadmap §1) — these rules exist to keep a handoff between AI/ML, systems, and Android roles cheap, not to enforce style for its own sake. When a rule and the deadline conflict, prefer something that compiles and is documented over something perfectly formatted.

---

## 1. General Principles

- **Match the honesty standard set in the project docs.** A function named `estimateDriftMeters()` must not silently return a hardcoded target from PRD §3.2 — if it's not measured yet, return `null`/`Optional` or throw `NotYetMeasuredException`, don't fake a number that looks real. This is a direct extension of PRD/Roadmap's "don't overclaim" principle into code.
- **No magic sample rates.** Because of the 10 Hz (training) vs. up-to-100 Hz (device) mismatch documented in ML spec §2.1, any function touching a sample count or window length must take the rate as an explicit parameter or class field — never a bare literal `100` or `10` buried in logic.
- **Fail toward visible uncertainty, not confident silence** (SECURITY.md §7). A function that can't produce a confident estimate returns an explicit low-confidence/null value; it does not substitute a plausible-looking default.
- **One unit system, always labeled.** SI units only (m, m/s, rad, rad/s). Every variable holding a physical quantity carries its unit in the name (`speedMps`, `headingRad`) — the ML spec and PRD already do this; code should too.

---

## 2. Kotlin (Android App)

- **Style base**: official Kotlin coding conventions + `ktlint`, run in CI before merge.
- **Naming**: `camelCase` for functions/variables, `PascalCase` for classes/interfaces, `UPPER_SNAKE_CASE` for constants (e.g. `const val ZUPT_CONFIDENCE_THRESHOLD = 0.85f`, matching ML spec §5).
- **Nullability**: prefer explicit nullable types (`RotationMatrix?`) over sentinel values (e.g. an identity matrix meaning "uncalibrated") — see API.md §2, where `currentRotation()` returns `null` deliberately.
- **Coroutines over raw threads** for the sensor-ingestion foreground service; avoid blocking the main thread with inference or fusion calls (PRD §5.1 latency budget).
- **Data classes for all cross-module contracts** (`ImuSample`, `FusionState`, etc., per API.md) — no loose `Map<String, Any>` payloads between modules.
- **No hardcoded UI copy for confidence states.** Strings like "NaviCore AI Active (Dead Reckoning)" (PRD §7.1) live in `strings.xml`, and any string implying certainty (e.g. a specific drift number) must be interpolated from a real measured value, never a static string repeating a PRD target.
- **Testing**: unit tests for calibration math, fusion state transitions, and ZUPT trigger logic are required before a module is marked "done" in the Roadmap — a checked-off Roadmap milestone (Roadmap §4) should correspond to passing tests, not just code that exists.
- **Lint gate**: `ktlint` + Android Lint clean (warnings reviewed, not blindly suppressed) before a PR merges into the branch used for the demo build.

---

## 3. C++ (Native Fusion Core / JNI)

Status: stretch goal per Roadmap §2 Phase 2 — a Kotlin fallback must exist regardless (Roadmap §6 risk table), so this native layer is additive, not a demo dependency.

- **Style base**: Google C++ Style Guide, adapted:
  - `snake_case` for functions/variables, `PascalCase` for classes, `kPascalCase` for constants.
  - 2-space indentation, 100-column soft limit.
- **Formatting**: `clang-format` with a checked-in `.clang-format`, run pre-commit.
- **Memory safety**: no raw `new`/`delete` in the fusion core — use RAII (`std::unique_ptr`, Eigen's stack-allocated fixed-size matrices where possible) given SECURITY.md §6 flags this layer as the broadest memory-safety surface in the stack.
- **JNI boundary discipline**: every JNI-exposed function validates buffer sizes/lengths coming from the Kotlin side before touching native memory — a zero-copy `DirectByteBuffer` bridge (Roadmap Phase 2) is a real attack/crash surface if the Kotlin side ever passes a mismatched size.
- **Eigen usage**: prefer fixed-size matrices (`Eigen::Matrix<float, 15, 15>` for the ESKF state, ML spec's 15-state filter) over dynamic-size where the dimension is known at compile time — faster and catches dimension-mismatch bugs at compile time instead of runtime.
- **No exceptions across the JNI boundary** — catch at the native/JNI edge and convert to an error code or `Result`-style return, since an uncaught C++ exception crossing into the JVM crashes the app.
- **Testing**: the ESKF and NHC/ZUPT logic get native unit tests (e.g. GoogleTest) independent of the Android build, so the fusion math can be verified without a device — matching Roadmap §2's push toward measured, not assumed, correctness.

---

## 4. Python (Training Pipeline)

- **Style base**: PEP 8 + `black` (default settings) + `ruff` for linting, both run pre-commit.
- **Naming**: `snake_case` throughout; tensor shape and unit conventions documented in every function docstring (e.g. `# shape: [batch, 6, window_len] at training_rate_hz`) — this is not optional given the rate-mismatch risk called out in ML spec §2.1.
- **No hardcoded sample rate.** `window_len`, `stride`, and `training_rate_hz` are configuration values (e.g. a dataclass or YAML config), never literals scattered across preprocessing, model, and export code — the single biggest code-review checkpoint for this project, directly tied to the ML spec §2.1 correction.
- **Reproducibility**: every training run logs the exact dataset version/commit (SECURITY.md §6), random seed, and config used to produce a given `.tflite` export — a reported RMSE (PRD §8, ML spec §7) must be traceable back to the exact run that produced it.
- **Notebooks**: exploratory work stays in notebooks; anything feeding the actual training/export pipeline used for the demo build must be a plain `.py` script or module under version control, not a notebook cell run by hand.
- **Type hints**: required on all functions in the preprocessing/export pipeline (`mypy`-checked), since a silent type/shape mismatch here is exactly the kind of bug the rate-mismatch note in ML spec §2.1 is warning about.
- **Testing**: at minimum, a test that asserts the exported `.tflite` model's expected input shape matches the on-device `window_len`/rate configuration documented in API.md §3 — this is the single test most likely to catch the training/deployment mismatch before it ships.

---

## 5. ROS2 C++ (Post-Hackathon)

Not part of the SIH prototype (Roadmap §3), documented here only so a future contributor doesn't invent conflicting conventions:

- Follow ROS2's standard C++ style guide (`ament_lint`, `uncrustify`) rather than this project's Google-style native core, since ROS2 tooling assumes it.
- Topic/message naming matches API.md §6 exactly (`/navicore/odom`, `/navicore/pose`, `/navicore/status`) — do not rename without updating that contract.
- Any covariance published on `/navicore/pose` must come from the real fusion-core state (API.md §6 note) — a placeholder/identity covariance is treated as a bug, not a stub, because downstream robotics consumers will trust it.

---

## 6. Commit & Review Conventions

- **Commit messages**: `<module>: <short imperative summary>` (e.g. `fusion: add heading uncertainty growth during blackout`), referencing the relevant PRD/Roadmap section when it closes a specific milestone (e.g. `Closes Roadmap Phase 2 heading-correction milestone`).
- **PRs touching accuracy claims** (drift numbers, latency, battery) must link to the actual benchmark run/log that produced the number — per the project-wide rule against restating PRD/ML-spec *targets* as if they were *results* (PRD §3.2, ML spec §7). A reviewer should reject a PR that copies a target number into a log message, UI string, or comment as though it were measured.
- **Definition of done** for any Roadmap checklist item: code merged, tests passing, and — where the item involves a number (RMSE, latency, drift) — that number recorded from an actual run, not left as the PRD's target value.