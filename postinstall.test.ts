import { describe, expect, test } from "bun:test";

import { findInstalledPlatformPackage } from "./postinstall.mjs";

describe("findInstalledPlatformPackage", () => {
  test("accepts musl fallback package on Linux x64 glibc", () => {
    const resolvedPackage = findInstalledPlatformPackage({
      platform: "linux",
      arch: "x64",
      libcFamily: "glibc",
      packageBaseName: "oh-my-opencode",
      resolveImpl(specifier) {
        if (specifier === "oh-my-opencode-linux-x64-musl-baseline/bin/oh-my-opencode") {
          return specifier;
        }
        throw new Error("not found");
      },
    });

    expect(resolvedPackage.resolvedPackage).toBe("oh-my-opencode-linux-x64-musl-baseline");
  });

  test("keeps glibc package priority ahead of musl fallbacks", () => {
    const resolveCalls = [];
    const resolvedPackage = findInstalledPlatformPackage({
      platform: "linux",
      arch: "x64",
      libcFamily: "glibc",
      packageBaseName: "oh-my-opencode",
      resolveImpl(specifier) {
        resolveCalls.push(specifier);
        if (specifier === "oh-my-opencode-linux-x64/bin/oh-my-opencode") {
          return specifier;
        }
        throw new Error("not found");
      },
    });

    expect(resolvedPackage.resolvedPackage).toBe("oh-my-opencode-linux-x64");
    expect(resolveCalls[0]).toBe("oh-my-opencode-linux-x64/bin/oh-my-opencode");
  });
});
