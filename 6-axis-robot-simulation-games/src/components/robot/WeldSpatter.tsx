import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WeldHealth } from './weldProfiles';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  color: THREE.Color;
  bounces: number;
  isChunky: boolean;
}

const MAX_PARTICLES = 600;
const TABLE_Y = 0.58;

interface WeldSpatterProps {
  active: boolean;
  tipPosition?: THREE.Vector3;
  weldHealth: WeldHealth;
  voltage?: number;
}

export function WeldSpatter({
  active,
  tipPosition,
  weldHealth = 'perfect',
  voltage = 19.5,
}: WeldSpatterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Pre-allocated particle pool
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      size: 0.01,
      gravity: 9.8,
      drag: 0.98,
      color: new THREE.Color(),
      bounces: 0,
      isChunky: false,
    }));
  }, []);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  const spatterMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        toneMapped: false,
      }),
    []
  );

  // Initialize colors
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.frustumCulled = false;
      const initialColors = new Float32Array(MAX_PARTICLES * 3);
      for (let i = 0; i < MAX_PARTICLES; i++) {
        initialColors[i * 3 + 0] = 1;
        initialColors[i * 3 + 1] = 0.8;
        initialColors[i * 3 + 2] = 0.3;
      }
      meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(initialColors, 3);
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(0.05, delta);

    const origin = tipPosition || new THREE.Vector3(0, TABLE_Y + 0.03, 0);

    // 1. Particle Emission based on Weld Health state
    if (active) {
      let spawnCount = 1;
      if (weldHealth === 'perfect') {
        // Very few, small sparks
        spawnCount = Math.random() < 0.65 ? 1 : 2;
      } else if (weldHealth === 'too_cold') {
        // Medium count of heavy chunky droplets
        spawnCount = Math.floor(Math.random() * 3) + 2;
      } else if (weldHealth === 'too_hot') {
        // Massive shower of sparks
        spawnCount = Math.floor(Math.random() * 10) + 12;
      }

      for (let s = 0; s < spawnCount; s++) {
        // Find inactive particle in pool
        const p = particles.find((item) => !item.active);
        if (!p) break;

        p.active = true;
        p.x = origin.x + (Math.random() - 0.5) * 0.01;
        p.y = origin.y + (Math.random() - 0.5) * 0.01;
        p.z = origin.z + (Math.random() - 0.5) * 0.01;
        p.bounces = 0;

        if (weldHealth === 'perfect') {
          // Small, short-lived sparks
          p.maxLife = 0.15 + Math.random() * 0.15;
          p.life = p.maxLife;
          p.size = 0.008 + Math.random() * 0.006;
          p.gravity = 6.0;
          p.drag = 0.96;
          p.isChunky = false;

          const angle = Math.random() * Math.PI * 2;
          const speed = 1.2 + Math.random() * 1.5;
          p.vx = Math.cos(angle) * speed * 0.5;
          p.vy = 0.8 + Math.random() * 1.2;
          p.vz = Math.sin(angle) * speed * 0.5;
          p.color.setRGB(1.0, 0.85 + Math.random() * 0.15, 0.4);
        } else if (weldHealth === 'too_cold') {
          // Large chunky orange droplets, heavy gravity, slow velocity, bounces
          p.maxLife = 0.8 + Math.random() * 0.8;
          p.life = p.maxLife;
          p.size = 0.025 + Math.random() * 0.022; // Chunky droplet size
          p.gravity = 14.0; // High gravity
          p.drag = 0.94;
          p.isChunky = true;

          const angle = Math.random() * Math.PI * 2;
          const speed = 0.7 + Math.random() * 1.1; // Slow ejection
          p.vx = Math.cos(angle) * speed;
          p.vy = 0.6 + Math.random() * 1.2;
          p.vz = Math.sin(angle) * speed;
          p.color.setRGB(1.0, 0.35 + Math.random() * 0.2, 0.05); // Deep orange molten
        } else {
          // 'too_hot': Massive high-velocity shower in wide cone, tiny white-hot sparks
          p.maxLife = 0.25 + Math.random() * 0.35;
          p.life = p.maxLife;
          p.size = 0.006 + Math.random() * 0.006; // Tiny sparks
          p.gravity = 4.0;
          p.drag = 0.985;
          p.isChunky = false;

          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI * 0.45; // Wide cone
          const speed = 3.5 + Math.random() * 4.5; // High velocity
          p.vx = Math.sin(phi) * Math.cos(theta) * speed;
          p.vy = Math.cos(phi) * speed * 0.8;
          p.vz = Math.sin(phi) * Math.sin(theta) * speed;
          p.color.setRGB(1.0, 0.98, 0.92); // Blinding white-hot
        }
      }
    }

    // 2. Physics Simulation Loop
    let activeCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) {
        dummy.position.set(0, -999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        dummy.position.set(0, -999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Gravity and Drag
      p.vy -= p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vz *= Math.pow(p.drag, dt * 60);

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Table & Plate Bounce collision for chunky cold spatter
      if (p.y <= TABLE_Y && p.vy < 0) {
        p.y = TABLE_Y;
        if (p.isChunky && p.bounces < 3) {
          p.bounces += 1;
          p.vy = -p.vy * 0.38; // Bounce off plate with restitution
          p.vx *= 0.65;
          p.vz *= 0.65;
        } else {
          p.vy = 0;
          p.vx *= 0.4;
          p.vz *= 0.4;
        }
      }

      const lifeRatio = p.life / p.maxLife;
      const currentScale = p.size * (p.isChunky ? Math.max(0.6, lifeRatio) : lifeRatio);

      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(currentScale, currentScale, currentScale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Color decay over lifetime
      if (p.isChunky) {
        // Cold spatter decays from orange to dark crusted slag
        const crusted = 1.0 - lifeRatio;
        tempColor.setRGB(
          THREE.MathUtils.lerp(1.0, 0.25, crusted),
          THREE.MathUtils.lerp(0.35, 0.12, crusted),
          THREE.MathUtils.lerp(0.05, 0.05, crusted)
        );
      } else if (weldHealth === 'too_hot') {
        // White hot to fiery orange
        tempColor.setRGB(
          1.0,
          THREE.MathUtils.lerp(0.5, 1.0, lifeRatio),
          THREE.MathUtils.lerp(0.1, 0.9, lifeRatio)
        );
      } else {
        // Perfect golden spark decay
        tempColor.copy(p.color).multiplyScalar(lifeRatio);
      }

      meshRef.current.setColorAt(i, tempColor);
      activeCount++;
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[sphereGeo, spatterMat, MAX_PARTICLES]}
      frustumCulled={false}
    />
  );
}

export default WeldSpatter;
