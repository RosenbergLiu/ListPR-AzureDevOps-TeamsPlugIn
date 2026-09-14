import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

// The MSAL popup/hidden iframe must finish its callback without restoring the app again.
const isAuthCallback = /(?:^|[&#])(code|error|id_token)=/.test(window.location.hash);
if (!isAuthCallback) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
