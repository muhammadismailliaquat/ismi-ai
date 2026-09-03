import { NextRequest } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getToken } from "next-auth/jwt";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// ── Rate limiters (TTS is expensive — stricter than chat) ───────────────────
const redis = Redis.fromEnv();

const limiterByUser = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "tts:user",
});

const limiterByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  prefix: "tts:ip",
});

// Allowed voices (sample list; safe defaults only — no arbitrary SSML injection)
const ALLOWED_VOICES = new Set([
  "en-US-AndrewNeural",
  "en-US-AriaNeural",
  "en-US-ChristopherNeural",
  "en-US-EricNeural",
  "en-US-JennyNeural",
  "en-US-MichelleNeural",
  "en-US-RogerNeural",
  "en-US-SteffanNeural",
  "en-GB-RyanNeural",
  "en-GB-SoniaNeural",
  "en-AU-NatashaNeural",
  "en-AU-WilliamNeural",
  "en-IN-PrabhatNeural",
  "en-IN-RavindraNeural",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET handler ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // ── 1. Auth check ────────────────────────────────────────────────────────
  const token = await getToken({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: request as any,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.sub) {
    return jsonError("Unauthorized", 401);
  }

  const userKey = String(token.sub);
  const ip = getClientIp(request);

  // ── 2. Rate limit ───────────────────────────────────────────────────────
  const [byUser, byIp] = await Promise.all([
    limiterByUser.limit(userKey),
    limiterByIp.limit(ip),
  ]);

  if (!byUser.success || !byIp.success) {
    return jsonError("Too many TTS requests. Please wait a moment.", 429);
  }

  // ── 4. Parse query params ───────────────────────────────────────────────
  const text = (request.nextUrl.searchParams.get("text") || "").trim();
  const rawVoice = request.nextUrl.searchParams.get("voice") || "en-US-AndrewNeural";
  const rawRate = request.nextUrl.searchParams.get("rate");

  // ── 5. Validate & sanitize inputs ───────────────────────────────────────
  if (!text) {
    return jsonError("No text provided", 400);
  }

  // Voice allowlist — default to safe voice if unknown
  const voice = ALLOWED_VOICES.has(rawVoice) ? rawVoice : "en-US-AndrewNeural";

  // Rate: must be numeric, clamp to [0.5, 2.0]
  const rawRateNum = rawRate && !isNaN(Number(rawRate)) ? Number(rawRate) : 1;
  const rate = Math.min(2.0, Math.max(0.5, rawRateNum));

  // Text cap — safety cutoff to prevent abuse
  const safeText =
    text.length > 1000
      ? text.slice(0, 980).replace(/\s+\S*$/, "") + "."
      : text;

  // ── 6. Generate TTS audio ───────────────────────────────────────────────
  const tts = new MsEdgeTTS();

  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(safeText, { rate });

    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream) {
      // Respect client disconnect
      if (request.signal.aborted) {
        console.log("[tts] Client disconnected — stopping audio generation");
        break;
      }
      chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
    }
    try {
      tts.close();
    } catch {}

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return new Response(combined, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "Content-Length": String(totalLength),
      },
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("[tts] Error:", error?.message || error);
    try {
      tts.close();
    } catch {}
    return jsonError("TTS failed: " + ((error as Error)?.message || "unknown"), 500);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
