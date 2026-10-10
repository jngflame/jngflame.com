export const giveItUpVideoId = "uup-nmXhsHQ";

export interface MusicPlayback {
  getTime: () => number;
}

export interface YouTubePlayer {
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
}

interface PlayerEvent {
  target: YouTubePlayer;
  data: number;
}

interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: {
        autoplay: number;
        origin: string;
        playsinline: number;
        controls: number;
        disablekb: number;
        iv_load_policy: number;
        cc_load_policy: number;
      };
      events: {
        onReady: (event: PlayerEvent) => void;
        onStateChange: (event: PlayerEvent) => void;
        onError: (event: PlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeAPI> | undefined;

export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    const previousReady = window.onYouTubeIframeAPIReady;
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.onerror = null;
      window.onYouTubeIframeAPIReady = previousReady;
    };
    const fail = () => {
      cleanup();
      script.remove();
      apiPromise = undefined;
      reject(new Error("YouTube player could not be loaded"));
    };
    const timeout = window.setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}
