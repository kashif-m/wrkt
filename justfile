set shell := ["zsh", "-c"]

# Default target prints the available recipes.
default:
	@just --list

strata_dir := "strata"
view_dir := "view"
ffi_output := "view/ios/Strata/TrackerFFI.xcframework"

# --- Rust / Strata workspace -------------------------------------------------

core-build:
	cd {{strata_dir}} && cargo build --release

core-test:
	cd {{strata_dir}} && cargo test

clippy:
	cd {{strata_dir}} && cargo clippy --all-targets -- -D warnings
	cd workout-pack && cargo clippy --all-targets -- -D warnings

coverage-core:
	@if ! command -v cargo-llvm-cov >/dev/null 2>&1; then \
		echo "cargo-llvm-cov is required. Install via: cargo install cargo-llvm-cov"; \
		exit 1; \
	fi
	cd {{strata_dir}} && cargo llvm-cov --workspace --fail-under-lines 70 --summary-only

strata-publish-check:
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_ir
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_dsl
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_eval
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_engine
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_catalog
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_analytics
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_export
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_ffi_core
	cd {{strata_dir}} && cargo package --allow-dirty --offline -p tracker_ffi

ffi-device:
	cd workout-pack && CARGO_TARGET_DIR=../{{strata_dir}}/target cargo build --manifest-path crates/workout_ffi/Cargo.toml --release --target aarch64-apple-ios

ffi-sim:
	cd workout-pack && CARGO_TARGET_DIR=../{{strata_dir}}/target cargo build --manifest-path crates/workout_ffi/Cargo.toml --release --target aarch64-apple-ios-sim

ffi-xcframework: ffi-device ffi-sim
	rm -rf {{ffi_output}}
	xcodebuild -create-xcframework \
		-library {{strata_dir}}/target/aarch64-apple-ios/release/libtracker_ffi.a \
		-library {{strata_dir}}/target/aarch64-apple-ios-sim/release/libtracker_ffi.a \
		-output {{ffi_output}}

# --- Android FFI -------------------------------------------------------------

android-ffi:
	cd workout-pack && CARGO_TARGET_DIR=../{{strata_dir}}/target RUSTFLAGS="-C link-arg=-Wl,-soname,libtracker_ffi.so" \
		cargo ndk -t arm64-v8a -t armeabi-v7a -o ../view/android/app/src/main/jniLibs build --manifest-path crates/workout_ffi/Cargo.toml --release
	@tput sgr0 2>/dev/null || true # Rest terminal colors

# --- Workout pack helpers ----------------------------------------------------

pack-build:
	cd workout-pack && cargo build --release

pack-sync-dsl-contract:
	cd workout-pack && cargo build -p workout_pack

pack-test:
	cd workout-pack && cargo test

pack-rebuild:
	just pack-build
	just ffi-xcframework

# --- React Native / TypeScript -----------------------------------------------

ts-check:
	cd {{view_dir}} && npx tsc --noEmit

strata-purity:
	@if rg -n "workout|exercise|reps|weight|distance|bench|squat|muscle|hypertrophy|strength|conditioning|fitnotes" {{strata_dir}}/crates {{strata_dir}}/Cargo.toml --glob '!**/target/**'; then \
		echo "Strata purity check failed: domain-specific keywords found"; \
		exit 1; \
	fi
	@if rg -n "\\.\\./\\.\\./\\.\\./\\.\\./workout-pack|workout-pack|view/|include_str!\\(" {{strata_dir}}/crates {{strata_dir}}/Cargo.toml --glob '!**/target/**'; then \
		echo "Strata purity check failed: external module coupling found"; \
		exit 1; \
	fi

sot-check:
	just strata-purity
	just sot-strict
	just clippy
	cd {{strata_dir}} && cargo test -p tracker_dsl -p tracker_engine
	cd workout-pack && cargo test -p workout_pack -p workout_ffi
	cd {{view_dir}} && npx tsc --noEmit

sot-strict:
	@if rg -n "serde\\(alias\\s*=" workout-pack/src/analytics/types.rs; then \
		echo "SoT strict check failed: serde aliases are not allowed in workout analytics metric enums"; \
		exit 1; \
	fi
	@if rg -n "compileWorkoutTracker\\?|validateWorkoutEvent\\?|computeWorkoutTracker\\?|simulateWorkoutTracker\\?" view/src/TrackerEngine.ts; then \
		echo "SoT strict check failed: optional transitional workout bridge methods are not allowed"; \
		exit 1; \
	fi
	@if rg -n "interface (WorkoutAnalyticsQuery|BreakdownQuery|BreakdownResponse|ExerciseSeriesQuery|ExerciseSeriesResponse|HomeDayQuery|HomeDaysQuery|HomeDayResponse|HomeDaysResponse|CalendarMonthQuery|CalendarMonthResponse|AnalyticsSummary)" view/src --glob '!view/src/domain/generated/**'; then \
		echo "SoT strict check failed: workout API transport types must live in generated contracts only"; \
		exit 1; \
	fi

ios:
	cd {{view_dir}} && npm run ios

# Run iOS app on a connected physical device by name
ios-device device:
	cd {{view_dir}} && npx react-native run-ios --device "{{device}}"

metro:
	cd {{view_dir}} && npm start

pods:
	cd {{view_dir}}/ios && pod install

# --- Platform rebuilds (separated: iOS=system, Android=nix) ------------------

# Rebuild Android FFI from scratch (run inside nix shell)
rebuild-android: clean-android pack-test
	@echo "==> Building Android FFI..."
	just android-ffi
	@echo "==> Done! Ready to build Android."

# Rebuild iOS FFI from scratch (run in system shell, NOT nix)
rebuild-ios: clean-ios pack-test
	@echo "==> Building iOS FFI..."
	just ffi-xcframework
	@echo "==> Installing CocoaPods..."
	just pods
	@echo "==> Done! Ready to build iOS."

# Clean Android FFI artifacts
clean-android:
	rm -rf {{view_dir}}/android/app/src/main/jniLibs

# Clean iOS FFI artifacts
clean-ios:
	rm -rf {{ffi_output}}
	rm -rf {{strata_dir}}/target/aarch64-apple-ios
	rm -rf {{strata_dir}}/target/aarch64-apple-ios-sim

# --- Formatting --------------------------------------------------------------

# Format TypeScript/JavaScript/JSON
fmt-ts:
	cd {{view_dir}} && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,md}"

# Format Rust
fmt-rs:
	cd {{strata_dir}} && cargo fmt
	cd workout-pack && cargo fmt

# Format C++ and Objective-C (iOS)
fmt-cpp:
	find {{view_dir}}/ios -type f \( -name "*.mm" -o -name "*.cpp" -o -name "*.h" \) -not -path "*/Pods/*" | xargs clang-format -i
	find {{view_dir}}/android/app/src/main/cpp -name "*.cpp" -o -name "*.h" | xargs clang-format -i

# Format Kotlin (Android)
fmt-kt:
	cd {{view_dir}}/android && ./gradlew spotlessApply 2>/dev/null || ktlint --format "app/src/**/*.kt" 2>/dev/null || echo "Note: Install ktlint for Kotlin formatting"

# Format entire project (all languages)
fmt-all: fmt-rs fmt-ts fmt-cpp fmt-kt
	@echo "Formatted: Rust, TypeScript, C++/Obj-C, Kotlin"

# Quick format (Rust + TypeScript only, for daily use)
fmt: fmt-ts fmt-rs
