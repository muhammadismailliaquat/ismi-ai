'use client';

import { useRef, useEffect, useCallback } from 'react';

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInterface extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInterface;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseSpeechRecognitionProps {
  onResult?: (transcript: string) => void;
  onInterimResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  continuous?: boolean;
  language?: string;
}

export function useSpeechRecognition({
  onResult,
  onInterimResult,
  onError,
  onEnd,
  continuous = false,
  language = 'en-US',
}: UseSpeechRecognitionProps = {}) {
  const recognitionRef = useRef<SpeechRecognitionInterface | null>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        recognitionRef.current = new SpeechRecognitionAPI();
        recognitionRef.current.continuous = continuous;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = language;

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const results = Array.from(event.results);
          const transcript = results.map((result) => result[0].transcript).join('');
          const last = event.results[event.results.length - 1];

          if (last?.isFinal) {
            onResult?.(transcript);
          } else {
            onInterimResult?.(transcript);
          }
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          onError?.(event.error);
          isListeningRef.current = false;
        };

        recognitionRef.current.onend = () => {
          isListeningRef.current = false;
          onEnd?.();
        };
      }
    }

    return () => {
      if (recognitionRef.current && isListeningRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [continuous, language, onResult, onError, onEnd]);

  const startListening = useCallback((): boolean => {
    if (recognitionRef.current && !isListeningRef.current) {
      try {
        recognitionRef.current.start();
        isListeningRef.current = true;
        return true;
      } catch (error) {
        console.error('Speech recognition error:', error);
        isListeningRef.current = false;
        return false;
      }
    }
    return false;
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      isListeningRef.current = false;
    }
  }, []);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return {
    startListening,
    stopListening,
    isSupported,
  };
}

// Speech Synthesis Hook
interface UseSpeechSynthesisProps {
  rate?: number;
  pitch?: number;
  language?: string;
  onEnd?: () => void;
}

export function useSpeechSynthesis({
  rate = 1,
  pitch = 1,
  language = 'en-US',
  onEnd,
}: UseSpeechSynthesisProps = {}) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      utteranceRef.current = new SpeechSynthesisUtterance(text);
      utteranceRef.current.rate = rate;
      utteranceRef.current.pitch = pitch;
      utteranceRef.current.lang = language;

      utteranceRef.current.onend = () => {
        onEnd?.();
      };

      window.speechSynthesis.speak(utteranceRef.current);
    }
  }, [rate, pitch, language, onEnd]);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return {
    speak,
    stop,
    isSupported,
  };
}
