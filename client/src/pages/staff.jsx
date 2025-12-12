import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { auth, db, serverTimestamp } from "../firebaseInit";
import { signOut, onAuthStateChanged, getIdTokenResult } from "firebase/auth";
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

/* ------------------ UI STYLES ------------------ */

const ui = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 12,
    fontFamily: "'Segoe UI', Arial, sans-serif",
  },
  container: { maxWidth: 900, margin: "auto" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    alignItems: "center",
  },

  title: { fontSize: 22, fontWeight: 900, color: "#ffd166" },
  muted: { color: "#bfb39a", fontSize: 13 },

  /* token area */
  liveCard: {
    background: "#111",
    padding: 16,
    borderRadius: 12,
    borderLeft: "8px solid #ffd166",
    marginBottom: 14,
  },

  bigToken: {
    fontSize: 56,
    fontWeight: 900,
    color: "#ffd166",
    textAlign: "center",
  },

  buttonMain: {
    background: "#ffd166",
    color: "#111",
    border: "none",
    width: "100%",
    padding: 12,
    fontWeight: 900,
    borderRadius: 10,
    marginTop: 8,
  },

  buttonSecondary: {
    background: "#444",
    color: "#ffd166",
    border: "none",
    width: "100%",
    padding: 10,
    fontWeight: 700,
    borderRadius: 10,
    marginTop: 8,
  },

  orderCard: {
    background: "#111",
    padding: 14,
    borderRadius: 10,
    borderLeft: "6px solid #444",
    marginBottom: 10,
    cursor: "pointer",
  },

  floatingButtons: {
    display: "flex",
    gap: 6,
    marginTop: 6,
  },

  approveBtn: {
    flex: 1,
    padding: 10,
    background: "#2ecc71",
    color: "#01110b",
    border: "none",
    borderRadius: 8,
    fontWeight: 800,
  },

  paidBtn: {
    flex: 1,
    padding: 10,
    background: "#ffd166",
    color: "#111",
    border: "none",
    borderRadius: 8,
    fontWeight: 800,
  },

  deleteBtn: {
    flex: 1,
    padding: 10,
    background: "#ff5c5c",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 800,
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
    padding: 18,
    borderRadius: 10,
    width: "90%",
    maxWidth: 520,
    color: "#f6e8c1",
  },
};

/* --------------------------------------------------------- */

