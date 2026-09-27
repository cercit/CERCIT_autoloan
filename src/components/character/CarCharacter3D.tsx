import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { EXPRESSION_CAPTIONS, FACES, type CarExpression } from "./expressions";

// 3D companion (adapted from the Lovable prototype, 27 Sep 2026). Kenney "hatchback
// sports" model, CC0. Uses three + react-three-fiber only; the prototype's drei
// helpers were dropped to keep the download small. Loaded lazily by companion.tsx.

const MODEL_URL = `${import.meta.env.BASE_URL}models/car/hatchback-sports.glb`;

type Props = {
  expression?: CarExpression;
  /** 0 (still) … 1 (fast): scroll speed from the companion. Spins the wheels and lifts the nose. */
  drive?: number;
  className?: string;
  showCaption?: boolean;
};

function FaceEye({ x, expression, blink, gaze }: { x: number; expression: CarExpression; blink: boolean; gaze: { x: number; y: number } }) {
  const face = FACES[expression];
  const closed = blink || expression === "BLINK";
  const height = closed ? 0.012 : face.eyeHeight / 175;
  const width = face.eyeWidth / 160;
  const pupilX = expression === "LOOKING_AWAY" ? -0.075 : face.pupilX / 140 + gaze.x;
  const pupilY = face.pupilY / 120 + gaze.y;
  return (
    <group position={[x, 0.75, 1.096]}>
      <mesh scale={[width, height, 0.027]}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial color="#f3f7f9" roughness={0.25} />
      </mesh>
      {!closed && (
        <group position={[pupilX, pupilY, 0.032]}>
          <mesh scale={[0.069 * face.pupilScale, 0.09 * face.pupilScale, 0.021]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#273847" roughness={0.22} />
          </mesh>
          <mesh position={[-0.022, 0.025, 0.023]} scale={[0.014, 0.018, 0.008]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial color="#ecfaff" />
          </mesh>
        </group>
      )}
      <mesh
        position={[0, 0.23 - (x < 0 ? face.browLeftY : face.browRightY) / 300, 0.015]}
        rotation-z={((x < 0 ? face.browLeftRotate : face.browRightRotate) * Math.PI) / 180}
        scale={[0.18, 0.018, 0.016]}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#d5e0e8" />
      </mesh>
    </group>
  );
}

function Mascot({ expression, gaze, reducedMotion, drive }: { expression: CarExpression; gaze: { x: number; y: number }; reducedMotion: boolean; drive: number }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const car = useMemo(() => gltf.scene.clone(true), [gltf]);
  const wheels = useMemo(() => {
    const found: THREE.Object3D[] = [];
    car.traverse((o) => { if (o.name.startsWith("wheel")) found.push(o); });
    return found;
  }, [car]);
  const model = useRef<THREE.Group>(null);
  const [blink, setBlink] = useState(false);
  const face = FACES[expression];

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let open: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        open = setTimeout(() => { setBlink(false); schedule(); }, 150);
      }, 3200 + Math.random() * 4000);
    };
    schedule();
    return () => { clearTimeout(timer); clearTimeout(open); };
  }, []);

  useFrame(({ clock }, delta) => {
    if (!model.current) return;
    const t = clock.elapsedTime;
    const d = reducedMotion ? 0 : drive;
    const tilt = reducedMotion ? 0 : gaze.x * 0.35 + Math.sin(t * 0.55) * 0.025;
    model.current.rotation.y = THREE.MathUtils.damp(model.current.rotation.y, tilt, 3, delta);
    model.current.rotation.z = THREE.MathUtils.damp(model.current.rotation.z, (face.bodyRotate * Math.PI) / 180 + (d > 0.3 ? Math.sin(t * 40) * 0.01 * d : 0), 4, delta);
    // Nose lifts a little with speed, as if accelerating.
    model.current.rotation.x = THREE.MathUtils.damp(model.current.rotation.x, -d * 0.08, 5, delta);
    model.current.position.y = THREE.MathUtils.damp(
      model.current.position.y,
      (reducedMotion ? 0 : Math.sin(t * 1.2) * 0.018) - face.bodyY / 180,
      4,
      delta,
    );
    for (const w of wheels) w.rotation.x += d * delta * 22;
  });

  const mouthOpen = ["open", "shock", "wide"].includes(face.mouth);
  const smile = ["smile", "wide"].includes(face.mouth);
  return (
    <group ref={model}>
      <primitive object={car} />
      <FaceEye x={-0.27} expression={expression} blink={blink} gaze={gaze} />
      <FaceEye x={0.27} expression={expression} blink={blink} gaze={gaze} />
      <mesh
        position={[0, 0.41, 1.432]}
        scale={mouthOpen ? [0.105, face.mouth === "shock" ? 0.105 : 0.065, 0.018] : face.mouth === "frown" ? [0.12, 0.02, 0.018] : [0.14, 0.018, 0.018]}
      >
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial color="#293842" roughness={0.42} />
      </mesh>
      {smile && (
        <mesh position={[0, 0.385, 1.447]} scale={[0.088, 0.012, 0.012]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshBasicMaterial color="#e6f1fa" />
        </mesh>
      )}
      {/* Headlights: cool white, brighter while driving */}
      {[-0.43, 0.43].map((x) => (
        <mesh key={x} position={[x, 0.43, 1.389]} scale={[0.11, 0.045, 0.025]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshBasicMaterial color={drive > 0.2 ? "#9fe3ff" : "#c9f1ff"} />
        </mesh>
      ))}
    </group>
  );
}

export function CarCharacter3D({ expression = "IDLE", drive = 0, className = "", showCaption = false }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Eyes follow the pointer anywhere on the page, gently.
  useEffect(() => {
    if (reducedMotion) return;
    const move = (e: PointerEvent) => {
      setGaze({
        x: Math.max(-0.06, Math.min(0.06, (e.clientX / window.innerWidth - 0.5) * 0.12)),
        y: Math.max(-0.05, Math.min(0.05, (0.5 - e.clientY / window.innerHeight) * 0.1)),
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reducedMotion]);

  const g = expression === "LOOKING_AWAY" ? { x: 0, y: 0 } : gaze;
  return (
    <div className={`car-character car-character--3d ${className}`}>
      <div className="car-canvas" aria-hidden="true">
        <Canvas dpr={[1, 1.5]} camera={{ position: [1.65, 1.35, 3.45], fov: 32 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={1.4} />
          <directionalLight position={[-3, 6, 5]} intensity={2.4} />
          <directionalLight position={[3, 2, -2]} intensity={1.5} />
          <hemisphereLight args={["#dbe8ff", "#1b2433", 0.8]} />
          <Suspense fallback={null}>
            <Mascot expression={expression} gaze={g} reducedMotion={reducedMotion} drive={drive} />
          </Suspense>
        </Canvas>
      </div>
      {showCaption && (
        <p className="car-caption" role="status" aria-live="polite" aria-atomic="true">
          {EXPRESSION_CAPTIONS[expression]}
        </p>
      )}
    </div>
  );
}

export default CarCharacter3D;
