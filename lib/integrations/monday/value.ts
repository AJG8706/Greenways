// Pure Monday column-value builders (unit-tested apart from the server client).

/** Link-column value: {url, text}; empty object clears the column. */
export function linkColumnValue(url: string | null, label?: string): string {
  if (!url) return "{}";
  return JSON.stringify({ url, text: label ?? url });
}
