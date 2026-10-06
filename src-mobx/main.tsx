import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configure } from "mobx";
import "@shared/styles/global.css";
import App from "./App.tsx";

// every state change must go through an action
configure({ enforceActions: "always" });

// dev only: the import is removed from production builds, with everything it loads
if (import.meta.env.DEV) await import("./devtools.ts");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
