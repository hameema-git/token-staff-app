// client/src/pages/OwnerSummary.jsx
import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc
} from "firebase/firestore";
import jsPDF from "jspdf";
import "jspdf-autotable";

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
  pdfBtn: { background: "#ffd166", color: "#111" },
  deleteBtn: { background: "#551111", color: "#fff" }
};

export default function OwnerSummary() {
  const [session, setSession] = useState("");
  const [sessions, setSessions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [itemsSummary, setItemsSummary] = useState({});
  const [stats, setStats] = useState(null);

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

  /* ---------------- LOAD SUMMARY ---------------- */
  useEffect(() => {
    if (!session) return;

    async function loadSummary() {
      const q = query(
        collection(db, "orders"),
        where("session_id", "==", session)
      );

      const snap = await getDocs(q);
      const data = snap.docs.map(d => d.data());
      setOrders(data);

      let totalAmount = 0;
      let paidCount = 0;
      let itemMap = {};

      data.forEach(o => {
        totalAmount += Number(o.total || 0);
        if (o.paid) paidCount++;

        (o.items || []).forEach(i => {
          if (!itemMap[i.name]) {
            itemMap[i.name] = { qty: 0, amount: 0 };
          }
          itemMap[i.name].qty += i.quantity;
          itemMap[i.name].amount += i.quantity * i.price;
        });
      });

      setItemsSummary(itemMap);
      setStats({
        orders: data.length,
        paid: paidCount,
        unpaid: data.length - paidCount,
        totalAmount
      });
    }

    loadSummary();
  }, [session]);

  /* ---------------- PDF ---------------- */
  function downloadPDF() {
    const doc = new jsPDF();
    doc.text(`Waffle Lounge - Session Summary`, 14, 14);
    doc.text(`Session: ${session}`, 14, 22);

    doc.autoTable({
      startY: 30,
      head: [["Metric", "Value"]],
      body: [
        ["Total Orders", stats.orders],
        ["Paid Orders", stats.paid],
        ["Unpaid Orders", stats.unpaid],
        ["Total Amount", `₹${stats.totalAmount}`]
      ]
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Item", "Quantity Sold", "Revenue"]],
      body: Object.entries(itemsSummary).map(([name, v]) => [
        name,
        v.qty,
        `₹${v.amount}`
      ])
    });

    doc.save(`Session_${session}_Summary.pdf`);
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
                  <div style={styles.statLabel}>Paid</div>
                  <div style={styles.statValue}>{stats.paid}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Unpaid</div>
                  <div style={styles.statValue}>{stats.unpaid}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Total Amount</div>
                  <div style={styles.statValue}>₹{stats.totalAmount}</div>
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h3>Item-wise Sales</h3>
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
              <button style={{ ...styles.btn, ...styles.pdfBtn }} onClick={downloadPDF}>
                Download PDF
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
