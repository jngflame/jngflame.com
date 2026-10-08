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
  LoopOnce,
  LoopRepeat,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { disposeModel, loadModel } from "../lib/models";

const idleReturnDuration = 0.8;

export default function AvatarModel({
  modelUrl,
  animation,
  playing,
  motionRequested,
  replayKey,
  onAnimationsChange,
  onReadyChange,
  onAnimationChange,
}: {
  modelUrl: string;
  animation: string;
  playing: boolean;
  motionRequested: boolean;
  replayKey: number;
  onAnimationsChange: (names: string[]) => void;
  onReadyChange: (ready: boolean) => void;
  onAnimationChange: (name: string) => void;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<(() => void) | null>(null);
  const rotationRef = useRef(0);
  const zoomRef = useRef(1);
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
    setStatus("loading");
    setDragging(false);
    onReadyChange(false);
    onAnimationsChange([]);
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
      canvas.dataset.model = modelUrl;
      canvas.className = "absolute inset-0 size-full";
      host?.append(canvas);

      const gltf = await loadModel(modelUrl, abort.signal);
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
      for (const [name, action] of actions) {
        action.setLoop(
          name === "idle" ? LoopRepeat : LoopOnce,
          name === "idle" ? Infinity : 1,
        );
        action.clampWhenFinished = name !== "idle";
      }
      animationMixer.addEventListener("finished", (event) => {
        if (
          disposed ||
          event.action !== current ||
          current.getClip().name === "idle"
        )
          return;
        onAnimationChange("idle");
      });
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
      let cameraHalfHeight: number | undefined;
      const draw = (delta = 0) => {
        turntable.updateMatrixWorld(true);
        // Keep locomotion centered while preserving jumps and body movement.
        if (rootBone && rootAnchor) {
          rootBone.getWorldPosition(bonePosition);
          turntable.worldToLocal(bonePosition);
          stage.position.x += rootAnchor.x - bonePosition.x;
          stage.position.z += rootAnchor.z - bonePosition.z;
          stage.updateMatrixWorld(true);
        }
        // Let the framing return with the blended idle pose instead of retaining
        // the previous action's widest bounds.
        if (current.getClip().name === "idle") motionBounds.makeEmpty();
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
        const blend =
          cameraHalfHeight === undefined ||
          motionPreference.matches ||
          !selectionRef.current.playing
            ? 1
            : 1 - Math.exp((-3 * delta) / idleReturnDuration);
        cameraHalfHeight =
          (cameraHalfHeight ?? halfHeight) +
          (halfHeight - (cameraHalfHeight ?? halfHeight)) * blend;
        camera.position.y += ((top + bottom) / 2 - camera.position.y) * blend;
        const canvasAspect = canvas.clientWidth / canvas.clientHeight;
        camera.left = -cameraHalfHeight * canvasAspect;
        camera.right = cameraHalfHeight * canvasAspect;
        camera.top = cameraHalfHeight;
        camera.bottom = -cameraHalfHeight;
        camera.zoom = zoomRef.current;
        camera.updateProjectionMatrix();
        nextRenderer.render(scene, camera);
      };
      const hero = host.closest("section");
      const setZoom = (zoom: number) => {
        zoomRef.current = Math.min(1.5, Math.max(0.5, zoom));
        canvas.dataset.zoom = String(zoomRef.current);
        draw();
      };
      const zoomWithWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;
        if (event.cancelable) event.preventDefault();
        const delta =
          event.deltaY *
          (event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? (hero?.clientHeight ?? canvas.clientHeight)
              : 1);
        setZoom(zoomRef.current * Math.exp(-delta * 0.01));
      };
      hero?.addEventListener("wheel", zoomWithWheel, {
        passive: false,
        signal: abort.signal,
      });
      let pinch: { distance: number; zoom: number } | null = null;
      const heroTouches = (event: TouchEvent) =>
        Array.from(event.touches).filter((touch) =>
          hero?.contains(touch.target as Node),
        );
      const touchDistance = (touches: Touch[]) =>
        Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY,
        );
      const startPinch = (event: TouchEvent) => {
        pinch = null;
        const touches = heroTouches(event);
        if (touches.length !== 2) return;
        const distance = touchDistance(touches);
        if (!distance) return;
        if (event.cancelable) event.preventDefault();
        pinch = { distance, zoom: zoomRef.current };
        dragRef.current = null;
        setDragging(false);
      };
      const movePinch = (event: TouchEvent) => {
        const touches = heroTouches(event);
        if (!pinch || touches.length !== 2) return;
        if (event.cancelable) event.preventDefault();
        setZoom((pinch.zoom * touchDistance(touches)) / pinch.distance);
      };
      const endPinch = () => {
        pinch = null;
      };
      // Cancel only two-finger gestures so one-finger scrolling stays native.
      const touchOptions = { passive: false, signal: abort.signal };
      hero?.addEventListener("touchstart", startPinch, touchOptions);
      hero?.addEventListener("touchmove", movePinch, touchOptions);
      hero?.addEventListener("touchend", endPinch, { signal: abort.signal });
      hero?.addEventListener("touchcancel", endPinch, { signal: abort.signal });
      canvas.dataset.zoom = String(zoomRef.current);
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
        draw(delta);
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
            const duration =
              selection.animation === "idle" ? idleReturnDuration : 0.35;
            next.crossFadeFrom(current, duration, false);
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
  }, [modelUrl, onAnimationsChange, onReadyChange, onAnimationChange]);

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
            className={`pointer-events-auto absolute inset-x-0 top-1/5 h-7/10 touch-pan-y rounded-3xl select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
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
