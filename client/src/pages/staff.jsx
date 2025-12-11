// client/src/pages/StaffDashboard.jsx

import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { auth, db, serverTimestamp } from "../firebaseInit";

import {
  signOut,
  onAuthStateChanged,
  getIdTokenResult
} from "firebase/auth";

import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  runTransaction,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  where
} from "firebase/firestore";

// ---------------------
// STYLES
// ---------------------
const styles = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 20,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif"
  },
  container: { maxWidth: 1100, margin: "auto" },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 18
  },
  title: { fontSize: 22, fontWeight: 900, color: "#ffd166" },
  subtitle: { color: "#bfb39a", fontSize: 13 },

  topPanel: {
    display: "grid",
    gridTemplateColumns: "1fr 320px",
    gap: 16,
    marginBottom: 18
  },

  liveCard: {
    background: "#111",
    padding: 18,
    borderRadius: 12,
    borderLeft: "8px solid #ffd166",
    minHeight: 220,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between"
  },

  bigToken: {
    fontSize: 60,
    fontWeight: 900,
    color: "#ffd166",
    textAlign: "center",
    letterSpacing: 2
  },
  smallMuted: { color: "#bfb39a", fontSize: 13 },

  skippedChip: {
    display: "inline-block",
    background: "#222",
    color: "#ffd166",
    padding: "6px 10px",
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    fontWeight: 700,
    cursor: "pointer"
  },

  actionsRow: {
    display: "flex",
    gap: 12,
    marginTop: 12,
    flexWrap: "wrap"
  },

  btn: {
    padding: "12px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 800
  },
  callBtn: { background: "#ffd166", color: "#111", flex: 1, minWidth: 160 },
  callAgainBtn: { background: "#444", color: "#ffd166", minWidth: 120 },
  skipBtn: { background: "#ff7a00", color: "#111", minWidth: 120 },
  refreshBtn: { background: "#333", color: "#ffd166", minWidth: 120 },

  sessionSelect: {
    padding: 10,
    fontSize: 15,
    borderRadius: 8,
    background: "#0c0c0c",
    color: "#fff",
    border: "1px solid #222"
  },

  // Orders styling
  approveSection: { marginTop: 16 },

  orderCard: {
    background: "#111",
    padding: 14,
    borderRadius: 10,
    borderLeft: "6px solid #333",
    marginBottom: 12
  },

  orderActions: {
    marginTop: 8,
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
  },

  approveBtn: { background: "#2ecc71", color: "#01100b", flex: 1 },
  updateBtn: { background: "#ffd166", color: "#111", flex: 1 },
  deleteBtn: { background: "#ff6b6b", color: "#fff", flex: 1 },

  smallNote: { color: "#bfb39a", fontSize: 13 }
};

// ------------------------------------------------
// COMPONENT START
// ------------------------------------------------

