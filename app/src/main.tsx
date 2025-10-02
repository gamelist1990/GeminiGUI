import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Suppress React DevTools download suggestion
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true };
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
