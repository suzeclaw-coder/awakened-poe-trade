# Awakened PoE Trade — macOS Build & Self-Signing Guide

This guide details how to build **Awakened PoE Trade** from source on macOS, create a permanent self-signed Code Signing certificate, and configure macOS permissions so that **Accessibility and Input Monitoring permissions persist across all future updates**.

---

## 1. Why macOS Loses Permissions on Every Update

macOS uses **TCC (Transparency, Consent, and Control)** to manage permissions for sensitive capabilities (Accessibility, Input Monitoring, and Screen Recording).

- **The Problem with Ad-hoc / Unsigned Binaries**:
  Awakened PoE Trade is distributed with an ad-hoc signature (`codesign -s -`). Without a persistent signing identity, macOS identifies the binary using its cryptographic hash (`cdhash`). Every time you update or rebuild the application, its binary and `cdhash` change. macOS detects this as an unknown/modified binary and resets permissions, often causing the app to freeze or hang on `http://localhost:0/`.

- **The Problem with Apple Developer Certificates**:
  Signing with an Apple Development certificate (`Apple Development: ...`) can trigger Apple’s online OCSP revocation checks. If the certificate is revoked or superseded in Xcode, macOS Gatekeeper blocks execution with a **"Malware Blocked"** dialog (`CSSMERR_TP_CERT_REVOKED`).

- **The Permanent Fix**:
  A **local self-signed Code Signing certificate** binds the app's **Designated Requirement** to that specific certificate identity rather than a binary hash:
  ```text
  designated => identifier "com.electron.awakened-poe-trade" and certificate leaf = H"<HASH>"
  ```
  - It **never** contacts Apple servers (cannot be revoked).
  - It does **not** require a paid Apple Developer subscription.
  - macOS TCC remembers the permissions for this certificate identity forever across all future builds.

---

## 2. Step 1: Create a Local Code Signing Identity

You only need to do this **once** per Mac.

### Method A: Automated via Terminal (Recommended)

Run the following commands in Terminal to generate and trust a certificate named `AwakenedPoESigner`:

```bash
# 1. Create OpenSSL configuration for Code Signing
cat << 'EOF' > /tmp/cert.cnf
[ req ]
distinguished_name = req_distinguished_name
prompt = no
x509_extensions = v3_req

[ req_distinguished_name ]
CN = AwakenedPoESigner

[ v3_req ]
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
basicConstraints = critical, CA:FALSE
EOF

# 2. Generate private key and certificate (valid for 10 years)
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/signer.key \
  -out /tmp/signer.crt \
  -days 3650 \
  -config /tmp/cert.cnf

# 3. Export to PKCS#12 archive
openssl pkcs12 -export -legacy \
  -inkey /tmp/signer.key \
  -in /tmp/signer.crt \
  -out /tmp/signer.p12 \
  -passout pass:temp1234 \
  -name "AwakenedPoESigner"

# 4. Import into your macOS Login Keychain
security import /tmp/signer.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P temp1234 \
  -T /usr/bin/codesign \
  -T /usr/bin/security

# 5. Add Code Signing trust
security add-trusted-cert -p codeSign \
  -k ~/Library/Keychains/login.keychain-db \
  /tmp/signer.crt

# 6. Cleanup temporary files
rm -f /tmp/signer.key /tmp/signer.crt /tmp/signer.p12 /tmp/cert.cnf
```

### Method B: Via macOS Keychain Access (GUI)

1. Open **Keychain Access** (`Cmd + Space` → search `Keychain Access`).
2. In the menu bar, go to **Keychain Access** → **Certificate Assistant** → **Create a Certificate...**
3. Configure the fields:
   - **Name**: `AwakenedPoESigner`
   - **Identity Type**: `Self-Signed Root`
   - **Certificate Type**: `Code Signing`
4. Click **Create**, then click **Done**.

### Verify Your Certificate

Run:
```bash
security find-identity -p codesigning -v
```
You should see `AwakenedPoESigner` listed under **Valid identities only**:
```text
  1) <THUMBPRINT> "AwakenedPoESigner"
     1 valid identities found
```

---

## 3. Fast One-Command Update & Install (Recommended)

Once your certificate is created, you can build, sign, and install everything in **under 10 seconds** using the automated update script:

```bash
# Fast build (arm64 for Apple Silicon), sign, and install to /Applications
./scripts/mac-update.sh

# Or pull latest commits from git, build, sign, and install:
./scripts/mac-update.sh --pull

# Or fetch and merge a specific branch (e.g. upstream master):
./scripts/mac-update.sh --sync upstream master
```

---

## 4. Manual Build & Sign Steps (Alternative)

If you prefer running each step manually:

