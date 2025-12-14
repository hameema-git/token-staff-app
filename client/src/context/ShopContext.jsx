import React from "react";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
// import { db } from "../firebase";
import { db } from "../firebaseInit";


const ShopContext = createContext();

export const ShopProvider = ({ children }) => {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "settings", "shop");

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setShop(snap.data());
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
