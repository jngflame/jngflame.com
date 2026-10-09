import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  giveItUpVideoId,
  loadYouTubeAPI,
  type MusicPlayback,
  type YouTubePlayer,
} from "../lib/youtube";

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

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
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const callbacks = useRef({ onPlay, onEnded });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const lastReplayKey = useRef(replayKey);

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
    let interval: number | undefined;
    let readyTimeout: number | undefined;
    let lastTime = 0;
    setStatus("loading");
    setBlocked(false);
    setPlaying(false);
    setPosition(0);
    const sample = (target: YouTubePlayer) => {
      const time = target.getCurrentTime();
      if (Number.isFinite(time)) lastTime = Math.max(0, time);
      return lastTime;
    };
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      window.clearTimeout(readyTimeout);
      window.clearInterval(interval);
      clock.current = { getTime: () => lastTime };
      playerRef.current = null;
      player?.destroy();
      player = undefined;
      setPlaying(false);
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
          playerVars: { origin: window.location.origin, playsinline: 1 },
          events: {
            onReady: ({ target }) => {
              if (disposed || failed) return;
              window.clearTimeout(readyTimeout);
              playerRef.current = target;
              clock.current = { getTime: () => sample(target) };
              setStatus("ready");
              target.getIframe().title = "Give It Up — YouTube";
              interval = window.setInterval(() => {
                setPosition(sample(target));
                setDuration(target.getDuration());
                setPlaying(target.getPlayerState() === 1);
              }, 100);
              target.playVideo();
            },
            onStateChange: ({ target, data }) => {
              if (disposed || failed) return;
              setPosition(sample(target));
              setDuration(target.getDuration());
              setPlaying(data === 1);
              if (data === 1 || data === 2) {
                if (data === 1) setBlocked(false);
                // Seeking back from the end must restore the dance even if paused.
                callbacks.current.onPlay();
              } else if (data === 0) callbacks.current.onEnded();
            },
            onError: fail,
            onAutoplayBlocked: () => {
              if (!disposed && !failed) setBlocked(true);
            },
          },
        });
      })
      .catch(fail);
    return () => {
      disposed = true;
      window.clearTimeout(readyTimeout);
      window.clearInterval(interval);
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
    <div className="absolute right-0 bottom-5 z-10 w-full max-w-90 px-5 font-orbiter">
      <div className="overflow-hidden rounded-4 bg-white/95 shadow-lg">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm">Give It Up · YouTube</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("hero.dismissMusic")}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
          >
            <img src="/21823.svg" alt="" width={16} height={16} />
          </button>
        </div>
        <div ref={hostRef} className="h-50 w-full bg-black" />
        {status === "loading" && (
          <p role="status" className="px-3 py-2 text-xs">
            {t("hero.musicLoading")}
          </p>
        )}
        {status === "error" ? (
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
        ) : (
          <div className="px-3 pt-2 pb-3">
            {blocked && (
              <p role="status" className="mb-2 text-xs">
                {t("hero.musicPlayPrompt")}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={status !== "ready"}
                onClick={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  if (player.getPlayerState() === 1) player.pauseVideo();
                  else {
                    if (player.getPlayerState() === 0) player.seekTo(0, true);
                    player.playVideo();
                  }
                }}
                className="min-w-10 cursor-pointer rounded py-1 disabled:opacity-40"
              >
                {t(playing ? "hero.musicPause" : "hero.musicPlay")}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(position, duration || 1)}
                disabled={status !== "ready" || !duration}
                aria-label={t("hero.musicPosition")}
                aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
                onChange={(event) => {
                  const time = Number(event.target.value);
                  const player = playerRef.current;
                  if (!player) return;
                  const wasPlaying = player.getPlayerState() === 1;
                  callbacks.current.onPlay();
                  player.seekTo(time, true);
                  if (!wasPlaying) player.pauseVideo();
                  setPosition(time);
                }}
                className="min-w-0 flex-1 cursor-pointer accent-black"
              />
              <span className="shrink-0 tabular-nums">
                {formatTime(position)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