### 1. Build the Renderer (UI)
```bash
cd renderer
npm ci
npm run build
cd ..
```

### 2. Build the Main Process (Electron backend)
```bash
cd main
npm ci
npm run build
```

### 3. Package for Apple Silicon (arm64 — Fast)
```bash
# Thin arm64 build (300MB, packages in ~3s)
npm run package:mac:arm64
# Or universal build (500MB):
# npx electron-builder build --mac
cd ..
```
The packaged app bundle is placed at:
`main/dist/mac-arm64/Awakened PoE Trade.app`

---

## 5. Step 3: Sign the App Bundle

> [!IMPORTANT]
> **Do NOT run `sudo codesign`**. 
> Your signing certificate and private key reside in your personal login keychain. Running `sudo` switches to `root`, which cannot access your login keychain and will fail with `errSecInternalComponent`. Always run `codesign` as your regular user.

Run:
```bash
# Sign the entire application bundle recursively
codesign --force --deep --sign "AwakenedPoESigner" "main/dist/mac-arm64/Awakened PoE Trade.app"

# Strip quarantine attributes
xattr -cr "main/dist/mac-arm64/Awakened PoE Trade.app"
```

### Verify the Signature
```bash
# Verify bundle integrity
codesign --verify --deep --strict --verbose=2 "main/dist/mac-arm64/Awakened PoE Trade.app"

# Verify Designated Requirement
codesign -d -r- "main/dist/mac-arm64/Awakened PoE Trade.app"
```
The output should state:
`valid on disk` and `satisfies its Designated Requirement`.

---

## 6. Step 4: Install to `/Applications` & Grant Permissions

### 1. Install
```bash
# Quit running instances
killall "Awakened PoE Trade" 2>/dev/null || true

# Replace installed app
rm -rf "/Applications/Awakened PoE Trade.app"
cp -R "main/dist/mac-arm64/Awakened PoE Trade.app" /Applications/
chown -R $(whoami):admin "/Applications/Awakened PoE Trade.app"
```

*(If previous installs were done with `sudo`, prepend `sudo` to `rm` / `cp` if needed, then run `sudo chown -R $(whoami):admin "/Applications/Awakened PoE Trade.app"`).*

### 2. Grant Permissions (One-Time Only)
1. Open **System Settings** → **Privacy & Security**.
2. Go to **Accessibility**:
   - If an older entry for **Awakened PoE Trade** exists, select it and click **`-`** (Remove).
   - Click **`+`** (Add), select `/Applications/Awakened PoE Trade.app`, and ensure it is toggled **ON**.
3. Go to **Input Monitoring**:
   - Repeat the step: remove any old entry (`-`), re-add `/Applications/Awakened PoE Trade.app` (`+`), and toggle **ON**.
4. Launch the app:
   ```bash
   open "/Applications/Awakened PoE Trade.app"
   ```

---

## 6. Future Updates Workflow

Whenever you sync upstream, switch branches, or pull new commits:

```bash
# 1. Update source
git pull

# 2. Build renderer
cd renderer && npm run build && cd ..

# 3. Build main & package
cd main && npm run build && npx electron-builder build --mac && cd ..

# 4. Sign with persistent identity
codesign --force --deep --sign "AwakenedPoESigner" "main/dist/mac-universal/Awakened PoE Trade.app"
xattr -cr "main/dist/mac-universal/Awakened PoE Trade.app"

# 5. Install & restart
killall "Awakened PoE Trade" 2>/dev/null || true
rm -rf "/Applications/Awakened PoE Trade.app"
cp -R "main/dist/mac-universal/Awakened PoE Trade.app" /Applications/
open "/Applications/Awakened PoE Trade.app"
```

**Because the signing certificate (`AwakenedPoESigner`) remains unchanged, macOS TCC will seamlessly retain your Accessibility and Input Monitoring permissions without ever prompting again.**

---

## 7. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **`errSecInternalComponent`** | `sudo codesign` was run. `root` cannot access your login keychain. | Run `codesign` **without `sudo`** as your normal user account. |
| **"Malware Blocked"** | The app was signed with an Apple Developer certificate that was revoked (`CSSMERR_TP_CERT_REVOKED`). | Use the self-signed `AwakenedPoESigner` certificate described in this guide. |
| **Stuck on `http://localhost:0/`** | Earlier versions coupled the HTTP server startup with keyboard hooks. In our current branch, the server binds immediately on app launch, eliminating this issue. If permissions are missing, check **System Settings → Privacy & Security**. | Ensure Accessibility & Input Monitoring permissions are toggled ON. |
| **Permission Denied when copying to `/Applications`** | An earlier install was owned by `root`. | Run `sudo chown -R $(whoami):admin "/Applications/Awakened PoE Trade.app"`, then replace the app. |
