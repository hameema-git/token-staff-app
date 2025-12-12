import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "firebase/firestore";

const styles = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 16,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif"
  },
  container: {
    maxWidth: 900,
    margin: "auto"
  },

  header: {
    marginBottom: 16
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    color: "#ffd166"
  },
  subtitle: {
    fontSize: 13,
    color: "#bfb39a"
  },

  sessionBox: {
    marginTop: 14
  },
  sessionSelect: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    background: "#111",
    border: "1px solid #222",
    color: "#ffd166",
    fontSize: 15
  },

  card: {
    background: "#111",
    padding: 14,
    borderRadius: 12,
    borderLeft: "6px solid #2ecc71",
    marginBottom: 12
  },
  token: {
    fontSize: 20,
    fontWeight: 900,
    color: "#2ecc71"
  },
  customer: {
    marginTop: 6,
    fontWeight: 800
  },
  phone: {
    fontSize: 13,
    color: "#bfb39a"
  },
  items: {
    marginTop: 8,
    color: "#eee"
  },
  amount: {
    marginTop: 8,
    fontWeight: 800,
    color: "#ffd166"
  },
  footer: {
    marginTop: 6,
    fontSize: 12,
    color: "#999"
  },
  empty: {
    marginTop: 30,
    textAlign: "center",
    color: "#777"
  }
};

export default function Completed() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [orders, setOrders] = useState([]);

  /* ---------------- LOAD SESSIONS ---------------- */
  useEffect(() => {
    async function loadSessions() {
      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map((d) => d.id.replace("session_", ""))
        .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

      setSessions(list);

      // auto-pick latest session
      if (list.length) {
        setSelectedSession(list[list.length - 1]);
      }
    }

    loadSessions();
  }, []);

  /* ---------------- LOAD COMPLETED ORDERS ---------------- */
  useEffect(() => {
    if (!selectedSession) return;

    async function loadCompleted() {
      const q = query(
        collection(db, "orders"),
        where("session_id", "==", selectedSession),
        where("status", "==", "completed"),
        orderBy("token", "asc")
      );

      const snap = await getDocs(q);

      const list = snap.docs.map((d) => {
        const data = d.data();

        let items = [];
        if (Array.isArray(data.items)) items = data.items;
        else if (data.items && typeof data.items === "object")
          items = Object.values(data.items);

        return { id: d.id, ...data, items };
      });

      setOrders(list);
    }

    loadCompleted();
  }, [selectedSession]);

  function formatTime(ts) {
    try {
      return ts?.toDate().toLocaleString();
    } catch {
      return "-";
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.header}>
          <div style={styles.title}>Completed Orders</div>
          <div style={styles.subtitle}>
            Finished & delivered orders (read-only)
          </div>
        </div>

        {/* SESSION SELECT */}
        <div style={styles.sessionBox}>
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

        {/* LIST */}
        <div style={{ marginTop: 18 }}>
          {orders.length === 0 && (
            <div style={styles.empty}>
              No completed orders in this session
            </div>
          )}

          {orders.map((o) => (
            <div key={o.id} style={styles.card}>
              <div style={styles.token}>Token #{o.token}</div>

              <div style={styles.customer}>{o.customerName}</div>
              <div style={styles.phone}>{o.phone}</div>

              <div style={styles.items}>
                {o.items?.map((i) => `${i.quantity}×${i.name}`).join(", ")}
              </div>

              <div style={styles.amount}>
                Amount: ₹{Number(o.total || 0).toFixed(2)}
              </div>

              <div style={styles.footer}>
                Completed at: {formatTime(o.completedAt)}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
