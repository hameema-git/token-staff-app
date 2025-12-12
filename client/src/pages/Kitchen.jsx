// client/src/pages/Kitchen.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { db, serverTimestamp } from "../firebaseInit";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  getDocs
} from "firebase/firestore";

/* ---------------- STYLES ---------------- */
const base = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 16 },
  container: { maxWidth: 1100, margin: "auto" },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16
  },

  title: { fontSize: 24, fontWeight: 900, color: "#ffd166" },
  subtitle: { fontSize: 13, color: "#bfb39a" },

  sessionSelect: {
    padding: 10,
    borderRadius: 8,
    background: "#0f0f0f",
    color: "#fff",
    border: "1px solid #222"
  },

  card: {
    background: "#111",
    padding: 16,
    borderRadius: 12,
    borderLeft: "6px solid #ffd166",
    marginBottom: 14
  },

  btn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 800
  },

  cookingBtn: { background: "#ffb86b", color: "#111" },
  finishBtn: { background: "#2ecc71", color: "#01110b" },

  logoutBtn: { background: "#333", color: "#ffd166" }
};

/* --------------------------------------------------------
   KITCHEN PAGE — NO AUTH REQUIRED
-------------------------------------------------------- */
export default function Kitchen() {
  const [, navigate] = useLocation();

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  const [orders, setOrders] = useState([]);
  const unsubRef = useRef(null);

  /* --------------------------------------------------------
     Load session list
  -------------------------------------------------------- */
  async function loadSessions() {
    const snap = await getDocs(collection(db, "tokens"));
    const list = snap.docs
      .map((d) => d.id.replace("session_", ""))
      .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

    setSessions(list);
    if (!selectedSession && list.length) setSelectedSession(list[0]);
  }

  useEffect(() => {
    loadSessions();
  }, []);

  /* --------------------------------------------------------
     Subscribe to PAID + COOKING orders only
  -------------------------------------------------------- */
  useEffect(() => {
    if (!selectedSession) return;

    // cleanup previous
    if (unsubRef.current) unsubRef.current();

    const q = query(
      collection(db, "orders"),
      where("session_id", "==", selectedSession),
      where("status", "in", ["paid", "cooking"]),
      orderBy("token", "asc")
    );

    unsubRef.current = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });

    return () => unsubRef.current && unsubRef.current();
  }, [selectedSession]);

  /* --------------------------------------------------------
     ACTIONS
  -------------------------------------------------------- */
  async function startCooking(orderId) {
    await updateDoc(doc(db, "orders", orderId), {
      status: "cooking",
      cookingAt: serverTimestamp()
    });
  }

  async function finishOrder(orderId) {
    await updateDoc(doc(db, "orders", orderId), {
      status: "completed",
      completedAt: serverTimestamp()
    });
  }

  /* --------------------------------------------------------
     RENDER
  -------------------------------------------------------- */
  return (
    <div style={base.page}>
      <div style={base.container}>
        {/* HEADER */}
        <div style={base.headerRow}>
          <div>
            <div style={base.title}>Kitchen Dashboard</div>
            <div style={base.subtitle}>Prepare orders in sequence</div>
          </div>

          <div>
            <button
              style={{ ...base.btn, ...base.logoutBtn }}
              onClick={() => navigate("/staff")}
            >
              Back to Staff
            </button>
          </div>
        </div>

        {/* SESSION SELECT */}
        <div style={{ marginBottom: 16 }}>
          <div style={base.subtitle}>Session</div>
          <select
            style={base.sessionSelect}
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

        <h3 style={{ marginBottom: 10 }}>Orders To Prepare</h3>

        {orders.length === 0 && (
          <div style={{ color: "#777" }}>No paid orders yet</div>
        )}

        {orders.map((o) => (
          <div key={o.id} style={base.card}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>
              Token #{o.token}
            </div>

            <div style={{ marginTop: 6, color: "#ccc" }}>
              {o.customerName} — {o.phone}
            </div>

            <div style={{ marginTop: 6, color: "#eee" }}>
              {o.items?.map((i) => `${i.quantity}×${i.name}`).join(", ")}
            </div>

            <div style={{ marginTop: 8, color: "#ffd166", fontWeight: 900 }}>
              Amount: ₹{Number(o.total || 0).toFixed(2)}
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ marginTop: 12 }}>
              {o.status === "paid" && (
                <button
                  onClick={() => startCooking(o.id)}
                  style={{ ...base.btn, ...base.cookingBtn, marginRight: 8 }}
                >
                  Start Cooking
                </button>
              )}

              {o.status === "cooking" && (
                <button
                  onClick={() => finishOrder(o.id)}
                  style={{ ...base.btn, ...base.finishBtn }}
                >
                  Finish & Deliver
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
