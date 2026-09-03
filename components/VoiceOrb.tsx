'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface VoiceOrbProps {
  audioLevel: number; // 0-1, represents voice volume
  state: 'idle' | 'listening' | 'speaking' | 'thinking';
}

function Orb({ audioLevel, state }: VoiceOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetScale = useRef(1);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // Determine target scale based on audio level
    if (state === 'listening' || state === 'speaking') {
      targetScale.current = 1 + audioLevel * 0.35;
    } else if (state === 'thinking') {
      targetScale.current = 1.05;
    } else {
      targetScale.current = 1;
    }

    // Smooth scale transition
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale.current, targetScale.current, targetScale.current),
      delta * 3
    );

    // Subtle rotation
    const rotationSpeed = state === 'idle' ? 0.0005 : 0.002;
    meshRef.current.rotation.x += rotationSpeed;
    meshRef.current.rotation.y += rotationSpeed * 1.2;
  });

  // Animation speeds based on state
  const distort = useMemo(() => {
    if (state === 'idle') return 0.08;
    if (state === 'thinking') return 0.12;
    if (audioLevel > 0.3) return 0.25;
    return 0.15;
  }, [state, audioLevel]);

  const speed = useMemo(() => {
    if (state === 'idle') return 0.2;
    if (state === 'thinking') return 0.6;
    if (audioLevel > 0.3) return 1.5;
    return 0.8;
  }, [state, audioLevel]);

  return (
    <Sphere ref={meshRef} args={[1, 64, 64]}>
      <MeshDistortMaterial
        color="#a78bfa"
        attach="material"
        distort={distort}
        speed={speed}
        roughness={0.4}
        metalness={0.05}
        transparent
        opacity={0.88}
      />
    </Sphere>
  );
}

function GlowEffect({ audioLevel, state }: { audioLevel: number; state: VoiceOrbProps['state'] }) {
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!glowRef.current) return;

    glowRef.current.rotation.x -= 0.0003;
    glowRef.current.rotation.y -= 0.0005;

    const scale = 1.25 + (audioLevel * 0.15);
    glowRef.current.scale.lerp(
      new THREE.Vector3(scale, scale, scale),
      0.08
    );
  });

  return (
    <Sphere ref={glowRef} args={[1.12, 32, 32]}>
      <meshBasicMaterial
        color="#a78bfa"
        transparent
        opacity={state === 'idle' ? 0.015 : 0.035}
        depthWrite={false}
      />
    </Sphere>
  );
}

export function VoiceOrb({ audioLevel, state }: VoiceOrbProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 5]} intensity={0.7} />
        <pointLight position={[-10, -10, -5]} intensity={0.3} color="#c4b5fd" />
        <pointLight position={[10, -10, 5]} intensity={0.3} color="#6ee7b7" />
        <Orb audioLevel={audioLevel} state={state} />
        <GlowEffect audioLevel={audioLevel} state={state} />
      </Canvas>
    </div>
  );
}
