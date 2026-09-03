"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Loader2, Pause, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { ChatMessage } from "@/types/chat";
import { storage } from "@/lib/storage";
import { useSpeechRecognition } from "@/lib/speech";
import { readTtsVoice } from "@/lib/ttsVoices";
import { VoiceOrb } from "@/components/VoiceOrb";

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

  const [inputText, setInputText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [isListeningLocal, setIsListeningLocal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [assistantText, setAssistantText] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<"idle" | "playing" | "paused">("idle");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ttsVoice = useMemo(() => {
    return readTtsVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const stopAudio = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } catch {}
    setAudioStatus("idle");
  }, []);

  const revokeAudioUrl = useCallback((url: string | null) => {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, []);

  // Cleanup when modal closes — use a ref signal to avoid direct setState in effect.
  const cleanupSignalRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      cleanupSignalRef.current = true;
    } else {
      cleanupSignalRef.current = false;
    }
  }, [isOpen]);

  const handleSpeechResult = useCallback(
    (finalTranscript: string) => {
      const cleaned = (finalTranscript || "").trim();
      setInputText(cleaned);
      setIsListeningLocal(false);
    },
    []
  );

  const handleSpeechError = useCallback((msg: string) => {
    setError(msg || "Voice input failed");
    setIsListeningLocal(false);
  }, []);

  const { startListening, stopListening, isSupported } = useSpeechRecognition({
    onResult: handleSpeechResult,
    onError: handleSpeechError,
    continuous: false,
    language: "en-US",
  });

  const startVoice = useCallback(() => {
    setError(null);
    setAssistantText("");
    revokeAudioUrl(audioUrl);
    setAudioUrl(null);

    setInputText("");
    setInputText("");

    if (!isSupported) {
      setError("Voice recognition is not supported in this browser.");
      return;
    }

    setIsListeningLocal(true);
    startListening();
  }, [audioUrl, isSupported, revokeAudioUrl, startListening]);

  const stopVoice = useCallback(() => {
    stopListening();
    setIsListeningLocal(false);
  }, [stopListening]);

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
    if (!reader) {
      return jsonError("Missing response body", 500);
    }

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
      stopAudio();
      revokeAudioUrl(audioUrl);
      setAudioUrl(null);
      setAudioStatus("idle");

      const qs = new URLSearchParams({
        text: text.slice(0, 980),
        voice: ttsVoice,
        rate: String(voiceRate),
      });

      const res = await fetch(`/api/tts?${qs.toString()}`, {
        signal: abortRef.current?.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error(`TTS failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Attempt autoplay; if it fails, user can click Play.
      try {
        if (!audioRef.current) audioRef.current = new Audio();
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
          setAudioStatus("playing");
        }
      } catch {
        setAudioStatus("paused");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioUrl, revokeAudioUrl, stopAudio, ttsVoice, voiceRate]
  );

  const handleGenerate = useCallback(async () => {
    const text = (inputText || "").trim();

    if (!text) {
      setError("Say something first (or type your message)." );
      return;
    }
    setError(null);

    const userText = text.length > 2000 ? text.slice(0, 2000) : text;

    setIsGenerating(true);
    setAssistantText("");

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const userMessage: ChatMessage = {
        id: storage.generateId(),
        role: "user",
        content: userText,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userText }],
        }),
        signal: abortRef.current.signal,
      });

      const parsed = await parseChatStream(response);
      if (parsed instanceof Response) {
        if (parsed.status === 401) {
          router.push("/login");
          return;
        }
        const errJson = await parsed.json().catch(() => null);
        throw new Error((errJson as { error?: string })?.error || "Chat failed");
      }

      const assistantContent = parsed.text || "";
      setAssistantText(assistantContent);

      const assistantMessage: ChatMessage = {
        id: storage.generateId(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };

      await onConversationComplete([userMessage, assistantMessage]);

      // Generate TTS after the assistant text is ready.
      if (assistantContent.trim()) {
        await fetchTtsAndPrepareAudio(assistantContent);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      if ((e as Error)?.message === "Unauthorized") {
        router.push("/login");
        return;
      }
      setError((e as Error)?.message || "Failed to generate voice response");
    } finally {
      setIsGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTtsAndPrepareAudio, inputText, onConversationComplete, parseChatStream]);

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current && audioUrl) {
      audioRef.current = new Audio(audioUrl);
    }
    if (!audioRef.current) return;

    if (audioStatus === "playing") {
      audioRef.current.pause();
      setAudioStatus("paused");
      return;
    }

    try {
      await audioRef.current.play();
      setAudioStatus("playing");
    } catch {
      setAudioStatus("paused");
    }
  }, [audioStatus, audioUrl]);

  const onOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onMouseDown={onOverlayMouseDown}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="relative w-full max-w-2xl rounded-3xl overflow-hidden border border-blue-200/15 bg-[#0b1220]/95 backdrop-blur-[10px] shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
          >
            {/* Close */}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>

            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-6">
                {/* Orb */}
                <div className="w-40 h-40 rounded-3xl bg-blue-500/5 border border-blue-200/15 flex items-center justify-center">
                  <VoiceOrb
                    audioLevel={isListeningLocal ? 0.9 : 0.2}
                    state={isGenerating ? "thinking" : isListeningLocal ? "listening" : "idle"}
                  />
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Voice Mode</h2>
                      <p className="text-sm text-[#94a3b8] mt-1">
                        Speak, generate a reply, then listen via TTS.
                      </p>
                    </div>
                    <button
                      onClick={onSwitchToChat}
                      className="text-sm text-[#94a3b8] hover:text-[#a78bfa] transition-colors"
                    >
                      Switch to Chat
                    </button>
                  </div>

                  {/* Input */}
                  <div className="mt-5">
                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={isListeningLocal ? stopVoice : startVoice}
                        disabled={isGenerating}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-all w-1/2 ${
                          isGenerating
                            ? "bg-white/5 text-gray-500 cursor-not-allowed border-white/10"
                            : isListeningLocal
                              ? "bg-red-500/15 text-red-300 border-red-400/30 hover:bg-red-500/20"
                              : "bg-[#7c3aed]/55 text-white border-[#a78bfa]/40 hover:bg-[#7c3aed]/70"
                        }`}
                        aria-label={isListeningLocal ? "Stop listening" : "Start listening"}
                      >
                        {isListeningLocal ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        <span className="font-semibold">{isListeningLocal ? "Stop" : "Speak"}</span>
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleGenerate}
                        disabled={isGenerating || !(inputText || "").trim()}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-all w-1/2 ${
                          isGenerating || !(inputText || "").trim()
                            ? "bg-white/5 text-gray-500 cursor-not-allowed border-white/10"
                            : "bg-blue-500/15 text-blue-200 border-blue-300/20 hover:bg-blue-500/20"
                        }`}
                        aria-label="Generate voice reply"
                      >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                        <span className="font-semibold">{isGenerating ? "Thinking" : "Generate"}</span>
                      </motion.button>
                    </div>

                    {!isSupported && (
                      <p className="text-xs text-[#94a3b8] mt-3">
                        Your browser does not support Speech Recognition — type below instead.
                      </p>
                    )}

                    <div className="mt-4">
                      <label className="block text-xs text-[#94a3b8] mb-2">Your message</label>
                      <textarea
                        value={inputText}
                        onChange={(e) => {
                          setInputText(e.target.value);
                          setInputText(e.target.value);
                        }}
                        className="w-full min-h-28 rounded-2xl bg-white/5 border border-blue-200/15 outline-none text-[#e2e8f0] p-4"
                        placeholder="Say something or type..."
                        disabled={isGenerating}
                      />
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          className="mt-4 rounded-2xl bg-red-500/10 border border-red-400/25 px-4 py-3 text-sm text-red-200"
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="mt-5">
                      <label className="block text-xs text-[#94a3b8] mb-2">Assistant reply</label>
                      <div className="rounded-2xl bg-white/5 border border-blue-200/15 px-4 py-3 text-sm text-[#e2e8f0] min-h-20 whitespace-pre-wrap">
                        {assistantText || (isGenerating ? "Generating..." : "(reply will appear here)" )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <div className="text-xs text-[#94a3b8]">
                        {audioUrl ? "Audio ready" : "TTS audio will be prepared after generation."}
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handlePlayPause}
                        disabled={!audioUrl}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border transition-all ${
                          !audioUrl
                            ? "bg-white/5 text-gray-500 cursor-not-allowed border-white/10"
                            : "bg-[#7c3aed]/55 text-white border-[#a78bfa]/40 hover:bg-[#7c3aed]/70"
                        }`}
                        aria-label={audioStatus === "playing" ? "Pause" : "Play"}
                      >
                        {audioStatus === "playing" ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        <span className="font-semibold">{audioStatus === "playing" ? "Pause" : "Play"}</span>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
