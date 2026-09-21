import { hydrateRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initEngine } from "@/lib/engine";

import "./styles.css";

initEngine();
const router = getRouter();

hydrateRoot(document, <RouterProvider router={router} />);
