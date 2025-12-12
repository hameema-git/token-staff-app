// client/src/pages/ApprovedOrders.jsx
import React, { useEffect, useState } from "react";
import { db, serverTimestamp } from "../firebaseInit";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";

export default function ApprovedOrders() {
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  const [search, setSearch] = useState("");
  const [modalOrder, setModalOrder] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // ---------- Load sessions ----------
      const tokenSnap = await getDocs(collection(db, "tokens"));
      const sessionList = tokenSnap.docs
        .map((d) => d.id.replace("session_", ""))
        .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

      const lastSession = sessionList[sessionList.length - 1] || "Session 1";

      setSessions(sessionList);
      setSelectedSession(lastSession);

      // ---------- Load APPROVED orders ----------
      const orderSnap = await getDocs(collection(db, "orders"));
      const approved = orderSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => o.status === "approved");

      setOrders(approved);
      setLoading(false);

      applyFilters(approved, lastSession, "");
    }

    loadData();
  }, []);

  // ---------- Filter ----------
  function applyFilters(orderList, session, text) {
    let result = orderList;

    result = result.filter((o) => o.session_id === session);

    if (text.trim() !== "") {
      const t = text.toLowerCase();
      result = result.filter(
        (o) =>
          (o.customerName || "").toLowerCase().includes(t) ||
          (o.phone || "").includes(t) ||
          String(o.token).includes(t)
      );
    }

    result = result.sort((a, b) => (a.token || 0) - (b.token || 0));
    setFiltered(result);
  }

  function handleSessionChange(v) {
    setSelectedSession(v);
    applyFilters(orders, v, search);
  }

  function handleSearch(v) {
    setSearch(v);
    applyFilters(orders, selectedSession, v);
  }

  // ---------- Mark Paid ----------
  async function markPaid(order) {
    if (!window.confirm("Mark this order as PAID?")) return;

    await updateDoc(doc(db, "orders", order.id), {
      paid: true,
      paidAt: serverTimestamp(),
      status: "paid"
    });

    alert("Payment marked. Sent to Kitchen.");
    setModalOrder(null);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Approved Orders</h1>

      <label>Select Session:</label>
      <select
        value={selectedSession}
        onChange={(e) => handleSessionChange(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 15 }}
      >
        {sessions.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>

      {loading && <p>Loading...</p>}
      {!loading && filtered.length === 0 && <p>No approved orders yet.</p>}

      {filtered.map((order) => (
        <div
          key={order.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
            borderRadius: 6,
            cursor: "pointer"
          }}
          onClick={() => setModalOrder(order)}
        >
          <h3>
            Token #{order.token ?? "-"}{" "}
            <span style={{ color: "green" }}>({order.session_id})</span>
          </h3>

          <p><b>Name:</b> {order.customerName}</p>
          <p><b>Phone:</b> {order.phone}</p>

          <b>Items:</b>
          <ul>
            {(order.items || []).map((i, idx) => (
              <li key={idx}>
                {i.quantity} × {i.name}
              </li>
            ))}
          </ul>

          <p>
            <b>Status:</b>{" "}
            <span style={{ color: order.paid ? "green" : "orange" }}>
              {order.paid ? "PAID" : "UNPAID"}
            </span>
          </p>
        </div>
      ))}

      {/* ---------- POPUP ---------- */}
      {modalOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
          onClick={() => setModalOrder(null)}
        >
          <div
            style={{
              background: "#111",
              padding: 20,
              borderRadius: 10,
              width: "90%",
              maxWidth: 500,
              color: "#fff"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Order Details</h2>

            <p><b>Name:</b> {modalOrder.customerName}</p>
            <p><b>Phone:</b> {modalOrder.phone}</p>

            <b>Items:</b>
            <ul>
              {modalOrder.items?.map((i, idx) => (
                <li key={idx}>
                  {i.quantity} × {i.name}
                </li>
              ))}
            </ul>

            <p>
              <b>Amount:</b> ₹{Number(modalOrder.total).toFixed(2)}
            </p>

            <p>
              <b>Paid:</b>{" "}
              <span style={{ color: modalOrder.paid ? "green" : "orange" }}>
                {modalOrder.paid ? "Yes" : "No"}
              </span>
            </p>

            {!modalOrder.paid && (
              <button
                onClick={() => markPaid(modalOrder)}
                style={{
                  background: "green",
                  color: "#fff",
                  padding: "10px 15px",
                  borderRadius: 6,
                  border: "none",
                  fontWeight: "bold",
                  marginTop: 10,
                  width: "100%"
                }}
              >
                Mark Paid
              </button>
            )}

            <button
              onClick={() => setModalOrder(null)}
              style={{
                background: "#555",
                color: "#fff",
                padding: "10px 15px",
                borderRadius: 6,
                border: "none",
                marginTop: 10,
                width: "100%"
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
