import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import { useLocation } from "wouter";

import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc
} from "firebase/firestore";

const styles = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 20 },
  container: { maxWidth: 900, margin: "auto" },
  title: { fontSize: 26, fontWeight: 900, color: "#ffd166" },
  card: { background: "#111", padding: 16, borderRadius: 12, marginTop: 16 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 },
  statBox: { background: "#0f0f0f", padding: 14, borderRadius: 10 },
  statLabel: { color: "#bfb39a", fontSize: 12 },
  statValue: { fontSize: 20, fontWeight: 900, color: "#ffd166" },
  table: { width: "100%", marginTop: 16, borderCollapse: "collapse" },
  th: { borderBottom: "1px solid #333", padding: 8, textAlign: "left" },
  td: { padding: 8, borderBottom: "1px solid #222" },
  btnRow: { display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" },
  btn: { padding: "12px 16px", borderRadius: 10, border: "none", fontWeight: 800, cursor: "pointer" },
  exportBtn: { background: "#ffd166", color: "#111" },
  deleteBtn: { background: "#551111", color: "#fff" },
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

export default function OwnerSummary() {
  const [session, setSession] = useState("");
  const [sessions, setSessions] = useState([]);
  const [itemsSummary, setItemsSummary] = useState({});
  const [stats, setStats] = useState(null);
  const [, navigate] = useLocation();

  /* ---------------- LOAD SESSIONS ---------------- */
  useEffect(() => {
    async function loadSessions() {
      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map(d => d.id.replace("session_", ""))
        .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

      setSessions(list);
      setSession(list[list.length - 1] || "");
    }
    loadSessions();
  }, []);

  /* ---------------- LOAD SUMMARY (FIXED LOGIC) ---------------- */
  useEffect(() => {
    if (!session) return;

    async function loadSummary() {
      const q = query(
        collection(db, "orders"),
        where("session_id", "==", session)
      );

      const snap = await getDocs(q);
      const data = snap.docs.map(d => d.data());

      let totalPaidAmount = 0;
      let paidCount = 0;
      let itemMap = {};

      data.forEach(order => {
        if (order.paid === true) {
          paidCount++;
          totalPaidAmount += Number(order.total || 0);

          const items = Array.isArray(order.items)
            ? order.items
            : order.items && typeof order.items === "object"
              ? Object.values(order.items)
              : [];

          items.forEach(i => {
            if (!itemMap[i.name]) {
              itemMap[i.name] = { qty: 0, amount: 0 };
            }

            const qty = Number(i.quantity || 0);
            const price = Number(i.price || 0);

            itemMap[i.name].qty += qty;
            itemMap[i.name].amount += qty * price;
          });
        }
      });

      setItemsSummary(itemMap);
      setStats({
        orders: data.length,
        paid: paidCount,
        unpaid: data.length - paidCount,
        totalAmount: totalPaidAmount
      });
    }

    loadSummary();
  }, [session]);

  /* ---------------- EXPORT CSV ---------------- */
  function exportCSV() {
    if (!stats) return;

    const rows = [
      ["Metric", "Value"],
      ["Total Orders", stats.orders],
      ["Paid Orders", stats.paid],
      ["Unpaid Orders", stats.unpaid],
      ["Total Paid Amount", stats.totalAmount],
      [],
      ["Item", "Quantity Sold", "Revenue"],
      ...Object.entries(itemsSummary).map(([name, v]) => [
        name,
        v.qty,
        v.amount
      ])
    ];

    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `Session_${session}_Summary.csv`;
    a.click();
  }

  /* ---------------- DELETE SESSION ---------------- */
  async function deleteSession() {
    if (!window.confirm(`Delete ${session}? This cannot be undone.`)) return;

    const q = query(collection(db, "orders"), where("session_id", "==", session));
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      await deleteDoc(doc(db, "orders", d.id));
    }

    await deleteDoc(doc(db, "tokens", "session_" + session));
    alert("Session deleted");
    window.location.reload();
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.title}>Owner Summary</div>

        <button style={styles.backBtn} onClick={() => navigate("/staff")}>
          ← Back to Staff Dashboard
        </button>

        <select
          value={session}
          onChange={(e) => setSession(e.target.value)}
          style={{ marginTop: 10, padding: 10, borderRadius: 8 }}
        >
          {sessions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {stats && (
          <>
            <div style={styles.card}>
              <div style={styles.statGrid}>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Total Orders</div>
                  <div style={styles.statValue}>{stats.orders}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Paid Orders</div>
                  <div style={styles.statValue}>{stats.paid}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Unpaid Orders</div>
                  <div style={styles.statValue}>{stats.unpaid}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Total Paid Amount</div>
                  <div style={styles.statValue}>₹{stats.totalAmount}</div>
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h3>Item-wise Paid Sales</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Item</th>
                    <th style={styles.th}>Qty</th>
                    <th style={styles.th}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(itemsSummary).map(([name, v]) => (
                    <tr key={name}>
                      <td style={styles.td}>{name}</td>
                      <td style={styles.td}>{v.qty}</td>
                      <td style={styles.td}>₹{v.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={styles.btnRow}>
              <button style={{ ...styles.btn, ...styles.exportBtn }} onClick={exportCSV}>
                Export CSV
              </button>

              <button style={{ ...styles.btn, ...styles.deleteBtn }} onClick={deleteSession}>
                Delete Session
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
