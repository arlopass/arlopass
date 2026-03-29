#!/usr/bin/env bash
# Generate platform-specific icon files from the source SVG.
# Produces:
#   assets/icon.ico   — Windows (16, 24, 32, 48, 64, 128, 256px layers)
#   assets/icon.icns  — macOS
#   assets/icon-256.png — intermediate PNG (also used as Linux icon)
#
# Requirements: rsvg-convert (librsvg), imagemagick (convert), iconutil (macOS only)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="${SCRIPT_DIR}/../assets"
SVG="${ASSETS_DIR}/icon.svg"

if [ ! -f "${SVG}" ]; then
  echo "ERROR: ${SVG} not found" >&2
  exit 1
fi

# ---- Generate PNGs at required sizes ----
SIZES=(16 24 32 48 64 128 256)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

for size in "${SIZES[@]}"; do
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "${SVG}" > "${TMP_DIR}/icon-${size}.png"
  elif command -v magick >/dev/null 2>&1; then
    magick -background none -density 300 "${SVG}" -resize "${size}x${size}" "${TMP_DIR}/icon-${size}.png"
  elif command -v convert >/dev/null 2>&1; then
    convert -background none -density 300 "${SVG}" -resize "${size}x${size}" "${TMP_DIR}/icon-${size}.png"
  else
    echo "ERROR: Need rsvg-convert or imagemagick (magick/convert)" >&2
    exit 1
  fi
done

# Copy 256px PNG to assets for general use / Linux
cp "${TMP_DIR}/icon-256.png" "${ASSETS_DIR}/icon-256.png"

# ---- Windows .ico (multi-resolution) ----
if command -v magick >/dev/null 2>&1; then
  magick "${TMP_DIR}/icon-16.png" "${TMP_DIR}/icon-24.png" "${TMP_DIR}/icon-32.png" \
    "${TMP_DIR}/icon-48.png" "${TMP_DIR}/icon-64.png" "${TMP_DIR}/icon-128.png" \
    "${TMP_DIR}/icon-256.png" "${ASSETS_DIR}/icon.ico"
elif command -v convert >/dev/null 2>&1; then
  convert "${TMP_DIR}/icon-16.png" "${TMP_DIR}/icon-24.png" "${TMP_DIR}/icon-32.png" \
    "${TMP_DIR}/icon-48.png" "${TMP_DIR}/icon-64.png" "${TMP_DIR}/icon-128.png" \
    "${TMP_DIR}/icon-256.png" "${ASSETS_DIR}/icon.ico"
else
  echo "WARN: imagemagick not found — skipping .ico generation" >&2
fi

# ---- macOS .icns (via iconutil) ----
if command -v iconutil >/dev/null 2>&1; then
  ICONSET="${TMP_DIR}/icon.iconset"
  mkdir -p "${ICONSET}"
  # Standard iconset naming: icon_NxN.png and icon_NxN@2x.png
  cp "${TMP_DIR}/icon-16.png"   "${ICONSET}/icon_16x16.png"
  cp "${TMP_DIR}/icon-32.png"   "${ICONSET}/icon_16x16@2x.png"
  cp "${TMP_DIR}/icon-32.png"   "${ICONSET}/icon_32x32.png"
  cp "${TMP_DIR}/icon-64.png"   "${ICONSET}/icon_32x32@2x.png"
  cp "${TMP_DIR}/icon-128.png"  "${ICONSET}/icon_128x128.png"
  cp "${TMP_DIR}/icon-256.png"  "${ICONSET}/icon_128x128@2x.png"
  cp "${TMP_DIR}/icon-256.png"  "${ICONSET}/icon_256x256.png"
  # For 256@2x we'd need 512px, use 256 as best available
  cp "${TMP_DIR}/icon-256.png"  "${ICONSET}/icon_256x256@2x.png"
  iconutil -c icns "${ICONSET}" -o "${ASSETS_DIR}/icon.icns"
else
  echo "WARN: iconutil not available (macOS only) — skipping .icns generation" >&2
fi

echo "Icon generation complete."
ls -la "${ASSETS_DIR}/icon"*
