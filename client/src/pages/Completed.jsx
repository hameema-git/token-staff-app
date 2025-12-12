import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

export default function Completed() {
  const [orders, setOrders] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  useEffect(() => {
    async function loadSessions() {
      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map(d => d.id.replace("session_", ""))
        .sort((a,b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

      setSessions(list);
      setSelectedSession(list[list.length - 1]);
    }
    loadSessions();
  }, []);

  useEffect(() => {
    if (!selectedSession) return;

    async function loadOrders() {
      const q = query(
        collection(db, "orders"),
        where("session_id", "==", selectedSession),
        where("status", "==", "completed"),
        orderBy("token", "asc")
      );
      const snap = await getDocs(q);
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    loadOrders();
  }, [selectedSession]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Completed Orders</h2>

      <select
        value={selectedSession}
        onChange={e => setSelectedSession(e.target.value)}
        style={{ padding: 8, marginBottom: 15 }}
      >
        {sessions.map(s => <option key={s}>{s}</option>)}
      </select>

      {orders.map(o => (
        <div key={o.id} style={{ padding: 10, background: "#111", marginBottom: 8, borderRadius: 8 }}>
          <b>Token #{o.token}</b><br />
          {o.customerName}<br />
          {o.items.map(i => `${i.quantity}×${i.name}`).join(", ")}<br />
          <span style={{ color: "lightgreen" }}>Completed</span>
        </div>
      ))}
    </div>
  );
}