export default function StaffDashboard() {
  const [, navigate] = useLocation();

  const [staffName, setStaffName] = useState("");

  /* sessions */
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("");
  const [selectedSession, setSelectedSession] = useState("");

  /* token values */
  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);

  /* orders */
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);

  const [modalOrder, setModalOrder] = useState(null);

  const unsubToken = useRef(null);
  const unsubOrders = useRef(null);

  /* ---------------- AUTH ---------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate("/staff-login");

      const token = await getIdTokenResult(user, true);

      if (token.claims.role !== "staff") {
        alert("Not a staff login!");
        signOut(auth);
        navigate("/staff-login");
        return;
      }

      setStaffName(user.email || "staff");
    });

    return () => unsub();
  }, []);

  /* ---------------- Load Sessions ---------------- */
  async function loadSessions() {
    const snap = await getDocs(collection(db, "tokens"));
    const list = snap.docs
      .map((d) => d.id.replace("session_", ""))
      .sort(
        (a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1])
      );

    setSessions(list);

    // choose latest session by default
    const last = list[list.length - 1] || "Session 1";
    setSession(last);
    setSelectedSession(last);
  }

  useEffect(() => {
    loadSessions();
  }, []);

  /* ---------------- Subscribe to tokens ---------------- */
  useEffect(() => {
    if (!selectedSession) return;

    if (unsubToken.current) unsubToken.current();

    const ref = doc(db, "tokens", "session_" + selectedSession);

    unsubToken.current = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;

      const d = snap.data();
      setCurrent(d.currentToken || 0);
      setLastIssued(d.lastTokenIssued || 0);
    });
  }, [selectedSession]);

  /* ---------------- Subscribe to ORDERS ---------------- */
  useEffect(() => {
    if (!selectedSession) return;

    if (unsubOrders.current) unsubOrders.current();

    const q = query(
      collection(db, "orders"),
      where("session_id", "==", selectedSession),
      where("status", "in", ["pending", "approved", "paid"]),
      orderBy("createdAt", "asc")
    );

    unsubOrders.current = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setOrders(list);
      setLoading(false);
    });
  }, [selectedSession]);

  /* ---------------- Actions ---------------- */

  async function approveOrder(id) {
    const orderRef = doc(db, "orders", id);
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) return;

      const data = orderSnap.data();
      if (data.status !== "pending") return;

      const tokenSnap = await tx.get(tokenRef);
      const last = tokenSnap.data()?.lastTokenIssued || 0;
      const next = last + 1;

      tx.update(tokenRef, { lastTokenIssued: next });

      if (data.paid) {
        tx.update(orderRef, {
          token: next,
          status: "paid",
          approvedAt: serverTimestamp(),
        });
      } else {
        tx.update(orderRef, {
          token: next,
          status: "approved",
          approvedAt: serverTimestamp(),
        });
      }
    });

    setModalOrder(null);
  }

  async function markPaid(id) {
    const ref = doc(db, "orders", id);

    await updateDoc(ref, {
      paid: true,
      paidAt: serverTimestamp(),
      status: "paid",
    });

    setModalOrder(null);
  }

  /* ---------------- Token actions ---------------- */

  async function callNext() {
    const ref = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data();
      const cur = d.currentToken || 0;
      const last = d.lastTokenIssued || 0;

      if (cur + 1 <= last) {
        tx.update(ref, {
          currentToken: cur + 1,
          lastCalledAt: serverTimestamp(),
        });
      }
    });
  }

  async function callAgain() {
    const ref = doc(db, "tokens", "session_" + selectedSession);

    await updateDoc(ref, {
      lastCalledAt: serverTimestamp(),
    });
  }

  /* ---------------- UI Helpers ---------------- */
  function formatItems(items) {
    if (!items) return "-";
    return items.map((i) => `${i.quantity}×${i.name}`).join(", ");
  }

  function formatTime(ts) {
    try {
      return ts?.toDate().toLocaleString() || "-";
    } catch {
      return "-";
    }
  }

  /* ---------------- RENDER ---------------- */

  return (
    <div style={ui.page}>
      <div style={ui.container}>

        {/* HEADER */}
        <div style={ui.header}>
          <div>
            <div style={ui.title}>Staff Dashboard</div>
            <div style={ui.muted}>Approve • Call Tokens • Payments • Kitchen</div>
          </div>

          <div>
            <button
              onClick={() => navigate("/payment")}
              style={ui.buttonSecondary}
            >
              Payment Center
            </button>

            <button
              onClick={() => navigate("/kitchen")}
              style={ui.buttonSecondary}
            >
              Kitchen
            </button>

            <button
              onClick={() => {
                signOut(auth);
                navigate("/staff-login");
              }}
              style={ui.buttonSecondary}
            >
              Logout
            </button>
          </div>
        </div>

        {/* SESSION DROPDOWN */}
        <div style={{ marginBottom: 12 }}>
          <div style={ui.muted}>Session</div>
          <select
            style={{
              padding: 10,
              width: "100%",
              background: "#111",
              color: "#ffd166",
              borderRadius: 8,
              border: "1px solid #333",
              marginTop: 4,
            }}
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* NOW SERVING PANEL */}
        <div style={ui.liveCard}>
          <div
            style={{ cursor: "pointer" }}
            onClick={async () => {
              if (!current) return;

              const q = query(
                collection(db, "orders"),
                where("session_id", "==", selectedSession),
                where("token", "==", current)
              );
              const snap = await getDocs(q);
              if (!snap.empty) {
                const d = snap.docs[0];
                setModalOrder({ id: d.id, ...d.data() });
              }
            }}
          >
            <div style={ui.muted}>NOW SERVING</div>
            <div style={ui.bigToken}>{current || "-"}</div>
          </div>

          <button style={ui.buttonMain} onClick={callNext}>
            Call Next
          </button>

          <button style={ui.buttonSecondary} onClick={callAgain}>
            Call Again
          </button>
        </div>

        {/* ORDER LIST */}
        <h3 style={{ marginTop: 12 }}>Pending / Approved / Paid Orders</h3>
        {loading && <div style={ui.muted}>Loading…</div>}
        {!loading && orders.length === 0 && (
          <div style={ui.muted}>No active orders</div>
        )}

        {orders.map((o) => (
          <div
            key={o.id}
            style={ui.orderCard}
            onClick={() => setModalOrder(o)}
          >
            <div style={{ fontWeight: 900 }}>{o.customerName}</div>
            <div style={ui.muted}>{o.phone}</div>
            <div style={{ marginTop: 6 }}>{formatItems(o.items)}</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              Placed: {formatTime(o.createdAt)}
            </div>

            <div style={{ marginTop: 6, fontWeight: 800, color: "#ffd166" }}>
              Status: {o.status}
            </div>

            <div
              style={{
                color: o.paid ? "#2ecc71" : "#ffb86b",
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              {o.paid ? "PAID" : "UNPAID"}
            </div>
          </div>
        ))}

        {/* ---------- MODAL ---------- */}
        {modalOrder && (
          <div style={ui.modalBackdrop} onClick={() => setModalOrder(null)}>
            <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>
                {modalOrder.customerName}
              </div>
              <div style={ui.muted}>{modalOrder.phone}</div>

              <div style={{ marginTop: 8 }}>{formatItems(modalOrder.items)}</div>

              <div style={{ marginTop: 8 }}>
                Amount:{" "}
                <b style={{ color: "#ffd166" }}>
                  ₹{Number(modalOrder.total || 0).toFixed(2)}
                </b>
              </div>

              <div style={{ marginTop: 8 }}>
                Status: <b>{modalOrder.status}</b>
              </div>

              <div style={{ marginTop: 8 }}>
                Paid:{" "}
                <b style={{ color: modalOrder.paid ? "#2ecc71" : "#ffb86b" }}>
                  {modalOrder.paid ? "Yes" : "No"}
                </b>
              </div>

              {/* ACTION BUTTONS */}
              <div style={ui.floatingButtons}>
                <button
                  style={ui.approveBtn}
                  onClick={() => approveOrder(modalOrder.id)}
                >
                  Approve
                </button>

                {!modalOrder.paid && (
                  <button
                    style={ui.paidBtn}
                    onClick={() => markPaid(modalOrder.id)}
                  >
                    Mark Paid
                  </button>
                )}

                <button
                  style={ui.deleteBtn}
                  onClick={() => {
                    if (window.confirm("Delete order?"))
                      deleteDoc(doc(db, "orders", modalOrder.id));
                    setModalOrder(null);
                  }}
                >
                  Delete
                </button>
              </div>

              <button
                style={{
                  ...ui.buttonSecondary,
                  marginTop: 10,
                }}
                onClick={() => setModalOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
