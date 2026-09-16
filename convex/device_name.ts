const AUTOMATIC_NAMES = new Set(["Mac", "Windows PC", "Linux computer", "Computer"]);

/**
 * Older published CLIs sent their platform label as `name` even when the
 * account owner had already named the link. Treat those labels as defaults so
 * an account-side name remains authoritative during redemption.
 */
export function isAutomaticDeviceName(name: string, platform?: string) {
  const normalizedName = name.trim();
  const normalizedPlatform = platform?.trim().toLowerCase();
  if (normalizedName === "Mac") return normalizedPlatform === "darwin";
  if (normalizedName === "Windows PC") return normalizedPlatform === "win32";
  if (normalizedName === "Linux computer") return normalizedPlatform === "linux";
  if (/^WSL\s·\s.+/.test(normalizedName)) return normalizedPlatform === "linux";
  return AUTOMATIC_NAMES.has(normalizedName);
}

export function resolveDeviceName({
  linkName,
  requestedName,
  platform,
  explicit,
}: {
  linkName: string;
  requestedName?: string;
  platform?: string;
  explicit?: boolean;
}) {
  const accountName = linkName.trim() || "My computer";
  const clientName = requestedName?.trim();
  if (!clientName) return accountName;
  if (explicit === true) return clientName;
  if (explicit === false || isAutomaticDeviceName(clientName, platform)) return accountName;
  return clientName;
}
