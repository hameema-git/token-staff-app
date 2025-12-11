// src/pages/StaffDashboard.jsx

import React, { useEffect, useState, useRef } from "react";
import { auth, db, serverTimestamp } from "../firebaseInit";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
} from "firebase/auth";

import {
  collection,
  query,
  orderBy,
  limit,
  doc,
  runTransaction,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  where,
  getDocs,
} from "firebase/firestore";

// ----------------------------------------------
// STYLE
// ----------------------------------------------
const styles = {
  page: {
    background: "#0b0b0b",
    minHeight: "100vh",
    padding: 20,
    color: "#f6e8c1",
    fontFamily: "'Segoe UI', sans-serif",
  },

  container: { maxWidth: 1100, margin: "auto" },

  loginCard: {
    maxWidth: 350,
    margin: "120px auto",
    padding: 25,
    background: "#111",
    borderRadius: 12,
    borderLeft: "6px solid #ffd166",
  },

  loginInput: {
    width: "100%",
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#0c0c0c",
    color: "#fff",
  },

  loginBtn: {
    width: "100%",
    padding: 14,
    marginTop: 18,
    borderRadius: 8,
    border: "none",
    fontWeight: 900,
    background: "#ffd166",
    color: "#111",
    cursor: "pointer",
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 20,
    flexWrap: "wrap",
  },

  title: { fontSize: 26, fontWeight: 900, color: "#ffd166" },

  topPanel: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
    marginBottom: 20,
  },

  liveCard: {
    flex: 1,
    minWidth: 280,
    background: "#111",
    padding: 20,
    borderRadius: 12,
    borderLeft: "8px solid #ffd166",
  },

  sideCard: {
    width: 300,
    background: "#111",
    padding: 20,
    borderRadius: 12,
  },

  bigToken: {
    fontSize: 60,
    fontWeight: 900,
    color: "#ffd166",
    textAlign: "center",
    marginTop: 10,
  },

  btn: {
    padding: "12px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
  },

  yellowBtn: { background: "#ffd166", color: "#111", flex: 1 },
  grayBtn: { background: "#444", color: "#ffd166" },
  orangeBtn: { background: "#ff7a00", color: "#111" },
  purpleBtn: { background: "#6c5ce7", color: "#fff" },
  greenBtn: { background: "#2ecc71", color: "#01100b" },

  orderCard: {
    background: "#111",
    padding: 16,
    borderLeft: "6px solid #333",
    borderRadius: 10,
    marginBottom: 12,
  },
};

