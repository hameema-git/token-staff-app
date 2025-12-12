import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

const ui = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 16,
    fontFamily: "'Segoe UI', Arial, sans-serif",
  },
  container: {
    maxWidth: 850,
    margin: "auto",
  },
  title: { fontSize: 24, fontWeight: 900, color: "#ffd166" },
  muted: { color: "#bfb39a", fontSize: 13 },
  sessionSelect: {
    width: "100%",
    padding: 10,
    marginTop: 6,
    background: "#111",
    color: "#ffd166",
    borderRadius: 8,
    border: "1px solid #333",
    fontSize: 16,
  },
  card: {
    background: "#111",
    padding: 14,
    borderRadius: 12,
    borderLeft: "6px solid #2ecc71",
    marginBottom: 12,
  },
  token: {
    fontSize: 22,
    fontWeight: 900,
    color: "#2ecc71",
  },
  items: { marginTop: 6, color: "#eee" },
  footer: { marginTop: 8, color: "#bfb39a", fontSize: 13 },
};

export default function Completed() {
  const [orders, setOrders] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  /* ---------------- Load Sessions ---------------- */
  useEffect(() => {
    async function loadSessions() {
      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map((d) => d.id.replace("session_", ""))
        .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

      setSessions(list);

      // Pick latest session
      const last = list[list.length - 1];
      setSelectedSession(last);
    }
    loadSessions();
  }, []);

  /* ---------------- Load Completed Orders ---------------- */
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

      const list = snap.docs.map((d) => {
        const data = d.data();

        // Normalize items array
        let items = [];
        if (Array.isArray(data.items)) items = data.items;
        else if (data.items && typeof data.items === "object")
          items = Object.values(data.items);

        return { id: d.id, ...data, items };
      });

      setOrders(list);
    }

    loadOrders();
  }, [selectedSession]);

  function formatTime(ts) {
    try {
      return ts?.toDate().toLocaleString() || "-";
    } catch {
      return "-";
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.container}>
        <h1 style={ui.title}>Completed Orders</h1>
        <div style={ui.muted}>Served & finalized orders</div>

        {/* Session Dropdown */}
        <div style={{ marginTop: 16 }}>
          <div style={ui.muted}>Select Session</div>
          <select
            style={ui.sessionSelect}
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Orders */}
        <div style={{ marginTop: 20 }}>
          {orders.length === 0 && (
            <div style={{ color: "#777", textAlign: "center", marginTop: 20 }}>
              No completed orders in this session.
            </div>
          )}

          {orders.map((o) => (
            <div key={o.id} style={ui.card}>
              <div style={ui.token}>Token #{o.token}</div>

              <div style={{ fontWeight: 800, marginTop: 6 }}>
                {o.customerName}
              </div>
              <div style={ui.muted}>{o.phone}</div>

              <div style={ui.items}>
                {o.items?.map((i) => `${i.quantity}×${i.name}`).join(", ")}
              </div>

              <div style={{ marginTop: 6, color: "#ffd166", fontWeight: 700 }}>
                Amount: ₹{Number(o.total || 0).toFixed(2)}
              </div>

              <div style={ui.footer}>
                Completed At: {formatTime(o.completedAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
