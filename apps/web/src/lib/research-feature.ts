function parseTripAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function researchEnabledForTrip(
  tripId: string,
  enabled = import.meta.env.VITE_RESEARCH_ALPHA_ENABLED,
  configuredTripIds = import.meta.env.VITE_RESEARCH_ALPHA_TRIP_IDS,
) {
  if (enabled !== "true") return false;
  const allowlist = parseTripAllowlist(configuredTripIds);
  return allowlist.has("*") || allowlist.has(tripId);
}

function researchCaptureUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export { parseTripAllowlist, researchCaptureUrl, researchEnabledForTrip };
