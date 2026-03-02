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

# --- Workout pack helpers ----------------------------------------------------

pack-build:
	cd workout-pack && cargo build --release

pack-test:
	cd workout-pack && cargo test

pack-rebuild:
	just pack-build
	just ffi-xcframework

# --- React Native / TypeScript -----------------------------------------------

ts-check:
	cd {{view_dir}} && npx tsc --noEmit

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
