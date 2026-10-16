import { createRoot } from "react-dom/client";
import "@fontsource/big-shoulders-display/latin-800";
import "@fontsource/big-shoulders-display/latin-ext-800";
import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/big-shoulders-display/latin-ext-900";
import "@fontsource/onest/latin-400";
import "@fontsource/onest/latin-ext-400";
import "@fontsource/onest/latin-600";
import "@fontsource/onest/latin-ext-600";
import "@fontsource/onest/latin-700";
import "@fontsource/onest/latin-ext-700";
import "@fontsource/sedgwick-ave/latin-400";
import "@fontsource/sedgwick-ave/latin-ext-400";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
