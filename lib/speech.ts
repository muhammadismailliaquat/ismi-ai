'use client';

import { useRef, useEffect, useCallback } from 'react';

interface UseSpeechRecognitionProps {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  continuous?: boolean;
  language?: string;
}

export function useSpeechRecognition({
  onResult,
  onError,
  onEnd,
  continuous = false,
  language = 'en-US',
}: UseSpeechRecognitionProps = {}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = continuous;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = language;

        recognitionRef.current.onresult = (event) => {
          const results = Array.from(event.results);
          const transcript = results
            .map(result => result[0].transcript)
            .join('');

          if (event.results[event.results.length - 1].isFinal) {
            onResult?.(transcript);
          }
        };

        recognitionRef.current.onerror = (event) => {
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

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListeningRef.current) {
      try {
        recognitionRef.current.start();
        isListeningRef.current = true;
      } catch (error) {
        console.error('Speech recognition error:', error);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
      isListeningRef.current = false;
    }
  }, []);

  const isSupported = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return {
    startListening,
    stopListening,
    isListening: isListeningRef.current,
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
