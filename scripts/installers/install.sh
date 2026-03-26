#!/usr/bin/env sh
# BYOM Bridge Installer
# Usage: curl -fsSL https://byomai.com/install.sh | sh
# Uninstall: curl -fsSL https://byomai.com/install.sh | sh -s -- --uninstall
set -eu

REPO="AltClick/byom-web"
INSTALL_DIR="${HOME}/.local/bin"
BINARY_NAME="byom-bridge"
NATIVE_HOST_NAME="com.byom.bridge"

log()   { printf '\033[1;34m%s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
err()   { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       err "Unsupported OS: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)   echo "x64" ;;
    aarch64|arm64)   echo "arm64" ;;
    *)               err "Unsupported architecture: $(uname -m)" ;;
  esac
}

get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=20" \
    | grep -o '"tag_name": "bridge/v[^"]*"' \
    | head -1 \
    | grep -o 'v[0-9].*'
}

install_bridge() {
  os=$(detect_os)
  arch=$(detect_arch)
  version=$(get_latest_version)

  if [ -z "${version}" ]; then
    err "Could not determine latest bridge version"
  fi

  binary_name="byom-bridge-${os}-${arch}"
  log "Installing BYOM Bridge ${version} (${os}/${arch})..."

  tmp_dir=$(mktemp -d)
  trap 'rm -rf "${tmp_dir}"' EXIT

  release_url="https://github.com/${REPO}/releases/download/bridge%2F${version}"

  log "Downloading ${binary_name}..."
  curl -fsSL -o "${tmp_dir}/${binary_name}" "${release_url}/${binary_name}"
  curl -fsSL -o "${tmp_dir}/SHA256SUMS.txt" "${release_url}/SHA256SUMS.txt"

  # Verify checksum (mandatory)
  log "Verifying checksum..."
  cd "${tmp_dir}"
  if command -v sha256sum >/dev/null 2>&1; then
    grep "${binary_name}" SHA256SUMS.txt | sha256sum -c - || err "Checksum verification failed!"
  elif command -v shasum >/dev/null 2>&1; then
    grep "${binary_name}" SHA256SUMS.txt | shasum -a 256 -c - || err "Checksum verification failed!"
  else
    err "No sha256sum or shasum available for checksum verification"
  fi
  ok "Checksum verified."

  # Sigstore verification (opportunistic)
  if command -v cosign >/dev/null 2>&1; then
    log "Verifying Sigstore signature..."
    curl -fsSL -o SHA256SUMS.txt.bundle "${release_url}/SHA256SUMS.txt.bundle"
    if cosign verify-blob --bundle SHA256SUMS.txt.bundle SHA256SUMS.txt 2>/dev/null; then
      ok "Sigstore signature verified."
    else
      err "Sigstore signature verification failed!"
    fi
  else
    warn "cosign not found — skipping Sigstore verification (install cosign for maximum security)"
  fi

  # Install binary
  mkdir -p "${INSTALL_DIR}"
  cp "${tmp_dir}/${binary_name}" "${INSTALL_DIR}/${BINARY_NAME}"
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  # Check PATH
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      warn "${INSTALL_DIR} is not in your PATH."
      warn "Add it: export PATH=\"\${HOME}/.local/bin:\${PATH}\""
      ;;
  esac

  # Register native messaging hosts
  install_native_hosts "${os}"

  echo ""
  ok "BYOM Bridge ${version} installed successfully!"
  log "  Binary: ${INSTALL_DIR}/${BINARY_NAME}"
}

install_native_hosts() {
  os="$1"
  binary_path="${INSTALL_DIR}/${BINARY_NAME}"

  manifest_content="{
  \"name\": \"${NATIVE_HOST_NAME}\",
  \"description\": \"BYOM AI Bridge native messaging host\",
  \"path\": \"${binary_path}\",
  \"type\": \"stdio\",
  \"allowed_origins\": [\"chrome-extension://*\"]
}"

  case "${os}" in
    macos)
      chrome_dir="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"
      ;;
    linux)
      chrome_dir="${HOME}/.config/google-chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/.mozilla/native-messaging-hosts"
      ;;
    *)
      err "Unsupported OS for native host registration: ${os}"
      ;;
  esac

  for dir in "${chrome_dir}" "${firefox_dir}"; do
    mkdir -p "${dir}"
    printf '%s' "${manifest_content}" > "${dir}/${NATIVE_HOST_NAME}.json"
  done

  log "Native messaging hosts registered for Chrome and Firefox."
}

uninstall_bridge() {
  warn "Uninstalling BYOM Bridge..."

  rm -f "${INSTALL_DIR}/${BINARY_NAME}"

  os=$(detect_os)
  case "${os}" in
    macos)
      chrome_dir="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"
      ;;
    linux)
      chrome_dir="${HOME}/.config/google-chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/.mozilla/native-messaging-hosts"
      ;;
    *)
      chrome_dir=""
      firefox_dir=""
      ;;
  esac

  [ -n "${chrome_dir}" ] && rm -f "${chrome_dir}/${NATIVE_HOST_NAME}.json" 2>/dev/null || true
  [ -n "${firefox_dir}" ] && rm -f "${firefox_dir}/${NATIVE_HOST_NAME}.json" 2>/dev/null || true

  ok "BYOM Bridge uninstalled."
}

# Main
case "${1:-}" in
  --uninstall) uninstall_bridge ;;
  *)           install_bridge ;;
esac
