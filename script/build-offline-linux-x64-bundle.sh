#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version is required}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${2:-${ROOT_DIR}/release-assets}"
BUNDLE_NAME="oh-my-opencode-offline-linux-x64-${VERSION}"
WORK_DIR="$(mktemp -d)"
PACK_DIR="${WORK_DIR}/pack"
STAGE_DIR="${WORK_DIR}/${BUNDLE_NAME}"
VENDOR_DIR="${STAGE_DIR}/vendor"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${PACK_DIR}" "${STAGE_DIR}" "${VENDOR_DIR}" "${OUTPUT_DIR}"

copy_root_package() {
  local target="${PACK_DIR}/oh-my-opencode"
  mkdir -p "${target}"
  cp -R "${ROOT_DIR}/dist" "${target}/dist"
  cp -R "${ROOT_DIR}/bin" "${target}/bin"
  cp "${ROOT_DIR}/postinstall.mjs" "${target}/postinstall.mjs"

  jq --arg version "${VERSION}" '
    .version = $version
    | .optionalDependencies["oh-my-opencode-linux-x64"] = $version
    | .optionalDependencies["oh-my-opencode-linux-x64-baseline"] = $version
    | .optionalDependencies["oh-my-opencode-linux-x64-musl-baseline"] = $version
  ' "${ROOT_DIR}/package.json" > "${target}/package.json"
}

copy_platform_package() {
  local platform="${1}"
  local target="${PACK_DIR}/${platform}"
  mkdir -p "${target}"
  cp -R "${ROOT_DIR}/packages/${platform}/bin" "${target}/bin"
  jq --arg version "${VERSION}" '.version = $version' \
    "${ROOT_DIR}/packages/${platform}/package.json" > "${target}/package.json"
}

pack_local_package() {
  local source_dir="${1}"
  npm_config_ignore_scripts=true npm pack "${source_dir}" --pack-destination "${VENDOR_DIR}" >/dev/null
}

unpack_vendor_package() {
  local package_name="${1}"
  local target_dir="${2}"
  mkdir -p "${target_dir}"
  tar -xzf "${VENDOR_DIR}/${package_name}-${VERSION}.tgz" -C "${target_dir}" --strip-components=1
}

copy_root_package
copy_platform_package "linux-x64"
copy_platform_package "linux-x64-baseline"
copy_platform_package "linux-x64-musl-baseline"

pack_local_package "${PACK_DIR}/oh-my-opencode"
pack_local_package "${PACK_DIR}/linux-x64"
pack_local_package "${PACK_DIR}/linux-x64-baseline"
pack_local_package "${PACK_DIR}/linux-x64-musl-baseline"

cat > "${STAGE_DIR}/package.json" <<EOF
{
  "name": "oh-my-opencode-offline-linux-x64",
  "private": true,
  "dependencies": {
    "oh-my-opencode": "file:vendor/oh-my-opencode-${VERSION}.tgz",
    "oh-my-opencode-linux-x64": "file:vendor/oh-my-opencode-linux-x64-${VERSION}.tgz",
    "oh-my-opencode-linux-x64-baseline": "file:vendor/oh-my-opencode-linux-x64-baseline-${VERSION}.tgz"
  }
}
EOF

(cd "${STAGE_DIR}" && npm install --omit=dev)

unpack_vendor_package \
  "oh-my-opencode-linux-x64-musl-baseline" \
  "${STAGE_DIR}/node_modules/oh-my-opencode-linux-x64-musl-baseline"

cat > "${STAGE_DIR}/package.json" <<EOF
{
  "name": "oh-my-opencode-offline-linux-x64",
  "private": true,
  "dependencies": {
    "oh-my-opencode": "${VERSION}",
    "oh-my-opencode-linux-x64": "${VERSION}",
    "oh-my-opencode-linux-x64-baseline": "${VERSION}",
    "oh-my-opencode-linux-x64-musl-baseline": "${VERSION}"
  }
}
EOF

rm -f "${STAGE_DIR}/package-lock.json"
rm -rf "${VENDOR_DIR}"

cat > "${STAGE_DIR}/opencode.json" <<EOF
{
  "plugin": ["oh-my-openagent@${VERSION}"]
}
EOF

cat > "${STAGE_DIR}/oh-my-openagent.json" <<'EOF'
{
  "disabled_hooks": ["auto-update-checker", "comment-checker"],
  "disabled_mcps": ["websearch", "context7", "grep_app"]
}
EOF

