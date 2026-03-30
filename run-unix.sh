#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-gui}"
shift || true

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

fail() {
  echo "Error: $*" >&2
  exit 1
}

info() {
  echo "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_node() {
  install_node_darwin() {
    if need_cmd brew; then
      info "Attempting to install/upgrade Node.js via Homebrew..."
      brew install node >/dev/null 2>&1 || brew upgrade node
      return 0
    fi

    info "Homebrew not found."
    return 1
  }

  install_node_linux() {
    # Preferred on Ubuntu/Debian: NodeSource repository to get Node 22.
    if need_cmd apt-get; then
      if ! need_cmd curl; then
        info "curl not found; cannot use NodeSource installer."
        return 1
      fi

      info "Attempting to install/upgrade Node.js 22 via NodeSource (apt)..."
      sudo apt-get update
      curl -fsSL "https://deb.nodesource.com/setup_22.x" | sudo -E bash -
      sudo apt-get install -y nodejs
      return 0
    fi

    # Other distros: best-effort with native package manager (may be older).
    if need_cmd dnf; then
      info "Attempting to install/upgrade Node.js via dnf..."
      sudo dnf install -y nodejs npm
      return 0
    fi
    if need_cmd yum; then
      info "Attempting to install/upgrade Node.js via yum..."
      sudo yum install -y nodejs npm
      return 0
    fi
    if need_cmd pacman; then
      info "Attempting to install/upgrade Node.js via pacman..."
      sudo pacman -Sy --noconfirm nodejs npm
      return 0
    fi
    if need_cmd zypper; then
      info "Attempting to install/upgrade Node.js via zypper..."
      sudo zypper install -y nodejs npm
      return 0
    fi

    return 1
  }

  ensure_node_version_or_install() {
    if need_cmd node; then
      return 0
    fi

    info "Node.js not found."
    if [[ "$(uname -s)" == "Darwin" ]]; then
      install_node_darwin || return 1
    else
      install_node_linux || return 1
    fi
  }

  ensure_node_version_or_install || {
    info "Cannot auto-install Node.js."
    info "Install Node.js 22+ from https://nodejs.org/en/download and re-run."
    fail "Node.js is required."
  }

  local version
  version="$(node --version | sed 's/^v//')"
  local major="${version%%.*}"
  if [[ -z "${major}" ]] || ! [[ "${major}" =~ ^[0-9]+$ ]]; then
    fail "Unrecognized Node.js version: ${version}"
  fi

  if (( major < 22 )); then
    info "Node.js version is too old (${version}). Attempting to upgrade to 22..."

    # If nvm is available, prefer it (no sudo required in many setups).
    if need_cmd nvm; then
      nvm install 22
      nvm use 22
    else
      if [[ "$(uname -s)" == "Darwin" ]]; then
        install_node_darwin || true
      else
        install_node_linux || true
      fi
    fi

    version="$(node --version | sed 's/^v//')"
    major="${version%%.*}"
    if [[ -z "${major}" ]] || ! [[ "${major}" =~ ^[0-9]+$ ]]; then
      fail "Unrecognized Node.js version: ${version}"
    fi
    if (( major < 22 )); then
      info "Auto-upgrade did not provide Node.js 22+."
      info "Install Node.js 22+ from https://nodejs.org/en/download and re-run."
      fail "Node.js 22+ required. Current: ${version}"
    fi
  fi

  if ! need_cmd npm; then
    fail "npm not found (usually bundled with Node.js)."
  fi
}

ensure_deps() {
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    return
  fi
  info "Installing npm dependencies (npm ci)..."
  (cd "$ROOT_DIR" && npm ci)
}

open_terminal_and_rerun() {
  # Best-effort: if script was launched by double click, open a terminal window so logs stay visible.
  if [[ "${MAGIC_IMGER_NO_OPEN_TERMINAL:-}" == "1" ]]; then
    return 1
  fi

  export MAGIC_IMGER_NO_OPEN_TERMINAL=1
  local cmd
  cmd="cd \"$ROOT_DIR\"; chmod +x \"$ROOT_DIR/run-unix.sh\"; \"$ROOT_DIR/run-unix.sh\" \"$MODE\" $*; echo; echo \"Press Enter to close\"; read -r _"

  if [[ "$(uname -s)" == "Darwin" ]] && need_cmd osascript; then
    osascript <<OSA >/dev/null
tell application "Terminal"
  activate
  do script "$(printf '%s' "$cmd" | sed 's/\\/\\\\/g; s/\"/\\\"/g')"
end tell
OSA
    return 0
  fi

  if need_cmd x-terminal-emulator; then
    x-terminal-emulator -e bash -lc "$cmd" >/dev/null 2>&1 &
    return 0
  fi
  if need_cmd gnome-terminal; then
    gnome-terminal -- bash -lc "$cmd" >/dev/null 2>&1 &
    return 0
  fi
  if need_cmd konsole; then
    konsole -e bash -lc "$cmd" >/dev/null 2>&1 &
    return 0
  fi
  if need_cmd xfce4-terminal; then
    xfce4-terminal -e "bash -lc \"$cmd\"" >/dev/null 2>&1 &
    return 0
  fi
  if need_cmd xterm; then
    xterm -e bash -lc "$cmd" >/dev/null 2>&1 &
    return 0
  fi

  return 1
}

case "$MODE" in
  help|--help|-h)
    cat <<'HELP'
Magic Imger launcher (macOS/Linux)

Usage:
  ./run-unix.sh              # GUI
  ./run-unix.sh cli -- --help

Notes:
  - If started from Finder/File Manager, it tries to open a Terminal window.
  - It auto-installs npm dependencies if node_modules/ is missing.
HELP
    exit 0
    ;;
  gui|cli)
    ;;
  *)
    fail "Unknown mode: $MODE (expected gui|cli)"
    ;;
esac

# If not running in an interactive terminal, try to spawn one so output is visible.
if [[ ! -t 1 ]]; then
  if open_terminal_and_rerun "$@"; then
    exit 0
  fi
fi

cd "$ROOT_DIR"
ensure_node
ensure_deps

if [[ "$MODE" == "gui" ]]; then
  info "Starting GUI..."
  npm run gui
else
  info "Starting CLI..."
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  npm run cli -- "$@"
fi
