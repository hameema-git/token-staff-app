import React, { useEffect, useState } from "react";
import { db, serverTimestamp } from "../firebaseInit";
import { useLocation } from "wouter";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";

const isDesktop = window.innerWidth >= 768;

const styles = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 16,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    overflowX: "hidden"
  },
  container: {
    maxWidth: 1100,
    margin: "auto"
  },

  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 900, color: "#ffd166" },
  subtitle: { fontSize: 13, color: "#bfb39a" },

  controls: { marginTop: 14 },
  select: {
    width: "100%",
    padding: 10,
    background: "#111",
    color: "#ffd166",
    borderRadius: 8,
    border: "1px solid #222",
    marginTop: 6
  },
  search: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    background: "#111",
    border: "1px solid #222",
    color: "#fff"
  },

  /* 🔹 GRID FIX */
  list: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: isDesktop ? "repeat(2, minmax(0, 1fr))" : "1fr",
    gap: 14
  },

  card: {
    background: "#111",
    padding: 14,
    borderRadius: 12,
    borderLeft: "6px solid #ffd166",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0
  },

  tokenRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },

  token: { fontSize: 18, fontWeight: 900, color: "#ffd166" },
  unpaid: { color: "#ffb86b", fontWeight: 800, fontSize: 13 },

  name: { fontWeight: 800 },
  phone: { fontSize: 13, color: "#bfb39a" },

  items: {
    fontSize: 14,
    color: "#eee",
    lineHeight: 1.4,
    wordBreak: "break-word"
  },

  amount: { fontWeight: 800, color: "#ffd166", marginTop: 4 },

  empty: {
    gridColumn: "1 / -1",
    marginTop: 30,
    textAlign: "center",
    color: "#777"
  },

  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 12
  },
  modal: {
    background: "#0f0f0f",
    padding: 18,
    borderRadius: 12,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto"
  },

  btn: {
    padding: "12px",
    borderRadius: 8,
    border: "none",
    fontWeight: 800,
    cursor: "pointer",
    width: "100%"
  },
  backBtn: {
  background: "#222",
  color: "#ffd166",
  border: "1px solid #333",
  padding: "8px 14px",
  borderRadius: 20,
  fontWeight: 800,
  cursor: "pointer",
  marginBottom: 12
}
};

export default function ApprovedOrders() {
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [search, setSearch] = useState("");
  const [modalOrder, setModalOrder] = useState(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    async function loadData() {
      const tokenSnap = await getDocs(collection(db, "tokens"));
      const sessionList = tokenSnap.docs
        .map(d => d.id.replace("session_", ""))
        .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

      const last = sessionList[sessionList.length - 1];
      setSessions(sessionList);
      setSelectedSession(last);

      const orderSnap = await getDocs(collection(db, "orders"));
      const approved = orderSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.status === "approved" && !o.paid);

      setOrders(approved);
      applyFilters(approved, last, "");
    }

    loadData();
  }, []);

  function applyFilters(list, session, text) {
    let result = list.filter(o => o.session_id === session);

    if (text.trim()) {
      const t = text.toLowerCase();
      result = result.filter(
        o =>
          (o.customerName || "").toLowerCase().includes(t) ||
          (o.phone || "").includes(t) ||
          String(o.token || "").includes(t)
      );
    }

    result.sort((a, b) => (a.token || 0) - (b.token || 0));
    setFiltered(result);
  }

  function markPaid(order) {
    if (!window.confirm("Confirm payment received?")) return;

    updateDoc(doc(db, "orders", order.id), {
      paid: true,
      paidAt: serverTimestamp(),
      status: "paid"
    });

    setModalOrder(null);
    setOrders(prev => prev.filter(o => o.id !== order.id));
    setFiltered(prev => prev.filter(o => o.id !== order.id));
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <div style={styles.header}>
          <div style={styles.title}>Approved Orders</div>
          <div style={styles.subtitle}>Awaiting payment — unpaid only</div>
        </div>
        <button
  style={styles.backBtn}
  onClick={() => navigate("/staff")}
>
  ← Back to Staff Dashboard
</button>


        <div style={styles.controls}>
          <div style={styles.subtitle}>Session</div>
          <select
            style={styles.select}
            value={selectedSession}
            onChange={e => {
              setSelectedSession(e.target.value);
              applyFilters(orders, e.target.value, search);
            }}
          >
            {sessions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input
            style={styles.search}
            placeholder="Search token / name / phone"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              applyFilters(orders, selectedSession, e.target.value);
            }}
          />
        </div>

        <div style={styles.list}>
          {filtered.length === 0 && (
            <div style={styles.empty}>No unpaid approved orders</div>
          )}

          {filtered.map(o => (
            <div key={o.id} style={styles.card} onClick={() => setModalOrder(o)}>
              <div style={styles.tokenRow}>
                <div style={styles.token}>Token #{o.token}</div>
                <div style={styles.unpaid}>UNPAID</div>
              </div>

              <div style={styles.name}>{o.customerName}</div>
              <div style={styles.phone}>{o.phone}</div>

              <div style={styles.items}>
                {o.items?.map(i => `${i.quantity}× ${i.name}`).join(", ")}
              </div>

              <div style={styles.amount}>
                ₹{Number(o.total || 0).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {modalOrder && (
          <div style={styles.modalBg} onClick={() => setModalOrder(null)}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <h3 style={{ color: "#ffd166" }}>Token #{modalOrder.token}</h3>

              <div style={{ marginTop: 8 }}>
                {modalOrder.items?.map((i, idx) => (
                  <div key={idx}>{i.quantity}× {i.name}</div>
                ))}
              </div>

              <div style={{ marginTop: 10, fontWeight: 800 }}>
                Amount: ₹{Number(modalOrder.total).toFixed(2)}
              </div>

              <button
                style={{ ...styles.btn, background: "#2ecc71", color: "#01110b", marginTop: 14 }}
                onClick={() => markPaid(modalOrder)}
              >
                Mark Paid & Send to Kitchen
              </button>

              <button
                style={{ ...styles.btn, background: "#333", color: "#ffd166", marginTop: 8 }}
                onClick={() => setModalOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
