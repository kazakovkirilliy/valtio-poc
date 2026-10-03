import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@shared/styles/global.css";
import App from "./App.tsx";

// keystone protects its own trees: only `@modelAction`s can change them

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
