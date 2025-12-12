// client/src/pages/StaffDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { auth, db, serverTimestamp } from "../firebaseInit";
import { signOut, onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";

const styles = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 14,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
  },
  container: { maxWidth: 900, margin: "auto", position: "relative" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  titleCol: { display: "flex", flexDirection: "column" },
  title: { fontSize: 20, fontWeight: 900, color: "#ffd166" },
  subtitle: { color: "#bfb39a", fontSize: 12 },

  userCol: { textAlign: "right", fontSize: 12 },

  menuButton: {
    background: "transparent",
    color: "#ffd166",
    border: "none",
    fontSize: 22,
    padding: 8,
  },

  liveCard: {
    background: "#111",
    padding: 14,
    borderRadius: 12,
    borderLeft: "6px solid #ffd166",
    marginBottom: 14,
  },

  nowServingWrap: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  nowServingLabel: { color: "#bfb39a", fontSize: 12 },
  bigToken: {
    fontSize: 56,
    fontWeight: 900,
    color: "#ffd166",
    letterSpacing: 2,
    textAlign: "center",
  },

  infoRow: {
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#ccc",
  },

  actionsRow: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },

  btn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  callBtn: { background: "#ffd166", color: "#111", flex: 1 },
  callAgainBtn: { background: "#444", color: "#ffd166", minWidth: 110 },
  skipBtn: { background: "#ff7a00", color: "#111", minWidth: 110 },
  smallBtn: { padding: "8px 10px", borderRadius: 8, fontSize: 13 },

  pendingList: { marginTop: 6 },

  orderCard: {
    background: "#111",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },

  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    height: "100%",
    width: 260,
    background: "#0f0f0f",
    boxShadow: "2px 0 10px rgba(0,0,0,0.6)",
    zIndex: 10000,
    padding: 14,
  },
  drawerClose: {
    position: "absolute",
    right: 10,
    top: 8,
    background: "transparent",
    border: "none",
    color: "#ffd166",
    fontSize: 18,
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    background: "#0f0f0f",
    padding: 16,
    borderRadius: 10,
    width: "min(720px, 96%)",
    color: "#f6e8c1",
  },
};

