# Strata (Tracker Core)

Strata hosts the **generic tracker engine** (DSL → IR → engine → planning) as a pure Rust project.
It is **not the full product**; the intention is for UI clients (React Native, native apps) to consume this
library via C/JSI bridges or other bindings. Treat this repo as the language-agnostic core that can be
included as a git submodule or dependency in platform-specific applications.

See `llm/GUIDELINES.md` and `llm/ARCHITECTURE.md` for architectural constraints and goals.
