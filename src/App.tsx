import LiquidGlass from "liquid-glass-react";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { isLinkNavigation, Link, linkStyle } from "./components/Link";
import LoadingScreen from "./components/LoadingScreen";
import { type HeroModel, heroModels } from "./data/heroModels";
import { inventory } from "./data/inventory";
import { supportedLanguages } from "./i18n";
import type { MusicPlayback } from "./lib/youtube";
import { ArticleDetail } from "./pages/article_datail";

const AvatarModel = lazy(() => import("./components/AvatarModel"));
const HeroMusicPlayer = lazy(() => import("./components/HeroMusicPlayer"));
const CloudSky = lazy(() =>
  import("./components/CloudSky").then((module) => ({
    default: module.CloudSky,
  })),
);
type HeroBackground = "clouds" | "windows-xp";

type Page = "index" | "articles" | "inventory" | "detail" | "missing";
const asset = (name: string) => `/${name}`;
const articlePath = "/articles/egypt-to-jordan";
const pagePaths = {
  index: "/",
  articles: "/articles",
  inventory: "/inventory",
};

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getPage(path: string): Page {
  if (path === "/" || path === "/index") return "index";
  if (path === "/articles" || path === "/article") return "articles";
  if (path === "/inventory") return "inventory";
  if (path === articlePath) return "detail";
  return "missing";
}

function Divider({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={compact ? "mx-1 overflow-hidden" : "overflow-hidden"}
    >
      <div className="flex w-max">
        <img
          src={asset(compact ? "a719a.svg" : "b22d1.svg")}
          alt=""
          width={compact ? 354 : 362}
          height={4}
          className="max-w-none"
        />
        <img
          src={asset(compact ? "a719a.svg" : "b22d1.svg")}
          alt=""
          width={compact ? 354 : 362}
          height={4}
          className="max-w-none"
        />
      </div>
    </div>
  );
}

function Footer({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <footer className="mx-auto w-full max-w-170 px-5 pb-18">
      <Divider compact={compact} />
      <div className="mt-9.5 flex items-center justify-between gap-4 font-orbiter text-black/40">
        <div className="flex gap-7">
          <a
            href="https://github.com/jngflame"
            target="_blank"
            rel="noreferrer"
            className={`underline underline-offset-2 ${linkStyle}`}
          >
            github
          </a>
          <a
            href="mailto:jngflame@gmail.com"
            className={`underline underline-offset-2 ${linkStyle}`}
          >
            {t("footer.email")}
          </a>
        </div>
        <p className="text-sm">2026 © jngflame</p>
      </div>
    </footer>
  );
}

function Navigation({ page }: { page: Page }) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("navigation.label")}
      className="site-navigation sticky top-0 z-20 bg-white"
    >
      <div className="mx-auto flex max-w-170 font-orbiter">
        <div className="px-5 py-2.5 flex-1">
          <Link
            key={"index"}
            href={`${pagePaths.index}#content`}
            aria-current={page === "index" ? "page" : undefined}
            className={`${linkStyle} ${page === "index" ? "text-black" : "text-black/30"}`}
          >
            {t(`navigation.index`)}
          </Link>
        </div>

        <div className="py-2.5 flex-1 text-center">
          <Link
            key={"articles"}
            href={`${pagePaths.articles}#content`}
            aria-current={page === "articles" ? "page" : undefined}
            className={`${linkStyle} ${page === "articles" ? "text-black" : "text-black/30"}`}
          >
            {t(`navigation.articles`)}
          </Link>
        </div>
        <div className="px-5 py-2.5 flex-1 text-right">
          <Link
            key={"inventory"}
            href={`${pagePaths.inventory}#content`}
            aria-current={page === "inventory" ? "page" : undefined}
            className={`${linkStyle} ${page === "inventory" ? "text-black" : "text-black/30"}`}
          >
            {t(`navigation.inventory`)}
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroTool({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`hero-tool pointer-events-auto relative ${wide ? "hero-tool-language" : ""}`}
    >
      <LiquidGlass
        displacementScale={32}
        blurAmount={0.1}
        saturation={140}
        aberrationIntensity={1.5}
        elasticity={0.4}
        cornerRadius={100}
        padding="0"
        style={{ position: "absolute", top: "50%", left: "50%" }}
      >
        <div
          className={`relative flex h-10 items-center justify-center ${wide ? "w-18" : "w-10.5"}`}
        >
          {children}
        </div>
      </LiquidGlass>
    </div>
  );
}