// ----------------------------------------------
// MAIN COMPONENT
// ----------------------------------------------
export default function StaffDashboard() {
  // LOGIN FIELDS
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // SESSION + TOKENS
  const [session, setSession] = useState("Session 1");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");

  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);

  // ORDERS
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Subscription references
  const ordersUnsub = useRef(null);
  const tokensUnsub = useRef(null);

  // ----------------------------------------------
  // LOGIN
  // ----------------------------------------------
  async function handleLogin(e) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    } catch (err) {
      alert("Login failed: " + err.message);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setIsStaff(false);
    } catch (err) {
      alert("Logout failed");
    }
  }

  // ----------------------------------------------
  // AUTH WATCHER
  // ----------------------------------------------
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsStaff(false);
        return;
      }

      const token = await getIdTokenResult(user, true);
      if (token.claims.role === "staff") {
        setIsStaff(true);
        setStaffName(user.email);
      } else {
        alert("Not a staff account");
        await signOut(auth);
      }
    });
  }, []);

  // ----------------------------------------------
  // LOAD SESSIONS
  // ----------------------------------------------
  async function loadSessions() {
    const s = await getDocs(collection(db, "tokens"));
    const list = s.docs.map((d) => d.id.replace("session_", ""));
    setSessions(list);

    const activeSnap = await getDoc(doc(db, "settings", "activeSession"));
    const active = activeSnap.exists()
      ? activeSnap.data().session_id
      : "Session 1";

    setSession(active);
    setSelectedSession(active);
  }

  // ----------------------------------------------
  // SUBSCRIBE TO TOKENS + ORDERS
  // ----------------------------------------------
  function subscribe(sessionId) {
    const tokenRef = doc(db, "tokens", "session_" + sessionId);

    tokensUnsub.current = onSnapshot(tokenRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setCurrent(d.currentToken || 0);
      setLastIssued(d.lastTokenIssued || 0);
      setSkipped(d.skipped || []);
    });

    const q = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", sessionId),
      orderBy("createdAt", "asc")
    );

    ordersUnsub.current = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(arr);
    });
  }

  useEffect(() => {
    if (!isStaff) return;
    loadSessions();
  }, [isStaff]);

  useEffect(() => {
    if (!selectedSession) return;
    if (ordersUnsub.current) ordersUnsub.current();
    if (tokensUnsub.current) tokensUnsub.current();
    subscribe(selectedSession);
  }, [selectedSession]);

  // ----------------------------------------------
  // CALL NEXT
  // ----------------------------------------------
  async function callNext() {
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        const d = snap.data();
        const cur = d.currentToken || 0;
        const last = d.lastTokenIssued || 0;
        const skippedArr = d.skipped || [];

        if (skippedArr.length > 0) {
          const next = Math.min(...skippedArr);
          tx.update(tokenRef, {
            currentToken: next,
            skipped: skippedArr.filter((t) => t !== next),
            lastCalled: next,
            lastCalledAt: serverTimestamp(),
          });
        } else {
          const next = cur + 1;
          if (next > last) throw new Error("No next token available");
          tx.update(tokenRef, {
            currentToken: next,
            lastCalled: next,
            lastCalledAt: serverTimestamp(),
          });
        }
      });
    } catch (err) {
      alert(err.message);
    }
  }

  // ----------------------------------------------
  // CALL AGAIN
  // ----------------------------------------------
  async function callAgain() {
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);
    try {
      await updateDoc(tokenRef, {
        lastCalled: current,
        lastCalledAt: serverTimestamp(),
      });
    } catch (err) {
      alert("Failed");
    }
  }

  // ----------------------------------------------
  // SKIP TOKEN
  // ----------------------------------------------
  async function skipCurrent() {
    const tok = current;
    if (!tok) return;

    const tokenRef = doc(db, "tokens", "session_" + selectedSession);
    try {
      await updateDoc(tokenRef, {
        skipped: [...skipped, tok].sort((a, b) => a - b),
      });
      callNext();
    } catch (err) {
      alert("Skip failed");
    }
  }

  // ----------------------------------------------
  // SERVE SKIPPED
  // ----------------------------------------------
  async function serveSkipped(tok) {
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);

    await updateDoc(tokenRef, {
      currentToken: tok,
      skipped: skipped.filter((t) => t !== tok),
      lastCalled: tok,
      lastCalledAt: serverTimestamp(),
    });
  }

  // ----------------------------------------------
  // APPROVE ORDER
  // ----------------------------------------------
  async function approveOrder(id) {
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);
    const orderRef = doc(db, "orders", id);

    try {
      await runTransaction(db, async (tx) => {
        const tokenSnap = await tx.get(tokenRef);
        const d = tokenSnap.data();
        const next = (d.lastTokenIssued || 0) + 1;

        tx.update(tokenRef, { lastTokenIssued: next });

        tx.update(orderRef, {
          token: next,
          status: "approved",
          approvedAt: serverTimestamp(),
          session_id: selectedSession,
        });
      });
    } catch (err) {
      alert(err.message);
    }
  }

  // ----------------------------------------------
  // DELETE ORDER
  // ----------------------------------------------
  async function deleteOrder(orderId) {
    if (!window.confirm("Delete this order?")) return;
    await deleteDoc(doc(db, "orders", orderId));
  }

  // ----------------------------------------------
  // UI
  // ----------------------------------------------

  // ----------------------------------------------
  // LOGIN SCREEN
  // ----------------------------------------------
  if (!isStaff) {
    return (
      <div style={styles.page}>
        <div style={styles.loginCard}>
          <h2>Staff Login</h2>

          <input
            style={styles.loginInput}
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={styles.loginInput}
            placeholder="Password"
            type="password"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button style={styles.loginBtn} onClick={handleLogin}>
            Login
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------
  // DASHBOARD SCREEN
  // ----------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <div style={styles.headerRow}>
          <div style={styles.title}>Waffle Lounge — Staff Dashboard</div>
          <div>
            <div>Signed in as</div>
            <b>{staffName}</b>
          </div>
        </div>

        {/* TOP PANEL */}
        <div style={styles.topPanel}>
          {/* LIVE CARD */}
          <div style={styles.liveCard}>
            <div>Now Serving</div>
            <div style={styles.bigToken}>{current || "-"}</div>

            <div style={{ marginTop: 10 }}>
              <div>Last Issued: {lastIssued}</div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div>Skipped Tokens:</div>
              {skipped.length === 0 ? (
                <div style={{ color: "#666" }}>— none —</div>
              ) : (
                skipped.map((t) => (
                  <span
                    key={t}
                    onClick={() => serveSkipped(t)}
                    style={{
                      background: "#222",
                      padding: "6px 12px",
                      borderRadius: 20,
                      marginRight: 8,
                      cursor: "pointer",
                      color: "#ffd166",
                    }}
                  >
                    {t}
                  </span>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
              <button
                style={{ ...styles.btn, ...styles.yellowBtn }}
                onClick={callNext}
              >
                Call Next
              </button>

              <button
                style={{ ...styles.btn, ...styles.grayBtn }}
                onClick={callAgain}
              >
                Call Again
              </button>

              <button
                style={{ ...styles.btn, ...styles.orangeBtn }}
                onClick={skipCurrent}
              >
                Skip
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
              <button
                style={{ ...styles.btn, ...styles.purpleBtn }}
                onClick={() => (window.location.href = "/approved")}
              >
                View Approved
              </button>

              <button
                style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>

          {/* SESSION CARD */}
          <div style={styles.sideCard}>
            <h3>Session Controls</h3>

            <div style={{ marginBottom: 10 }}>
              <div>Active Session</div>
              <b>{session}</b>
            </div>

            <div>
              Change Session:
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: "#0c0c0c",
                  color: "#fff",
                  border: "1px solid #333",
                }}
              >
                {sessions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* PENDING ORDERS */}
        <h3>Pending Orders (Session: {selectedSession})</h3>

        {loading && <div>Loading...</div>}
        {!loading && orders.length === 0 && (
          <div style={{ color: "#666" }}>No pending orders</div>
        )}

        {orders.map((order) => (
          <div key={order.id} style={styles.orderCard}>
            <div>
              <b>{order.customerName}</b>
              <div style={{ color: "#aaa" }}>{order.phone}</div>
              <div>{order.items?.map((i) => `${i.quantity}×${i.name}`).join(", ")}</div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                style={{ ...styles.btn, ...styles.greenBtn }}
                onClick={() => approveOrder(order.id)}
              >
                Approve
              </button>

              <button
                style={{ ...styles.btn, background: "#ff4d4d", color: "#fff" }}
                onClick={() => deleteOrder(order.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
