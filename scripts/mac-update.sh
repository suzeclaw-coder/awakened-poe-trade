#!/usr/bin/env bash
set -euo pipefail

# Awakened PoE Trade — Automated macOS Build, Sign & Update Tool
# Usage:
#   ./scripts/mac-update.sh                 # Fast build (arm64), sign, and install
#   ./scripts/mac-update.sh --pull          # Pull current branch, build, sign, and install
#   ./scripts/mac-update.sh --sync upstream master # Fetch and merge upstream, build, sign, install
#   ./scripts/mac-update.sh --universal     # Build universal binary instead of thin arm64
#   ./scripts/mac-update.sh --no-launch     # Do not auto-launch after install

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

CERT_NAME="AwakenedPoESigner"
ARCH="arm64"
TARGET_DIR="mac-arm64"
AUTO_LAUNCH=true
DO_SYNC=false
SYNC_REMOTE=""
SYNC_BRANCH=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pull)
      DO_SYNC=true
      shift
      ;;
    --sync)
      DO_SYNC=true
      SYNC_REMOTE="${2:-origin}"
      SYNC_BRANCH="${3:-$(git branch --show-current)}"
      shift 3 2>/dev/null || shift 1
      ;;
    --universal)
      ARCH="universal"
      TARGET_DIR="mac-universal"
      shift
      ;;
    --cert)
      CERT_NAME="$2"
      shift 2
      ;;
    --no-launch)
      AUTO_LAUNCH=false
      shift
      ;;
    -h|--help)
      echo "Usage: ./scripts/mac-update.sh [options]"
      echo "Options:"
      echo "  --pull                  Run 'git pull' before building"
      echo "  --sync <remote> <branch> Fetch and merge specified remote/branch"
      echo "  --universal             Build universal (arm64 + x64) bundle (slower, larger)"
      echo "  --cert <name>           Specify code-signing certificate (default: AwakenedPoESigner)"
      echo "  --no-launch             Do not auto-open the app after installing"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "============================================================"
echo " Awakened PoE Trade — macOS Fast Build & Sign Pipeline"
echo "============================================================"
echo "• Target Architecture : $ARCH"
echo "• Signing Identity    : $CERT_NAME"
echo "• Repository Root     : $REPO_DIR"
echo "============================================================"

# 1. Optional Sync
if [ "$DO_SYNC" = true ]; then
  if [ -n "$SYNC_REMOTE" ] && [ -n "$SYNC_BRANCH" ]; then
    echo "==> Fetching $SYNC_REMOTE/$SYNC_BRANCH..."
    git fetch "$SYNC_REMOTE" "$SYNC_BRANCH"
    echo "==> Merging $SYNC_REMOTE/$SYNC_BRANCH into $(git branch --show-current)..."
    git merge "${SYNC_REMOTE}/${SYNC_BRANCH}"
  else
    echo "==> Pulling latest changes for current branch..."
    git pull
  fi
fi

# 2. Verify Certificate in Keychain
echo "==> Checking signing identity '$CERT_NAME' in Keychain..."
if ! security find-identity -p codesigning -v | grep -q "$CERT_NAME"; then
  echo "[-] Error: Code signing certificate '$CERT_NAME' not found or not trusted in Keychain."
  echo "    Refer to setup_guide.md to create and trust 'AwakenedPoESigner'."
  exit 1
fi
echo "[+] Certificate '$CERT_NAME' verified."

# 3. Build Renderer
echo "==> Building Renderer..."
(cd renderer && npm run build)

# 4. Build Main Backend
echo "==> Building Main backend..."
(cd main && npm run build)

# 5. Package with Electron-Builder
echo "==> Packaging macOS ($ARCH) bundle..."
if [ "$ARCH" = "arm64" ]; then
  (cd main && npx electron-builder build --mac --arm64 --dir)
else
  (cd main && npx electron-builder build --mac --universal --dir)
fi

APP_BUNDLE="main/dist/${TARGET_DIR}/Awakened PoE Trade.app"

if [ ! -d "$APP_BUNDLE" ]; then
  echo "[-] Build failed: Expected app bundle at $APP_BUNDLE was not found."
  exit 1
fi

# 6. Code Sign
echo "==> Signing app bundle with '$CERT_NAME'..."
codesign --force --deep --sign "$CERT_NAME" "$APP_BUNDLE"

# 7. Strip Quarantine & Extended Attributes
echo "==> Stripping quarantine attributes..."
xattr -cr "$APP_BUNDLE"

# 8. Verify Signature & Designated Requirement
echo "==> Verifying signature integrity..."
codesign --verify --deep --strict "$APP_BUNDLE"
echo "[+] Bundle is valid and satisfies Designated Requirement:"
codesign -d -r- "$APP_BUNDLE" | grep "designated =>" || true

# 9. Install to /Applications
echo "==> Installing to /Applications/Awakened PoE Trade.app..."
killall "Awakened PoE Trade" 2>/dev/null || true
rm -rf "/Applications/Awakened PoE Trade.app"
cp -R "$APP_BUNDLE" "/Applications/"
chown -R "$(whoami):admin" "/Applications/Awakened PoE Trade.app"

echo "============================================================"
echo "[SUCCESS] Awakened PoE Trade ($ARCH) installed successfully!"
echo "============================================================"

# 10. Launch
if [ "$AUTO_LAUNCH" = true ]; then
  echo "==> Launching /Applications/Awakened PoE Trade.app..."
  open "/Applications/Awakened PoE Trade.app"
fi
