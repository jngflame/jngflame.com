import { useEffect, useRef } from "react";
import { render, setup } from "../lib/custom-effects/clouds";

// The Figma connector supplies the original shader, but does not expose its
// runtime resources in this environment. This host runs that source unchanged.
interface Texture {
  width: number;
  height: number;
  createView(): unknown;
}
interface Device {
  destroy(): void;
  lost: Promise<unknown>;
  queue: { onSubmittedWorkDone(): Promise<void> };
}
interface CanvasContext {
  configure(options: {
    device: Device;
    format: string;
    alphaMode: string;
  }): void;
  getCurrentTexture(): Texture;
  unconfigure(): void;
}
interface Gpu {
  requestAdapter(): Promise<{ requestDevice(): Promise<Device> } | null>;
  getPreferredCanvasFormat(): string;
}

const params = {
  warpScale: 0,
  globalTransform: { x: 50, y: 50, radius: 60, angle: 0 },
  coverage: 50,
  warpAmount: 0,
  globalDetail: 50,
  cloudColor: { r: 0.9290000200271606, g: 0.9729999899864197, b: 1, a: 1 },
  stretch: 0,
  shadingVariation: 50,
  density: 50,
  cloudShadowColor: {
    r: 0.2669999897480011,
    g: 0.5180000066757202,
    b: 0.800000011920929,
    a: 1,
  },
  brightness: 70,
  skyColor: {
    stops: [
      {
        position: 0,
        color: { r: 0, g: 0.16099999845027924, b: 0.47099998593330383, a: 1 },
      },
      {
        position: 1,
        color: {
          r: 0.32899999618530273,
          g: 0.5879999995231628,
          b: 0.7960000038146973,
          a: 1,
        },
      },
    ],
  },
  evolution: 0,
};

export function CloudSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
    if (!canvas || !gpu) return;
    let disposed = false;
    let device: Device | undefined;
    let observer: ResizeObserver | undefined;
    let context: CanvasContext | undefined;
    let animationFrame = 0;

    async function initialize() {
      const adapter = await gpu?.requestAdapter();
      if (!adapter || disposed || !canvas || !gpu) return;
      const nextDevice = await adapter.requestDevice();
      if (disposed) {
        nextDevice.destroy();
        return;
      }
      device = nextDevice;
      context = canvas.getContext("webgpu") as unknown as
        | CanvasContext
        | undefined;
      if (!context) return;
      const format = gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "premultiplied" });
      const state = {};
      setup(device, { state, params });
      const draw = () => {
        if (disposed || !context || !device) return;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * scale));
        const height = Math.max(1, Math.round(canvas.clientHeight * scale));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const texture = context.getCurrentTexture();
        render(device, {
          state,
          params,
          output: {
            width: texture.width,
            height: texture.height,
            format,
            createView: () => texture.createView(),
          },
        });
        void device.queue.onSubmittedWorkDone().then(() => {
          if (!disposed) canvas.dataset.ready = "true";
        });
      };
      draw();
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(draw);
      });
      observer.observe(canvas);
      void device.lost.then(() => {
        if (!disposed) delete canvas.dataset.ready;
      });
    }
    void initialize().catch(() => {
      // Keep the blue backdrop readable if GPU access is unavailable.
      delete canvas.dataset.ready;
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      context?.unconfigure();
      device?.destroy();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      tabIndex={-1}
      className="absolute inset-0 size-full"
    />
  );
}
