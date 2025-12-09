import React, { useEffect, useState } from "react";
import { db } from "../firebaseInit";
import { collection, getDocs } from "firebase/firestore";

export default function ApprovedOrders() {
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // ----------------------
      // 1️⃣ Load all sessions from tokens collection
      // ----------------------
      const tokenSnap = await getDocs(collection(db, "tokens"));
      const sessionList = tokenSnap.docs
        .map(d => d.id.replace("session_", "")) // extract clean session name
        .sort((a, b) => {
          const na = Number(a.split(" ")[1]);
          const nb = Number(b.split(" ")[1]);
          return na - nb;
        });

      // pick last session as default
      const lastSession = sessionList[sessionList.length - 1] || "Session 1";

      setSessions(sessionList);
      setSelectedSession(lastSession);

      // ----------------------
      // 2️⃣ Load ALL approved orders
      // ----------------------
      const orderSnap = await getDocs(collection(db, "orders"));
      const approvedOrders = orderSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.status === "approved");

      setOrders(approvedOrders);
      setLoading(false);

      // Apply default filter
      applyFilters(approvedOrders, lastSession, "");
    }

    loadData();
  }, []);

  // ------------------------------
  // Filter function
  // ------------------------------
  function applyFilters(orderList, session, searchText) {
    let result = orderList;

    // session filter
    if (session) {
      result = result.filter(o => o.session_id === session);
    }

    // search filter
    if (searchText.trim() !== "") {
      const s = searchText.toLowerCase();
      result = result.filter(o =>
        (o.customerName || "").toLowerCase().includes(s) ||
        (o.phone || "").includes(s) ||
        String(o.token).includes(s)
      );
    }

    // sort tokens
    result = result.sort((a, b) => (a.token || 0) - (b.token || 0));

    setFiltered(result);
  }

  // session dropdown handler
  function handleSessionChange(value) {
    setSelectedSession(value);
    applyFilters(orders, value, search);
  }

  // search handler
  function handleSearch(text) {
    setSearch(text);
    applyFilters(orders, selectedSession, text);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Approved Orders</h1>

      {/* ⭐ SESSION SELECT DROPDOWN */}
      <label style={{ fontSize: 14 }}>Select Session:</label>
      <select
        value={selectedSession}
        onChange={(e) => handleSessionChange(e.target.value)}
        style={{
          padding: 8,
          width: "100%",
          marginBottom: 15,
          fontSize: 16
        }}
      >
        {sessions.map(s => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      ⭐ SEARCH BAR
      {/* <input
        value={search}
        onChange={e => handleSearch(e.target.value)}
        placeholder="Search by name, phone, or token"
        style={{
          padding: 8,
          width: "100%",
          marginBottom: 15,
          fontSize: 16
        }}
      /> */}

      {loading && <p>Loading...</p>}
      {!loading && filtered.length === 0 && <p>No approved orders found.</p>}

      {!loading &&
        filtered.map(order => (
          <div
            key={order.id}
            style={{
              border: "1px solid #ccc",
              padding: 10,
              marginBottom: 10,
              borderRadius: 6
            }}
          >
            <h3>
              Token #{order.token ?? "-"}  
              <span style={{ color: "green", marginLeft: 10 }}>
                ({order.session_id})
              </span>
            </h3>

            <p><b>Name:</b> {order.customerName}</p>
            <p><b>Phone:</b> {order.phone}</p>

            <b>Items:</b>
            <ul>
              {(order.items || []).map((i, idx) => (
                <li key={idx}>{i.quantity}× {i.name}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

