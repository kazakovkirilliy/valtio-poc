import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configure } from "mobx";
import "./styles/global.css";
import App from "./App.tsx";

// every state change must go through an action
configure({ enforceActions: "always" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
