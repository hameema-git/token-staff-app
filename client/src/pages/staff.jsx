// client/src/pages/StaffDashboard.jsx
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

/**
 * Mobile-first Staff Dashboard
 * - Menu (☰) contains session and advanced actions
 * - Now Serving (big) is tappable to open order popup
 * - Staff sees only pending orders
 * - Approve / Mark Paid flows included
 */

const styles = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 14, fontFamily: "'Segoe UI', Roboto, Arial, sans-serif" },
  container: { maxWidth: 900, margin: "auto", position: "relative" },

  // Header
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
  titleWrap: { display: "flex", flexDirection: "column" },
  title: { fontSize: 20, fontWeight: 900, color: "#ffd166" },
  subtitle: { color: "#bfb39a", fontSize: 12 },

  // Menu button
  menuBtn: { background: "transparent", border: "none", color: "#ffd166", fontSize: 20, cursor: "pointer" },

  // Live card
  liveCard: { background: "#111", padding: 14, borderRadius: 12, borderLeft: "6px solid #ffd166", marginBottom: 14 },
  nowServingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  nowServingBox: { flex: 1, textAlign: "center", cursor: "pointer" },
  bigToken: { fontSize: 56, fontWeight: 900, color: "#ffd166", letterSpacing: 2 },
  smallMuted: { color: "#bfb39a", fontSize: 13 },

  // Buttons row (2 per row on mobile)
  actionsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
  btn: { padding: "12px 10px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14 },
  callBtn: { background: "#ffd166", color: "#111" },
  callAgainBtn: { background: "#444", color: "#ffd166" },
  skipBtn: { background: "#ff7a00", color: "#111" },
  undoBtn: { background: "#333", color: "#ffd166" },

  // Small controls & note
  smallNote: { color: "#bfb39a", fontSize: 12, marginTop: 10 },

  // Orders list
  approveSection: { marginTop: 6 },
  orderCard: { background: "#111", padding: 12, borderRadius: 10, borderLeft: "4px solid #333", marginBottom: 10, cursor: "pointer" },
  orderTopRow: { display: "flex", justifyContent: "space-between", gap: 12 },
  orderActions: { display: "flex", gap: 8, marginTop: 10 },

  // Modal
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
  modal: { background: "#0f0f0f", padding: 16, borderRadius: 12, width: "min(760px, 96%)", color: "#f6e8c1" },

  // Menu drawer (simple)
  drawer: { position: "absolute", right: 12, top: 56, background: "#111", padding: 10, borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.6)", zIndex: 1000, minWidth: 200 },

  // utility
  pill: { display: "inline-block", padding: "6px 8px", borderRadius: 999, background: "#222", color: "#ffd166", fontWeight: 700, marginLeft: 6 }
};

