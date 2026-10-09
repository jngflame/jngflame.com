import { useEffect, useState } from "react";

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
  const [message] = useState(
    () => messages[Math.floor(Math.random() * messages.length)],
  );
  const [exiting, setExiting] = useState(false);

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
        {failed ? "에셋을 불러오지 못했어요. 다시 시도해 주세요." : message}
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
