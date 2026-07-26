function safeRedirectPath(value: string | null, fallback = "/trips") {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export { safeRedirectPath };
