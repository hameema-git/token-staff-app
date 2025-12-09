import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import { query, collection, where, orderBy, limit, getDocs, doc, getDoc, onSnapshot } from "firebase/firestore";
import { Link } from "wouter";


export default function TokenStatus() {
  const params = new URLSearchParams(window.location.search);
  const initialPhone = params.get("phone") || localStorage.getItem("myPhone") || "";
  const [phone, setPhone] = useState(initialPhone);
  // const [session] = useState(new Date().toISOString().slice(0, 10));
  const [session] = useState(localStorage.getItem("session") || "Session 1");

  const [orderInfo, setOrderInfo] = useState(null);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  async function fetchMyToken(p) {
    if (!p) return setOrderInfo(null);
    setLoading(true);
    const q = query(collection(db, "orders"), where("phone", "==", String(p)), where("session_id", "==", session), orderBy("createdAt", "desc"), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) setOrderInfo(null);
    else setOrderInfo({ id: snap.docs[0].id, ...snap.docs[0].data() });
    setLoading(false);
  }

  useEffect(() => {
    fetchMyToken(phone);
    const tokenDoc = doc(db, "tokens", "session_" + session);
    const unsub = onSnapshot(tokenDoc, snap => {
      if (!snap.exists()) { setCurrent(0); return; }
      setCurrent(snap.data().currentToken || 0);
    }, err => console.error(err));
    return () => unsub();
  }, [phone, session]);

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: "auto" }}>
      <h1>My Token</h1>

      <div style={{ marginBottom: 12 }}>
        <input placeholder="Enter phone" value={phone} onChange={e => setPhone(e.target.value)} />
        <button onClick={() => { localStorage.setItem("myPhone", phone); fetchMyToken(phone); }}>Find</button>
      </div>

      {loading && <div>Loading…</div>}

      {!loading && (
        <div>
          <div>Now Serving: #{current}</div>
          <div style={{ marginTop: 8 }}>
            Token: {orderInfo ? (orderInfo.token ?? "Waiting for approval") : "-"}
          </div>
          <div>Status: {orderInfo ? orderInfo.status : "-"}</div>
          <div>
            Position: {orderInfo && orderInfo.token ? Math.max(0, orderInfo.token - current) : "-"}
          </div>
           {/* ⭐ Add this button here */}
    <Link href="/">
      <button style={{ marginTop: 20 }}>Place Another Order</button>
    </Link>

    <button
  onClick={() => {
    const ph = localStorage.getItem("myPhone");
    if (ph) setLocation(`/mytoken?phone=${ph}`);
  }}
  style={{ marginTop: 10 }}
>
  Refresh My Status
</button>
        </div>
      )}
    </div>
  );
}
