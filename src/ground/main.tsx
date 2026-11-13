import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, getThemeMode } from "../ui/ui";
import { Ground } from "./Ground";
import "../styles.css";
import "./ground.css";

applyTheme(getThemeMode());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Ground />
  </StrictMode>,
);
