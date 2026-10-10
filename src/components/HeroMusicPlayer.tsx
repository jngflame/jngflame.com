import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  giveItUpVideoId,
  loadYouTubeAPI,
  type MusicPlayback,
  type YouTubePlayer,
} from "../lib/youtube";

export default function HeroMusicPlayer({
  clock,
  replayKey,
  onPlay,
  onEnded,
  onClose,
}: {
  clock: RefObject<MusicPlayback | null>;
  replayKey: number;
  onPlay: () => void;
  onEnded: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; } | null>(
    null,
  );
  const [panelPosition, setPanelPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const callbacks = useRef({ onPlay, onEnded });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const lastReplayKey = useRef(replayKey);

  const movePanel = (x: number, y: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    setPanelPosition({
      x: Math.max(
        0,
        Math.min(x, document.documentElement.clientWidth - panel.offsetWidth),
      ),
      y: Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight)),
    });
  };

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const constrainPosition = () => {
      setPanelPosition((current) => {
        const panelRect = panel.getBoundingClientRect();
        const x = current?.x ?? panelRect.left;
        const y = current?.y ?? panelRect.top;
        const next = {
          x: Math.max(
            0,
            Math.min(
              x,
              document.documentElement.clientWidth - panel.offsetWidth,
            ),
          ),
          y: Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight)),
        };
        if (next.x === x && next.y === y) return current;
        return next;
      });
    };
    const observer = new ResizeObserver(constrainPosition);
    observer.observe(panel);
    window.addEventListener("resize", constrainPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", constrainPosition);
    };
  }, []);

  useEffect(() => {
    callbacks.current = { onPlay, onEnded };
  }, [onPlay, onEnded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new attempt intentionally recreates the external player.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let failed = false;
    let player: YouTubePlayer | undefined;
    let readyTimeout: number | undefined;
    let lastTime = 0;
    setStatus("loading");
    const sample = (target: YouTubePlayer) => {
      const time = target.getCurrentTime();
      if (Number.isFinite(time)) lastTime = Math.max(0, time);
      return lastTime;
    };
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      window.clearTimeout(readyTimeout);
      clock.current = { getTime: () => lastTime };
      playerRef.current = null;
      player?.destroy();
      player = undefined;
      setStatus("error");
    };
    void loadYouTubeAPI()
      .then((api) => {
        if (disposed) return;
        const mount = document.createElement("div");
        host.replaceChildren(mount);
        readyTimeout = window.setTimeout(fail, 15000);
        player = new api.Player(mount, {
          videoId: giveItUpVideoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            origin: window.location.origin,
            playsinline: 1,
            controls: 1,
            disablekb: 0,
            iv_load_policy: 3,
            cc_load_policy: 0,
          },
          events: {
            onReady: ({ target }) => {
              if (disposed || failed) return;
              window.clearTimeout(readyTimeout);
              playerRef.current = target;
              clock.current = { getTime: () => sample(target) };
              setStatus("ready");
              target.getIframe().title = "Give It Up — YouTube";
              target.playVideo();
            },
            onStateChange: ({ target, data }) => {
              if (disposed || failed) return;
              sample(target);
              if (data === 1 || data === 2) {
                // Seeking back from the end must restore the dance even if paused.
                callbacks.current.onPlay();
              } else if (data === 0) callbacks.current.onEnded();
            },
            onError: fail,
          },
        });
      })
      .catch(fail);
    return () => {
      disposed = true;
      window.clearTimeout(readyTimeout);
      clock.current = null;
      playerRef.current = null;
      player?.destroy();
      host.replaceChildren();
    };
  }, [clock, attempt]);

  useEffect(() => {
    if (lastReplayKey.current === replayKey) return;
    lastReplayKey.current = replayKey;
    const player = playerRef.current;
    player?.seekTo(0, true);
    player?.playVideo();
  }, [replayKey]);

  return (
    <div
      ref={panelRef}
      className="fixed right-0 bottom-1 z-30 max-h-dvh w-89 overflow-y-auto font-orbiter"
      style={
        panelPosition
          ? {
            left: panelPosition.x,
            top: panelPosition.y,
            right: "auto",
            bottom: "auto",
          }
          : undefined
      }
    >
      <div className="overflow-hidden rounded-4 bg-white/95 shadow-lg">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={t("hero.moveMusic")}
            title={t("hero.moveMusic")}
            className={`h-12 min-w-0 flex-1 touch-none px-3 text-left text-sm select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              const panel = panelRef.current;
              if (!panel) return;
              const rect = panel.getBoundingClientRect();
              dragRef.current = {
                pointerId: event.pointerId,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              movePanel(event.clientX - drag.x, event.clientY - drag.y);
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              dragRef.current = null;
              setDragging(false);
            }}
            onLostPointerCapture={() => {
              dragRef.current = null;
              setDragging(false);
            }}
            onKeyDown={(event) => {
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const direction = directions[event.key];
              const panel = panelRef.current;
              if (!direction || !panel) return;
              event.preventDefault();
              const rect = panel.getBoundingClientRect();
              const step = event.shiftKey ? 40 : 10;
              movePanel(
                rect.left + direction[0] * step,
                rect.top + direction[1] * step,
              );
            }}
          >
            Give It Up · YouTube
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("hero.dismissMusic")}
            className="mr-3 flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
          >
            <img src="/21823.svg" alt="" width={16} height={16} />
          </button>
        </div>
        <div ref={hostRef} className="aspect-video w-full bg-black" />
        {status === "error" && (
          <div role="alert" className="space-y-2 px-3 py-2 text-xs">
            <p>{t("hero.musicError")}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="cursor-pointer underline"
            >
              {t("hero.musicRetry")}
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${giveItUpVideoId}`}
              target="_blank"
              rel="noreferrer"
              className="ml-3 underline"
            >
              {t("hero.musicOpenYouTube")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
