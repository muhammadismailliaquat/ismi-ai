"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Mic, StopCircle, PhoneOff } from "lucide-react";
import { useRouter } from "next/navigation";

import { ParticleBackground } from "@/components/ParticleBackground";
import { ChatMessage } from "@/types/chat";
import { storage } from "@/lib/storage";
import { useSpeechRecognition } from "@/lib/speech";
import { EDGE_VOICES, readTtsVoice, saveTtsVoice } from "@/lib/ttsVoices";

type ChatStreamResult = { ok: true; text: string } | Response;

export type VoiceCallModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToChat: () => void;
  onConversationComplete: (messages: ChatMessage[]) => void | Promise<void>;
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function VoiceCallModal({
  isOpen,
  onClose,
  onSwitchToChat,
  onConversationComplete,
}: VoiceCallModalProps) {
  const router = useRouter();

  const [youTranscript, setYouTranscript] = useState<string>("");
  const [assistantText, setAssistantText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [isListeningLocal, setIsListeningLocal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [audioStatus, setAudioStatus] = useState<"idle" | "playing">("idle");

  const [selectedVoice, setSelectedVoice] = useState<string>(() => readTtsVoice());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);

  const voicePitch = useMemo(() => {
    if (typeof window === "undefined") return 1;
    try {
      const raw = localStorage.getItem("ismi_settings");
      if (!raw) return 1;
      const parsed = JSON.parse(raw);
      const v = parsed?.voicePitch;
      if (typeof v === "number" && !Number.isNaN(v)) return v;
    } catch {}
    return 1;
  }, [isOpen]);

  const chatAbortRef = useRef<AbortController | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  const listeningActiveRef = useRef(false);

  const voiceRate = useMemo(() => {
    if (typeof window === "undefined") return 1;
    try {
      const raw = localStorage.getItem("ismi_settings");
      if (!raw) return 1;
      const parsed = JSON.parse(raw);
      const v = parsed?.voiceRate;
      if (typeof v === "number" && !Number.isNaN(v)) return v;
    } catch {}
    return 1;
  }, [isOpen]);

  const voiceOptions = useMemo(() => {
    // Male/Female English only
    const usEnglish = EDGE_VOICES.filter((v) => v.value.startsWith("en-US-"));
    const seen = new Set<string>();
    return usEnglish.filter((v) => {
      if (seen.has(v.gender)) return false;
      seen.add(v.gender);
      return true;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    setSelectedVoice(readTtsVoice());
    setError(null);
    setYouTranscript("");
    setAssistantText("");
    setIsListeningLocal(false);
    setIsGenerating(false);
    setAudioStatus("idle");

    chatAbortRef.current?.abort();
    ttsAbortRef.current?.abort();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const revokeCurrentAudio = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {}
  }, []);

  const stopTts = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    setAudioStatus("idle");
    revokeCurrentAudio();

    // Revoke any previous blob URL to avoid memory leaks.
    try {
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }
    } catch {}
  }, [revokeCurrentAudio]);

  const parseChatStream = useCallback(async (response: Response): Promise<ChatStreamResult> => {
    if (!response.ok) {
      if (response.status === 401) return jsonError("Unauthorized", 401);
      try {
        const err = await response.json();
        return jsonError(String(err?.error || "Chat failed"), response.status);
      } catch {
        return jsonError(`Chat failed (${response.status})`, response.status);
      }
    }

    const reader = response.body?.getReader();
    if (!reader) return jsonError("Missing response body", 500);

    const decoder = new TextDecoder();
    let buffer = "";
    let assistant = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          if (data === "[DONE]") {
            return { ok: true as const, text: assistant };
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed?.error) {
              return jsonError(String(parsed.error), 500);
            }
            if (typeof parsed?.text === "string") {
              assistant += parsed.text;
              setAssistantText(assistant);
            }
          } catch {
            // Ignore non-JSON chunks.
          }
        }
      }
    }

    return { ok: true as const, text: assistant };
  }, []);

  const fetchTtsAndPrepareAudio = useCallback(
    async (text: string) => {
      stopTts();

      const qs = new URLSearchParams({
        text: text.slice(0, 980),
        voice: selectedVoice,
        rate: String(voiceRate),
      });

      // Connect existing voicePitch setting to TTS API.
      const pitchDelta = voicePitch - 1;
      if (Math.abs(pitchDelta) > 1e-6) {
        const rel = Math.round(pitchDelta * 100);
        qs.set("pitch", `${rel >= 0 ? "+" : ""}${rel}%`);
      }

      ttsAbortRef.current?.abort();
      ttsAbortRef.current = new AbortController();

      const res = await fetch(`/api/tts?${qs.toString()}`, {
        signal: ttsAbortRef.current.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error(`TTS failed (${res.status})`);
      }

      const blob = await res.blob();

      // Revoke previous blob URL (if any) before replacing.
      try {
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current);
          audioObjectUrlRef.current = null;
        }
      } catch {}

      const url = URL.createObjectURL(blob);
      audioObjectUrlRef.current = url;

      try {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = url;

        // Auto-play immediately as soon as it’s ready.
        await audioRef.current.play();
        setAudioStatus("playing");

        // Revoke URL after playback completes.
        audioRef.current.onended = () => {
          try {
            if (audioObjectUrlRef.current) {
              URL.revokeObjectURL(audioObjectUrlRef.current);
              audioObjectUrlRef.current = null;
            }
          } catch {}
        };

        audioRef.current.onerror = () => {
          try {
            if (audioObjectUrlRef.current) {
              URL.revokeObjectURL(audioObjectUrlRef.current);
              audioObjectUrlRef.current = null;
            }
          } catch {}

          setAudioStatus("idle");
        };
      } catch {
        setAudioStatus("idle");
        try {
          if (audioObjectUrlRef.current) {
            URL.revokeObjectURL(audioObjectUrlRef.current);
            audioObjectUrlRef.current = null;
          } else {
            URL.revokeObjectURL(url);
          }
        } catch {}
      }
    },
    [router, selectedVoice, stopTts, voiceRate]
  );

  const handleSpeechInterim = useCallback((transcript: string) => {
    if (!listeningActiveRef.current) return;
    setError(null);
    setYouTranscript((transcript || "").trim());
  }, []);

  const handleSpeechError = useCallback((msg: string) => {
    setError(msg || "Voice input failed");
    listeningActiveRef.current = false;
    setIsListeningLocal(false);
  }, []);

  const handleSpeechFinal = useCallback(
    async (finalTranscript: string) => {
      if (!listeningActiveRef.current) return;

      const cleaned = (finalTranscript || "").trim();
      listeningActiveRef.current = false;
      setIsListeningLocal(false);

      if (!cleaned) return;

      setYouTranscript(cleaned);
      setError(null);

      setIsGenerating(true);
      setAssistantText("");

      chatAbortRef.current?.abort();
      chatAbortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-voice-mode": "true",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: cleaned }],
          }),
          signal: chatAbortRef.current.signal,
        });

        const parsed = await parseChatStream(response);
        if (parsed instanceof Response) {
          if (parsed.status === 401) {
            router.push("/login");
            return;
          }
          const err = await parsed.json().catch(() => null);
          throw new Error((err as { error?: string })?.error || "Chat failed");
        }

        const assistantContent = parsed.text || "";

        const userMessage: ChatMessage = {
          id: storage.generateId(),
          role: "user",
          content: cleaned,
          timestamp: new Date().toISOString(),
        };

        const assistantMessage: ChatMessage = {
          id: storage.generateId(),
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toISOString(),
        };

        await onConversationComplete([userMessage, assistantMessage]);

        if (assistantContent.trim()) {
          await fetchTtsAndPrepareAudio(assistantContent);
        }
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") return;
        setError((e as Error)?.message || "Failed to generate voice response");
      } finally {
        setIsGenerating(false);
      }
    },
    [
      fetchTtsAndPrepareAudio,
      onConversationComplete,
      parseChatStream,
      router,
    ]
  );

  const { startListening, stopListening, isSupported } = useSpeechRecognition({
    onResult: handleSpeechFinal,
    onInterimResult: handleSpeechInterim,
    onError: handleSpeechError,
    continuous: false,
    language: "en-US",
  });

  const startListeningSafe = useCallback(() => {
    if (!isSupported) {
      setError("Voice recognition is not supported in this browser.");
      return;
    }

    setError(null);
    stopTts();

    setAssistantText("");
    setYouTranscript("");

    listeningActiveRef.current = true;
    setIsListeningLocal(true);
    startListening();
  }, [isSupported, startListening, stopTts]);

  const stopListeningSafe = useCallback(() => {
    listeningActiveRef.current = false;
    stopListening();
    setIsListeningLocal(false);
  }, [stopListening]);

  const handleMic = useCallback(() => {
    if (audioStatus === "playing") {
      // Stop speech immediately and resume listening.
      stopTts();
      setError(null);
      setAssistantText("");
      setYouTranscript("");
      setIsListeningLocal(false);

      // kick recognition
      listeningActiveRef.current = true;
      setIsListeningLocal(true);
      startListening();
      return;
    }

    if (isGenerating) return;

    if (isListeningLocal) {
      stopListeningSafe();
      return;
    }

    startListeningSafe();
  }, [
    audioStatus,
    isGenerating,
    isListeningLocal,
    startListening,
    startListeningSafe,
    stopListeningSafe,
    stopTts,
  ]);

  const handleEndCall = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    listeningActiveRef.current = false;
    stopListeningSafe();
    stopTts();
    onClose();
  }, [onClose, stopListeningSafe, stopTts]);

  const statusContent = error ? (
    <div className="text-sm text-red-200">{error}</div>
  ) : isListeningLocal ? (
    <div className="text-sm text-[#e2e8f0] whitespace-pre-wrap break-words">
      <span className="text-xs text-[#94a3b8]">You: </span>
      {youTranscript ? youTranscript : "Say something..."}
    </div>
  ) : (
    <div className="text-sm text-[#e2e8f0] whitespace-pre-wrap break-words">
      <span className="text-xs text-[#94a3b8]">Ismi: </span>
      {assistantText ? assistantText : isGenerating ? "Thinking..." : ""}
    </div>
  );

  const micIcon = audioStatus === "playing" ? (
    <StopCircle className="w-6 h-6" />
  ) : (
    <Mic className="w-6 h-6" />
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Flowing colorful particle background only */}
          <div className="absolute inset-0">
            <ParticleBackground variant="bloom" />
            {/* Keep background variant correct (bloom/galaxy) */}
            <div className="absolute inset-0 bg-black/18" aria-hidden="true" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="relative mx-auto mt-10 w-full max-w-2xl px-4"
          >
            <div className="rounded-3xl border border-white/10 bg-[#0b1220]/70 backdrop-blur-[18px] shadow-[0_20px_80px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-[#94a3b8]">Voice Mode</div>
                    <div className="text-2xl font-bold text-white">Voice Call</div>
                    <div className="text-xs text-[#94a3b8] mt-1">
                      {audioStatus === "playing"
                        ? "Speaking"
                        : isGenerating
                          ? "Thinking"
                          : isListeningLocal
                            ? "Listening"
                            : "Ready"}
                    </div>
                  </div>

                  {/* Voice dropdown */}
                  <div className="flex flex-col items-end gap-2">
                    <label className="text-xs text-[#94a3b8]">Voice</label>
                    <select
                      value={selectedVoice}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSelectedVoice(next);
                        saveTtsVoice(next);
                      }}
                      className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 outline-none"
                      aria-label="Voice dropdown"
                    >
                      {voiceOptions.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ONE frosted-glass status/transcript box */}
                <div className="mt-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 min-h-[160px]">
                  {statusContent}
                </div>

                {/* Controls: exactly 2-3 buttons total */}
                <div className="mt-8 flex items-center justify-between gap-4">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onSwitchToChat}
                    className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                    aria-label="Back to chat"
                  >
                    <MessageSquare className="w-6 h-6 text-[#94a3b8]" />
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleMic}
                    disabled={isGenerating && audioStatus !== "playing"}
                    className={`flex items-center justify-center w-16 h-16 rounded-full border-2 transition-all ${
                      audioStatus === "playing"
                        ? "bg-red-500/20 border-red-400/40 text-red-300"
                        : isListeningLocal
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-white/10 border-white/30 text-white hover:bg-white/20"
                    } ${isGenerating ? "opacity-70 cursor-not-allowed" : ""}`}
                    aria-label={audioStatus === "playing" ? "Stop speaking" : "Mic"}
                  >
                    {micIcon}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEndCall}
                    className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/20 border border-red-400/40 hover:bg-red-500/30 transition-all"
                    aria-label="End call"
                  >
                    <PhoneOff className="w-6 h-6 text-red-300" />
                  </motion.button>
                </div>

                <div className="mt-4 text-center text-xs text-[#94a3b8]">
                  {audioStatus === "playing"
                    ? "Tap mic to stop speech & resume listening"
                    : isListeningLocal
                      ? "Speak — I’ll generate a reply"
                      : "Tap mic to start"}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
