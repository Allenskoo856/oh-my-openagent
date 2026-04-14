import { describe, expect, test } from "bun:test";

import { isLinuxLoaderCompatibilityFailure, runBinaryWithFallback } from "./oh-my-opencode.js";

describe("isLinuxLoaderCompatibilityFailure", () => {
  test("detects glibc loader mismatch in stderr", () => {
    const result = isLinuxLoaderCompatibilityFailure({
      platform: "linux",
      status: 127,
      stderr: "oh-my-opencode: /lib64/libm.so.6: version `GLIBC_2.29' not found",
    });

    expect(result).toBe(true);
  });

  test("ignores non-linux failures", () => {
    const result = isLinuxLoaderCompatibilityFailure({
      platform: "darwin",
      status: 127,
      stderr: "version `GLIBC_2.29' not found",
    });

    expect(result).toBe(false);
  });
});

describe("runBinaryWithFallback", () => {
  test("falls back to musl candidate after glibc loader failure", () => {
    const probeCalls = [];
    const runCalls = [];

    const outcome = runBinaryWithFallback({
      platform: "linux",
      args: ["version"],
      resolvedBinaries: [
        { pkg: "oh-my-opencode-linux-x64-baseline", binPath: "/glibc" },
        { pkg: "oh-my-opencode-linux-x64-musl-baseline", binPath: "/musl" },
      ],
      probeImpl: (binPath) => {
        probeCalls.push(binPath);
        if (binPath === "/glibc") {
          return {
            status: 127,
            stdout: "",
            stderr: "error while loading shared libraries: /lib64/libc.so.6: version `GLIBC_2.29' not found",
          };
        }
        return { status: 0, stdout: "3.17.2\n", stderr: "" };
      },
      runImpl: (binPath, args) => {
        runCalls.push({ binPath, args });
        return { status: 0 };
      },
    });

    expect(probeCalls).toEqual(["/glibc"]);
    expect(runCalls).toEqual([{ binPath: "/musl", args: ["version"] }]);
    expect(outcome).toEqual({ kind: "status", status: 0 });
  });

  test("does not fall back on ordinary command failure after a successful probe", () => {
    const runCalls = [];

    const outcome = runBinaryWithFallback({
      platform: "linux",
      args: ["run"],
      resolvedBinaries: [
        { pkg: "oh-my-opencode-linux-x64", binPath: "/glibc" },
        { pkg: "oh-my-opencode-linux-x64-musl", binPath: "/musl" },
      ],
      probeImpl: () => ({ status: 0, stdout: "3.17.2\n", stderr: "" }),
      runImpl: (binPath, args) => {
        runCalls.push({ binPath, args });
        return { status: 1 };
      },
    });

    expect(runCalls).toEqual([{ binPath: "/glibc", args: ["run"] }]);
    expect(outcome).toEqual({ kind: "status", status: 1 });
  });

  test("falls back on SIGILL from the primary binary", () => {
    const runCalls = [];

    const outcome = runBinaryWithFallback({
      platform: "linux",
      args: ["doctor"],
      resolvedBinaries: [
        { pkg: "oh-my-opencode-linux-x64", binPath: "/glibc" },
        { pkg: "oh-my-opencode-linux-x64-baseline", binPath: "/baseline" },
      ],
      probeImpl: () => ({ status: 0, stdout: "3.17.2\n", stderr: "" }),
      runImpl: (binPath, args) => {
        runCalls.push({ binPath, args });
        if (binPath === "/glibc") {
          return { signal: "SIGILL" };
        }
        return { status: 0 };
      },
    });

    expect(runCalls).toEqual([
      { binPath: "/glibc", args: ["doctor"] },
      { binPath: "/baseline", args: ["doctor"] },
    ]);
    expect(outcome).toEqual({ kind: "status", status: 0 });
  });
});