export default function StaffDashboard() {
  const [, navigate] = useLocation();

  // AUTH
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // Sessions & token states
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("Session 1");
  const [selectedSession, setSelectedSession] = useState("");

  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);

  // Orders
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Subscriptions
  const tokensUnsubRef = useRef(null);
  const ordersUnsubRef = useRef(null);
  const intervalRef = useRef(null);
  const [subscribing, setSubscribing] = useState(false);

  // Prevent double click
  const [actionBusy, setActionBusy] = useState(false);

  // ---------------------------
  // AUTH LISTENER
  // ---------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsStaff(false);
        navigate("/staff-login");
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(user, true);
        if (tokenResult.claims?.role !== "staff") {
          alert("Not authorized");
          await signOut(auth);
          navigate("/staff-login");
          return;
        }

        setIsStaff(true);
        setStaffName(user.email);

      } catch (err) {
        console.error(err);
        setIsStaff(false);
        navigate("/staff-login");
      }
    });

    return () => unsub();
  }, []);

  // --------------------------------
  // Load sessions from Firestore
  // --------------------------------
  useEffect(() => {
    async function loadSessions() {
      const activeSnap = await getDoc(doc(db, "settings", "activeSession"));
      const active = activeSnap.exists() ? activeSnap.data().session_id : "Session 1";

      setSession(active);
      setSelectedSession(active);

      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs.map((d) => d.id.replace("session_", ""));
      setSessions(list);
    }

    loadSessions();
  }, []);

  // ----------------------------------------------------
  // Start Firestore live listeners
  // ----------------------------------------------------
  function startSubscriptions(sess) {
    if (subscribing) return;
    setSubscribing(true);
    setLoading(true);

    const tokenRef = doc(db, "tokens", "session_" + sess);

    tokensUnsubRef.current = onSnapshot(tokenRef, (snap) => {
      if (!snap.exists()) {
        setCurrent(0);
        setLastIssued(0);
        setSkipped([]);
        return;
      }

      const d = snap.data();
      setCurrent(d.currentToken || 0);
      setLastIssued(d.lastTokenIssued || 0);
      setSkipped(d.skipped || []);
    });

    // Orders listener
    const ordersQ = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", sess),
      orderBy("createdAt", "asc")
    );

    ordersUnsubRef.current = onSnapshot(ordersQ, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(arr);
      setLoading(false);
    });

    intervalRef.current = setInterval(() => {
      fetchOrders(sess);
    }, 5000);
  }

  function stopSubscriptions() {
    if (tokensUnsubRef.current) tokensUnsubRef.current();
    if (ordersUnsubRef.current) ordersUnsubRef.current();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSubscribing(false);
  }

  // Change session listener
  useEffect(() => {
    if (!isStaff) return;
    stopSubscriptions();
    startSubscriptions(selectedSession);
  }, [selectedSession, isStaff]);

  // ----------------------------------------------------
  // Fetch orders manually fallback
  // ----------------------------------------------------
  async function fetchOrders(sess) {
    try {
      const q = query(
        collection(db, "orders"),
        where("status", "==", "pending"),
        where("session_id", "==", sess),
        orderBy("createdAt", "asc")
      );
      const snap = await getDocs(q);
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
  }

  // ---------------------------
  // LOGOUT
  // ---------------------------
  async function logout() {
    try {
      await signOut(auth);
      stopSubscriptions();
      navigate("/staff-login");
    } catch (err) {
      console.error(err);
    }
  }

  // ---------------------------
  // TOKEN ACTIONS
  // ---------------------------

  async function callNext() {
    if (actionBusy) return;
    setActionBusy(true);

    const ref = doc(db, "tokens", "session_" + selectedSession);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Session missing");

        let { currentToken, lastTokenIssued, skipped } = snap.data();
        currentToken = currentToken || 0;
        skipped = skipped || [];

        if (skipped.length > 0) {
          const next = Math.min(...skipped);
          const newSkipped = skipped.filter((x) => x !== next);

          tx.update(ref, {
            currentToken: next,
            skipped: newSkipped,
            lastCalled: next,
            lastCalledAt: serverTimestamp(),
            lastPrev: currentToken
          });
          return;
        }

        if (currentToken + 1 <= lastTokenIssued) {
          tx.update(ref, {
            currentToken: currentToken + 1,
            lastCalled: currentToken + 1,
            lastCalledAt: serverTimestamp(),
            lastPrev: currentToken
          });
        } else {
          throw new Error("No next token available");
        }
      });
    } catch (err) {
      alert(err.message);
    }

    setActionBusy(false);
  }

  async function callAgain() {
    const ref = doc(db, "tokens", "session_" + selectedSession);
    await updateDoc(ref, {
      lastCalled: current,
      lastCalledAt: serverTimestamp()
    });
  }

  async function skipToken() {
    const tok = Number(prompt("Enter token to skip:", current));
    if (!tok) return;

    const ref = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;

      let { skipped, currentToken, lastTokenIssued } = snap.data();
      skipped = skipped || [];

      if (!skipped.includes(tok)) skipped.push(tok);
      skipped.sort((a, b) => a - b);

      tx.update(ref, { skipped });

      if (tok === currentToken) {
        const remain = skipped.filter((x) => x !== tok);
        if (remain.length > 0) {
          const next = Math.min(...remain);
          const newSkipped = skipped.filter((x) => x !== next && x !== tok);
          tx.update(ref, {
            currentToken: next,
            skipped: newSkipped,
            lastCalled: next,
            lastCalledAt: serverTimestamp(),
            lastPrev: currentToken
          });
        } else if (currentToken + 1 <= lastTokenIssued) {
          tx.update(ref, {
            currentToken: currentToken + 1,
            lastCalled: currentToken + 1,
            lastCalledAt: serverTimestamp(),
            lastPrev: currentToken
          });
        }
      }
    });
  }

  async function undoLast() {
    const ref = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Session missing");

      const prev = snap.data().lastPrev;
      if (prev == null) throw new Error("Nothing to undo");

      tx.update(ref, {
        currentToken: prev,
        lastCalled: prev,
        lastCalledAt: serverTimestamp(),
        lastPrev: null
      });
    });
  }

  async function serveSkipped(tok) {
    if (!tok) return;
    const ref = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;

      let { skipped, currentToken } = snap.data();
      skipped = skipped || [];

      const newArr = skipped.filter((x) => x !== tok);

      tx.update(ref, {
        currentToken: tok,
        skipped: newArr,
        lastCalled: tok,
        lastCalledAt: serverTimestamp(),
        lastPrev: currentToken
      });
    });
  }

  // ---------------------------
  // ORDERS
  // ---------------------------
  async function approveOrder(orderId) {
    const orderRef = doc(db, "orders", orderId);
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);

    try {
      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Missing order");
        const order = orderSnap.data();
        if (order.status !== "pending") throw new Error("Already approved");

        const tokenSnap = await tx.get(tokenRef);
        let last = tokenSnap.exists() ? tokenSnap.data().lastTokenIssued || 0 : 0;
        const next = last + 1;

        tx.update(tokenRef, { lastTokenIssued: next });

        tx.update(orderRef, {
          status: "approved",
          token: next,
          approvedAt: serverTimestamp()
        });
      });
    } catch (err) {
      alert(err.message);
    }
  }

  async function updateOrder(order) {
    const newName = prompt("Customer name:", order.customerName);
    if (newName == null) return;

    const newPhone = prompt("Phone:", order.phone);
    if (newPhone == null) return;

    await updateDoc(doc(db, "orders", order.id), {
      customerName: newName,
      phone: newPhone
    });
  }

  async function deleteOrder(id) {
    if (!window.confirm("Delete this order?")) return;
    await deleteDoc(doc(db, "orders", id));
  }

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.title}>Waffle Lounge — Staff Dashboard</div>
            <div style={styles.subtitle}>Manage tokens & serve customers</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={styles.smallMuted}>Signed in as</div>
            <div style={{ fontWeight: 800 }}>
              {isStaff ? staffName : "—"}
            </div>
          </div>
        </div>

        {/* MAIN PANEL */}
        <div style={styles.topPanel}>

          {/* LEFT PANEL */}
          <div style={styles.liveCard}>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={styles.smallMuted}>Now Serving</div>
                <div style={styles.bigToken}>{current || "-"}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={styles.smallMuted}>Last Issued</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#ffd166" }}>
                  {lastIssued}
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={styles.smallMuted}>Session</div>

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
              </div>
            </div>

            {/* SKIPPED TOKENS */}
            <div style={{ marginTop: 15 }}>
              <div style={styles.smallMuted}>Skipped Tokens</div>

              {skipped.length ? (
                skipped.map((t) => (
                  <span
                    key={t}
                    style={styles.skippedChip}
                    onClick={() => serveSkipped(t)}
                  >
                    {t}
                  </span>
                ))
              ) : (
                <div style={{ color: "#666", marginTop: 6 }}>— none —</div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div style={styles.actionsRow}>
              <button
                style={{ ...styles.btn, ...styles.callBtn }}
                onClick={callNext}
                disabled={actionBusy}
              >
                Call Next
              </button>

              <button
                style={{ ...styles.btn, ...styles.callAgainBtn }}
                onClick={callAgain}
                disabled={actionBusy}
              >
                Call Again
              </button>

              <button
                style={{ ...styles.btn, ...styles.skipBtn }}
                onClick={skipToken}
                disabled={actionBusy}
              >
                Skip Token
              </button>
            </div>

            {/* SECOND ROW */}
            <div style={{ marginTop: 10 }}>

              <button
                onClick={() => fetchOrders(selectedSession)}
                style={{ ...styles.btn, ...styles.refreshBtn }}
              >
                Refresh Orders
              </button>

              <button
                onClick={() => navigate("/approved")}
                style={{
                  ...styles.btn,
                  marginLeft: 8,
                  background: "#6c5ce7",
                  color: "white"
                }}
              >
                View Approved
              </button>

              <button
                onClick={logout}
                style={{
                  ...styles.btn,
                  marginLeft: 8,
                  background: "#333",
                  color: "#ffd166"
                }}
              >
                Logout
              </button>

              <button
                onClick={undoLast}
                style={{
                  ...styles.btn,
                  marginLeft: 8,
                  background: "#222",
                  color: "#ffd166"
                }}
              >
                Undo
              </button>
            </div>

          </div>

          {/* RIGHT PANEL */}
          <div style={{
            background: "#111",
            padding: 16,
            borderRadius: 12
          }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              Session Controls
            </div>

            <button
              style={{
                ...styles.btn,
                background: "#ffd166",
                color: "#111",
                width: "100%",
                marginBottom: 10
              }}
              onClick={async () => {
                const num = Number(session.split(" ")[1]) + 1;
                const newSess = `Session ${num}`;

                await setDoc(
                  doc(db, "settings", "activeSession"),
                  { session_id: newSess }
                );

                await setDoc(
                  doc(db, "tokens", "session_" + newSess),
                  {
                    session_id: newSess,
                    currentToken: 0,
                    lastTokenIssued: 0,
                    skipped: []
                  },
                  { merge: true }
                );

                setSession(newSess);
                setSelectedSession(newSess);
              }}
            >
              Start New Session
            </button>

            <div style={{ marginTop: 10 }}>
              <div style={styles.smallMuted}>Active Session</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>{session}</div>
            </div>

            <div style={{ marginTop: 15 }}>
              <div style={styles.smallMuted}>Quick actions</div>

              <button
                style={{
                  ...styles.btn,
                  background: "#2ecc71",
                  color: "#01110b",
                  width: "100%",
                  marginTop: 8
                }}
                onClick={() => {
                  if (skipped.length === 0) return alert("No skipped tokens");
                  const tok = Number(prompt("Enter token to serve:", skipped[0]));
                  if (tok) serveSkipped(tok);
                }}
              >
                Serve Skipped
              </button>

              <button
                style={{
                  ...styles.btn,
                  background: "#444",
                  color: "#ffd166",
                  width: "100%",
                  marginTop: 8
                }}
                onClick={() => navigate("/approved")}
              >
                Approved Orders
              </button>
            </div>
          </div>
        </div>

        {/* PENDING ORDERS */}
        <div style={styles.approveSection}>
          <h3>Pending Orders (Session: {selectedSession})</h3>

          {loading && <div>Loading...</div>}
          {!loading && orders.length === 0 && (
            <div style={{ color: "#666" }}>No pending orders</div>
          )}

          {orders.map((order) => (
            <div key={order.id} style={styles.orderCard}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start"
              }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{order.customerName}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{order.phone}</div>
                  <div style={{ marginTop: 8 }}>
                    {(order.items || []).map((i) => `${i.quantity}×${i.name}`).join(", ")}
                  </div>

                  <div style={{ color: "#777", fontSize: 12, marginTop: 6 }}>
                    Placed: {order.createdAt?.toDate().toLocaleString()}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#ffd166", fontWeight: 800 }}>
                    {order.status}
                  </div>
                  {order.token && (
                    <div style={{ marginTop: 6 }}>
                      Token: <strong>{order.token}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.orderActions}>
                <button
                  style={styles.approveBtn}
                  onClick={() => approveOrder(order.id)}
                >
                  Approve
                </button>

                <button
                  style={styles.updateBtn}
                  onClick={() => updateOrder(order)}
                >
                  Update
                </button>

                <button
                  style={styles.deleteBtn}
                  onClick={() => deleteOrder(order.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
