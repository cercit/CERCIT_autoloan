import { hydrateRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

import "./styles.css";

const router = getRouter();

hydrateRoot(document, <RouterProvider router={router} />);
