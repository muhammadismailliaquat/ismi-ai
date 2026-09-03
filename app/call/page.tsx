'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mic, MicOff, PhoneOff, MessageSquare, Loader2, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@/types/chat';
import { storage } from '@/lib/storage';
import { useSpeechRecognition } from '@/lib/speech';
import { readTtsVoice } from '@/lib/ttsVoices';
import { VoiceOrb } from '@/components/VoiceOrb';

type ChatStreamResult = { ok: true; text: string } | Response;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Jellyfish particle background
function JellyfishBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Array<{
      x: number; y: number; vx: number; vy: number;
      size: number; alpha: number; color: string;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#a78bfa', '#60a5fa', '#7c3aed', '#06b6d4', '#8b5cf6'];

    const initParticles = () => {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 15000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -Math.random() * 0.8 - 0.2,
          size: Math.random() * 4 + 1,
          alpha: Math.random() * 0.5 + 0.1,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };
    initParticles();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += (Math.random() - 0.5) * 0.02;
        p.alpha = Math.max(0.05, Math.min(0.6, p.alpha));

        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        // Glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = p.alpha * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 50%, #0f172a 100%)' }}
    />
  );
}

export default function CallPage() {
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [assistantText, setAssistantText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ttsVoice = useMemo(() => readTtsVoice(), []);

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

  const stopAudio = useCallback(() => {
    try {
      if (audioRef.current) audioRef.current.pause();
    } catch {}
    setAudioStatus('idle');
  }, []);

  const revokeAudioUrl = useCallback((url: string | null) => {
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch {}
  }, []);

  const handleSpeechResult = useCallback((finalTranscript: string) => {
    const cleaned = (finalTranscript || '').trim();
    setInputText(cleaned);
    setIsListening(false);
  }, []);

  const handleSpeechError = useCallback((msg: string) => {
    setError(msg || 'Voice input failed');
    setIsListening(false);
  }, []);

  const { startListening, stopListening, isSupported } = useSpeechRecognition({
    onResult: handleSpeechResult,
    onError: handleSpeechError,
    continuous: false,
    language: 'en-US',
  });

  const toggleListening = useCallback(() => {
    setError(null);
    if (isListening) {
      stopListening();
      setIsListening(false);
    } else {
      setInputText('');
      setAssistantText('');
      revokeAudioUrl(audioUrl);
      setAudioUrl(null);
      stopAudio();
      if (!isSupported) {
        setError('Voice recognition not supported');
        return;
      }
      setIsListening(true);
      startListening();
    }
  }, [isListening, isSupported, startListening, stopListening, audioUrl, revokeAudioUrl, stopAudio]);

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
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return { ok: true, text: assistant };

          try {
            const parsed = JSON.parse(data);
            if (parsed?.error) return jsonError(String(parsed.error), 500);
            if (typeof parsed?.text === 'string') assistant += parsed.text;
          } catch {}
        }
      }
    }
    return { ok: true, text: assistant };
  }, []);

  const fetchTtsAndPlay = useCallback(async (text: string) => {
    stopAudio();
    revokeAudioUrl(audioUrl);
    setAudioUrl(null);
    setAudioStatus('idle');

    const qs = new URLSearchParams({
      text: text.slice(0, 980),
      voice: ttsVoice,
      rate: String(voiceRate),
    });

    const res = await fetch(`/api/tts?${qs.toString()}`, { signal: abortRef.current?.signal });

    if (!res.ok) {
      if (res.status === 401) { router.push('/login'); return; }
      throw new Error(`TTS failed (${res.status})`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);

    try {
      if (!audioRef.current) audioRef.current = new Audio();
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        setAudioStatus('playing');
      }
    } catch {
      setAudioStatus('paused');
    }
  }, [ttsVoice, voiceRate, audioUrl, revokeAudioUrl, stopAudio, router]);

  const handleGenerate = useCallback(async () => {
    const text = inputText.trim();
    if (!text) {
      setError('Say something first or type your message.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    setAssistantText('');

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
        signal: abortRef.current.signal,
      });

      const parsed = await parseChatStream(response);
      if (parsed instanceof Response) {
        if (parsed.status === 401) { router.push('/login'); return; }
        const errJson = await parsed.json().catch(() => null);
        throw new Error((errJson as { error?: string })?.error || 'Chat failed');
      }

      const content = parsed.text || '';
      setAssistantText(content);

      if (content.trim()) {
        await fetchTtsAndPlay(content);
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setError((e as Error)?.message || 'Failed to generate response');
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, parseChatStream, fetchTtsAndPlay, router]);

  const togglePlayPause = useCallback(async () => {
    if (!audioRef.current && audioUrl) {
      audioRef.current = new Audio(audioUrl);
    }
    if (!audioRef.current) return;

    if (audioStatus === 'playing') {
      audioRef.current.pause();
      setAudioStatus('paused');
    } else {
      try {
        await audioRef.current.play();
        setAudioStatus('playing');
      } catch {
        setAudioStatus('paused');
      }
    }
  }, [audioStatus, audioUrl]);

  const handleEndCall = useCallback(() => {
    abortRef.current?.abort();
    stopListening();
    stopAudio();
    revokeAudioUrl(audioUrl);
    router.push('/chat');
  }, [stopListening, stopAudio, revokeAudioUrl, audioUrl, router]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <JellyfishBackground />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <Link
          href="/chat"
          className="flex items-center gap-2 text-[#94a3b8] hover:text-white transition-colors"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-sm">Back to Chat</span>
        </Link>
        <h1 className="text-lg font-semibold text-white">Voice Call</h1>
        <div className="w-24" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4">
        {/* Voice Orb */}
        <motion.div
          className="w-56 h-56 rounded-full mb-8"
          animate={{ scale: isListening ? 1.05 : 1 }}
          transition={{ duration: 0.3 }}
        >
          <VoiceOrb
            audioLevel={isListening ? 0.9 : 0.2}
            state={isGenerating ? 'thinking' : isListening ? 'listening' : 'idle'}
          />
        </motion.div>

        {/* Status */}
        <p className="text-[#94a3b8] text-sm mb-8 text-center">
          {isListening
            ? 'Listening...'
            : isGenerating
            ? 'Thinking...'
            : audioStatus === 'playing'
            ? 'Speaking...'
            : 'Tap mic to start'}
        </p>

        {/* Your message */}
        {inputText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 max-w-md w-full"
          >
            <p className="text-xs text-[#64748b] mb-1">You:</p>
            <div className="rounded-xl bg-white/5 border border-blue-200/15 px-4 py-3 text-[#e2e8f0] text-sm">
              {inputText}
            </div>
          </motion.div>
        )}

        {/* Assistant reply */}
        {assistantText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 max-w-md w-full"
          >
            <p className="text-xs text-[#64748b] mb-1">Ismi:</p>
            <div className="rounded-xl bg-[#7c3aed]/10 border border-[#a78bfa]/20 px-4 py-3 text-[#e2e8f0] text-sm">
              {assistantText}
            </div>
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 max-w-md w-full rounded-xl bg-red-500/10 border border-red-400/25 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Mic button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleListening}
            disabled={isGenerating}
            className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${
              isListening
                ? 'bg-red-500/20 border-red-400 text-red-300'
                : 'bg-white/10 border-white/30 text-white hover:bg-white/20'
            }`}
          >
            {isListening ? (
              <MicOff className="w-7 h-7" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </motion.button>

          {/* Generate/Send button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleGenerate}
            disabled={isGenerating || !inputText.trim()}
            className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${
              isGenerating || !inputText.trim()
                ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                : 'bg-[#7c3aed]/30 border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#7c3aed]/50'
            }`}
          >
            {isGenerating ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              <Play className="w-7 h-7" />
            )}
          </motion.button>

          {/* Play/Pause audio */}
          {audioUrl && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={togglePlayPause}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 border border-white/30 text-white hover:bg-white/20 transition-all"
            >
              {audioStatus === 'playing' ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6" />
              )}
            </motion.button>
          )}

          {/* End call */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleEndCall}
            className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30 transition-all"
          >
            <PhoneOff className="w-6 h-6" />
          </motion.button>
        </div>

        {/* Voice not supported hint */}
        {!isSupported && (
          <p className="mt-4 text-xs text-[#64748b]">
            Voice input not supported — type below instead
          </p>
        )}

        {/* Text input fallback */}
        <div className="mt-6 max-w-md w-full">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Or type your message..."
            disabled={isGenerating}
            className="w-full rounded-xl bg-white/5 border border-blue-200/15 outline-none text-[#e2e8f0] p-4 text-sm placeholder:text-[#64748b] resize-none"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
