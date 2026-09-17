import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const ENC_API = "https://enc-dec.app/api";
export const VIDFAST_REFERER = "https://vidfast.vc/";

const SERVER_PREFERENCES: Record<string, string[]> = {
  lisbon: ["vFast", "vEdge", "vRapid", "Horizon", "vBlaze", "Cobra", "Bravo", "Cine"],
  sakura: ["vRapid", "vEdge", "Cine", "vFast", "vBlaze", "Horizon"],
  nebula: ["vEdge", "vFast", "vRapid", "Cobra", "Horizon"],
  solara: ["Horizon", "vEdge", "vRapid", "vFast", "vBlaze"],
  athens: ["vFast", "vEdge", "vRapid", "Horizon", "Cobra", "Bravo"],
  joy: ["Bravo", "vEdge", "vRapid", "vFast", "Horizon"],
  castle: ["vRapid", "vEdge", "vFast", "Cobra", "vBlaze"],
  canaias: ["vEdge", "Horizon", "vRapid", "Bravo", "vFast"],
};

export interface VidfastDirectHit {
  url: string;
  kind: "hls" | "file";
  referer: string;
  serverName: string;
  is4K?: boolean;
  hdUrl?: string;
  fourKUrl?: string;
}

interface DecryptedServer {
  name: string;
  description?: string;
  image?: string;
  data?: string;
}

export interface AlternateTvCoordinate {
  season: number;
  episode: number;
  reason: string;
}

