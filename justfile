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
	cd {{strata_dir}} && cargo build --release --target aarch64-apple-ios -p tracker_ffi

ffi-sim:
	cd {{strata_dir}} && cargo build --release --target aarch64-apple-ios-sim -p tracker_ffi

ffi-xcframework: ffi-device ffi-sim
	rm -rf {{ffi_output}}
	xcodebuild -create-xcframework \
		-library {{strata_dir}}/target/aarch64-apple-ios/release/libtracker_ffi.a \
		-library {{strata_dir}}/target/aarch64-apple-ios-sim/release/libtracker_ffi.a \
		-output {{ffi_output}}

# --- Workout pack helpers ----------------------------------------------------

pack-build:
	cd workout-pack && cargo build --release

pack-test:
	cd workout-pack && cargo test

# --- React Native / TypeScript -----------------------------------------------

ts-check:
	cd {{view_dir}} && npx tsc --noEmit

ios:
	cd {{view_dir}} && npm run ios

metro:
	cd {{view_dir}} && npm start

pods:
	cd {{view_dir}}/ios && pod install
