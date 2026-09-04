const MAX_EXTERNAL_URL_LENGTH = 2_048;

export function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new Error("External URL is invalid.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("External URL is invalid.");
  }

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("Only non-credentialed HTTP(S) URLs may be opened externally.");
  }
  return url.toString();
}
