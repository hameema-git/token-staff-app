import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebaseInit";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy
} from "firebase/firestore";
import { useLocation } from "wouter";

const styles = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 16 },
  container: { maxWidth: 1000, margin: "auto" },

  title: { fontSize: 22, fontWeight: 900, color: "#ffd166", marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#bfb39a", marginBottom: 14 },

  searchBar: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #222",
    background: "#111",
    color: "white",
    marginBottom: 16,
    fontSize: 16
  },

  card: {
    background: "#111",
    padding: 14,
    borderRadius: 10,
    borderLeft: "6px solid #ffd166",
    marginBottom: 12
  },

  btn: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 800,
    marginTop: 10,
    width: "100%"
  },

  paidBtn: { background: "#2ecc71", color: "#01110b" },
  backBtn: { background: "#333", color: "#ffd166", marginBottom: 16 }
};

export default function PaymentCenter() {
  const [, navigate] = useLocation();

  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");

  const unsubRef = useRef(null);

  /* -------------------------
        LIVE FETCH UNPAID ORDERS
     ------------------------- */
  useEffect(() => {
    if (unsubRef.current) unsubRef.current();

    const q = query(
      collection(db, "orders"),
      where("paid", "==", false),
      where("status", "in", ["pending", "approved", "paid"]),  // do NOT show completed
      orderBy("createdAt", "asc")
    );

    unsubRef.current = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        let items = [];

        // Normalize items array
        if (Array.isArray(data.items)) items = data.items;
        else if (typeof data.items === "object") items = Object.values(data.items);

        return { id: d.id, ...data, items };
      });
      setOrders(list);
    });

    return () => unsubRef.current && unsubRef.current();
  }, []);

  /* -------------------------
        SEARCH FILTER
     ------------------------- */
  const filtered = orders.filter((o) => {
    const t = search.toLowerCase();
    return (
      (o.customerName || "").toLowerCase().includes(t) ||
      (o.phone || "").includes(t) ||
      String(o.token || "").includes(t)
    );
  });

  /* -------------------------
        MARK PAID
     ------------------------- */
  async function markPaid(orderId) {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        paid: true,
        paidAt: serverTimestamp(),
        status: "paid"
      });
    } catch (err) {
      alert("Payment failed: " + err.message);
      console.error(err);
    }
  }

  function formatItems(items = []) {
    return items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <button style={{ ...styles.btn, ...styles.backBtn }} onClick={() => navigate("/staff")}>
          ← Back to Staff Dashboard
        </button>

        <div style={styles.title}>Payment Center</div>
        <div style={styles.subtitle}>
          Collect payments for all <b>approved / pending unpaid</b> orders.
        </div>

        <input
          style={styles.searchBar}
          placeholder="Search by token, name, or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {filtered.length === 0 && (
          <div style={{ color: "#999", marginTop: 20 }}>No unpaid orders found.</div>
        )}

        {filtered.map((o) => (
          <div key={o.id} style={styles.card}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {o.customerName} {o.token ? `(Token ${o.token})` : "(No Token Yet)"}
            </div>

            <div style={{ marginTop: 6, color: "#bfb39a" }}>{o.phone}</div>
            <div style={{ marginTop: 8, color: "#eee" }}>{formatItems(o.items)}</div>

            <div style={{ marginTop: 8, color: "#ffd166", fontWeight: 800 }}>
              Amount: ₹{Number(o.total || 0).toFixed(2)}
            </div>

            <button
              style={{ ...styles.btn, ...styles.paidBtn }}
              onClick={() => markPaid(o.id)}
            >
              Mark Paid ✔
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
