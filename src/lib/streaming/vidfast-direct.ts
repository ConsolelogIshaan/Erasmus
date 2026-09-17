import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const ENC_API = "https://enc-dec.app/api";
export const VIDFAST_REFERER = "https://vidfast.vc/";

const SERVER_PREFERENCES: Record<string, string[]> = {
  lisbon: ["vRapid", "vEdge", "vFast", "Cine", "Cobra"],
  sakura: ["Cine", "vFast", "vRapid"],
  nebula: ["vEdge", "vFast", "Cobra"],
  solara: ["Horizon", "vFast", "vEdge"],
  athens: ["Cobra", "vFast", "vRapid"],
  joy: ["Bravo", "vFast", "vEdge"],
  castle: ["vRapid", "vFast", "Cobra"],
  canaias: ["vEdge", "Horizon", "Bravo"],
};

export interface VidfastDirectHit {
  url: string;
  kind: "hls" | "file";
  referer: string;
  serverName: string;
}

interface DecryptedServer {
  name: string;
  description?: string;
  image?: string;
  data?: string;
}

export async function resolveVidfastDirectStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverId?: string;
}): Promise<{ hit: VidfastDirectHit | null; debug?: string }> {
  const pageUrl =
    input.type === "tv"
      ? `https://vidfast.vc/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `https://vidfast.vc/movie/${input.tmdbId}`;

  try {
    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
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
        signal: AbortSignal.timeout(6000),
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
      signal: AbortSignal.timeout(6000),
    });
    const serversEncText = await serversRes.text();
    if (!serversEncText) {
      return { hit: null, debug: `servers endpoint returned empty text (status ${serversRes.status})` };
    }

    const decServersRes = await fetch(`${ENC_API}/dec-vidfast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: serversEncText }),
      signal: AbortSignal.timeout(6000),
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
      SERVER_PREFERENCES[requestedServer] || ["vRapid", "vEdge", "vFast"];

    // Build ordered list of candidates:
    // For Lisbon (flagship 4K server), prioritize servers that deliver 4K
    const orderedCandidates: DecryptedServer[] = [];
    const addedNames = new Set<string>();

    const pushCandidate = (s: DecryptedServer) => {
      if (s.data && !addedNames.has(s.name)) {
        addedNames.add(s.name);
        orderedCandidates.push(s);
      }
    };

    if (requestedServer === "lisbon") {
      const fourKOrder = ["vRapid", "vEdge", "vFast"];
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

    let lastError = "";
    for (const candidate of orderedCandidates.slice(0, 5)) {
      try {
        const streamUrl = `${stream}/${candidate.data}`;
        const streamRes = await fetch(streamUrl, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(6000),
        });
        const streamEncText = await streamRes.text();
        if (!streamEncText) {
          lastError = `${candidate.name}: empty response`;
          continue;
        }

        const decStreamRes = await fetch(`${ENC_API}/dec-vidfast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: streamEncText }),
          signal: AbortSignal.timeout(6000),
        });
        const decStreamJson = (await decStreamRes.json()) as {
          status?: number;
          result?: { url?: string };
        };
        const streamResult = decStreamJson.result;
        if (decStreamJson.status === 200 && streamResult?.url) {
          const finalUrl = streamResult.url;
          return {
            hit: {
              url: finalUrl,
              kind: finalUrl.includes(".mp4") ? "file" : "hls",
              referer: VIDFAST_REFERER,
              serverName: candidate.name,
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
