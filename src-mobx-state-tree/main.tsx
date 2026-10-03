import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@shared/styles/global.css";
import App from "./App.tsx";

// MST protects its own trees: only actions can change them

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
