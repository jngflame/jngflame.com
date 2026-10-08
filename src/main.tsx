import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { i18nReady } from "./i18n";
import "./styles.css";

// WebKit feature support also matches other iOS browsers; identify Safari itself.
const userAgent = navigator.userAgent;
const isSafari =
  /Version\/[\d.]+.*Safari\//.test(userAgent) &&
  !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Opera|Android|SamsungBrowser/i.test(
    userAgent,
  );
document.documentElement.dataset.browser = isSafari ? "safari" : "other";
const isIOS =
  /iPhone|iPad|iPod/i.test(userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
document.documentElement.dataset.iosSafari = String(isSafari && isIOS);

const root = document.getElementById("root");
if (!root) throw new Error("App root element was not found");

void i18nReady.then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
