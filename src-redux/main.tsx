import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "@shared/styles/global.css";
import App from "./App.tsx";
import { app } from "./stores/app.ts";

// dev only: the import is removed from production builds, with everything it loads
if (import.meta.env.DEV) await import("./devtools.ts");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={app.store}>
      <App />
    </Provider>
  </StrictMode>,
);
