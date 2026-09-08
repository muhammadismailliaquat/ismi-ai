'use client';

// Particle background for ismi.ai — THREE.js instanced mesh + bloom.
// pointer-events-none so it never blocks UI clicks.

import { useEffect, useRef, memo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type ParticleVariant = 'galaxy' | 'bloom' | 'fabric' | 'dna' | 'neural';

// ---- Global quality flag — set by chat page when AI is streaming ----
let forceLowFPS = false;
export function setParticleStreaming(streaming: boolean) {
  forceLowFPS = streaming;
}

// ---- CONFIG ----
const BLOOM_STRENGTH = 1.2;
const FOG_COLOR = 0x05050d;

const BLOOM_VERT = `
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const BLOOM_FRAG = `
  varying vec2 vUv;
  varying vec3 vColor;
  uniform float uTime;
  float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 ip = floor(p); vec2 u = fract(p); u = u*u*(3.0-2.0*u);
    float res = mix(mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
                    mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
    return res * res;
  }
  void main() {
    float dist = distance(vUv, vec2(0.5));
    float n = noise(vUv * 5.0 + uTime * 0.5);
    float alpha = (1.0 - smoothstep(0.2, 0.5, dist)) * (0.5 + 0.5 * n);
    if (alpha < 0.1) discard;
    gl_FragColor = vec4(vColor + 0.2, alpha * 0.8);
  }
`;

// Count per variant
const COUNTS: Record<ParticleVariant, number> = {
  dna: 6000,
  galaxy: 8000,
  bloom: 20000, // user-provided swarm bloom
  fabric: 6000,
  neural: 6000,
};

export const ParticleBackground = memo(function ParticleBackground({ variant = 'galaxy' }: { variant?: ParticleVariant }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const el: HTMLDivElement = mount;

    const isBloom = variant === 'bloom';
    const isFabric = variant === 'fabric';
    const isDna = variant === 'dna';
    const isNeural = variant === 'neural';
    const count = COUNTS[variant];
    // Slow down DNA/chat particles a bit so it doesn't feel fast on small screens.
    // (Call page uses variant="bloom" so it stays unchanged.)
    const speedMult = isFabric ? 0.4 : isDna ? 0.65 : 1;
    const fogColor = isDna || isNeural ? 0x000000 : isFabric ? 0x0f172a : FOG_COLOR;

    const getViewportSize = () => {
      // Use visualViewport when available (mobile browser address bar changes size).
      const vv = window.visualViewport;
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      return { w, h };
    };

    const { w, h } = getViewportSize();

    const computeViewScale = (width: number) => {
      // On very narrow phones we want the orb/particle field to “fit” like the call page.
      // This avoids sparse right-side coverage.
      // Width-based scale tuned so the dna field looks denser-but-smaller
      // on ~300px phones (matches the “call page” look expectation).
      return Math.min(1, Math.max(0.25, width / 720));
    };

    let viewScale = isDna ? computeViewScale(w) : 1;

    // SETUP
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isBloom ? 0x000000 : fogColor);
    scene.fog = isNeural ? new THREE.FogExp2(fogColor, 0.008) : new THREE.FogExp2(fogColor, isBloom ? 0.01 : 0.012);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    camera.position.set(0, 0, isNeural ? 55 : 100);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: isBloom ? 'high-performance' : 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // POST PROCESSING — always on, just reduce strength for dna
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 0.85);
    bloomPass.strength = isDna ? 0.8 : isNeural ? 0.9 : isFabric ? 1.4 : isBloom ? 1.0 : BLOOM_STRENGTH;
    bloomPass.radius = 0.4;
    bloomPass.threshold = 0;
    composer.addPass(bloomPass);

    // Controls (no rotate — show only)
    let controls: OrbitControls | null = null;
    if (isBloom || isFabric || isDna || isNeural) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = isNeural ? 0.5 : 2.0;
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableRotate = false;
    }

    // GEOMETRY
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const target = new THREE.Vector3();

    const geometry = (isBloom || isFabric) ? new THREE.PlaneGeometry(0.8, 0.8) : new THREE.TetrahedronGeometry(0.25);
    const material = (isBloom || isFabric)
      ? new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 } },
          vertexShader: BLOOM_VERT,
          fragmentShader: BLOOM_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
        })
      : new THREE.MeshBasicMaterial({ color: 0xffffff });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(instancedMesh);

    // DATA
    const positions: THREE.Vector3[] = [];
    const initColor = isNeural || isDna || isFabric ? 0x00ff88 : isBloom ? 0x00ff88 : 0x38bdf8;
    for (let i = 0; i < count; i++) {
      positions.push(new THREE.Vector3((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100));
      instancedMesh.setColorAt(i, new THREE.Color(initColor));
    }

    // Params
    const PARAMS: Record<string, number> = isBloom
      ? { scale: 0.84, speed: 0.65, depth: 8.4, glow: 0.28 }
      : isFabric
      ? { scale: 128, freq: 2.2, amp: 12.8, speed: 0.96, pull: 9, twist: 5.88 }
      : isDna
      ? { twist: 0.815, radius: 40, flux: 1.543, zoom: 1.94 }
      : isNeural
      ? { radius: 80, speed: 0.1, noise: 0.14 }
      : { scale: 101.6, twist: 0.606, flow: 0, bloom: 0.44 };

    // ANIMATION
    // @ts-ignore THREE.Clock is deprecated in newer three.js but Timer causes lag in this setup
    const clock = new THREE.Clock();
    let raf = 0;
    let lastFrameTime = 0;

    function animate() {
      raf = requestAnimationFrame(animate);

      // Throttle to ~24fps when streaming to leave CPU for React
      if (forceLowFPS) {
        const now = performance.now();
        if (now - lastFrameTime < 42) return;
        lastFrameTime = now;
      }

      const t = clock.getElapsedTime() * speedMult;

      for (let i = 0; i < count; i++) {
        const u = i / count;

        if (isFabric) {
          const scale = PARAMS.scale, freq = PARAMS.freq, amp = PARAMS.amp, speed = PARAMS.speed, pull = PARAMS.pull;
          const time = t * speed;
          const randU = (Math.sin(i * 12.9898) * 43758.5453) % 1.0;
          const randV = (Math.sin(i * 78.233) * 12345.6789) % 1.0;
          const x = (randU * 2.0 - 1.0) * scale;
          const y = (randV * 2.0 - 1.0) * scale;
          const wave = Math.sin(x * 0.02 * freq + time) + Math.sin(y * 0.02 * freq - time * 0.8);
          let z = wave * amp;
          const w1x = Math.sin(time * 0.3) * scale * 0.4, w1y = Math.cos(time * 0.2) * scale * 0.4;
          const w2x = Math.sin(time * 0.5 + 2.0) * scale * 0.3, w2y = Math.cos(time * 0.4 + 1.0) * scale * 0.3;
          const d1 = Math.sqrt((x - w1x) ** 2 + (y - w1y) ** 2 + 4.0);
          const d2 = Math.sqrt((x - w2x) ** 2 + (y - w2y) ** 2 + 4.0);
          z += ((-pull / d1) + (-pull / d2)) * 0.5;
          const ang = PARAMS.twist * ((-pull / d1) - (-pull / d2));
          target.set(x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang), z);
          const depth = Math.abs(z) / (amp + 0.001);
          color.setHSL((0.6 - depth * 0.5 + 0.1 * Math.sin(time)) % 1.0, 0.7 + 0.3 * depth, 0.2 + 0.6 * (1.0 - depth));
        } else if (isBloom) {
          const scale = PARAMS.scale, speed = PARAMS.speed, depth = PARAMS.depth, glow = PARAMS.glow;
          const t2 = t * speed;
          const y = (i / count) * 42.55;
          const n = (10000.0 / count) * i;
          const k = (4.0 + Math.cos(n / 9.0 - t2 * 2.0)) * Math.cos(n / 35.0);
          const e = y / 7.0 - 13.0;
          const d = Math.sqrt(k * k + e * e) + Math.sin(e / 9.0 + t2 / 2.0) - 4.0;
          const q = 2.0 * Math.sin(k * 3.0) - (y / 35.0) * k * (9.0 + k * Math.sin(Math.cos(e) * 9.0 - d * 2.0 + t2));
          const c = d - t2;
          target.set(
            (q + 40.0 * Math.cos(c)) * scale,
            -((q * Math.sin(c) + d * 35.0) - 245.0) * scale,
            depth * Math.sin(k * 2.0 + c) * scale
          );
          const hueDeg = (((d * 40.0 + t2 * 30.0) % 360.0) + 360.0) % 360.0;
          color.setHSL((Math.floor(hueDeg / 10.0) * 10.0 + 5.0) / 360.0, 0.85, glow);
        } else if (isDna) {
          const twist = PARAMS.twist, radius = PARAMS.radius, flux = PARAMS.flux, zoom = PARAMS.zoom;
          const norm = i / count;
          const dt = t * 0.4 * flux;
          const breakY = Math.sin(dt * 0.4) * 60;
          const breakRange = 12.0;
          let px = 0, py = 0, pz = 0;
          const isBackbone = norm < 0.75;
          if (isBackbone) {
            const side = norm < 0.375 ? 1 : -1;
            const v = ((norm < 0.375 ? norm / 0.375 : (norm - 0.375) / 0.375) - 0.5) * 200;
            const angle = v * 0.1 * twist + dt;
            const offset = side === 1 ? 0 : Math.PI;
            const dy = v - breakY;
            const factor = Math.min(1.0, (dy * dy) / 250.0);
            px = Math.cos(angle + offset) * radius * (0.95 + 0.05 * factor);
            pz = Math.sin(angle + offset) * radius * (0.95 + 0.05 * factor);
            py = v;
            px += Math.sin(i * 0.5 + dt * 8) * (1.0 - factor) * 4.0;
            pz += Math.cos(i * 0.5 + dt * 8) * (1.0 - factor) * 4.0;
            color.setHSL(0.6, 0.8, 0.3 + (1.0 - factor) * 0.4);
          } else {
            const v = ((norm - 0.75) / 0.25 - 0.5) * 200;
            const angle = v * 0.1 * twist + dt;
            const lerpVal = Math.sin(i * 99.0) * 0.5 + 0.5;
            const r = radius * (lerpVal * 2.0 - 1.0);
            const dy = Math.abs(v - breakY);
            px = Math.cos(angle) * r;
            pz = Math.sin(angle) * r;
            py = v;
            if (dy < breakRange && Math.sin(i * 1.5) > 0.4) {
              px += Math.sin(i + dt * 5) * 6;
              pz += Math.cos(i + dt * 5) * 6;
              color.setHSL(0, 0, 0.95);
            } else {
              color.setHSL(0.6, 0.1, 0.25);
            }
          }
          target.set(px * zoom, py * zoom, pz * zoom);
        } else if (isNeural) {
          const radius = PARAMS.radius, noiseP = PARAMS.noise, tt = t * PARAMS.speed;
          const phi = Math.acos(1 - 2 * (i + 0.5) / count);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          let x = radius * Math.sin(phi) * Math.cos(theta);
          let y = radius * Math.sin(phi) * Math.sin(theta);
          let z = radius * Math.cos(phi);
          const wave = Math.sin(tt + theta * 0.5) * noiseP;
          x += wave * Math.sin(phi + tt);
          y += wave * Math.cos(theta + tt);
          z += wave * Math.sin(theta + tt);
          const pulse = 1 + 0.3 * Math.sin(tt * 2 + i * 0.01);
          target.set(x * pulse, y * pulse, z * pulse);
          color.setHSL(0.6 + 0.2 * Math.sin(i * 0.01 + tt), 1.0, 0.45 + 0.3 * Math.sin(tt + phi * 2.0));
        } else {
          const turns = PARAMS.twist * 18.0;
          const a = u * 6.283185307179586 * turns + t * PARAMS.flow;
          const b = u * 6.283185307179586 * 5.0 - t * (0.35 + PARAMS.bloom * 0.2);
          const ring = PARAMS.scale * (0.62 + 0.28 * Math.sin(b * 3.0 + t * 0.8));
          const tube = PARAMS.scale * 0.22 * (1.0 + PARAMS.bloom * Math.sin(a * 2.0 - t * 1.5));
          const cb = Math.cos(b), sb = Math.sin(b), ca = Math.cos(a), sa = Math.sin(a);
          target.set((ring + tube * cb) * ca, (ring + tube * cb) * sa, tube * sb * 2.1 + PARAMS.scale * 0.18 * Math.sin(a * 3.0 + b * 2.0 + t));
          const h = 0.52 + 0.42 * u + 0.06 * Math.sin(a * 0.5 + t * 0.25);
          const l = 0.42 + 0.18 * Math.sin(b * 2.0 - t);
          color.setHSL(h - Math.floor(h), 0.9, l);
        }

        // Apply responsive scaling so the particle field fits small screens better.
        // We scale mainly in the screen plane (x/y). Keeping z unscaled helps
        // preserve depth/bloom feel while still fixing narrow-width coverage.
        target.x *= viewScale;
        target.y *= viewScale;

        positions[i].lerp(target, 0.1);
        dummy.position.copy(positions[i]);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
        instancedMesh.setColorAt(i, color);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

      if ((isBloom || isFabric) && (material as any).uniforms?.uTime) {
        (material as any).uniforms.uTime.value = t;
      }

      if (controls) controls.update();
      composer.render();
    }
    animate();

    function onResize() {
      const nw = el.clientWidth || window.innerWidth;
      const nh = el.clientHeight || window.innerHeight;
      viewScale = isDna ? computeViewScale(nw) : 1;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      composer.setSize(nw, nh);
      // Keep bloom pass resolution in sync with composer render targets.
      (bloomPass as any)?.setSize?.(nw, nh);
    }
    // ResizeObserver: handles mobile visual-viewport changes (address bar) better than window resize alone.
    const ro = new ResizeObserver(() => onResize());
    ro.observe(el);

    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      try {
        ro.disconnect();
      } catch {}
      if (controls) { try { controls.dispose(); } catch {} }
      try { (composer as any).dispose?.(); } catch {}
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (instancedMesh.instanceColor) instancedMesh.instanceColor.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [variant]);

  return (
    <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />
  );
});
