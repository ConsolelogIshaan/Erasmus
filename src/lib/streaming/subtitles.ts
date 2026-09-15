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

export function isAssText(text: string): boolean {
  const trimmed = text.trimStart().replace(/^\uFEFF/, "");
  if (trimmed.startsWith("WEBVTT")) return false;
  return (
    /\[script info\]/i.test(trimmed) ||
    /\[v4\+? styles\]/i.test(trimmed) ||
    /\[events\]/i.test(trimmed) ||
    /^dialogue:\s*/im.test(trimmed)
  );
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

function formatVttTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}.${pad3(ms)}`;
}

export function parseTimestamp(raw: string): number {
  const stamp = raw.trim().replace(",", ".");
  const parts = stamp.split(":");
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + parseFloat(parts[2] || "0");
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + parseFloat(parts[1] || "0");
  }
  return parseFloat(stamp) || 0;
}

export function assToVtt(text: string): string {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = clean.split("\n");

  let inEvents = false;
  let formatFields: string[] = [];
  let startIndex = 1;
  let endIndex = 2;
  let textIndex = 9;

  interface IntermediateCue {
    start: number;
    end: number;
    vttStart: string;
    vttEnd: string;
    text: string;
  }

  const cues: IntermediateCue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    if (line.toLowerCase() === "[events]") {
      inEvents = true;
      continue;
    }

    if (inEvents && line.toLowerCase().startsWith("format:")) {
      const header = line.slice(7).trim();
      formatFields = header.split(",").map((f) => f.trim().toLowerCase());
      const sIdx = formatFields.indexOf("start");
      const eIdx = formatFields.indexOf("end");
      const tIdx = formatFields.indexOf("text");
      if (sIdx !== -1) startIndex = sIdx;
      if (eIdx !== -1) endIndex = eIdx;
      if (tIdx !== -1) textIndex = tIdx;
      continue;
    }

    if (/^dialogue:\s*/i.test(line)) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      const body = line.slice(colonIndex + 1).trim();

      const numFields = formatFields.length || 10;
      const parts: string[] = [];
      let cur = "";

      for (let j = 0; j < body.length; j++) {
        if (parts.length === numFields - 1) {
          parts.push(body.slice(j));
          break;
        }
        if (body[j] === ",") {
          parts.push(cur.trim());
          cur = "";
        } else {
          cur += body[j];
        }
      }
      if (cur && parts.length < numFields) {
        parts.push(cur.trim());
      }

      const rawStart = parts[startIndex] || "";
      const rawEnd = parts[endIndex] || "";
      const rawText = parts[textIndex] || "";

      // Skip ASS drawing commands
      if (/\{\\p[1-9]\}/i.test(rawText)) continue;

      const startSec = parseTimestamp(rawStart);
      const endSec = parseTimestamp(rawEnd);
      if (endSec <= startSec) continue;

      const cleanText = rawText
        .replace(/\\N/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\h/g, " ")
        .replace(/\{[^}]*\}/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();

      if (!cleanText) continue;

      cues.push({
        start: startSec,
        end: endSec,
        vttStart: formatVttTimestamp(startSec),
        vttEnd: formatVttTimestamp(endSec),
        text: cleanText,
      });
    }
  }

  cues.sort((a, b) => a.start - b.start);

  let output = "WEBVTT\n\n";
  for (const cue of cues) {
    output += `${cue.vttStart} --> ${cue.vttEnd}\n${cue.text}\n\n`;
  }
  return output;
}

export function parseSubtitleCues(text: string): SubtitleCue[] {
  let source = text.replace(/^\uFEFF/, "");
  if (isAssText(source)) {
    source = assToVtt(source);
  } else if (isSrtText(source)) {
    source = srtToVtt(source);
  }

  const cleanSource = source.replace(/\r/g, "").replace(/\n[ \t]+\n/g, "\n\n");
  const blocks = cleanSource.split(/\n\n+/);
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
      .replace(/\{[^}]+\}/g, "")
      .trim();
    if (!cueText || end <= start) continue;
    cues.push({ start, end, text: cueText });
  }
  return cues;
}

export function cuesAtTime(cues: SubtitleCue[], seconds: number): string {
  const active = cues.filter((cue) => seconds >= cue.start && seconds < cue.end);
  const unique = Array.from(new Set(active.map((cue) => cue.text.trim()))).filter(Boolean);
  return unique.join("\n");
}
