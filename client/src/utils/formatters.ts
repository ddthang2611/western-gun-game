// Strip log prefix tags
export function formatSimpleLog(line: string): string {
  return line
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/^\[Mock\]\s*/i, "")
    .trim();
}
