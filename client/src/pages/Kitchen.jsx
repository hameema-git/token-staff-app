// client/src/pages/Kitchen.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { auth, db } from "../firebaseInit";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs
} from "firebase/firestore";

const styles = {
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
    padding: 8,
    borderRadius: 8,
    background: "#0f0f0f",
    border: "1px solid #222",
    color: "#fff"
  },

  card: {
    background: "#111",
    padding: 16,
    borderRadius: 12,
    borderLeft: "6px solid #ffd166",
    marginBottom: 12,
    transition: "0.2s"
  },

  btn: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 800
  },

  startBtn: { background: "#ffb86b", color: "#111", marginRight: 8 },
  finishBtn: { background: "#2ecc71", color: "#01110b", marginRight: 8 },
  logoutBtn: { background: "#333", color: "#ffd166" }
};

export default function Kitchen() {
  const [, navigate] = useLocation();

  const [staffName, setStaffName] = useState("");

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  const [orders, setOrders] = useState([]);
  const unsubRef = useRef(null);

  /* -------------------------
     AUTH
  --------------------------*/
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return navigate("/staff-login");
      setStaffName(user.email || "kitchen");
    });
    return () => unsub();
  }, []);

  /* -------------------------
     Load Sessions
     → DEFAULT: latest (Session X)
  --------------------------*/
  async function loadSessions() {
    const snap = await getDocs(collection(db, "tokens"));

    const list = snap.docs
      .map((d) => d.id.replace("session_", ""))
      .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

    setSessions(list);

    if (!selectedSession && list.length) {
      const latest = list[list.length - 1]; // pick latest session
      setSelectedSession(latest);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  /* -------------------------
     Subscribe to PAID + COOKING orders
  --------------------------*/
  useEffect(() => {
    if (!selectedSession) return;

    unsubRef.current && unsubRef.current();

    const q = query(
      collection(db, "orders"),
      where("session_id", "==", selectedSession),
      where("status", "in", ["paid", "cooking"]),
      orderBy("token", "asc")
    );

    unsubRef.current = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();

        // FIX: items stored as object → convert to array
        const items = Array.isArray(data.items)
          ? data.items
          : typeof data.items === "object"
          ? Object.values(data.items)
          : [];

        return { id: d.id, ...data, items };
      });

      setOrders(list);
    });

    return () => unsubRef.current && unsubRef.current();
  }, [selectedSession]);

  /* -------------------------
     ACTIONS
  --------------------------*/
  async function markCooking(id) {
    await updateDoc(doc(db, "orders", id), {
      status: "cooking",
      cookingAt: serverTimestamp()
    });
  }

  async function markCompleted(id) {
    await updateDoc(doc(db, "orders", id), {
      status: "completed",
      completedAt: serverTimestamp()
    });
  }

  async function logout() {
    await signOut(auth);
    navigate("/staff-login");
  }

  /* -------------------------
     Sort info: highlight lowest 2 tokens
  --------------------------*/
  const highlightedTokens = orders.slice(0, 2).map((o) => o.token);

  /* -------------------------
     RENDER
  --------------------------*/
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.title}>Kitchen Dashboard</div>
            <div style={styles.subtitle}>Prepare the Orders</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={styles.subtitle}>Logged in:</div>
            <div style={{ color: "#ffd166", fontWeight: 800 }}>{staffName}</div>
            <button
              style={{ ...styles.btn, ...styles.logoutBtn, marginTop: 8 }}
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>

        {/* SESSION SELECT */}
        <div style={{ marginBottom: 18 }}>
          <div style={styles.subtitle}>Session</div>
          <select
            style={styles.sessionSelect}
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <h3 style={{ marginBottom: 8 }}>Orders to Prepare</h3>

        {orders.length === 0 && (
          <div style={{ color: "#888" }}>No orders yet</div>
        )}

        {orders.map((o) => {
          const highlight = highlightedTokens.includes(o.token);

          return (
            <div
              key={o.id}
              style={{
                ...styles.card,
                borderLeft: highlight
                  ? "6px solid #2ecc71"
                  : "6px solid #ffd166",
                background: highlight ? "#1a1a1a" : "#111"
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900 }}>
                Token #{o.token}
              </div>

              <div style={{ marginTop: 6, color: "#ccc" }}>
                {o.customerName} — {o.phone}
              </div>

              <div style={{ marginTop: 8, color: "#eee" }}>
                {o.items.map((i) => `${i.quantity}×${i.name}`).join(", ")}
              </div>

              <div style={{ marginTop: 8, color: "#ffd166" }}>
                Amount: ₹{Number(o.total).toFixed(2)}
              </div>

              <div style={{ marginTop: 12 }}>
                {o.status === "paid" && (
                  <button
                    onClick={() => markCooking(o.id)}
                    style={{ ...styles.btn, ...styles.startBtn }}
                  >
                    Start Cooking
                  </button>
                )}

                {o.status === "cooking" && (
                  <button
                    onClick={() => markCompleted(o.id)}
                    style={{ ...styles.btn, ...styles.finishBtn }}
                  >
                    Finish & Deliver
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
