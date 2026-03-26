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
  if ! need_cmd node; then
    info "Node.js not found."

    if [[ "$(uname -s)" == "Darwin" ]]; then
      if need_cmd brew; then
        info "Attempting to install Node.js via Homebrew..."
        brew install node
      else
        info "Homebrew not found. Opening Node.js download page..."
        open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
        fail "Install Node.js 22+ and re-run."
      fi
    else
      # Linux: best-effort using the available package manager, otherwise open download page.
      if need_cmd apt-get; then
        info "Attempting to install Node.js via apt-get..."
        sudo apt-get update
        sudo apt-get install -y nodejs npm
      elif need_cmd dnf; then
        info "Attempting to install Node.js via dnf..."
        sudo dnf install -y nodejs npm
      elif need_cmd yum; then
        info "Attempting to install Node.js via yum..."
        sudo yum install -y nodejs npm
      elif need_cmd pacman; then
        info "Attempting to install Node.js via pacman..."
        sudo pacman -Sy --noconfirm nodejs npm
      elif need_cmd zypper; then
        info "Attempting to install Node.js via zypper..."
        sudo zypper install -y nodejs npm
      else
        info "No supported package manager found. Opening Node.js download page..."
        (need_cmd xdg-open && xdg-open "https://nodejs.org/en/download") >/dev/null 2>&1 || true
        fail "Install Node.js 22+ and re-run."
      fi
    fi
  fi

  local version
  version="$(node --version | sed 's/^v//')"
  local major="${version%%.*}"
  if [[ -z "${major}" ]] || ! [[ "${major}" =~ ^[0-9]+$ ]]; then
    fail "Unrecognized Node.js version: ${version}"
  fi
  if (( major < 22 )); then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      info "Node.js version is too old (${version}). Opening download page..."
      open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
    else
      info "Node.js version is too old (${version}). Opening download page..."
      (need_cmd xdg-open && xdg-open "https://nodejs.org/en/download") >/dev/null 2>&1 || true
    fi
    fail "Node.js 22+ required. Current: ${version}"
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
