export function encodeCursor(fields: Record<string, string>): string {
  return Buffer.from(JSON.stringify(fields)).toString("base64url");
}

export function decodeCursor(cursor: string): Record<string, string> {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}
