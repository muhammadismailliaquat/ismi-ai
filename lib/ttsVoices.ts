// Available Microsoft Edge neural voices for the voice call (via /api/tts).

export interface TtsVoice {
  value: string;
  label: string;
  gender: 'male' | 'female';
}

export const EDGE_VOICES: TtsVoice[] = [
  { value: 'en-US-AndrewNeural', label: 'US English — Male', gender: 'male' },
  { value: 'en-US-JennyNeural', label: 'US English — Female', gender: 'female' },
];

export const DEFAULT_TTS_VOICE = 'en-US-AndrewNeural';

// Voice is stored inside the existing ismi_settings localStorage blob
// (alongside voiceRate / voicePitch / language).
export function readTtsVoice(): string {
  if (typeof window === 'undefined') return DEFAULT_TTS_VOICE;
  try {
    const raw = localStorage.getItem('ismi_settings');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.ttsVoice === 'string' && parsed.ttsVoice.trim()) {
      // Migrate old / removed voices to default
      const removedVoices = ['en-IN-PrabhatNeural', 'en-IN-NeerjaNeural', 'hi-IN-MadhurNeural', 'hi-IN-SwaraNeural', 'ur-PK-AsadNeural', 'ur-PK-UzmaNeural'];
      if (removedVoices.includes(parsed.ttsVoice)) {
        parsed.ttsVoice = DEFAULT_TTS_VOICE;
        localStorage.setItem('ismi_settings', JSON.stringify(parsed));
      }
      return parsed.ttsVoice;
    }
  } catch {}
  return DEFAULT_TTS_VOICE;
}

export function saveTtsVoice(voice: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('ismi_settings');
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.ttsVoice = voice;
    localStorage.setItem('ismi_settings', JSON.stringify(parsed));
  } catch {}
}