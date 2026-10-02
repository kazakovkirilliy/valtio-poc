import "zod/compile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "../src-shared/components/Editor.tsx";
import { zustandBindings } from "./stores/bindings.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Editor kind="zustand" bindings={zustandBindings} /></StrictMode>,
);