export default function StaffDashboard() {
  const [, navigate] = useLocation();

  // auth & staff
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // sessions & tokens
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("Session 1"); // active session
  const [selectedSession, setSelectedSession] = useState("");
  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);

  // orders (staff sees only pending)
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // subs
  const tokensUnsubRef = useRef(null);
  const ordersUnsubRef = useRef(null);
  const intervalRef = useRef(null);
  const [subscribing, setSubscribing] = useState(false);

  // UI
  const [loadingAction, setLoadingAction] = useState(""); // "", "callNext", "approve", "markPaid", ...
  const [modalOrder, setModalOrder] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // responsive: reduce large token on narrow screens automatically
  const [isMobile, setIsMobile] = useState(window.innerWidth < 720);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // -------- Auth listener --------
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
          // not staff
          alert("Not authorized as staff. Signing out.");
          await signOut(auth);
          navigate("/staff-login");
          return;
        }
        setIsStaff(true);
        setStaffName(user.displayName || user.email || "staff");
      } catch (err) {
        console.error("auth error", err);
        setIsStaff(false);
        navigate("/staff-login");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Load sessions (active) --------
  async function loadSessions() {
    try {
      const activeSnap = await getDoc(doc(db, "settings", "activeSession"));
      const active = activeSnap.exists() ? activeSnap.data().session_id : "Session 1";
      setSession(active);
      // set selectedSession to active if not set — this makes staff and kitchen use same working session
      setSelectedSession((prev) => prev || active);

      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map((d) => d.id.replace("session_", ""))
        .filter(Boolean)
        .sort((a, b) => {
          const na = Number((a || "").split(" ")[1]) || 0;
          const nb = Number((b || "").split(" ")[1]) || 0;
          return na - nb;
        });
      setSessions(list);

      // If there's a latest (largest) session, use that as default too (aligns with staff)
      if (list.length) {
        const latest = list[list.length - 1];
        setSelectedSession((prev) => prev || latest);
      }
    } catch (err) {
      console.error("loadSessions", err);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  // -------- Subscriptions (tokens + pending orders) --------
  function startSubscriptions(sess) {
    if (!sess) return;
    if (subscribing) return;
    setSubscribing(true);
    setLoading(true);

    const tokenRef = doc(db, "tokens", "session_" + sess);
    tokensUnsubRef.current = onSnapshot(
      tokenRef,
      (snap) => {
        if (!snap.exists()) {
          setCurrent(0);
          setLastIssued(0);
          setSkipped([]);
          setLoading(false);
          return;
        }
        const d = snap.data();
        setCurrent(d.currentToken || 0);
        setLastIssued(d.lastTokenIssued || 0);
        setSkipped(Array.isArray(d.skipped) ? d.skipped.slice().sort((a, b) => a - b) : []);
        setLoading(false);
      },
      (err) => {
        console.error("tokens onSnapshot", err);
      }
    );

    // staff only cares about pending orders for approving
    const ordersQ = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", sess),
      orderBy("createdAt", "asc")
    );
    ordersUnsubRef.current = onSnapshot(
      ordersQ,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data();
          // normalize items
          let items = [];
          if (Array.isArray(data.items)) items = data.items;
          else if (data.items && typeof data.items === "object") items = Object.values(data.items);
          return { id: d.id, ...data, items };
        });
        setOrders(arr);
        setLoading(false);
      },
      (err) => {
        console.error("orders onSnapshot", err);
      }
    );

    // fallback fetch every 6s
    intervalRef.current = setInterval(() => {
      fetchOrdersManual(sess).catch(() => {});
    }, 6000);
  }

  function stopSubscriptions() {
    if (tokensUnsubRef.current) tokensUnsubRef.current();
    if (ordersUnsubRef.current) ordersUnsubRef.current();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSubscribing(false);
  }

  useEffect(() => {
    if (!isStaff) return;
    stopSubscriptions();
    startSubscriptions(selectedSession || session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, isStaff, session]);

  useEffect(() => {
    return () => stopSubscriptions();
  }, []);

  // manual fetch fallback
  async function fetchOrdersManual(sess) {
    try {
      setLoading(true);
      const q = query(
        collection(db, "orders"),
        where("status", "==", "pending"),
        where("session_id", "==", sess),
        orderBy("createdAt", "asc")
      );
      const snap = await getDocs(q);
      const arr = snap.docs.map((d) => {
        const data = d.data();
        let items = [];
        if (Array.isArray(data.items)) items = data.items;
        else if (data.items && typeof data.items === "object") items = Object.values(data.items);
        return { id: d.id, ...data, items };
      });
      setOrders(arr);
      setLoading(false);
    } catch (err) {
      console.error("fetchOrdersManual", err);
      setLoading(false);
    }
  }

  // -------- Auth actions --------
  async function logout() {
    try {
      await signOut(auth);
      stopSubscriptions();
      setIsStaff(false);
      navigate("/staff-login");
    } catch (err) {
      console.error("logout", err);
      alert("Logout failed");
    }
  }

  // -------- Token actions --------
  async function callNext() {
    if (loadingAction) return;
    setLoadingAction("callNext");
    const ref = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Session missing");
        const data = snap.data();
        const cur = data.currentToken || 0;
        const last = data.lastTokenIssued || 0;
        const skippedArr = Array.isArray(data.skipped) ? data.skipped.slice() : [];

        // pick next numeric token not in skipped
        let candidate = cur + 1;
        while (skippedArr.includes(candidate) && candidate <= last) candidate++;
        if (candidate <= last) {
          tx.update(ref, { currentToken: candidate, lastCalled: candidate, lastCalledAt: serverTimestamp(), lastPrev: cur });
        } else {
          throw new Error("No next token available");
        }
      });
    } catch (err) {
      alert("Call Next failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function callAgain() {
    if (loadingAction) return;
    setLoadingAction("callAgain");
    const ref = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("No token doc");
        const cur = snap.data().currentToken || 0;
        if (!cur) throw new Error("No current token to call");
        tx.update(ref, { lastCalled: cur, lastCalledAt: serverTimestamp() });
      });
    } catch (err) {
      alert("Call Again failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function skipToken() {
    if (loadingAction) return;
    setLoadingAction("skipToken");
    try {
      const tok = Number(prompt("Enter token to skip:", current || ""));
      if (!tok) {
        setLoadingAction("");
        return;
      }
      const ref = doc(db, "tokens", "session_" + (selectedSession || session));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Session missing");
        let { skipped = [], currentToken = 0, lastTokenIssued = 0 } = snap.data();
        skipped = Array.isArray(skipped) ? skipped.slice() : [];
        if (!skipped.includes(tok)) {
          skipped.push(tok);
          skipped.sort((a, b) => a - b);
        }
        tx.update(ref, { skipped });

        // if skipping current token, advance to next non-skipped or clear
        if (tok === currentToken) {
          let candidate = currentToken + 1;
          while (skipped.includes(candidate) && candidate <= lastTokenIssued) candidate++;
          if (candidate <= lastTokenIssued) {
            tx.update(ref, { currentToken: candidate, lastCalled: candidate, lastCalledAt: serverTimestamp(), lastPrev: currentToken });
          } else {
            tx.update(ref, { currentToken: 0, lastPrev: currentToken, lastCalled: currentToken, lastCalledAt: serverTimestamp() });
          }
        }
      });
    } catch (err) {
      alert("Skip failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function serveSkipped(tok) {
    if (loadingAction) return;
    setLoadingAction("serveSkipped");
    try {
      if (!tok) return;
      const ref = doc(db, "tokens", "session_" + (selectedSession || session));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Session missing");
        let { skipped = [], currentToken = 0 } = snap.data();
        skipped = Array.isArray(skipped) ? skipped.slice() : [];
        if (!skipped.includes(tok)) throw new Error("Token not in skipped list");
        const newArr = skipped.filter((x) => x !== tok);
        tx.update(ref, { currentToken: tok, skipped: newArr, lastCalled: tok, lastCalledAt: serverTimestamp(), lastPrev: currentToken });
      });
    } catch (err) {
      alert("Serve skipped failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function undoLast() {
    if (loadingAction) return;
    setLoadingAction("undo");
    try {
      const ref = doc(db, "tokens", "session_" + (selectedSession || session));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Session missing");
        const prev = snap.data().lastPrev;
        if (prev == null) throw new Error("Nothing to undo");
        tx.update(ref, { currentToken: prev, lastCalled: prev, lastCalledAt: serverTimestamp(), lastPrev: null });
      });
    } catch (err) {
      alert("Undo failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function startNewSession() {
    if (loadingAction) return;
    setLoadingAction("startSession");
    try {
      await loadSessions();
      let max = 0;
      sessions.forEach((s) => {
        const n = Number((s || "").split(" ")[1]) || 0;
        if (n > max) max = n;
      });
      const activeN = Number((session || "").split(" ")[1]) || 0;
      if (activeN > max) max = activeN;
      const newNum = (max || 0) + 1;
      const newSess = `Session ${newNum || 1}`;

      await setDoc(doc(db, "settings", "activeSession"), { session_id: newSess });
      await setDoc(doc(db, "tokens", "session_" + newSess), { session_id: newSess, currentToken: 0, lastTokenIssued: 0, skipped: [] }, { merge: true });

      await loadSessions();
      setSession(newSess);
      setSelectedSession(newSess);
      alert("Started " + newSess);
      setMenuOpen(false);
    } catch (err) {
      alert("Start session failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  // -------- Orders: approve / markPaid / update / delete --------
  async function approveOrder(orderId) {
    if (loadingAction) return;
    setLoadingAction("approve");
    try {
      const orderRef = doc(db, "orders", orderId);
      const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order missing");
        const order = orderSnap.data();
        if (order.status !== "pending") throw new Error("Already processed");

        const tokenSnap = await tx.get(tokenRef);
        let last = tokenSnap.exists() ? tokenSnap.data().lastTokenIssued || 0 : 0;
        const next = last + 1;

        tx.update(tokenRef, { lastTokenIssued: next });

        // If already paid -> immediately mark paid so it goes to kitchen
        if (order.paid) {
          tx.update(orderRef, { token: next, status: "paid", approvedAt: serverTimestamp(), paidAt: order.paidAt || serverTimestamp(), session_id: selectedSession || session });
        } else {
          tx.update(orderRef, { token: next, status: "approved", approvedAt: serverTimestamp(), session_id: selectedSession || session });
        }
      });
      setModalOrder(null);
    } catch (err) {
      alert("Approve failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function markPaid(orderId) {
    if (loadingAction) return;
    setLoadingAction("markPaid");
    try {
      const orderRef = doc(db, "orders", orderId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists()) throw new Error("Order missing");
        const data = snap.data();
        const alreadyApproved = data.status === "approved";
        if (alreadyApproved) {
          // approved -> convert to paid and set paidAt
          tx.update(orderRef, { paid: true, paidAt: serverTimestamp(), status: "paid" });
        } else {
          tx.update(orderRef, { paid: true, paidAt: serverTimestamp() });
        }
      });
      setModalOrder(null);
    } catch (err) {
      alert("Mark paid failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  async function updateOrder(order) {
    try {
      const name = prompt("Customer name:", order.customerName || "");
      if (name == null) return;
      const phone = prompt("Phone:", order.phone || "");
      if (phone == null) return;
      await updateDoc(doc(db, "orders", order.id), { customerName: name, phone });
    } catch (err) {
      console.error("updateOrder", err);
      alert("Update failed");
    }
  }

  async function deleteOrder(id) {
    if (!window.confirm("Delete this order?")) return;
    try {
      await deleteDoc(doc(db, "orders", id));
      setModalOrder(null);
    } catch (err) {
      console.error("deleteOrder", err);
      alert("Delete failed");
    }
  }

  // helper: format items
  function formatItems(items = []) {
    return (items || []).map((i) => `${i.quantity}×${i.name}`).join(", ");
  }

  function formatTimestamp(ts) {
    try {
      if (!ts) return "—";
      if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
      if (ts instanceof Date) return ts.toLocaleString();
      return String(ts);
    } catch {
      return "—";
    }
  }

  // open popup for current token — finds any order with token === current (approved/paid)
  async function openCurrentTokenDetails() {
    if (!current) return alert("No current token");
    try {
      setLoadingAction("openCurrent");
      const q = query(
        collection(db, "orders"),
        where("session_id", "==", selectedSession || session),
        where("token", "==", current)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        alert("No order found for current token");
      } else {
        const docSnap = snap.docs[0];
        const d = docSnap.data();
        let items = [];
        if (Array.isArray(d.items)) items = d.items;
        else if (d.items && typeof d.items === "object") items = Object.values(d.items);
        setModalOrder({ id: docSnap.id, ...d, items });
      }
    } catch (err) {
      console.error("openCurrent", err);
      alert("Failed to open current token details");
    } finally {
      setLoadingAction("");
    }
  }

  // menu actions
  function gotoApproved() {
    setMenuOpen(false);
    navigate("/approved");
  }
  function gotoKitchen() {
    setMenuOpen(false);
    navigate("/kitchen");
  }

  // pick latest session (helper) — sync staff & kitchen
  function pickLatestSession() {
    if (sessions && sessions.length) {
      const latest = sessions[sessions.length - 1];
      setSelectedSession(latest);
      setMenuOpen(false);
    } else {
      alert("No sessions available");
    }
  }

  // UI render
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleWrap}>
            <div style={styles.title}>Waffle Lounge</div>
            <div style={styles.subtitle}>Staff dashboard</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={styles.smallMuted}>Signed in as</div>
              <div style={{ fontWeight: 800 }}>{isStaff ? staffName : "—"}</div>
              <div style={{ fontSize: 12, color: "#bfb39a", marginTop: 6 }}>Session: <strong style={{ color: "#ffd166" }}>{selectedSession || session}</strong></div>
            </div>

            <button
              aria-label="menu"
              onClick={() => setMenuOpen((s) => !s)}
              style={styles.menuBtn}
            >
              ☰
            </button>
          </div>
        </div>

        {/* Simple menu drawer */}
        {menuOpen && (
          <div style={styles.drawer}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={pickLatestSession} style={{ ...styles.btn, background: "#444", color: "#ffd166", borderRadius: 8 }}>Use Latest Session</button>
              <button onClick={startNewSession} disabled={!!loadingAction} style={{ ...styles.btn, background: "#ffd166", color: "#111", borderRadius: 8 }}>{loadingAction === "startSession" ? "Starting..." : "Start New Session"}</button>
              <button onClick={() => { const tok = Number(prompt("Token to serve (skipped)?", skipped[0] || "")); if (tok) serveSkipped(tok); setMenuOpen(false); }} style={{ ...styles.btn, background: "#2ecc71", color: "#01110b", borderRadius: 8 }}>Serve Skipped</button>
              <button onClick={gotoApproved} style={{ ...styles.btn, background: "#444", color: "#ffd166", borderRadius: 8 }}>Approved Orders</button>
              <button onClick={gotoKitchen} style={{ ...styles.btn, background: "#444", color: "#ffd166", borderRadius: 8 }}>Kitchen</button>
              <button onClick={logout} style={{ ...styles.btn, background: "#333", color: "#ffd166", borderRadius: 8 }}>Logout</button>
            </div>
          </div>
        )}

        {/* Live card */}
        <div style={styles.liveCard}>
          <div style={styles.nowServingRow}>
            <div style={styles.nowServingBox} onClick={openCurrentTokenDetails}>
              <div style={styles.smallMuted}>Now Serving</div>
              <div style={styles.bigToken}>{current || "-"}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#bfb39a" }}>Tap to view order</div>
            </div>

            <div style={{ textAlign: "right", minWidth: 100 }}>
              <div style={styles.smallMuted}>Last Issued</div>
              <div style={{ fontWeight: 900, fontSize: 20, color: "#ffd166" }}>{lastIssued || 0}</div>

              <div style={{ marginTop: 8 }}>
                <div style={styles.smallMuted}>Skipped</div>
                <div style={{ marginTop: 6 }}>
                  {skipped && skipped.length ? (
                    skipped.slice(0, 6).map((t) => <span key={t} style={{ ...styles.pill }}>{t}</span>)
                  ) : (
                    <div style={{ color: "#6b6b6b" }}>— none —</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* actions grid */}
          <div style={styles.actionsGrid}>
            <button
              onClick={callNext}
              disabled={!!loadingAction}
              style={{ ...styles.btn, ...styles.callBtn, opacity: loadingAction === "callNext" ? 0.7 : 1 }}
            >
              {loadingAction === "callNext" ? "Processing…" : "Call Next"}
            </button>

            <button
              onClick={callAgain}
              disabled={!!loadingAction}
              style={{ ...styles.btn, ...styles.callAgainBtn, opacity: loadingAction === "callAgain" ? 0.7 : 1 }}
            >
              {loadingAction === "callAgain" ? "Calling…" : "Call Again"}
            </button>

            <button
              onClick={skipToken}
              disabled={!!loadingAction}
              style={{ ...styles.btn, ...styles.skipBtn, opacity: loadingAction === "skipToken" ? 0.7 : 1 }}
            >
              {loadingAction === "skipToken" ? "Skipping…" : "Skip Token"}
            </button>

            <button
              onClick={undoLast}
              disabled={!!loadingAction}
              style={{ ...styles.btn, ...styles.undoBtn, opacity: loadingAction === "undo" ? 0.7 : 1 }}
            >
              {loadingAction === "undo" ? "Undoing…" : "Undo"}
            </button>
          </div>

          <div style={styles.smallNote}>Only pending orders are shown below for approval. Tap Now Serving to view the current token's order.</div>
        </div>

        {/* Pending orders list */}
        <div style={styles.approveSection}>
          <h3 style={{ marginBottom: 8 }}>Pending Orders (Session: {selectedSession || session})</h3>

          {loading && <div style={{ color: "#bfb39a" }}>Loading…</div>}
          {!loading && orders.length === 0 && <div style={{ color: "#6b6b6b" }}>No pending orders</div>}

          {orders.map((order) => (
            <div key={order.id} style={styles.orderCard} onClick={() => setModalOrder(order)}>
              <div style={styles.orderTopRow}>
                <div style={{ maxWidth: "70%" }}>
                  <div style={{ fontWeight: 900 }}>{order.customerName || "Unknown"}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{order.phone}</div>
                  <div style={{ marginTop: 8, color: "#ddd", fontSize: 13 }}>{formatItems(order.items || [])}</div>
                  <div style={{ marginTop: 6, color: "#999", fontSize: 12 }}>Placed: {formatTimestamp(order.createdAt)}</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#bfb39a", marginBottom: 6 }}>Status</div>
                  <div style={{ fontWeight: 800, color: "#ffd166" }}>{order.status}</div>
                  <div style={{ marginTop: 8, color: order.paid ? "#2ecc71" : "#ffb86b", fontWeight: 800 }}>{order.paid ? "PAID" : "UNPAID"}</div>
                </div>
              </div>

              <div style={styles.orderActions}>
                <button
                  onClick={(e) => { e.stopPropagation(); approveOrder(order.id); }}
                  disabled={!!loadingAction}
                  style={{ ...styles.btn, background: "#2ecc71", color: "#01110b", borderRadius: 8, flex: 1 }}
                >
                  {loadingAction === "approve" ? "Approving…" : "Approve"}
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); updateOrder(order); }}
                  style={{ ...styles.btn, background: "#ffd166", color: "#111", borderRadius: 8 }}
                >
                  Update
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); if (!window.confirm("Delete this order?")) return; deleteOrder(order.id); }}
                  style={{ ...styles.btn, background: "#ff6b6b", color: "#fff", borderRadius: 8 }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal / popup for order details */}
        {modalOrder && (
          <div style={styles.modalBackdrop} onClick={() => setModalOrder(null)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{modalOrder.customerName || "Unknown"}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{modalOrder.phone}</div>
                  <div style={{ marginTop: 10, color: "#ddd" }}>{formatItems(modalOrder.items || [])}</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={styles.smallMuted}>Status</div>
                  <div style={{ fontWeight: 800, color: "#ffd166" }}>{modalOrder.status}</div>

                  <div style={{ marginTop: 10 }}>
                    <div style={styles.smallMuted}>Token</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{modalOrder.token || "—"}</div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={styles.smallMuted}>Amount</div>
                    <div style={{ fontWeight: 900, color: "#ffd166" }}>₹{Number(modalOrder.total || 0).toFixed(2)}</div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={styles.smallMuted}>Paid</div>
                    <div style={{ fontWeight: 800, color: modalOrder.paid ? "#2ecc71" : "#ffb86b" }}>{modalOrder.paid ? "Yes" : "No"}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, color: "#999" }}>
                Placed: {formatTimestamp(modalOrder.createdAt)}
                {modalOrder.approvedAt && <><br />Approved: {formatTimestamp(modalOrder.approvedAt)}</>}
                {modalOrder.paidAt && <><br />Paid: {formatTimestamp(modalOrder.paidAt)}</>}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button
                  onClick={() => approveOrder(modalOrder.id)}
                  disabled={!!loadingAction}
                  style={{ ...styles.btn, background: "#2ecc71", color: "#01110b", borderRadius: 8 }}
                >
                  {loadingAction === "approve" ? "Approving…" : (modalOrder.paid ? "Approve & Send to Kitchen" : "Approve (awaiting payment)")}
                </button>

                <button
                  onClick={() => { if (!window.confirm("Mark this order as PAID?")) return; markPaid(modalOrder.id); }}
                  disabled={!!loadingAction || modalOrder.paid}
                  style={{ ...styles.btn, background: "#444", color: "#ffd166", borderRadius: 8 }}
                >
                  {loadingAction === "markPaid" ? "Marking…" : (modalOrder.paid ? "Already Paid" : "Mark Paid")}
                </button>

                <button onClick={() => updateOrder(modalOrder)} style={{ ...styles.btn, background: "#ffd166", color: "#111", borderRadius: 8 }}>
                  Update
                </button>

                <button onClick={() => { if (!window.confirm("Delete this order?")) return; deleteOrder(modalOrder.id); }} style={{ ...styles.btn, background: "#ff6b6b", color: "#fff", borderRadius: 8 }}>
                  Delete
                </button>

                <div style={{ flex: 1 }} />

                <button onClick={() => setModalOrder(null)} style={{ ...styles.btn, background: "#222", color: "#ffd166", borderRadius: 8 }}>
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
