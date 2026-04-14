#!/usr/bin/env node
// bin/oh-my-opencode.js
// Wrapper script that detects platform and spawns the correct binary

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getPlatformPackageCandidates, getBinaryPath } from "./platform.js";

const require = createRequire(import.meta.url);

/**
 * Detect libc family on Linux
 * @returns {string | null} 'glibc', 'musl', or null if detection fails
 */
function getLibcFamily() {
  if (process.platform !== "linux") {
    return undefined; // Not needed on non-Linux
  }
  
  try {
    const detectLibc = require("detect-libc");
    return detectLibc.familySync();
  } catch {
    // detect-libc not available
    return null;
  }
}

function supportsAvx2() {
  if (process.arch !== "x64") {
    return null;
  }

  if (process.env.OH_MY_OPENCODE_FORCE_BASELINE === "1") {
    return false;
  }

  if (process.platform === "linux") {
    try {
      const cpuInfo = readFileSync("/proc/cpuinfo", "utf8").toLowerCase();
      return cpuInfo.includes("avx2");
    } catch {
      return null;
    }
  }

  if (process.platform === "darwin") {
    const probe = spawnSync("sysctl", ["-n", "machdep.cpu.leaf7_features"], {
      encoding: "utf8",
    });

    if (probe.error || probe.status !== 0) {
      return null;
    }

    return probe.stdout.toUpperCase().includes("AVX2");
  }

  return null;
}

function getSignalExitCode(signal) {
  const signalCodeByName = {
    SIGINT: 2,
    SIGILL: 4,
    SIGKILL: 9,
    SIGTERM: 15,
  };

  return 128 + (signalCodeByName[signal] ?? 1);
}

function getPackageBaseName() {
  try {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return packageJson.name || "oh-my-opencode";
  } catch {
    return "oh-my-opencode";
  }
}

function shouldFallback(result, { platform, hasFallback }) {
  if (!hasFallback) {
    return false;
  }

  if (result.error) {
    return true;
  }

  if (result.signal === "SIGILL") {
    return true;
  }

  return isLinuxLoaderCompatibilityFailure({
    platform,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

export function isLinuxLoaderCompatibilityFailure({ platform, status, stdout = "", stderr = "" }) {
  if (platform !== "linux" || status === 0 || status === null || status === undefined) {
    return false;
  }

  const output = `${stdout}\n${stderr}`.toLowerCase();
  return [
    "glibc_",
    "version `glibc_",
    "not found",
    "failed to open shared object file",
    "libc.so",
  ].some((pattern) => output.includes(pattern));
}

function probeBinaryCompatibility(binPath) {
  return spawnSync(binPath, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runBinary(binPath, args) {
  return spawnSync(binPath, args, {
    stdio: "inherit",
  });
}

export function runBinaryWithFallback({
  platform,
  args,
  resolvedBinaries,
  probeImpl = probeBinaryCompatibility,
  runImpl = runBinary,
}) {
  for (let index = 0; index < resolvedBinaries.length; index += 1) {
    const currentBinary = resolvedBinaries[index];
    const hasFallback = index < resolvedBinaries.length - 1;

    if (hasFallback) {
      const probeResult = probeImpl(currentBinary.binPath);
      if (shouldFallback(probeResult, { platform, hasFallback })) {
        continue;
      }
    }

    const result = runImpl(currentBinary.binPath, args);

    if (shouldFallback(result, { platform, hasFallback })) {
      continue;
    }

    if (result.error) {
      return { kind: "error", error: result.error };
    }

    if (result.signal) {
      return { kind: "signal", signal: result.signal };
    }

    return { kind: "status", status: result.status ?? 1 };
  }

  return { kind: "status", status: 1 };
}

function main() {
  const { platform, arch } = process;
  const libcFamily = getLibcFamily();
  const packageBaseName = getPackageBaseName();
  const avx2Supported = supportsAvx2();
  
  let packageCandidates;
  try {
    packageCandidates = getPlatformPackageCandidates({
      platform,
      arch,
      libcFamily,
      preferBaseline: avx2Supported === false,
      packageBaseName,
    });
  } catch (error) {
    console.error(`\noh-my-opencode: ${error.message}\n`);
    process.exit(1);
  }

  const resolvedBinaries = packageCandidates
    .map((pkg) => {
      try {
        return { pkg, binPath: require.resolve(getBinaryPath(pkg, platform)) };
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null);

  if (resolvedBinaries.length === 0) {
    console.error(`\noh-my-opencode: Platform binary not installed.`);
    console.error(`\nYour platform: ${platform}-${arch}${libcFamily === "musl" ? "-musl" : ""}`);
    console.error(`Expected packages (in order): ${packageCandidates.join(", ")}`);
    console.error(`\nTo fix, run:`);
    console.error(`  npm install ${packageCandidates[0]}\n`);
    process.exit(1);
  }

  const outcome = runBinaryWithFallback({
    platform,
    args: process.argv.slice(2),
    resolvedBinaries,
  });

  if (outcome.kind === "error") {
    console.error(`\noh-my-opencode: Failed to execute binary.`);
    console.error(`Error: ${outcome.error.message}\n`);
    process.exit(2);
  }

  if (outcome.kind === "signal") {
    process.exit(getSignalExitCode(outcome.signal));
  }

  process.exit(outcome.status);
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  main();
}
