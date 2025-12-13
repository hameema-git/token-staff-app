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
  onSnapshot
} from "firebase/firestore";

/* ---------------- STYLES ---------------- */
const styles = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 14 },
  container: { maxWidth: 900, margin: "auto" },
  header: { display: "flex", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 900, color: "#ffd166" },
  subtitle: { fontSize: 12, color: "#bfb39a" },
  btn: { padding: "12px 14px", borderRadius: 10, border: "none", fontWeight: 800, cursor: "pointer" },
  menuButton: { background: "transparent", color: "#ffd166", border: "none", fontSize: 22 },

  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    width: 260,
    height: "100%",
    background: "#0f0f0f",
    padding: 14,
    zIndex: 10000,
    overflowY: "auto"
  },
  drawerClose: {
    position: "absolute",
    right: 10,
    top: 8,
    background: "transparent",
    border: "none",
    color: "#ffd166",
    fontSize: 18
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  modal: {
    background: "#111",
    padding: 16,
    borderRadius: 10,
    width: "min(720px, 96%)"
  }
};

export default function StaffDashboard() {
  const [, navigate] = useLocation();

  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("Session 1");
  const [selectedSession, setSelectedSession] = useState("");

  const [orders, setOrders] = useState([]);
  const [modalOrder, setModalOrder] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tokensUnsubRef = useRef(null);
  const ordersUnsubRef = useRef(null);

  /* ---------------- AUTH ---------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate("/staff-login");
      const res = await getIdTokenResult(user, true);
      if (res.claims?.role !== "staff") {
        await signOut(auth);
        navigate("/staff-login");
        return;
      }
      setIsStaff(true);
      setStaffName(user.displayName || user.email);
    });
    return () => unsub();
  }, []);

  /* ---------------- LOAD SESSIONS ---------------- */
  async function loadSessions() {
    const snap = await getDocs(collection(db, "tokens"));
    const list = snap.docs.map(d => d.id.replace("session_", ""));
    setSessions(list);
    setSession(list[list.length - 1] || "Session 1");
    setSelectedSession(list[list.length - 1] || "Session 1");
  }

  useEffect(() => {
    loadSessions();
  }, []);

  /* ---------------- SUBSCRIPTIONS ---------------- */
  useEffect(() => {
    if (!selectedSession) return;

    if (ordersUnsubRef.current) ordersUnsubRef.current();

    const q = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", selectedSession),
      orderBy("createdAt", "asc")
    );

    ordersUnsubRef.current = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      if (ordersUnsubRef.current) ordersUnsubRef.current();
    };
  }, [selectedSession]);

  /* ---------------- LOGOUT ---------------- */
  async function logout() {
    await signOut(auth);
    navigate("/staff-login");
  }

  /* ---------------- RENDER ---------------- */
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Waffle Lounge</div>
            <div style={styles.subtitle}>Staff Dashboard</div>
          </div>

          <div>
            <button
              style={styles.menuButton}
              onClick={() => {
                setModalOrder(null);   // ✅ FIX: close modal
                setDrawerOpen(true);   // open drawer safely
              }}
            >
              ☰
            </button>
            <button
              style={{ ...styles.btn, background: "#333", color: "#ffd166", marginLeft: 8 }}
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>

        {/* PENDING ORDERS */}
        {orders.map(o => (
          <div
            key={o.id}
            style={{ background: "#111", padding: 12, borderRadius: 10, marginBottom: 10 }}
            onClick={() => setModalOrder(o)}
          >
            <b>{o.customerName}</b> — {o.phone}
          </div>
        ))}

   {/* DRAWER */}
{drawerOpen && (
  <div style={styles.drawer} role="dialog" aria-modal="true">
    <button
      style={styles.drawerClose}
      onClick={() => setDrawerOpen(false)}
    >
      ✕
    </button>

    <h3 style={{ color: "#ffd166" }}>Menu</h3>

    {/* NAVIGATION */}
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
      style={{ ...styles.btn, background: "#333", color: "#ffd166", marginTop: 8 }}
      onClick={() => {
        setDrawerOpen(false);
        navigate("/completed");
      }}
    >
      Completed Orders
    </button>

    <button
      style={{ ...styles.btn, background: "#333", color: "#ffd166", marginTop: 8 }}
      onClick={() => {
        setDrawerOpen(false);
        navigate("/kitchen");
      }}
    >
      KitchenSSSSSS
    </button>

    {/* ✅ OWNER SUMMARY */}
    <button
      style={{ ...styles.btn, background: "#333", color: "#ffd166", marginTop: 8 }}
      onClick={() => {
        setDrawerOpen(false);
        navigate("/owner-summary");
      }}
    >
      📊 Owner Summary
    </button>

    {/* DANGER ZONE */}
    <div style={{ marginTop: 24 }}>
      <div style={{ color: "#bfb39a", marginBottom: 6 }}>Danger</div>

      <button
        style={{ ...styles.btn, background: "#551111", color: "#fff" }}
        onClick={() => {
          if (!window.confirm("Start a NEW session?")) return;
          startNewSession();
          setDrawerOpen(false);
        }}
      >
        Start New Session
      </button>
    </div>
  </div>
)}


        {/* MODAL */}
        {modalOrder && (
          <div style={styles.modalBackdrop} onClick={() => setModalOrder(null)}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <h3>{modalOrder.customerName}</h3>
              <p>{modalOrder.phone}</p>
              <button style={{ ...styles.btn, background: "#222", color: "#ffd166" }}
                onClick={() => setModalOrder(null)}>
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
