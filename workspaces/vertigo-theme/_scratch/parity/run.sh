#!/usr/bin/env bash
# Parity gate: compile the theme modules to plain ESM, then diff the theme the
# plugin builds against the theme the tenant's app-config block builds.
# Only TS-pure modules are compiled (src/index.ts is skipped — it imports CSS).
set -euo pipefail
cd "$(dirname "$0")"

PLUGIN=../../plugins/vertigo-platform-plugin-vertigo-theme

rm -rf build
(cd "$PLUGIN" && npx tsc \
  src/themes/tokens.ts \
  src/themes/palette.ts \
  src/themes/typography.ts \
  src/themes/components.ts \
  src/themes/mergeComponents.ts \
  src/themes/vertigoLight.ts \
  src/themes/vertigoDark.ts \
  --outDir ../../_scratch/parity/build \
  --module es2022 --target es2022 --moduleResolution bundler \
  --skipLibCheck --esModuleInterop)

node --import ./register.mjs ./check.mjs
