// Global 3D backdrop — a spatial field of floating glass shards, a slow-rotating
// energy ring, and a drifting particle constellation, all reacting subtly to the
// pointer. Rendered once behind the whole app (fixed, pointer-events: none).
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Icosahedron, Torus } from "@react-three/drei";
import { useMemo, useRef, Suspense } from "react";
import * as THREE from "three";

const ACCENTS = ["#14b8a6", "#22d3ee", "#3b82f6", "#8b5cf6", "#10b981"];

function Particles({ count = 900 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.02;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.08;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#7dd3fc"
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Shard({
  position,
  color,
  scale,
  speed,
}: {
  position: [number, number, number];
  color: string;
  scale: number;
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * speed * 0.4;
    ref.current.rotation.y += delta * speed * 0.6;
  });
  return (
    <Float speed={speed * 1.4} rotationIntensity={0.6} floatIntensity={1.4}>
      <Icosahedron ref={ref} args={[scale, 0]} position={position}>
        <meshStandardMaterial
          color={color}
          roughness={0.15}
          metalness={0.85}
          emissive={color}
          emissiveIntensity={0.35}
          transparent
          opacity={0.92}
          flatShading
        />
      </Icosahedron>
    </Float>
  );
}

function EnergyRing() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += delta * 0.06;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.4 + 0.6;
  });
  return (
    <Torus ref={ref} args={[5.4, 0.02, 16, 220]} position={[2, 0, -4]}>
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.35} />
    </Torus>
  );
}

function Rig() {
  const { camera, pointer } = useThree();
  useFrame(() => {
    // Gentle parallax toward the pointer — the scene feels like it has depth.
    camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.03;
    camera.position.y += (pointer.y * 1.0 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Shards() {
  const shards = useMemo(() => {
    const out: {
      position: [number, number, number];
      color: string;
      scale: number;
      speed: number;
    }[] = [];
    for (let i = 0; i < 11; i++) {
      out.push({
        position: [
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 6 - 2,
        ],
        color: ACCENTS[i % ACCENTS.length],
        scale: 0.28 + Math.random() * 0.55,
        speed: 0.4 + Math.random() * 0.8,
      });
    }
    return out;
  }, []);
  return (
    <>
      {shards.map((s, i) => (
        <Shard key={i} {...s} />
      ))}
    </>
  );
}

export default function Scene() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10"
      style={{ pointerEvents: "none" }}
    >
      <Canvas
        camera={{ position: [0, 0, 12], fov: 55 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1.2} color="#22d3ee" />
          <pointLight position={[-10, -6, -4]} intensity={0.9} color="#8b5cf6" />
          <pointLight position={[0, 8, 6]} intensity={0.7} color="#10b981" />
          <Particles />
          <Shards />
          <EnergyRing />
          <Rig />
        </Suspense>
      </Canvas>
    </div>
  );
}
