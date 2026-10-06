import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@shared/styles/global.css";
import App from "./App.tsx";

// keystone protects its own trees: only `@modelAction`s can change them

// dev only: the import is removed from production builds, with everything it loads
if (import.meta.env.DEV) await import("./devtools.ts");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