function Hero({
  revealStarted,
  onLoaded,
  onError,
}: {
  revealStarted: boolean;
  onLoaded: (ready: boolean) => void;
  onError: (failed: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [background, setBackground] = useState<HeroBackground>(() =>
    Math.random() < 0.5 ? "clouds" : "windows-xp",
  );
  const [model, setModel] = useState<HeroModel>(
    () => heroModels[Math.floor(Math.random() * heroModels.length)],
  );
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    const previousColor = style.getPropertyValue("--hero-edge-color");
    style.setProperty(
      "--hero-edge-color",
      background === "clouds" ? "#144895" : "#3f82fd",
    );
    return () => {
      if (previousColor) style.setProperty("--hero-edge-color", previousColor);
      else style.removeProperty("--hero-edge-color");
    };
  }, [background]);
  const [musicActive, setMusicActive] = useState(false);
  const musicClock = useRef<MusicPlayback | null>(null);
  const [animations, setAnimations] = useState<string[]>([]);
  const [animation, setAnimation] = useState("idle");
  const [animationStartTime, setAnimationStartTime] = useState(0);
  const introStarted = useRef(false);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [motionRequested, setMotionRequested] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const handleBackgroundReady = useCallback(() => setBackgroundReady(true), []);
  const handleError = useCallback(() => onError(true), [onError]);
  useEffect(() => {
    onLoaded(modelReady && backgroundReady);
  }, [modelReady, backgroundReady, onLoaded]);
  useEffect(() => {
    if (!revealStarted || !modelReady || introStarted.current) return;
    introStarted.current = true;
    if (!animations.includes("jump_down")) return;
    setAnimationStartTime(1.2);
    setAnimation("jump_down");
    setReplayKey((value) => value + 1.2);
  }, [revealStarted, modelReady, animations]);
  const animationLabels: Record<string, string> = t("hero.animations", {
    returnObjects: true,
  });
  const animationLabel = (name: string) => {
    const variant = name.match(/^(.*)_(\d+)$/);
    const base = variant?.[1] ?? name;
    const label = animationLabels[base] ?? base.replaceAll("_", " ");
    return variant
      ? t("hero.animationVariant", { name: label, number: Number(variant[2]) })
      : label;
  };
  const animationOptions = animations
    .map((name) => ({ name, label: animationLabel(name) }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return (
    <section
      aria-label={t("hero.label")}
      className="hero relative isolate overflow-hidden"
    >
      {background === "clouds" ? (
        <Suspense fallback={null}>
          <CloudSky onReady={handleBackgroundReady} />
        </Suspense>
      ) : (
        <img
          src="/wallpaper/windows-xp.jpg"
          onLoad={async (event) => {
            const image = event.currentTarget;
            try {
              await image.decode();
              handleBackgroundReady();
            } catch {
              handleError();
            }
          }}
          onError={handleError}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}
      <div className="hero-scene pointer-events-none absolute top-1/2 left-1/2 max-w-full -translate-x-1/2 -translate-y-1/2 mix-blend-multiply" />
      <div className="hero-scene pointer-events-none absolute top-1/2 left-1/2 max-w-full -translate-x-1/2 -translate-y-1/2">
        <Suspense
          fallback={
            <p
              role="status"
              className="absolute inset-x-0 top-1/2 text-center text-sm text-white/80"
            >
              {t("hero.modelLoading")}
            </p>
          }
        >
          <AvatarModel
            modelUrl={asset(`glb/${model}`)}
            animation={animation}
            animationStartTime={animationStartTime}
            playing={playing && revealStarted}
            motionRequested={motionRequested}
            replayKey={replayKey}
            musicClock={musicActive ? musicClock : null}
            onAnimationsChange={setAnimations}
            onReadyChange={setModelReady}
            onError={handleError}
            onAnimationChange={setAnimation}
          />
        </Suspense>
      </div>
      <div aria-hidden="true" className="hero-top-blur">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="hero-controls pointer-events-none absolute inset-x-0 top-8 z-20 mx-auto flex max-w-170 items-start justify-between px-5">
        <HeroTool wide>
          <label htmlFor="language" className="sr-only">
            {t("hero.language")}
          </label>
          <select
            id="language"
            value={i18n.resolvedLanguage ?? "en"}
            onChange={(event) => {
              void i18n.changeLanguage(event.target.value);
            }}
            className="size-full cursor-pointer appearance-none rounded-full bg-transparent py-2 pr-9 pl-3.5 font-sans text-base leading-6 text-black/80"
          >
            {supportedLanguages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <img
            src={asset("bd72e.svg")}
            alt=""
            width={14}
            height={14}
            className="pointer-events-none absolute right-3.5"
          />
        </HeroTool>
        <div className="relative flex flex-col gap-4">
          <HeroTool>
            <select
              id="animation"
              aria-label={t("hero.animationControls")}
              value=""
              disabled={!modelReady}
              onChange={(event) => {
                setMusicActive(event.target.value === "give_it_up");
                setAnimationStartTime(0);
                setAnimation(event.target.value);
                setPlaying(true);
                setMotionRequested(true);
                setReplayKey((value) => value + 1);
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            >
              <option value="" disabled>
                {t("hero.animationControls")}
              </option>
              {animationOptions.map(({ name, label }) => (
                <option key={name} value={name}>
                  {label}
                </option>
              ))}
            </select>
            <img
              src={asset("d1dae.svg")}
              alt=""
              width={24}
              height={24}
              className="pointer-events-none"
            />
          </HeroTool>
          <HeroTool>
            <select
              aria-label={t("hero.modelControls")}
              value={model}
              onChange={(event) => {
                if (event.target.value === model) return;
                setModelReady(false);
                setAnimations([]);
                setAnimationStartTime(0);
                setAnimation(
                  musicActive && animation === "give_it_up"
                    ? "give_it_up"
                    : "idle",
                );
                setModel(event.target.value as HeroModel);
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            >
              {heroModels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <img
              src={asset("0c976.svg")}
              alt=""
              width={24}
              height={24}
              className="pointer-events-none"
            />
          </HeroTool>
          <HeroTool>
            <select
              aria-label={t("hero.backgroundControls")}
              value={background}
              onChange={(event) => {
                setBackgroundReady(false);
                setBackground(event.target.value as HeroBackground);
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            >
              <option value="clouds">{t("hero.backgroundClouds")}</option>
              <option value="windows-xp">Windows XP</option>
            </select>
            <img
              src={asset("70920.svg")}
              alt=""
              width={24}
              height={24}
              className="pointer-events-none"
            />
          </HeroTool>
        </div>
      </div>
      {musicActive && (
        <Suspense fallback={null}>
          <HeroMusicPlayer
            clock={musicClock}
            replayKey={replayKey}
            onPlay={() => {
              setAnimation("give_it_up");
              setAnimationStartTime(0);
              setPlaying(true);
              setMotionRequested(true);
            }}
            onEnded={() => setAnimation("idle")}
            onClose={() => {
              setMusicActive(false);
              setAnimation("idle");
            }}
          />
        </Suspense>
      )}
    </section>
  );
}

function IndexPage() {
  const { t } = useTranslation();
  return (
    <main
      id="content"
      className="mx-auto w-full max-w-170 scroll-mt-11 px-5 pt-24 text-center"
    >
      <h1 className="text-profile leading-15 font-semibold sm:text-5xl">
        {t("profile.name")}
      </h1>
      <p className="leading-6">A.K.A @jngflame</p>
      <img
        id="profile-photo"
        src={asset("214e3.png")}
        alt={t("profile.photoAlt")}
        width={362}
        height={235}
        className="mt-10 aspect-362/235 w-full scroll-mt-16 rounded-5 object-cover"
      />
      <p className="mt-11.5 leading-6 uppercase">
        {t("profile.tagline.first")}
        <br />
        {t("profile.tagline.second")}
      </p>
      <div className="mt-13">
        <Divider />
      </div>
      <div className="mt-14.5 flex flex-col gap-13">
        <section aria-labelledby="itinerary">
          <h2 id="itinerary" className="text-xl leading-7.5 font-semibold">
            {t("profile.itinerary")}
          </h2>
          <p className="mt-2 leading-6">KATUSA (2026-2027)</p>
          <p className="mt-2 leading-6">
            <a
              href="https://horang.it/"
              target="_blank"
              rel="noreferrer"
              className={linkStyle}
            >
              horang.it
            </a>{" "}
            (2024-2026)
          </p>
        </section>
        <section aria-labelledby="contributes">
          <h2 id="contributes" className="text-xl leading-7.5 font-semibold">
            {t("profile.contributes")}
          </h2>
          <p className="mt-2 leading-6">
            <a
              href="https://apps.apple.com/us/app/%EB%94%EB%AF%B8%ED%8E%98%EC%9D%B4/id1642292289"
              target="_blank"
              rel="noreferrer"
              className={linkStyle}
            >
              dimipay
            </a>{" "}
            (2022-2024)
          </p>
        </section>
        <section aria-labelledby="education">
          <h2 id="education" className="text-xl leading-7.5 font-semibold">
            {t("profile.education")}
          </h2>
          <p className="mt-2 leading-6">{t("profile.university")} (2024-)</p>
          <p className="mt-2 leading-6">
            {t("profile.highSchool")} (2021-2024)
          </p>
        </section>
      </div>
      <div className="h-14.5" />
    </main>
  );
}

function ArticlePage() {
  const { t } = useTranslation();
  return (
    <main
      id="content"
      aria-label={t("navigation.articles")}
      className="mx-auto w-full max-w-170 scroll-mt-11 px-5 pt-11.5 pb-9.5 font-orbiter"
    >
      <ol lang="ko" className="flex flex-col gap-5">
        <li>
          <Link
            href={articlePath}
            className={`flex items-baseline gap-3 leading-6 ${linkStyle}`}
          >
            <span className="text-black/30">2026</span>
            <span className="min-w-0 flex-1 font-reading text-black/80">
              이집트에서 요르단으로
            </span>
            <time dateTime="2026-10-04" className="text-black/30">
              10.04
            </time>
          </Link>
        </li>
        <li className="flex items-baseline gap-3 leading-6">
          <span aria-hidden="true" className="invisible">
            2026
          </span>
          <span className="min-w-0 flex-1 font-reading text-black/80">
            보드 우승
          </span>
          <time dateTime="2026-10-04" className="text-black/30">
            10.04
          </time>
        </li>
        <li className="flex items-baseline gap-3 leading-6">
          <span aria-hidden="true" className="invisible">
            2026
          </span>
          <span className="min-w-0 flex-1 font-reading text-black/80">
            이집트에서 요르단으로
          </span>
          <time dateTime="2026-02-28" className="text-black/30">
            02.28
          </time>
        </li>
      </ol>
    </main>
  );
}

function InventoryPage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<(typeof inventory)[number] | null>(
    null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  return (
    <main
      id="content"
      aria-label={t("navigation.inventory")}
      className="mx-auto w-full max-w-100.5 scroll-mt-11 px-5"
    >
      <div className="inventory-collage relative overflow-hidden">
        {inventory.map((item) => (
          <button
            key={item.node}
            type="button"
            aria-label={t("inventory.enlarge", {
              name: t(`inventory.items.${item.labelKey}`),
            })}
            data-node-id={item.node}
            onClick={() => setSelected(item)}
            className="inventory-item absolute flex cursor-zoom-in items-center justify-center focus-visible:z-10"
            style={{
              left: `${(item.x / 402) * 100}%`,
              top: `${(item.y / 1431) * 100}%`,
              width: `${(item.width / 402) * 100}%`,
              height: `${(item.height / 1431) * 100}%`,
            }}
          >
            <img
              src={asset(item.file)}
              alt={t(`inventory.items.${item.labelKey}`)}
              loading="lazy"
              className="max-w-none object-cover"
              style={{
                width: `${((item.innerWidth ?? item.width) / item.width) * 100}%`,
                height: `${((item.innerHeight ?? item.height) / item.height) * 100}%`,
                transform: `rotate(${item.rotate ?? 0}deg)`,
                boxShadow: item.shadow
                  ? "-0.125rem 0.25rem 0.5rem rgb(0 0 0 / 0.5)"
                  : undefined,
              }}
            />
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        aria-label={
          selected
            ? t(`inventory.items.${selected.labelKey}`)
            : t("inventory.image")
        }
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") dialog.current?.close();
        }}
        className="inventory-dialog m-auto max-h-11/12 w-11/12 max-w-200 rounded-5 bg-white p-5 backdrop:bg-black/60"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <p>{selected ? t(`inventory.items.${selected.labelKey}`) : null}</p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className={`cursor-pointer px-2 py-1 ${linkStyle}`}
          >
            {t("inventory.close")}
          </button>
        </div>
        {selected && (
          <img
            src={asset(selected.file)}
            alt={t(`inventory.items.${selected.labelKey}`)}
            className="mx-auto max-h-160 max-w-full object-contain"
          />
        )}
      </dialog>
    </main>
  );
}

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsFailed, setAssetsFailed] = useState(false);
  const [revealStarted, setRevealStarted] = useState(false);
  const [loadingFinished, setLoadingFinished] = useState(false);
  const startReveal = useCallback(() => setRevealStarted(true), []);
  const finishLoading = useCallback(() => setLoadingFinished(true), []);
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const path = useSyncExternalStore(
    subscribe,
    () => window.location.pathname.replace(/\/$/, "") || "/",
  );
  const page = getPage(path);
  const previousPath = useRef(path);
  const isDetail = page === "detail" || page === "missing";
  useLayoutEffect(() => {
    document.documentElement.dataset.page = page;
    return () => {
      delete document.documentElement.dataset.page;
    };
  }, [page]);
  useEffect(() => {
    document.documentElement.lang = language;
    const titles = {
      index: t("profile.name"),
      articles: t("navigation.articles"),
      inventory: t("navigation.inventory"),
      detail: "이집트에서 요르단으로",
      missing: t("missing.title"),
    };
    document.title = `${titles[page]} — jngflame`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        `${t("profile.name")} — ${t("profile.tagline.first")} ${t("profile.tagline.second")}`,
      );
  }, [page, language, t]);
  useLayoutEffect(() => {
    if (isLinkNavigation) {
      previousPath.current = path;
      return;
    }
    if (previousPath.current !== path) {
      previousPath.current = path;
      if (!window.location.hash) window.scrollTo(0, 0);
    }
    if (window.location.hash)
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [path]);
  return (
    <>
      {!isDetail && !loadingFinished && (
        <LoadingScreen
          ready={assetsLoaded}
          failed={assetsFailed}
          onExitStart={startReveal}
          onExited={finishLoading}
        />
      )}
      <div
        inert={!isDetail && !loadingFinished}
        aria-busy={!isDetail && !loadingFinished}
        className="min-h-dvh bg-white text-black"
      >
        <a
          href="#content"
          className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("navigation.skipToContent")}
        </a>
        {!isDetail && (
          <Hero
            revealStarted={revealStarted}
            onLoaded={setAssetsLoaded}
            onError={setAssetsFailed}
          />
        )}
        {!isDetail && <Navigation page={page} />}
        {page === "index" && <IndexPage />}
        {page === "articles" && <ArticlePage />}
        {page === "inventory" && <InventoryPage />}
        {page === "detail" && <ArticleDetail />}
        {page === "missing" && (
          <main id="content" className="mx-auto max-w-170 px-5 py-20">
            <h1 className="text-2xl">{t("missing.title")}</h1>
            <Link href="/" className="mt-6 inline-block underline">
              {t("missing.backToIndex")}
            </Link>
          </main>
        )}
        <Footer compact={page === "articles" || page === "detail"} />
      </div>
    </>
  );
}

export default App;
