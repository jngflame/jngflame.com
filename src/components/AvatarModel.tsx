import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AnimationAction,
  AnimationMixer,
  Bone,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  Scene,
  SkinnedMesh,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
      material.dispose();
    }
  });
  for (const texture of textures) {
    texture.dispose();
    if (texture.image instanceof ImageBitmap) texture.image.close();
  }
}

export default function AvatarModel({
  animation,
  playing,
  motionRequested,
  replayKey,
  onAnimationsChange,
  onReadyChange,
}: {
  animation: string;
  playing: boolean;
  motionRequested: boolean;
  replayKey: number;
  onAnimationsChange: (names: string[]) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<(() => void) | null>(null);
  const rotationRef = useRef(0);
  const rotateRef = useRef<((angle: number) => void) | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    angle: number;
    moving: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rotate = (angle: number) => {
    const fullTurn = Math.PI * 2;
    rotationRef.current = ((angle % fullTurn) + fullTurn) % fullTurn;
    rotateRef.current?.(rotationRef.current);
  };
  const selectionRef = useRef({
    animation,
    playing,
    motionRequested,
    replayKey,
  });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    selectionRef.current = { animation, playing, motionRequested, replayKey };
    playbackRef.current?.();
  }, [animation, playing, motionRequested, replayKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abort = new AbortController();
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let disposed = false;
    let visible = true;
    let renderer: WebGLRenderer | undefined;
    let model: Group | undefined;
    let mixer: AnimationMixer | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let visibilityObserver: IntersectionObserver | undefined;
    let updatePlayback: (() => void) | undefined;

    async function initialize() {
      if (!host) return;
      const nextRenderer = new WebGLRenderer({ alpha: true, antialias: true });
      renderer = nextRenderer;
      nextRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      nextRenderer.setClearColor(0x000000, 0);
      const canvas = nextRenderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      canvas.className = "absolute inset-0 size-full";
      host?.append(canvas);

      const response = await fetch("/outdoor.glb", { signal: abort.signal });
      if (!response.ok)
        throw new Error(`Model request failed: ${response.status}`);
      const gltf = await new GLTFLoader().parseAsync(
        await response.arrayBuffer(),
        "/",
      );
      if (disposed) {
        disposeModel(gltf.scene);
        return;
      }
      model = gltf.scene;
      const scene = new Scene();
      const stage = new Group();
      stage.add(model);
      const turntable = new Group();
      turntable.add(stage);
      scene.add(turntable, new HemisphereLight(0xffffff, 0xffffff, 3));
      const light = new DirectionalLight(0xffffff, 2.5);
      light.position.set(-2, 3, 4);
      scene.add(light);

      const animationMixer = new AnimationMixer(model);
      mixer = animationMixer;
      const idleClip = gltf.animations.find((clip) => clip.name === "idle");
      if (!gltf.animations.length)
        throw new Error("Model animations are missing");
      const actions = new Map(
        gltf.animations.map((clip) => [
          clip.name,
          animationMixer.clipAction(clip),
        ]),
      );
      let current: AnimationAction = animationMixer.clipAction(
        idleClip ?? gltf.animations[0],
      );
      let lastReplayKey = selectionRef.current.replayKey;
      current.play();
      mixer.update(0);
      model.updateMatrixWorld(true);

      // Normalize the first idle pose without changing any animated bones.
      const bounds = new Box3().setFromObject(model, true);
      const center = bounds.getCenter(new Vector3());
      const scale = 1 / bounds.getSize(new Vector3()).y;
      stage.scale.setScalar(scale);
      stage.position.set(
        -center.x * scale,
        -bounds.min.y * scale,
        -center.z * scale,
      );
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.set(0, 0.557, 4);
      camera.lookAt(0, 0.557, 0);
      const bones: Bone[] = [];
      model.traverse((object) => {
        if (object instanceof Bone) bones.push(object);
      });
      const rootBone = bones.find((bone) => !(bone.parent instanceof Bone));
      const rootAnchor = rootBone?.getWorldPosition(new Vector3());
      const bonePosition = new Vector3();
      const motionBounds = new Box3();
      let aspect = 1;
      const draw = () => {
        turntable.updateMatrixWorld(true);
        // Keep locomotion centered while preserving jumps and body movement.
        if (rootBone && rootAnchor) {
          rootBone.getWorldPosition(bonePosition);
          turntable.worldToLocal(bonePosition);
          stage.position.x += rootAnchor.x - bonePosition.x;
          stage.position.z += rootAnchor.z - bonePosition.z;
          stage.updateMatrixWorld(true);
        }
        for (const bone of bones) {
          motionBounds.expandByPoint(bone.getWorldPosition(bonePosition));
        }
        const bottom = Math.min(-0.237, motionBounds.min.y - 0.12);
        const top = Math.max(1.351, motionBounds.max.y + 0.12);
        const halfHeight = Math.max(
          (top - bottom) / 2,
          (Math.max(
            Math.abs(motionBounds.min.x),
            Math.abs(motionBounds.max.x),
          ) +
            0.12) /
            aspect,
        );
        const canvasAspect = canvas.clientWidth / canvas.clientHeight;
        camera.left = -halfHeight * canvasAspect;
        camera.right = halfHeight * canvasAspect;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.position.y = (top + bottom) / 2;
        camera.updateProjectionMatrix();
        nextRenderer.render(scene, camera);
      };
      rotateRef.current = (angle) => {
        turntable.rotation.y = angle;
        motionBounds.makeEmpty();
        canvas.dataset.rotation = String(angle);
        draw();
      };
      const resize = () => {
        if (!host) return;
        const { width, height } = host.getBoundingClientRect();
        if (!width || !height) return;
        aspect =
          Math.min(width, host.closest("section")?.clientWidth ?? width) /
          height;
        nextRenderer.setSize(width, height, false);
        draw();
      };
      let previousTime = 0;
      const frame = (time: number) => {
        const delta = previousTime
          ? Math.min((time - previousTime) / 1000, 0.05)
          : 0;
        previousTime = time;
        mixer?.update(delta);
        draw();
      };
      updatePlayback = () => {
        previousTime = 0;
        const animate =
          visible &&
          !document.hidden &&
          selectionRef.current.playing &&
          (!motionPreference.matches || selectionRef.current.motionRequested);
        nextRenderer.setAnimationLoop(animate ? frame : null);
        canvas.dataset.playing = String(animate);
        draw();
      };
      playbackRef.current = () => {
        const selection = selectionRef.current;
        const next = actions.get(selection.animation);
        if (!next) return;
        const restart = selection.replayKey !== lastReplayKey;
        if (next !== current || restart) {
          next.reset().setEffectiveWeight(1).play();
          if (next !== current && !motionPreference.matches) {
            next.crossFadeFrom(current, 0.35, false);
          } else if (next !== current) {
            current.stop();
          }
          current = next;
          lastReplayKey = selection.replayKey;
          motionBounds.makeEmpty();
          mixer?.update(0);
        }
        canvas.dataset.animation = current.getClip().name;
        updatePlayback?.();
      };
      resize();
      rotateRef.current(rotationRef.current);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      visibilityObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        updatePlayback?.();
      });
      visibilityObserver.observe(host);
      onAnimationsChange(gltf.animations.map((clip) => clip.name));
      playbackRef.current();
      canvas.dataset.ready = "true";
      setStatus("ready");
      onReadyChange(true);
    }

    const handleVisibility = () => updatePlayback?.();
    document.addEventListener("visibilitychange", handleVisibility);
    motionPreference.addEventListener("change", handleVisibility);
    void initialize().catch(() => {
      if (disposed) return;
      renderer?.setAnimationLoop(null);
      setStatus("error");
      onReadyChange(false);
    });

    return () => {
      disposed = true;
      abort.abort();
      playbackRef.current = null;
      rotateRef.current = null;
      dragRef.current = null;
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      motionPreference.removeEventListener("change", handleVisibility);
      mixer?.stopAllAction();
      if (model) {
        mixer?.uncacheRoot(model);
        disposeModel(model);
      }
      renderer?.setAnimationLoop(null);
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      onReadyChange(false);
    };
  }, [onAnimationsChange, onReadyChange]);

  return (
    <>
      <div
        ref={hostRef}
        role="img"
        aria-label={t("hero.avatarAlt")}
        aria-busy={status === "loading"}
        className="absolute inset-y-0 left-1/2 w-2/1 -translate-x-1/2"
      />
      {status === "ready" && (
        <>
          <button
            type="button"
            aria-label={t("hero.rotateModel")}
            aria-describedby="model-rotation-instructions"
            title={t("hero.rotationHint")}
            className={`pointer-events-auto absolute inset-x-0 top-1/5 h-7/10 touch-pan-y touch-pinch-zoom rounded-3xl select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              dragRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                angle: rotationRef.current,
                moving: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              const dx = event.clientX - drag.x;
              const dy = event.clientY - drag.y;
              if (!drag.moving) {
                if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
                drag.moving = true;
                setDragging(true);
              }
              rotate(
                drag.angle +
                  (dx / event.currentTarget.clientWidth) * Math.PI * 2,
              );
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = null;
              setDragging(false);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDragging(false);
            }}
            onLostPointerCapture={() => {
              dragRef.current = null;
              setDragging(false);
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key))
                return;
              event.preventDefault();
              const step = Math.PI / 12;
              rotate(
                event.key === "Home"
                  ? 0
                  : rotationRef.current +
                      (event.key === "ArrowLeft" ? -step : step),
              );
            }}
            onClick={(event) => {
              if (event.detail === 0) rotate(0);
            }}
            onDoubleClick={() => rotate(0)}
          />
          <p id="model-rotation-instructions" className="sr-only">
            {t("hero.rotationInstructions")}
          </p>
        </>
      )}
      {status !== "ready" && (
        <p
          role="status"
          className="absolute inset-x-0 top-1/2 text-center text-sm text-white/80"
        >
          {t(status === "loading" ? "hero.modelLoading" : "hero.modelError")}
        </p>
      )}
    </>
  );
}
