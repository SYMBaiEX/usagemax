import { describe, expect, test } from "vitest";

import { isAutomaticDeviceName, resolveDeviceName } from "./device_name";

describe("device link name resolution", () => {
  test("recognizes labels emitted by older platform-aware CLIs", () => {
    expect(isAutomaticDeviceName("Mac", "darwin")).toBe(true);
    expect(isAutomaticDeviceName("Windows PC", "win32")).toBe(true);
    expect(isAutomaticDeviceName("WSL · Ubuntu", "linux")).toBe(true);
    expect(isAutomaticDeviceName("Work laptop", "linux")).toBe(false);
  });

  test("keeps the account name when an old CLI sends its automatic label", () => {
    expect(resolveDeviceName({ linkName: "Work laptop", requestedName: "Windows PC", platform: "win32" })).toBe("Work laptop");
    expect(resolveDeviceName({ linkName: "Work laptop", requestedName: "WSL · Ubuntu", platform: "linux" })).toBe("Work laptop");
  });

  test("allows an explicit CLI override while defaulting to the account name", () => {
    expect(resolveDeviceName({ linkName: "Work laptop", requestedName: "Travel laptop", platform: "darwin", explicit: true })).toBe("Travel laptop");
    expect(resolveDeviceName({ linkName: "Work laptop", platform: "darwin" })).toBe("Work laptop");
  });
});
