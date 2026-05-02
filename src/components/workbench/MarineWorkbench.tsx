import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function VesselModel({ position = [0, 0, 0], color = '#8795a8' }: { position?: [number, number, number], color?: string }) {
  return <group position={position} rotation={[0, -0.35, 0]}>
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[2.2, 0.28, 0.52]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.42} />
    </mesh>
    <mesh position={[0.35, 0.28, 0]}>
      <boxGeometry args={[0.62, 0.34, 0.42]} />
      <meshStandardMaterial color="#b5bdc8" metalness={0.25} roughness={0.5} />
    </mesh>
    <mesh position={[1.25, 0.02, 0]} rotation={[0, 0, Math.PI / 7]}>
      <coneGeometry args={[0.26, 0.52, 4]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.42} />
    </mesh>
  </group>;
}

function RadarCone() {
  const geometry = new THREE.ConeGeometry(1.2, 3.1, 48, 1, true);
  return <mesh geometry={geometry} position={[0.78, 0.18, -1.58]} rotation={[Math.PI / 2, 0, -0.15]}>
    <meshBasicMaterial color="#d4a552" transparent opacity={0.16} side={THREE.DoubleSide} />
  </mesh>;
}

function GhostTrack() {
  return <group>
    {[-1.2, -0.45, 0.35, 1.15].map((x, i) => <mesh key={x} position={[x, 0.06, -1.05 - i * 0.28]}>
      <sphereGeometry args={[0.055, 18, 18]} />
      <meshBasicMaterial color={i === 3 ? '#5bd897' : '#7e8fa8'} />
    </mesh>)}
    <mesh position={[1.15, 0.06, -1.89]}>
      <sphereGeometry args={[0.13, 24, 24]} />
      <meshBasicMaterial color="#5bd897" transparent opacity={0.85} />
    </mesh>
  </group>;
}

function IdentityLink() {
  return <group>
    <mesh position={[-0.9, 0.34, .62]}>
      <boxGeometry args={[0.9, 0.05, 0.05]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
    <mesh position={[0.9, 0.34, .62]}>
      <boxGeometry args={[0.9, 0.05, 0.05]} />
      <meshBasicMaterial color="#5bd897" />
    </mesh>
  </group>;
}

export function MarineWorkbench() {
  return <div className="workbench-canvas">
    <Canvas camera={{ position: [3.6, 2.4, 4.1], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 5, 4]} intensity={1.4} />
      <gridHelper args={[6, 12, '#293241', '#161b23']} />
      <VesselModel position={[-1.2, 0, .6]} color="#a4acb8" />
      <VesselModel position={[1.2, 0, .6]} color="#5e9f7a" />
      <RadarCone />
      <GhostTrack />
      <IdentityLink />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.7} />
    </Canvas>
  </div>;
}
