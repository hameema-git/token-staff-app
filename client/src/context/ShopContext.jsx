// client/src/context/ShopContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseInit";

const ShopContext = createContext();

export const ShopProvider = ({ children }) => {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "settings", "shop");

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setShop(data);

        /* ✅ APPLY THEME VARIABLES */
        const theme = data.theme || {};

        document.documentElement.style.setProperty(
          "--bg",
          theme.background || "#0b0b0b"
        );
        document.documentElement.style.setProperty(
          "--primary",
          theme.primary || "#ffd166"
        );
        document.documentElement.style.setProperty(
          "--text",
          theme.text || "#f6e8c1"
        );
        document.documentElement.style.setProperty(
          "--secondary",
          "#111"
        );
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <ShopContext.Provider value={{ shop, loading }}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => useContext(ShopContext);
