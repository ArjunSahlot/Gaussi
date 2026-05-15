import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";

import { MantineProvider, createTheme } from "@mantine/core";
import { createRoot } from "react-dom/client";

import { Analytics } from "@vercel/analytics/react";

import App from "./App";
import "./styles.css";

const theme = createTheme({
  primaryColor: "green",
  defaultRadius: "sm",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  components: {
    ActionIcon: { defaultProps: { radius: "sm" } },
    Button: { defaultProps: { radius: "sm" } },
    Paper: { defaultProps: { radius: "sm" } }
  }
});

createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="dark" theme={theme}>
    <App />
    <Analytics />
  </MantineProvider>
);
