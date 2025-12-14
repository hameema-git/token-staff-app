// client/src/main.jsx
import React from "react";
import "./index.css";

import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ShopProvider } from "./context/ShopContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ShopProvider>
      <App />
    </ShopProvider>
  </React.StrictMode>
);
