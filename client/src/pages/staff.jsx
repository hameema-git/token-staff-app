import React, { useEffect, useState } from "react";
import { auth, db, serverTimestamp } from "../firebaseInit";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult
} from "firebase/auth";

import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  runTransaction,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc
} from "firebase/firestore";

export default function StaffDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isStaff, setIsStaff] = useState(false);

  const [orders, setOrders] = useState([]);

  const [session, setSession] = useState("Session 1"); // active session
  const [sessions, setSessions] = useState([]);         // list of all sessions
  const [selectedSession, setSelectedSession] = useState("");

  const [loading, setLoading] = useState(false);

  // ---------------------------------------
  // LOAD ACTIVE SESSION + ALL SESSIONS
  // ---------------------------------------
  useEffect(() => {
    async function loadSessions() {
      try {
        // Load active session
        const ref = doc(db, "settings", "activeSession");
        const snap = await getDoc(ref);

        let active = "Session 1";
        if (snap.exists()) active = snap.data().session_id;

        setSession(active);
        localStorage.setItem("session", active);

        // Load list of all sessions from tokens collection
        const tokenSnap = await getDocs(collection(db, "tokens"));
        const sessionList = tokenSnap.docs
          .map(d => d.id.replace("session_", ""))
          .sort((a, b) => {
            const na = Number(a.split(" ")[1]);
            const nb = Number(b.split(" ")[1]);
            return na - nb;
          });

        setSessions(sessionList);
        setSelectedSession(active); // default selected session is the current active
      } catch (err) {
        console.error("Error loading sessions:", err);
      }
    }

    loadSessions();
  }, []);

  // ---------------------------------------
  // AUTH HANDLING
  // ---------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsStaff(false);
        setOrders([]);
        return;
      }

      const tokenResult = await getIdTokenResult(user, true);
      const role = tokenResult.claims?.role;

      if (role === "staff") {
        setIsStaff(true);
        fetchOrders();
      } else {
        setIsStaff(false);
        alert("This user is NOT staff.");
      }
    });

    return () => unsubscribe();
  }, []);

  async function login(e) {
    e.preventDefault();

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    } catch (err) {
      alert("Login failed: " + err.message);
    }
  }

  async function logout() {
    await signOut(auth);
    setIsStaff(false);
  }

  // ---------------------------------------
  // FETCH ORDERS (pending for selectedSession)
  // ---------------------------------------
  async function fetchOrders() {
    setLoading(true);

    const q = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const snap = await getDocs(q);

    const filtered = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.status === "pending" && o.session_id === selectedSession);

    setOrders(filtered);
    setLoading(false);
  }

  // ---------------------------------------
  // START NEW SESSION
  // ---------------------------------------
  async function startNewSession() {
    let currentNum = 1;

    if (session.includes(" ")) {
      const num = Number(session.split(" ")[1]);
      if (!isNaN(num)) currentNum = num;
    }

    const newSession = `Session ${currentNum + 1}`;

    try {
      await setDoc(doc(db, "settings", "activeSession"), {
        session_id: newSession
      });

      setSession(newSession);
      setSelectedSession(newSession);
      localStorage.setItem("session", newSession);

      await setDoc(doc(db, "tokens", "session_" + newSession), {
        session_id: newSession,
        currentToken: 0,
        lastTokenIssued: 0
      });

      alert("New session started: " + newSession);
      fetchOrders();
    } catch (err) {
      console.error("ERROR updating session:", err);
      alert("Failed to start new session.");
    }
  }

  // ---------------------------------------
  // DELETE ORDER
  // ---------------------------------------
  async function deleteOrder(id) {
    if (!window.confirm("Delete this order?")) return;

    await deleteDoc(doc(db, "orders", id));
    fetchOrders();
  }

  // ---------------------------------------
  // UPDATE ORDER
  // ---------------------------------------
  async function updateOrder(order) {
    const newName = prompt("Update name:", order.customerName);
    if (newName === null) return;

    const newPhone = prompt("Update phone:", order.phone);
    if (newPhone === null) return;

    const newItems = prompt(
      "Update Items (qty×name, ...):",
      order.items.map(i => `${i.quantity}×${i.name}`).join(", ")
    );
    if (newItems === null) return;

    const parsedItems = newItems.split(",").map(str => {
      const [qty, name] = str.split("×");
      return { quantity: Number(qty.trim()), name: name.trim() };
    });

    await updateDoc(doc(db, "orders", order.id), {
      customerName: newName.trim(),
      phone: newPhone.trim(),
      items: parsedItems
    });

    alert("Order updated!");
    fetchOrders();
  }

  // ---------------------------------------
  // APPROVE ORDER → assign token
  // ---------------------------------------
  async function approveOrder(orderId) {
    try {
      const orderRef = doc(db, "orders", orderId);

      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order missing");

        const order = orderSnap.data();
        if (order.status !== "pending") throw new Error("Already approved");

        const tokenRef = doc(db, "tokens", "session_" + session);
        const tokenSnap = await tx.get(tokenRef);

        let last = tokenSnap.exists()
          ? tokenSnap.data().lastTokenIssued || 0
          : 0;

        const next = last + 1;

        tx.set(
          tokenRef,
          {
            session_id: session,
            currentToken: tokenSnap.exists() ? tokenSnap.data().currentToken : 0,
            lastTokenIssued: next
          },
          { merge: true }
        );

        tx.update(orderRef, {
          token: next,
          status: "approved",
          approvedAt: serverTimestamp(),
          session_id: session
        });
      });

      fetchOrders();
    } catch (err) {
      alert("Approve failed: " + err.message);
    }
  }

  // ---------------------------------------
  // CALL NEXT TOKEN
  // ---------------------------------------
  async function callNext() {
    try {
      const tokenRef = doc(db, "tokens", "session_" + session);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);

        if (!snap.exists()) {
          tx.set(tokenRef, {
            session_id: session,
            currentToken: 1,
            lastTokenIssued: 0
          });
        } else {
          const cur = snap.data().currentToken || 0;
          const last = snap.data().lastTokenIssued || 0;

          const next = Math.min(cur + 1, Math.max(last, cur + 1));

          tx.update(tokenRef, { currentToken: next });
        }
      });
    } catch (err) {
      alert("Next failed: " + err.message);
    }
  }

  // ---------------------------------------
  // UI
  // ---------------------------------------
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "auto" }}>
      <h1>Staff Dashboard</h1>
      <h2>Active Session: {session}</h2>

      {/* -------------------------
          SESSION SELECT DROPDOWN
      --------------------------*/}
      {isStaff && (
        <div style={{ marginTop: 10, marginBottom: 20 }}>
          <label>Select Session to View Orders:</label>
          <select
            value={selectedSession}
            onChange={(e) => {
              setSelectedSession(e.target.value);
              fetchOrders();
            }}
            style={{
              padding: 8,
              width: "100%",
              fontSize: 16,
              marginTop: 4
            }}
          >
            {sessions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {isStaff && (
        <button onClick={startNewSession} style={{ marginBottom: 20 }}>
          Start New Session
        </button>
      )}

      {!isStaff && (
        <form onSubmit={login}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          /><br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          /><br />
          <button type="submit">Login</button>
        </form>
      )}

      {isStaff && (
        <div>
          <button onClick={callNext}>Call Next</button>
          <button onClick={fetchOrders} style={{ marginLeft: 10 }}>
            Refresh
          </button>
          <button onClick={logout} style={{ marginLeft: 10 }}>
            Logout
          </button>

          <button
            onClick={() => (window.location.href = "/approved")}
            style={{
              marginLeft: 10,
              background: "#6c5ce7",
              color: "white"
            }}
          >
            View Approved Orders
          </button>

          <h3 style={{ marginTop: 20 }}>
            Pending Orders (Session: {selectedSession})
          </h3>

          {loading && <div>Loading…</div>}

          {!loading &&
            orders.map((order) => (
              <div
                key={order.id}
                style={{
                  border: "1px solid #ddd",
                  padding: 12,
                  marginBottom: 10,
                  borderRadius: 6
                }}
              >
                <strong>{order.customerName}</strong> — {order.phone}
                <div style={{ fontSize: 13 }}>
                  {(order.items || [])
                    .map((i) => `${i.quantity}×${i.name}`)
                    .join(", ")}
                </div>

                <button
                  onClick={() => approveOrder(order.id)}
                  style={{ marginTop: 8 }}
                >
                  Approve
                </button>

                <button
                  onClick={() => updateOrder(order)}
                  style={{ marginLeft: 10, background: "#ffaa00" }}
                >
                  Update
                </button>

                <button
                  onClick={() => deleteOrder(order.id)}
                  style={{
                    marginLeft: 10,
                    background: "red",
                    color: "white"
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
