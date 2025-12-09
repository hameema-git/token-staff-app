import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import { collection, query, where, limit, orderBy, getDocs, doc, onSnapshot } from "firebase/firestore";

export default function MyToken() {
  const params = new URLSearchParams(window.location.search);
  const phone = params.get("phone") || "";

  const [orderInfo, setOrderInfo] = useState(null);
  const [current, setCurrent] = useState(0);
  const session = new Date().toISOString().slice(0, 10);

  async function loadMyOrder() {
    if (!phone) return;

    const q = query(
      collection(db, "orders"),
      where("phone", "==", phone),
      where("session_id", "==", session),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      setOrderInfo({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }
  }

  useEffect(() => {
    loadMyOrder();

    const tokenDoc = doc(db, "tokens", "session_" + session);
    const unsub = onSnapshot(tokenDoc, (snap) => {
      setCurrent(snap.exists() ? snap.data().currentToken : 0);
    });

    return () => unsub();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Your Token Status</h2>
      <p>Phone: <b>{phone}</b></p>

      <div>
        <p><b>Now Serving:</b> {current}</p>
        <p>
          <b>Your Token:</b>{" "}
          {orderInfo ? orderInfo.token ?? "Waiting for approval" : "-"}
        </p>
        <p>
          <b>Status:</b>{" "}
          {orderInfo ? orderInfo.status : "-"}
        </p>
      </div>
    </div>
  );
}
