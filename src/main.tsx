import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { i18nReady } from "./i18n";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("App root element was not found");

void i18nReady.then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
