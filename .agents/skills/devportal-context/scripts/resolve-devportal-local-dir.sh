#!/usr/bin/env bash
set -euo pipefail

is_devportal_local() {
  local candidate=$1
  [[ -f "$candidate/.chart-pin" && -f "$candidate/docker-compose.yml" ]]
}

if [[ -n "${DEVPORTAL_LOCAL_DIR:-}" ]]; then
  if ! is_devportal_local "$DEVPORTAL_LOCAL_DIR"; then
    printf 'DEVPORTAL_LOCAL_DIR is not a devportal-local checkout: %s\n' "$DEVPORTAL_LOCAL_DIR" >&2
    printf 'Clone devportal-local and set DEVPORTAL_LOCAL_DIR to that checkout.\n' >&2
    exit 1
  fi
  cd -- "$DEVPORTAL_LOCAL_DIR"
  pwd -P
  exit 0
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
monorepo_root=$(CDPATH= cd -- "$script_dir/../../../.." && pwd -P)

mapfile -t candidates < <(
  find -L "$monorepo_root/.." "$monorepo_root/../.." -maxdepth 3 \
    -type f -name .chart-pin \
    -exec sh -c 'for marker; do candidate=${marker%/.chart-pin}; if [ -f "$candidate/docker-compose.yml" ]; then printf "%s\n" "$candidate"; fi; done' sh {} + |
    sort -u
)

case "${#candidates[@]}" in
  0)
    printf 'devportal-local checkout not found. Clone devportal-local and set DEVPORTAL_LOCAL_DIR to that checkout.\n' >&2
    exit 1
    ;;
  1)
    printf '%s\n' "${candidates[0]}"
    ;;
  *)
    printf 'Multiple devportal-local checkouts found:\n' >&2
    printf '  %s\n' "${candidates[@]}" >&2
    printf 'Set DEVPORTAL_LOCAL_DIR to the checkout to use.\n' >&2
    exit 1
    ;;
esac