export default function StaffDashboard() {
  const [, navigate] = useLocation();

  // AUTH STATE
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // SESSION TOKENS
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("Session 1");
  const [selectedSession, setSelectedSession] = useState("");

  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);

  // 3 NEW INFO VALUES
  const [lastApprovedToken, setLastApprovedToken] = useState(0);
  const [lastPaidToken, setLastPaidToken] = useState(0);
  const [lastCompletedToken, setLastCompletedToken] = useState(0);

  // ORDERS
  const [orders, setOrders] = useState([]);
  const [modalOrder, setModalOrder] = useState(null);

  // DRAWER
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ------------------------------------------------------------------
  // AUTH
  // ------------------------------------------------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate("/staff-login");

      const token = await getIdTokenResult(user, true);
      if (token.claims.role !== "staff") {
        alert("Not staff.");
        await signOut(auth);
        return navigate("/staff-login");
      }

      setIsStaff(true);
      setStaffName(user.email || "Staff");
    });

    return () => unsub();
  }, []);

  // ------------------------------------------------------------------
  // LOAD SESSIONS
  // ------------------------------------------------------------------
  async function loadSessions() {
    const snap = await getDocs(collection(db, "tokens"));
    const list = snap.docs
      .map((d) => d.id.replace("session_", ""))
      .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));

    setSessions(list);
    const latest = list[list.length - 1];
    setSession(latest);
    setSelectedSession(latest);
  }

  useEffect(() => {
    loadSessions();
  }, []);

  // ------------------------------------------------------------------
  // LISTEN LIVE: TOKENS + PENDING ORDERS
  // ------------------------------------------------------------------
  const unsubTok = useRef(null);
  const unsubOrders = useRef(null);

  useEffect(() => {
    if (!selectedSession) return;

    // STOP OLD LISTENERS
    unsubTok.current && unsubTok.current();
    unsubOrders.current && unsubOrders.current();

    const tokenRef = doc(db, "tokens", "session_" + selectedSession);

    unsubTok.current = onSnapshot(tokenRef, (snap) => {
      if (!snap.exists()) return;

      const d = snap.data();
      setCurrent(d.currentToken || 0);
      setLastIssued(d.lastTokenIssued || 0);
      setSkipped(d.skipped || []);

      setLastApprovedToken(d.lastApprovedToken || 0);
      setLastPaidToken(d.lastPaidToken || 0);
      setLastCompletedToken(d.lastCompletedToken || 0);
    });

    const qPending = query(
      collection(db, "orders"),
      where("session_id", "==", selectedSession),
      where("status", "==", "pending"),
      orderBy("createdAt", "asc")
    );

    unsubOrders.current = onSnapshot(qPending, (snap) => {
      const arr = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        items: Array.isArray(d.data().items)
          ? d.data().items
          : Object.values(d.data().items || {}),
      }));
      setOrders(arr);
    });

    return () => {
      unsubTok.current && unsubTok.current();
      unsubOrders.current && unsubOrders.current();
    };
  }, [selectedSession]);

  // ------------------------------------------------------------------
  // TOKEN ACTIONS
  // ------------------------------------------------------------------
  const callNext = async () => {
    const ref = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Missing session");

      const d = snap.data();
      let cur = d.currentToken || 0;
      let last = d.lastTokenIssued || 0;
      const skippedList = d.skipped || [];

      let next = cur + 1;

      // Never call completed tokens → skip automatically
      const completedTokens = d.completedTokens || [];

      while (
        (skippedList.includes(next) || completedTokens.includes(next)) &&
        next <= last
      )
        next++;

      if (next > last) throw new Error("No next token");

      tx.update(ref, {
        currentToken: next,
        lastCalled: next,
        lastCalledAt: serverTimestamp(),
      });
    });
  };

  const callAgain = async () => {
    const ref = doc(db, "tokens", "session_" + selectedSession);
    await updateDoc(ref, { lastCalled: current, lastCalledAt: serverTimestamp() });
  };

  // ------------------------------------------------------------------
  // ORDER ACTIONS
  // ------------------------------------------------------------------

  // AUTO-APPROVE PAID ORDERS
  const markPaid = async (id) => {
    const ref = doc(db, "orders", id);
    const tokRef = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const order = snap.data();
      if (!order) return;

      // If it's already approved → change to paid
      if (order.status === "approved") {
        tx.update(ref, { paid: true, paidAt: serverTimestamp(), status: "paid" });

        // Update lastPaidToken
        tx.update(tokRef, { lastPaidToken: order.token || 0 });

        return;
      }

      // If pending → auto approve + paid
      const tokSnap = await tx.get(tokRef);
      const d = tokSnap.data() || {};
      const nextTok = (d.lastTokenIssued || 0) + 1;

      tx.update(tokRef, { lastTokenIssued: nextTok, lastPaidToken: nextTok });

      tx.update(ref, {
        token: nextTok,
        status: "paid",
        paid: true,
        paidAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
        session_id: selectedSession,
      });
    });

    setModalOrder(null);
  };

  // Approve (manual)
  const approve = async (id) => {
    const ref = doc(db, "orders", id);
    const tokRef = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const order = snap.data();
      if (!order || order.status !== "pending") return;

      const tokSnap = await tx.get(tokRef);
      const d = tokSnap.data() || {};
      const nextTok = (d.lastTokenIssued || 0) + 1;

      tx.update(tokRef, {
        lastTokenIssued: nextTok,
        lastApprovedToken: nextTok,
      });

      tx.update(ref, {
        token: nextTok,
        status: order.paid ? "paid" : "approved",
        approvedAt: serverTimestamp(),
        session_id: selectedSession,
      });
    });

    setModalOrder(null);
  };

  // ------------------------------------------------------------------
  // UI HELPERS
  // ------------------------------------------------------------------
  const formatItems = (items) =>
    (items || []).map((i) => `${i.quantity}× ${i.name}`).join(", ");

  const formatTime = (ts) =>
    ts?.toDate ? ts.toDate().toLocaleString() : "—";

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <div style={styles.header}>
          <div style={styles.titleCol}>
            <div style={styles.title}>Waffle Lounge</div>
            <div style={styles.subtitle}>Staff Dashboard</div>
          </div>

          <div style={styles.userCol}>
            <div>Signed in as</div>
            <div style={{ fontWeight: 800 }}>{staffName}</div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={styles.menuButton} onClick={() => setDrawerOpen(true)}>
                ☰
              </button>
              <button
                style={{ ...styles.btn, ...styles.smallBtn, background: "#333", color: "#ffd166" }}
                onClick={async () => {
                  await signOut(auth);
                  navigate("/staff-login");
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* LIVE CARD */}
        <div style={styles.liveCard}>
          <div style={styles.nowServingWrap}>
            <div>
              <div style={styles.nowServingLabel}>Now Serving</div>
              <div style={styles.bigToken}>{current || "-"}</div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={styles.nowServingLabel}>Last Issued</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#ffd166" }}>{lastIssued}</div>
            </div>
          </div>

          {/* INFO PANEL */}
          <div style={styles.infoRow}>
            <div>Approved: <b>{lastApprovedToken}</b></div>
            <div>Paid: <b>{lastPaidToken}</b></div>
            <div>Completed: <b>{lastCompletedToken}</b></div>
          </div>

          {/* ACTIONS */}
          <div style={styles.actionsRow}>
            <button style={{ ...styles.btn, ...styles.callBtn }} onClick={callNext}>
              Call Next
            </button>
            <button style={{ ...styles.btn, ...styles.callAgainBtn }} onClick={callAgain}>
              Call Again
            </button>
          </div>
        </div>

        {/* PENDING ORDERS */}
        <div style={styles.pendingList}>
          <h3>Pending Orders — {selectedSession}</h3>

          {orders.length === 0 && <div style={{ color: "#666" }}>No pending orders</div>}

          {orders.map((o) => (
            <div key={o.id} style={styles.orderCard} onClick={() => setModalOrder(o)}>
              <div>
                <div style={{ fontWeight: 900 }}>{o.customerName}</div>
                <div style={{ color: "#aaa" }}>{o.phone}</div>
                <div style={{ marginTop: 6 }}>{formatItems(o.items)}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: "#ccc" }}>{o.status}</div>
                {o.paid && <div style={{ color: "#2ecc71", fontWeight: 900 }}>PAID</div>}
              </div>
            </div>
          ))}
        </div>

        {/* DRAWER */}
        {drawerOpen && (
          <div style={styles.drawer}>
            <button style={styles.drawerClose} onClick={() => setDrawerOpen(false)}>
              ✕
            </button>

            <h3 style={{ color: "#ffd166" }}>Menu</h3>

            <div style={{ marginTop: 20 }}>
              <div style={{ color: "#ccc", marginBottom: 6 }}>Sessions</div>

              {sessions.map((s) => (
                <button
                  key={s}
                  style={{
                    ...styles.btn,
                    background: selectedSession === s ? "#ffd166" : "#222",
                    color: selectedSession === s ? "#111" : "#ffd166",
                    textAlign: "left",
                  }}
                  onClick={() => {
                    setSelectedSession(s);
                    setDrawerOpen(false);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ color: "#ccc", marginBottom: 6 }}>Navigate</div>

              <button
                style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate("/payment");
                }}
              >
                Payment Center
              </button>

              <button
                style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate("/approved");
                }}
              >
                Approved Orders
              </button>

              <button
                style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate("/completed");
                }}
              >
                Completed Orders
              </button>

              <button
                style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate("/kitchen");
                }}
              >
                Kitchen
              </button>
            </div>
          </div>
        )}

        {/* MODAL */}
        {modalOrder && (
          <div style={styles.modalBackdrop} onClick={() => setModalOrder(null)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3>{modalOrder.customerName}</h3>
              <div>{modalOrder.phone}</div>
              <div style={{ marginTop: 10 }}>{formatItems(modalOrder.items)}</div>

              <div style={{ marginTop: 10 }}>
                Status: <b>{modalOrder.status}</b>
              </div>

              <div style={{ marginTop: 10 }}>
                {modalOrder.paid ? (
                  <div style={{ color: "#2ecc71", fontWeight: 900 }}>PAID</div>
                ) : (
                  <button
                    style={{ ...styles.btn, background: "#ffd166", color: "#111" }}
                    onClick={() => markPaid(modalOrder.id)}
                  >
                    Mark Paid
                  </button>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <button
                  style={{ ...styles.btn, background: "#2ecc71", color: "#01110b" }}
                  onClick={() => approve(modalOrder.id)}
                >
                  Approve
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <button
                  style={{ ...styles.btn, background: "#222", color: "#ffd166" }}
                  onClick={() => setModalOrder(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