cat > "${STAGE_DIR}/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${OPENCODE_CONFIG_DIR:-${HOME}/.config/opencode}"
PLUGIN_ENTRY="$(node -p "require('${SCRIPT_DIR}/package.json').dependencies['oh-my-opencode']" 2>/dev/null || true)"

backup_file() {
  local file_path="${1}"
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  cp "${file_path}" "${file_path}.bak.${timestamp}"
  echo "${file_path}.bak.${timestamp}"
}

resolve_opencode_config_path() {
  if [[ -f "${TARGET_DIR}/opencode.jsonc" ]]; then
    echo "${TARGET_DIR}/opencode.jsonc"
    return
  fi

  if [[ -f "${TARGET_DIR}/opencode.json" ]]; then
    echo "${TARGET_DIR}/opencode.json"
    return
  fi

  echo "${TARGET_DIR}/opencode.json"
}

mkdir -p "${TARGET_DIR}"

cp "${SCRIPT_DIR}/package.json" "${TARGET_DIR}/package.json"

rm -rf "${TARGET_DIR}/node_modules"
cp -R "${SCRIPT_DIR}/node_modules" "${TARGET_DIR}/node_modules"

OPENCODE_CONFIG_PATH="$(resolve_opencode_config_path)"
BACKUP_PATH=""

if [[ -f "${OPENCODE_CONFIG_PATH}" ]]; then
  BACKUP_PATH="$(backup_file "${OPENCODE_CONFIG_PATH}")"
fi

TARGET_CONFIG_PATH="${OPENCODE_CONFIG_PATH}" \
SCRIPT_DIR="${SCRIPT_DIR}" \
PLUGIN_ENTRY="oh-my-openagent@${PLUGIN_ENTRY}" \
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configPath = process.env.TARGET_CONFIG_PATH;
const scriptDir = process.env.SCRIPT_DIR;
const pluginEntry = process.env.PLUGIN_ENTRY;

const { parse } = require(path.join(scriptDir, "node_modules", "jsonc-parser"));

const existingContent = fs.existsSync(configPath)
  ? fs.readFileSync(configPath, "utf8")
  : "{}";

const parsed = parse(existingContent);
if (parsed === undefined) {
  console.error(`Failed to parse OpenCode config: ${configPath}`);
  process.exit(1);
}

if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
  console.error(`OpenCode config must be a JSON object: ${configPath}`);
  process.exit(1);
}

const nextConfig = { ...parsed };
const currentPlugins = Array.isArray(nextConfig.plugin) ? nextConfig.plugin : [];
const filteredPlugins = currentPlugins.filter((entry) =>
  typeof entry === "string" &&
  entry !== "oh-my-openagent" &&
  !entry.startsWith("oh-my-openagent@")
);

filteredPlugins.push(pluginEntry);
nextConfig.plugin = filteredPlugins;

fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
NODE

if [[ ! -f "${TARGET_DIR}/oh-my-openagent.json" && ! -f "${TARGET_DIR}/oh-my-openagent.jsonc" ]]; then
  cp "${SCRIPT_DIR}/oh-my-openagent.json" "${TARGET_DIR}/oh-my-openagent.json"
fi

cat <<MSG
Installed offline bundle to: ${TARGET_DIR}

OpenCode config merged: ${OPENCODE_CONFIG_PATH}
${BACKUP_PATH:+Backup created: ${BACKUP_PATH}}

Next steps:
  1. export OMO_SEND_ANONYMOUS_TELEMETRY=0
  2. export OMO_DISABLE_POSTHOG=1
  3. start OpenCode and verify the plugin loads
MSG
EOF
chmod +x "${STAGE_DIR}/install.sh"

cat > "${STAGE_DIR}/README-offline.md" <<EOF
# Oh My OpenCode Offline Bundle

Version: ${VERSION}
Target: Linux x64 (glibc) with baseline and musl-baseline fallbacks included

## Install

\`\`\`bash
tar -xzf ${BUNDLE_NAME}.tar.gz
cd ${BUNDLE_NAME}
./install.sh
\`\`\`

If you want a non-default config location:

\`\`\`bash
OPENCODE_CONFIG_DIR=/path/to/opencode ./install.sh
\`\`\`

## Included packages

- oh-my-opencode
- oh-my-opencode-linux-x64
- oh-my-opencode-linux-x64-baseline
- oh-my-opencode-linux-x64-musl-baseline
EOF

tar -C "${WORK_DIR}" -czf "${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz" "${BUNDLE_NAME}"
echo "Created ${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz"
