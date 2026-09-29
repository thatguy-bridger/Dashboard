// Google's own per-file-type brand colors — stable, no API call needed.
const TYPE_COLORS: [pattern: RegExp, color: string][] = [
  [/spreadsheet/, "#0f9d58"],
  [/presentation/, "#f4b400"],
  [/document$/, "#4285f4"],
  [/pdf/, "#ea4335"],
  [/folder/, "#5f6368"],
  [/image\//, "#a142f4"],
  [/video\//, "#e8710a"],
  [/audio\//, "#ff6d00"],
  [/zip|compressed/, "#795548"],
];

export function driveTypeColor(mimeType: string | null | undefined): string {
  if (!mimeType) return "#8b93a7";
  const match = TYPE_COLORS.find(([pattern]) => pattern.test(mimeType));
  return match?.[1] ?? "#8b93a7";
}
