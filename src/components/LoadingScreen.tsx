import { useEffect, useLayoutEffect, useRef, useState } from "react";

const messages = [
  "가스 벨브 잘 잠갔는지 확인 중",
  "신발 끈 묶는 중",
  "에어컨 꺼져 있는지 확인 중",
];

export default function LoadingScreen({
  ready,
  failed,
  onExitStart,
  onExited,
}: {
  ready: boolean;
  failed: boolean;
  onExitStart: () => void;
  onExited: () => void;
}) {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * messages.length),
  );
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");
  const messageRef = useRef<HTMLSpanElement>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (ready || failed || exiting) {
      setPhase("idle");
      return;
    }
    const timer = window.setInterval(() => {
      setPhase("exit");
    }, 2000);
    return () => window.clearInterval(timer);
  }, [ready, failed, exiting]);

  useLayoutEffect(() => {
    if (ready || failed || exiting) return;
    if (phase === "enter") {
      // Paint the new text below before transitioning it back into place.
      if (messageRef.current) void messageRef.current.offsetHeight;
      setPhase("idle");
      return;
    }
    if (phase !== "exit" || !messageRef.current) return;
    const duration = getComputedStyle(messageRef.current)
      .getPropertyValue("--text-swap-dur")
      .trim();
    const milliseconds = duration.endsWith("ms")
      ? Number.parseFloat(duration)
      : Number.parseFloat(duration) * 1000;
    const timer = window.setTimeout(
      () => {
        setMessageIndex((index) => (index + 1) % messages.length);
        setPhase("enter");
      },
      Number.isFinite(milliseconds) ? milliseconds : 150,
    );
    return () => window.clearTimeout(timer);
  }, [phase, ready, failed, exiting]);

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Give cached assets a painted loading screen before starting the reveal.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        setExiting(true);
        onExitStart();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [ready, onExitStart]);

  useEffect(() => {
    if (!exiting) return;
    // Also finish when a browser skips the transition event.
    const timer = window.setTimeout(onExited, 850);
    return () => window.clearTimeout(timer);
  }, [exiting, onExited]);

  return (
    <div
      className="loading-screen fixed inset-0 z-100 flex flex-col items-center justify-center gap-5 bg-white px-6 text-center text-black"
      data-exiting={exiting}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && exiting) onExited();
      }}
    >
      <span
        aria-hidden="true"
        className="loading-indicator size-2 rounded-full bg-black"
      />
      <p
        role="status"
        aria-live="polite"
        lang="ko"
        className="font-reading text-base leading-7"
      >
        {failed ? (
          "에셋을 불러오지 못했어요. 다시 시도해 주세요."
        ) : (
          <span
            ref={messageRef}
            className={`t-text-swap${phase === "exit" ? " is-exit" : phase === "enter" ? " is-enter-start" : ""}`}
          >
            {messages[messageIndex]}
          </span>
        )}
      </p>
      {failed && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-full border border-black/15 px-5 py-2 text-sm hover:bg-black/5"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
