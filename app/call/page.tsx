'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, MicOff, PhoneOff, StopCircle } from 'lucide-react';
import { motion } from 'framer-motion';

import { ParticleBackground } from '@/components/ParticleBackground';
import { useSpeechRecognition } from '@/lib/speech';
import { readTtsVoice } from '@/lib/ttsVoices';

import { ChatConversation, ChatMessage } from '@/types/chat';
import { storage } from '@/lib/storage';

type ChatStreamResult = { ok: true; text: string } | Response;

type Phase = 'precall' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error';

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default function CallPage() {
  const router = useRouter();

  const [youTranscript, setYouTranscript] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Single source of truth for call controls.
  const [phase, setPhase] = useState<Phase>('precall');
  const phaseRef = useRef<Phase>('precall');

  // Avoid stale scheduled restarts.
  const restartSeqRef = useRef(0);
  const restartSilenceCountRef = useRef(0);

  const transitionTo = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);

    // Any phase change cancels previous scheduled work logically.
    restartSeqRef.current += 1;

    if (next === 'listening') {
      restartSilenceCountRef.current = 0;
    }
  }, []);

  const isListeningLocal = phase === 'listening';
  const isGenerating = phase === 'thinking';
  const callActive = phase !== 'precall';
  const audioStatus: 'idle' | 'playing' = phase === 'speaking' ? 'playing' : 'idle';

  // Strip markdown formatting from AI response text.
  const stripMarkdown = useCallback((text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // bold
      .replace(/\*(.*?)\*/g, '$1') // italic
      .replace(/^#+\s*/gm, '') // headings
      .replace(/^>\s*/gm, '') // blockquotes
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
      .replace(/^\s*[-*+]\s+/gm, '') // list items
      .replace(/^\s*\d+\.\s+/gm, '') // numbered lists
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links
      .replace(/\n{3,}/g, '\n\n') // extra newlines
      .trim();
  }, []);

  const currentCallConversationIdRef = useRef<string | null>(null);
  const currentCallConversationRef = useRef<ChatConversation | null>(null);

  const ensureCallConversation = useCallback(async () => {
    // Create ONE conversation for the entire active voice call session.
    if (currentCallConversationIdRef.current) {
      if (!currentCallConversationRef.current) {
        const existing = await storage.getConversation(
          currentCallConversationIdRef.current
        );
        currentCallConversationRef.current = existing;
      }
      storage.setCurrentChatId(currentCallConversationIdRef.current);
      return;
    }

    const convo = storage.createConversation('Voice Call Conversation');
    currentCallConversationIdRef.current = convo.id;
    currentCallConversationRef.current = convo;

    // Persist immediately so /chat sidebar can show it.
    await storage.saveConversation(convo);

    // Make this the current sidebar conversation when the user returns to /chat.
    storage.setCurrentChatId(convo.id);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  const stopTts = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;

    // Keep UI updates driven by phase; just stop audio here.
    try {
      audioRef.current?.pause();
      audioRef.current && (audioRef.current.currentTime = 0);
    } catch {}

    // Revoke any previous blob URL to avoid memory leaks.
    try {
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }
    } catch {}
  }, []);

  const voiceRate = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const raw = localStorage.getItem('ismi_settings');
      if (!raw) return 1;
      const parsed = JSON.parse(raw);
      const v = parsed?.voiceRate;
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    } catch {}
    return 1;
  }, []);

  const voicePitch = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const raw = localStorage.getItem('ismi_settings');
      if (!raw) return 1;
      const parsed = JSON.parse(raw);
      const v = parsed?.voicePitch;
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    } catch {}
    return 1;
  }, []);

  const startListeningFnRef = useRef<null | (() => void)>(null);

  const startListeningFromPhase = useCallback(() => {
    // Only start when we are truly in listening phase.
    if (phaseRef.current !== 'listening') return;
    startListeningFnRef.current?.();
  }, []);

  const scheduleSilenceRestart = useCallback(
    (delayMs: number = 200) => {
      const seq = ++restartSeqRef.current;
      const attempt = () => {
        if (restartSeqRef.current !== seq) return;
        if (phaseRef.current !== 'listening') return;

        restartSilenceCountRef.current += 1;
        if (restartSilenceCountRef.current > 6) {
          // Give up and wait for user.
          transitionTo('ready');
          return;
        }

        startListeningFromPhase();
      };

      window.setTimeout(attempt, delayMs);
    },
    [startListeningFromPhase, transitionTo]
  );

  const { startListening, stopListening, isSupported } = useSpeechRecognition({
    onResult: (finalTranscript) => {
      const cleaned = (finalTranscript || '').trim();

      // Recognition produced final transcript -> move to thinking.
      if (!cleaned) {
        // Stay in call but stop mic until user asks again.
        transitionTo('ready');
        return;
      }

      setError(null);
      setYouTranscript(cleaned);
      transitionTo('thinking');
      generateFromTranscript(cleaned);
    },
    onInterimResult: (transcript) => {
      if (phaseRef.current !== 'listening') return;
      setError(null);
      setYouTranscript((transcript || '').trim());
    },
    onError: (msg) => {
      if (msg === 'no-speech') {
        if (phaseRef.current === 'listening') {
          scheduleSilenceRestart(200);
        }
        return;
      }

      setError(msg || 'Voice input failed');
      transitionTo('error');
    },
    onEnd: () => {
      // Web Speech API often stops on silence.
      if (phaseRef.current === 'listening') {
        scheduleSilenceRestart(200);
        return;
      }

      // If we ended while not listening, ignore.
    },
    continuous: false,
    language: 'en-US',
  });

  const parseChatStream = useCallback(async (response: Response): Promise<ChatStreamResult> => {
    if (!response.ok) {
      if (response.status === 401) return jsonError('Unauthorized', 401);
      try {
        const err = await response.json();
        return jsonError(String(err?.error || 'Chat failed'), response.status);
      } catch {
        return jsonError(`Chat failed (${response.status})`, response.status);
      }
    }

    const reader = response.body?.getReader();
    if (!reader) return jsonError('Missing response body', 500);

    const decoder = new TextDecoder();
    let buffer = '';
    let assistant = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            return { ok: true as const, text: assistant };
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed?.error) {
              return jsonError(String(parsed.error), 500);
            }
            if (typeof parsed?.text === 'string') {
              assistant += parsed.text;
              setAssistantText(stripMarkdown(assistant));
            }
          } catch {
            // Ignore non-JSON chunks.
          }
        }
      }
    }

    return { ok: true as const, text: assistant };
  }, [stripMarkdown]);

  const fetchTtsAndPrepareAudio = useCallback(
    async (text: string) => {
      // Do not let speech recognition restart while we speak.
      stopListening();
      stopTts();

      const qs = new URLSearchParams({
        text: text.slice(0, 980),
        voice: readTtsVoice(),
        rate: String(voiceRate),
      });

      // Connect existing voicePitch setting to TTS API.
      // Map slider value (0.5–2) to SSML relative pitch percentage.
      const pitchDelta = voicePitch - 1;
      if (Math.abs(pitchDelta) > 1e-6) {
        const rel = Math.round(pitchDelta * 100);
        qs.set('pitch', `${rel >= 0 ? '+' : ''}${rel}%`);
      }

      ttsAbortRef.current?.abort();
      ttsAbortRef.current = new AbortController();

      const res = await fetch(`/api/tts?${qs.toString()}`, {
        signal: ttsAbortRef.current.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(`TTS failed (${res.status})`);
      }

      const blob = await res.blob();

      // Revoke previous blob URL (if any) before replacing it.
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

        audioRef.current.onplaying = () => {
          transitionTo('speaking');
        };

        // After playback finishes: back to listening.
        audioRef.current.onended = () => {
          try {
            if (audioObjectUrlRef.current) {
              URL.revokeObjectURL(audioObjectUrlRef.current);
              audioObjectUrlRef.current = null;
            }
          } catch {}

          transitionTo('listening');
          startListeningFromPhase();
        };

        audioRef.current.onerror = () => {
          try {
            if (audioObjectUrlRef.current) {
              URL.revokeObjectURL(audioObjectUrlRef.current);
              audioObjectUrlRef.current = null;
            }
          } catch {}

          transitionTo('ready');
        };

        transitionTo('thinking');
        await audioRef.current.play();
      } catch {
        transitionTo(phaseRef.current === 'thinking' ? 'ready' : phaseRef.current);
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
    [router, stopListening, stopTts, startListeningFromPhase, transitionTo, voiceRate]
  );

  const generateFromTranscript = useCallback(
    async (finalTranscript: string) => {
      const cleaned = (finalTranscript || '').trim();
      if (!cleaned) return;

      stopTts();
      setError(null);
      setAssistantText('');

      chatAbortRef.current?.abort();
      chatAbortRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: cleaned }],
          }),
          signal: chatAbortRef.current.signal,
        });

        const parsed = await parseChatStream(response);
        if (parsed instanceof Response) {
          if (parsed.status === 401) {
            router.push('/login');
            return;
          }
          const err = await parsed.json().catch(() => null);
          throw new Error((err as { error?: string })?.error || 'Chat failed');
        }

        const assistantContent = parsed.text || '';

        const userMessage: ChatMessage = {
          id: storage.generateId(),
          role: 'user',
          content: cleaned,
          timestamp: new Date().toISOString(),
        };

        const assistantMessage: ChatMessage = {
          id: storage.generateId(),
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date().toISOString(),
        };

        // IMPORTANT: One active voice call session = ONE conversation.
        try {
          await ensureCallConversation();
          const convo = currentCallConversationRef.current;

          if (convo) {
            convo.messages.push(userMessage, assistantMessage);
            convo.updatedAt = new Date().toISOString();
            await storage.saveConversation(convo);
          }
        } catch {}

        if (assistantContent.trim()) {
          // Keep listening blocked until audio finishes.
          await fetchTtsAndPrepareAudio(stripMarkdown(assistantContent));
          return;
        }

        // No audio -> wait for user.
        transitionTo('ready');
      } catch (e: unknown) {
        if ((e as Error)?.name === 'AbortError') return;
        setError((e as Error)?.message || 'Failed to generate voice response');
        transitionTo('error');
      }
    },
    [
      fetchTtsAndPrepareAudio,
      ensureCallConversation,
      parseChatStream,
      router,
      stopTts,
      stripMarkdown,
      transitionTo,
    ]
  );

  const startListeningSafe = useCallback(() => {
    if (!isSupported) {
      setError('Voice recognition is not supported in this browser.');
      transitionTo('error');
      return;
    }

    setError(null);
    setAssistantText('');
    setYouTranscript('');

    transitionTo('listening');

    // Start now.
    startListening();
  }, [isSupported, startListening, transitionTo]);

  const stopListeningSafe = useCallback(() => {
    stopListening();
    transitionTo('ready');
  }, [stopListening, transitionTo]);

  const handleMic = useCallback(() => {
    // Speaking -> Stop AI and resume listening.
    if (audioStatus === 'playing') {
      stopTts();
      setError(null);
      setAssistantText('');
      setYouTranscript('');

      stopListening();
      transitionTo('listening');
      startListening();
      return;
    }

    // While thinking, ignore mic presses.
    if (phaseRef.current === 'thinking') return;

    // Listening -> Mic off.
    if (phaseRef.current === 'listening') {
      stopListeningSafe();
      return;
    }

    // Ready/Error/Precall -> Mic on.
    startListeningSafe();
  }, [
    audioStatus,
    startListening,
    startListeningSafe,
    stopListening,
    stopListeningSafe,
    stopTts,
    transitionTo,
  ]);

  const handleBackToChat = useCallback(() => {
    transitionTo('precall');
    chatAbortRef.current?.abort();
    ttsAbortRef.current?.abort();

    currentCallConversationIdRef.current = null;
    currentCallConversationRef.current = null;

    try {
      stopListening();
    } catch {}

    stopTts();
    router.push('/chat');
  }, [router, stopListening, stopTts, transitionTo]);

  const handleEndCall = useCallback(() => {
    handleBackToChat();
  }, [handleBackToChat]);

  useEffect(() => {
    // Cleanup when leaving the page.
    return () => {
      chatAbortRef.current?.abort();
      ttsAbortRef.current?.abort();
      try {
        stopListening();
      } catch {}
      stopTts();
    };
  }, [stopListening, stopTts]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ParticleBackground variant="bloom" />

      {/* Persistent status box at top */}
      <div className="absolute top-[120px] left-1/2 -translate-x-1/2 z-20 inline-flex w-auto max-w-2xl px-4 flex-col">
        <div className="rounded-2xl backdrop-blur-xl bg-blue-500/20 border border-blue-200/25 shadow-[0_10px_40px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col">

          {/* Main status label */}
          <div className="px-4 py-2 text-center text-sm font-medium text-white/90 border-b border-white/10">
            {error
              ? 'Error'
              : isListeningLocal
                ? 'Listening'
                : isGenerating
                  ? 'Thinking'
                  : audioStatus === 'playing'
                    ? 'Speaking'
                    : 'Tap mic to start'}
          </div>

          {/* Inner transcript box — shows user speech while speaking */}
          {isListeningLocal && youTranscript.trim().length > 0 ? (
            <div className="px-3 py-2">
              <div className="rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 min-h-[40px] max-h-[100px] overflow-y-auto">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-white/80 shrink-0">You:</span>
                  <span className="text-xs text-white/90 whitespace-pre-wrap break-words">{youTranscript}</span>
                </div>
              </div>
            </div>
          ) : null}

          {audioStatus === 'playing' && assistantText.trim().length > 0 ? (
            <div className="px-3 py-2">
              <div className="rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 min-h-[40px] max-h-[100px] overflow-y-auto">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-white/80 shrink-0">Ismi:</span>
                  <span className="text-xs text-white/90 whitespace-pre-wrap break-words leading-relaxed">{assistantText}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Error display */}
      {error ? (
        <div className="absolute top-[340px] left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4">
          <div className="rounded-xl bg-red-500/20 border border-red-400/30 px-4 py-2 text-sm text-red-200 text-center">
            {error}
          </div>
        </div>
      ) : null}

      {/* Main content area */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-[240px] pb-[160px]">
      </div>

      {/* Controls */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[80px] z-30 flex items-center justify-center gap-4">
        {callActive ? (
          <>
            {/* Mic ON/OFF */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleMic}
              disabled={isGenerating || audioStatus === 'playing'}

              className={`flex items-center justify-center w-16 h-16 rounded-full border-2 transition-all ${
                isListeningLocal
                  ? 'bg-blue-500/15 border-blue-200/25 text-white'
                  : 'bg-blue-500/15 border-blue-200/25 text-white hover:bg-blue-500/25'
              } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label={isListeningLocal ? 'Mic on' : 'Mic off'}
            >
              {isListeningLocal ? (
                <Mic className="w-6 h-6 text-white" />
              ) : (
                <MicOff className="w-6 h-6 text-white opacity-80" />
              )}
            </motion.button>

            {/* Stop AI (only while speaking) */}
            {audioStatus === 'playing' ? (
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleMic}
                className="flex items-center justify-center w-16 h-16 rounded-full border-2 transition-all bg-red-500/30 border-red-400/50 text-white"
                aria-label="Stop AI"
              >
                <StopCircle className="w-6 h-6" />
              </motion.button>
            ) : null}

            {/* End call */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleEndCall}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/30 border border-red-400/50 text-white hover:bg-red-500/40 transition-all"
              aria-label="End call"
            >
              <PhoneOff className="w-6 h-6" />
            </motion.button>
          </>
        ) : (
          /* Initial state: single mic button */
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.98 }}
            onClick={startListeningSafe}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/15 border border-blue-200/25 backdrop-blur-xl text-white hover:bg-blue-500/25 transition-all"
            aria-label="Start voice call"
          >
            <Mic className="w-6 h-6 text-white" />
          </motion.button>
        )}
      </div>
    </div>
  );
}