export function getAlternateTvCoordinates(
  season: number,
  episode: number,
): AlternateTvCoordinate[] {
  const candidates: AlternateTvCoordinate[] = [];
  const seen = new Set<string>();

  const add = (s: number, e: number, reason: string) => {
    if (s <= 0 || e <= 0) return;
    if (s === season && e === episode) return;
    const key = `${s}:${e}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ season: s, episode: e, reason });
    }
  };

  if (season === 1) {
    if (episode > 12) {
      // 12-episode cour split (standard for split-cour anime, e.g. Solo Leveling, Spy x Family)
      add(2, episode - 12, "cour-12-split");
      // 13-episode cour split
      add(2, episode - 13, "cour-13-split");
    }
    if (episode > 24) {
      add(3, episode - 24, "cour-3-split-24");
      add(3, episode - 25, "cour-3-split-25");
      add(3, episode - 26, "cour-3-split-26");
      add(2, episode - 24, "cour-2-split-24");
    }
    if (episode > 36) {
      add(4, episode - 36, "cour-4-split-36");
      add(4, episode - 39, "cour-4-split-39");
    }
  } else {
    // Season > 1: Host may store continuous episodes under Season 1
    if (season === 2) {
      add(1, episode + 12, "s1-cour12-absolute");
      add(1, episode + 13, "s1-cour13-absolute");
      add(1, episode + 24, "s1-cour24-absolute");
      add(1, episode + 25, "s1-cour25-absolute");
      add(1, episode + 26, "s1-cour26-absolute");
    }
    add(1, (season - 1) * 12 + episode, `s1-calc-12x${season - 1}`);
    add(1, (season - 1) * 13 + episode, `s1-calc-13x${season - 1}`);
    add(1, (season - 1) * 24 + episode, `s1-calc-24x${season - 1}`);
    add(1, (season - 1) * 25 + episode, `s1-calc-25x${season - 1}`);
    add(1, episode, "s1-same-episode");
    add(season - 1, episode, "season-minus-1");
  }

  // Offsets by 1 (recap episodes, specials, or 0-indexed catalog)
  if (episode > 1) {
    add(season, episode - 1, "episode-minus-1");
  }
  add(season, episode + 1, "episode-plus-1");

  return candidates;
}

async function resolveVidfastDirectStreamSingle(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverId?: string;
  isFallback?: boolean;
}): Promise<{ hit: VidfastDirectHit | null; debug?: string }> {
  const cleanId = input.tmdbId.trim();
  const pageUrl =
    input.type === "tv"
      ? `https://vidfast.vc/tv/${cleanId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `https://vidfast.vc/movie/${cleanId}`;

  try {
    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!pageRes.ok) {
      return { hit: null, debug: `page fetch failed: status ${pageRes.status}` };
    }
    const html = await pageRes.text();
    const match = html.match(/\\"(?:en|token)\\":\\"([^\\"]+)\\"/);
    if (!match?.[1]) {
      return { hit: null, debug: `no session token found in page payload (html len ${html.length})` };
    }

    const encRes = await fetch(
      `${ENC_API}/enc-vidfast?text=${encodeURIComponent(match[1])}`,
      {
        signal: AbortSignal.timeout(4500),
      },
    );
    const encJson = (await encRes.json()) as {
      status?: number;
      result?: { servers?: string; stream?: string; token?: string };
    };
    if (
      encJson.status !== 200 ||
      !encJson.result?.servers ||
      !encJson.result?.stream ||
      !encJson.result?.token
    ) {
      return { hit: null, debug: `enc-vidfast returned status ${encJson.status}` };
    }

    const { servers, stream, token } = encJson.result;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      Referer: VIDFAST_REFERER,
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": token,
    };

    const serversRes = await fetch(servers, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(4500),
    });
    const serversEncText = await serversRes.text();
    if (!serversEncText) {
      return { hit: null, debug: `servers endpoint returned empty text (status ${serversRes.status})` };
    }

    const decServersRes = await fetch(`${ENC_API}/dec-vidfast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: serversEncText }),
      signal: AbortSignal.timeout(4500),
    });
    const decServersJson = (await decServersRes.json()) as {
      status?: number;
      result?: DecryptedServer[];
    };
    if (decServersJson.status !== 200 || !Array.isArray(decServersJson.result)) {
      return { hit: null, debug: `dec-vidfast servers returned status ${decServersJson.status}` };
    }

    const serverList = decServersJson.result;
    const requestedServer = input.serverId || "lisbon";
    const preferredNames =
      SERVER_PREFERENCES[requestedServer] || ["vEdge", "vRapid", "vFast"];

    const orderedCandidates: DecryptedServer[] = [];
    const addedNames = new Set<string>();

    const pushCandidate = (s: DecryptedServer) => {
      if (s.data && !addedNames.has(s.name)) {
        addedNames.add(s.name);
        orderedCandidates.push(s);
      }
    };

    if (requestedServer === "lisbon" || requestedServer === "athens") {
      const fourKOrder = ["vFast", "vEdge", "vRapid", "Horizon", "Cobra", "vBlaze", "Bravo", "Cine"];
      for (const name of fourKOrder) {
        const match = serverList.find(
          (s) => s.name.toLowerCase() === name.toLowerCase() && s.data,
        );
        if (match) pushCandidate(match);
      }
      const other4K = serverList.filter(
        (s) =>
          s.data &&
          (s.image?.includes("4k") ||
            s.description?.toLowerCase().includes("4k")),
      );
      for (const s of other4K) {
        pushCandidate(s);
      }
    }

    for (const pref of preferredNames) {
      const match = serverList.find(
        (s) => s.name.toLowerCase() === pref.toLowerCase() && s.data,
      );
      if (match) pushCandidate(match);
    }

    for (const s of serverList) {
      if (s.data) pushCandidate(s);
    }

    if (orderedCandidates.length === 0) {
      return {
        hit: null,
        debug: `no candidate with data found among ${serverList.length} servers`,
      };
    }

    const resolveCandidateUrl = async (cand?: DecryptedServer): Promise<string | null> => {
      if (!cand?.data) return null;
      try {
        const sUrl = `${stream}/${cand.data}`;
        const sRes = await fetch(sUrl, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(2500),
        });
        const sEnc = await sRes.text();
        if (!sEnc) return null;
        const dRes = await fetch(`${ENC_API}/dec-vidfast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sEnc }),
          signal: AbortSignal.timeout(2500),
        });
        const dJson = (await dRes.json()) as { status?: number; result?: { url?: string } };
        return dJson.status === 200 && dJson.result?.url ? dJson.result.url : null;
      } catch {
        return null;
      }
    };

    let lastError = "";
    let consecutiveEmpty = 0;
    for (const candidate of orderedCandidates.slice(0, 8)) {
      try {
        const streamUrl = `${stream}/${candidate.data}`;
        const streamRes = await fetch(streamUrl, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(3500),
        });
        const streamEncText = await streamRes.text();
        if (!streamEncText) {
          consecutiveEmpty++;
          lastError = `${candidate.name}: empty response`;
          if (consecutiveEmpty >= 4) {
            break;
          }
          continue;
        }
        consecutiveEmpty = 0;

        const decStreamRes = await fetch(`${ENC_API}/dec-vidfast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: streamEncText }),
          signal: AbortSignal.timeout(3500),
        });
        const decStreamJson = (await decStreamRes.json()) as {
          status?: number;
          result?: { url?: string };
        };
        const streamResult = decStreamJson.result;
        if (decStreamJson.status === 200 && streamResult?.url) {
          const finalUrl = streamResult.url;
          const is4K =
            candidate.name.toLowerCase() === "vfast" ||
            Boolean(candidate.description?.toLowerCase().includes("4k")) ||
            Boolean(candidate.image?.includes("4k")) ||
            finalUrl.includes("2160") ||
            finalUrl.includes("4k") ||
            finalUrl.includes("4K") ||
            finalUrl.includes("cdn1") ||
            requestedServer === "lisbon" ||
            requestedServer === "athens";

          let hdUrl: string | undefined = undefined;
          let fourKUrl: string | undefined = undefined;

          // Only perform companion lookup for non-fallback queries to keep fallback fast
          if (!input.isFallback) {
            if (is4K) {
              fourKUrl = finalUrl;
              const hdCandidate = serverList.find(
                (s) =>
                  s.data &&
                  s.name.toLowerCase() !== candidate.name.toLowerCase() &&
                  (s.name.toLowerCase() === "vedge" ||
                    s.name.toLowerCase() === "vrapid" ||
                    s.name.toLowerCase() === "cobra" ||
                    s.name.toLowerCase() === "horizon"),
              );
              if (hdCandidate) {
                const companionUrl = await resolveCandidateUrl(hdCandidate);
                if (companionUrl) hdUrl = companionUrl;
              }
            } else {
              hdUrl = finalUrl;
              const fourKCandidate = serverList.find(
                (s) =>
                  s.data &&
                  s.name.toLowerCase() !== candidate.name.toLowerCase() &&
                  (s.name.toLowerCase() === "vfast" ||
                    Boolean(s.description?.toLowerCase().includes("4k")) ||
                    Boolean(s.image?.includes("4k"))),
              );
              if (fourKCandidate) {
                const companionUrl = await resolveCandidateUrl(fourKCandidate);
                if (companionUrl) fourKUrl = companionUrl;
              }
            }
          }

          return {
            hit: {
              url: finalUrl,
              kind: finalUrl.includes(".mp4") ? "file" : "hls",
              referer: VIDFAST_REFERER,
              serverName: candidate.name,
              is4K,
              hdUrl,
              fourKUrl,
            },
          };
        }
        lastError = `${candidate.name}: returned status ${decStreamJson.status}`;
      } catch (candErr) {
        lastError = `${candidate.name}: ${candErr instanceof Error ? candErr.message : String(candErr)}`;
      }
    }

    return {
      hit: null,
      debug: `tried ${orderedCandidates.length} servers, last error: ${lastError}`,
    };
  } catch (error) {
    return { hit: null, debug: `vidfast exception: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function resolveVidfastDirectStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverId?: string;
  isFallback?: boolean;
}): Promise<{ hit: VidfastDirectHit | null; debug?: string }> {
  // 1. Try exact requested coordinates
  const primary = await resolveVidfastDirectStreamSingle(input);
  if (primary.hit) {
    return primary;
  }

  // 2. If not TV or this is already a fallback invocation, return primary failure
  if (input.type !== "tv" || input.isFallback) {
    return primary;
  }

  // 3. Evaluate smart alternate coordinates for TV / Anime cour splits & continuous numbering
  const alternates = getAlternateTvCoordinates(input.season ?? 1, input.episode ?? 1);
  let lastDebug = primary.debug || "";

  for (const alt of alternates.slice(0, 5)) {
    const altRes = await resolveVidfastDirectStreamSingle({
      ...input,
      season: alt.season,
      episode: alt.episode,
      isFallback: true,
    });
    if (altRes.hit) {
      return {
        hit: altRes.hit,
        debug: `fallback matched ${alt.reason} [S${alt.season}E${alt.episode}]; previous: ${lastDebug}`,
      };
    }
    if (altRes.debug) {
      lastDebug = `${alt.reason}: ${altRes.debug}`;
    }
  }

  return { hit: null, debug: lastDebug || primary.debug };
}
