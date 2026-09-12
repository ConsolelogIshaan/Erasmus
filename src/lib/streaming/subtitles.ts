export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export function isSrtText(text: string): boolean {
  const trimmed = text.trimStart().replace(/^\uFEFF/, "");
  if (trimmed.startsWith("WEBVTT")) return false;
  return /^\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,.]/.test(trimmed);
}

export function srtToVtt(text: string): string {
  const body = text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();
  const stamped = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  if (stamped.startsWith("WEBVTT")) return stamped;
  return `WEBVTT\n\n${stamped}\n`;
}

function parseTimestamp(raw: string): number {
  const stamp = raw.trim().replace(",", ".");
  const parts = stamp.split(":");
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(stamp) || 0;
}

export function parseSubtitleCues(text: string): SubtitleCue[] {
  const source = isSrtText(text) ? srtToVtt(text) : text.replace(/^\uFEFF/, "");
  const blocks = source.replace(/\r/g, "").split(/\n\n+/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;
    const [startRaw, endRaw] = lines[timeIndex]!.split("-->");
    if (!startRaw || !endRaw) continue;
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp((endRaw.trim().split(/\s+/)[0] || "").trim());
    const cueText = lines
      .slice(timeIndex + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!cueText || end <= start) continue;
    cues.push({ start, end, text: cueText });
  }
  return cues;
}

export function cuesAtTime(cues: SubtitleCue[], seconds: number): string {
  const active = cues.filter((cue) => seconds >= cue.start && seconds < cue.end);
  return active.map((cue) => cue.text).join("\n");
}
