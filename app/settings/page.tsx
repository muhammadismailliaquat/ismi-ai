'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Volume2 } from 'lucide-react';
import { EDGE_VOICES, DEFAULT_TTS_VOICE } from '@/lib/ttsVoices';
import { ParticleBackground } from '@/components/ParticleBackground';
import { signOut } from 'next-auth/react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    voiceRate: 1,
    voicePitch: 1,
    ttsVoice: DEFAULT_TTS_VOICE,
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('ismi_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({
          ...prev,
          voiceRate: typeof parsed?.voiceRate === 'number' ? parsed.voiceRate : prev.voiceRate,
          voicePitch: typeof parsed?.voicePitch === 'number' ? parsed.voicePitch : prev.voicePitch,
          ttsVoice: typeof parsed?.ttsVoice === 'string' ? parsed.ttsVoice : prev.ttsVoice,
        }));
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  const updateSettings = (key: 'voiceRate' | 'voicePitch' | 'ttsVoice', value: string | number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('ismi_settings', JSON.stringify(newSettings));
  };

  return (
    <div className="relative h-screen flex flex-col overflow-hidden bg-[#0f172a]">
      <ParticleBackground variant="neural" />

      <div className="relative z-10 flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link href="/chat">
              <motion.button
                whileHover={{ x: -5 }}
                className="flex items-center gap-2 text-[#94a3b8] mb-4 hover:text-[#a78bfa] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Chat
              </motion.button>
            </Link>

            <h1 className="text-4xl font-bold text-[#a78bfa]">Settings</h1>
            <p className="text-[#94a3b8] mt-2">Customize your Ismi.ai experience</p>
          </motion.div>

          <div className="space-y-6">
            {/* Voice Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl p-6 border border-[#a78bfa]/30 bg-[#7c3aed]/15 backdrop-blur-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center gap-3 mb-6">
                <Volume2 className="w-6 h-6 text-[#a78bfa]" />
                <h2 className="text-xl font-semibold text-[#e5e5f0]">Voice</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-[#94a3b8]">
                    Assistant Voice
                  </label>
                  <select
                    value={settings.ttsVoice}
                    onChange={(e) => updateSettings('ttsVoice', e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#1f2937] border border-[#a78bfa]/30 outline-none text-white [&>option]:bg-[#1f2937] [&>option]:text-white"
                  >
                    {EDGE_VOICES.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-[#94a3b8]">
                    Speech Rate: {settings.voiceRate.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.voiceRate}
                    onChange={(e) => updateSettings('voiceRate', parseFloat(e.target.value))}
                    className="w-full accent-[#7c3aed]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-[#94a3b8]">
                    Pitch: {settings.voicePitch.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.voicePitch}
                    onChange={(e) => updateSettings('voicePitch', parseFloat(e.target.value))}
                    className="w-full accent-[#7c3aed]"
                  />
                </div>
              </div>
            </motion.div>

            {/* Logout */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl p-6 border border-red-400/30 bg-red-500/10 backdrop-blur-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            >
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/15 border border-red-400/30 text-red-200 font-semibold hover:bg-red-500/25 transition-colors"
              >
                Log out
              </button>
            </motion.div>

            {/* About */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl p-6 text-center border border-[#a78bfa]/30 bg-[#7c3aed]/15 backdrop-blur-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            >
              <h2 className="text-2xl font-bold text-[#a78bfa] mb-2">Ismi.ai</h2>
              <p className="text-[#94a3b8] text-sm">Version 1.0.0</p>
              <p className="text-[#94a3b8] text-xs mt-2">Made with Ismi.ai</p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
