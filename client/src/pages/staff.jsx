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

/* ---------------------
   Styles (inline, responsive-aware)
   --------------------- */
const baseStyles = {
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
  approveSection: { marginTop: 16 },
  orderCard: {
    background: "#111",
    padding: 14,
    borderRadius: 10,
    borderLeft: "6px solid #333",
    marginBottom: 12
  },
  orderActions: { marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" },
  approveBtn: { background: "#2ecc71", color: "#01100b", flex: 1 },
  updateBtn: { background: "#ffd166", color: "#111", flex: 1 },
  deleteBtn: { background: "#ff6b6b", color: "#fff", flex: 1 },
  smallNote: { color: "#bfb39a", fontSize: 13 }
};

/* ---------------------
   Component
   --------------------- */
export default function StaffDashboard() {
  const [, navigate] = useLocation();

  // auth
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // sessions & tokens
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("Session 1"); // active session
  const [selectedSession, setSelectedSession] = useState("");
  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]); // array of numbers

  // orders
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // subscriptions refs
  const tokensUnsubRef = useRef(null);
  const ordersUnsubRef = useRef(null);
  const intervalRef = useRef(null);
  const [subscribing, setSubscribing] = useState(false);

  // UI / locking
  // loadingAction: "", or "callNext","callAgain","skipToken","startSession","serveSkipped","approve","undo"
  const [loadingAction, setLoadingAction] = useState("");

  // responsive
  const [isMobile, setIsMobile] = useState(window.innerWidth < 720);

  // recompute responsive on resize
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 720);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // computed styles (mobile)
  const styles = {
    ...baseStyles,
    topPanel: {
      ...baseStyles.topPanel,
      gridTemplateColumns: isMobile ? "1fr" : baseStyles.topPanel.gridTemplateColumns
    },
    liveCard: { ...baseStyles.liveCard },
    skippedChip: { ...baseStyles.skippedChip, cursor: "pointer" }
  };

  /* ---------------------------
     Auth listener
     --------------------------- */
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
        setStaffName(user.email || user.displayName || "staff");
        // auto-select active session will be handled in loadSessions effect below
      } catch (err) {
        console.error("auth token", err);
        setIsStaff(false);
        navigate("/staff-login");
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------
     load session list + active
     --------------------------- */
  async function loadSessions() {
    try {
      const activeSnap = await getDoc(doc(db, "settings", "activeSession"));
      const active = activeSnap.exists() ? activeSnap.data().session_id : "Session 1";
      setSession(active);
      setSelectedSession((prev) => prev || active);

      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map((d) => d.id.replace("session_", ""))
        .filter(Boolean)
        .sort((a, b) => {
          // sort numeric suffix if present
          const na = Number(a.split(" ")[1]) || 0;
          const nb = Number(b.split(" ")[1]) || 0;
          return na - nb;
        });
      setSessions(list);
    } catch (err) {
      console.error("loadSessions", err);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  /* ---------------------------
     Start / stop subscriptions (tokens + orders)
     --------------------------- */
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

    const ordersQ = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", sess),
      orderBy("createdAt", "asc")
    );

    ordersUnsubRef.current = onSnapshot(
      ordersQ,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrders(arr);
        setLoading(false);
      },
      (err) => {
        console.error("orders onSnapshot", err);
      }
    );

    // fallback manual fetch every 5s
    intervalRef.current = setInterval(() => {
      fetchOrdersManual(sess);
    }, 5000);
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

  // when session or auth changes, restart subs
  useEffect(() => {
    if (!isStaff) return;
    stopSubscriptions();
    startSubscriptions(selectedSession || session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, isStaff, session]);

  // cleanup on unmount
  useEffect(() => {
    return () => stopSubscriptions();
  }, []);

  /* ---------------------------
     Manual fetch for orders (fallback)
     --------------------------- */
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
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(arr);
      setLoading(false);
    } catch (err) {
      console.error("fetchOrdersManual", err);
      setLoading(false);
    }
  }

  /* ---------------------------
     Logout
     --------------------------- */
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

  /* ---------------------------
     Token Actions
     - callNext: always moves to next numeric token (NOT a skipped one)
     - callAgain: writes lastCalled
     - skipToken: add any token into skipped[]; if skipping current, advance to next non-skipped numeric token (or set current = 0)
     - serveSkipped: set current to that skipped token and remove from skipped
     - undoLast: uses lastPrev
     --------------------------- */

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

        // find next numeric candidate that is NOT skipped
        let candidate = cur + 1;
        while (skippedArr.includes(candidate) && candidate <= last) candidate++;
        if (candidate <= last) {
          tx.update(ref, {
            currentToken: candidate,
            lastCalled: candidate,
            lastCalledAt: serverTimestamp(),
            lastPrev: cur
          });
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
        if (!snap.exists()) throw new Error("No session");
        const cur = snap.data().currentToken || 0;
        if (!cur || cur === 0) throw new Error("No current token to call");
        tx.update(ref, { lastCalled: cur, lastCalledAt: serverTimestamp() });
      });
    } catch (err) {
      alert("Call Again failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  // skipToken: prompt or promptless; adds to skipped[] (keeps list). If skipping current -> advance to next non-skipped; else do nothing to current.
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

        // update skipped list
        tx.update(ref, { skipped });

        // if skipping current token, advance to next numeric token that's not skipped
        if (tok === currentToken) {
          let candidate = currentToken + 1;
          while (skipped.includes(candidate) && candidate <= lastTokenIssued) candidate++;
          if (candidate <= lastTokenIssued) {
            tx.update(ref, {
              currentToken: candidate,
              lastCalled: candidate,
              lastCalledAt: serverTimestamp(),
              lastPrev: currentToken
            });
          } else {
            // no candidate: clear current (show "-") to avoid showing skipped token as current
            tx.update(ref, {
              currentToken: 0,
              lastPrev: currentToken,
              lastCalled: currentToken,
              lastCalledAt: serverTimestamp()
            });
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
        tx.update(ref, {
          currentToken: tok,
          skipped: newArr,
          lastCalled: tok,
          lastCalledAt: serverTimestamp(),
          lastPrev: currentToken
        });
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
        tx.update(ref, {
          currentToken: prev,
          lastCalled: prev,
          lastCalledAt: serverTimestamp(),
          lastPrev: null
        });
      });
    } catch (err) {
      alert("Undo failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  /* ---------------------------
     Start new session (button)
     create unique next session number and refresh sessions list
     --------------------------- */
  async function startNewSession() {
    if (loadingAction) return;
    setLoadingAction("startSession");
    try {
      // compute next number from existing sessions or active session
      await loadSessions();
      // derive next from the active session name (session var)
      let maxNum = 0;
      sessions.forEach((s) => {
        const n = Number((s || "").split(" ")[1]) || 0;
        if (n > maxNum) maxNum = n;
      });
      const activeN = Number((session || "").split(" ")[1]) || 0;
      if (activeN > maxNum) maxNum = activeN;
      const newNum = maxNum + 1 || 1;
      const newSess = `Session ${newNum}`;

      await setDoc(doc(db, "settings", "activeSession"), { session_id: newSess });
      await setDoc(
        doc(db, "tokens", "session_" + newSess),
        { session_id: newSess, currentToken: 0, lastTokenIssued: 0, skipped: [] },
        { merge: true }
      );

      // refresh sessions and select new one
      await loadSessions();
      setSession(newSess);
      setSelectedSession(newSess);
      alert("Started " + newSess);
    } catch (err) {
      alert("Start session failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  /* ---------------------------
     Orders: approve / update / delete
     --------------------------- */
  async function approveOrder(orderId) {
    if (loadingAction) return;
    setLoadingAction("approve");
    const orderRef = doc(db, "orders", orderId);
    const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order missing");
        const order = orderSnap.data();
        if (order.status !== "pending") throw new Error("Already approved");

        const tokenSnap = await tx.get(tokenRef);
        let last = tokenSnap.exists() ? tokenSnap.data().lastTokenIssued || 0 : 0;
        const next = last + 1;

        tx.update(tokenRef, { lastTokenIssued: next });
        tx.update(orderRef, {
          token: next,
          status: "approved",
          approvedAt: serverTimestamp(),
          session_id: selectedSession || session
        });
      });
    } catch (err) {
      alert("Approve failed: " + (err.message || err));
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
    } catch (err) {
      console.error("deleteOrder", err);
      alert("Delete failed");
    }
  }

  /* ---------------------------
     Helper: format items
     --------------------------- */
  function formatItems(items = []) {
    return (items || []).map((i) => `${i.quantity}×${i.name}`).join(", ");
  }

  /* ---------------------------
     Render UI
     --------------------------- */
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* header */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.title}>Waffle Lounge — Staff Dashboard</div>
            <div style={styles.subtitle}>Manage tokens & serve customers</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={styles.smallMuted}>Signed in as</div>
            <div style={{ fontWeight: 800 }}>{isStaff ? staffName : "—"}</div>
          </div>
        </div>

        {/* top panel */}
        <div style={styles.topPanel}>
          {/* left: live card */}
          <div style={styles.liveCard}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={styles.smallMuted}>Now Serving</div>
                <div style={styles.bigToken}>{current || "-"}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={styles.smallMuted}>Last Issued</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#ffd166" }}>{lastIssued || 0}</div>

                <div style={{ marginTop: 10 }}>
                  <div style={styles.smallMuted}>Session</div>
                  <select
                    style={styles.sessionSelect}
                    value={selectedSession}
                    onChange={(e) => {
                      setSelectedSession(e.target.value);
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

            {/* skipped */}
            <div style={{ marginTop: 14 }}>
              <div style={styles.smallMuted}>Skipped Tokens</div>
              <div style={{ marginTop: 8 }}>
                {skipped && skipped.length ? (
                  skipped.map((t) => (
                    <span
                      key={t}
                      style={styles.skippedChip}
                      onClick={() => {
                        // quick serve selected skipped token (confirmation)
                        if (window.confirm(`Serve skipped token ${t} now?`)) serveSkipped(t);
                      }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <div style={{ color: "#666", marginTop: 6 }}>— none —</div>
                )}
              </div>
            </div>

            {/* actions row */}
            <div style={styles.actionsRow}>
              <button
                style={{
                  ...styles.btn,
                  ...styles.callBtn,
                  opacity: loadingAction === "callNext" ? 0.6 : 1
                }}
                onClick={callNext}
                disabled={!!loadingAction}
              >
                {loadingAction === "callNext" ? "Processing..." : "Call Next"}
              </button>

              <button
                style={{
                  ...styles.btn,
                  ...styles.callAgainBtn,
                  opacity: loadingAction === "callAgain" ? 0.6 : 1
                }}
                onClick={callAgain}
                disabled={!!loadingAction}
              >
                {loadingAction === "callAgain" ? "Calling..." : "Call Again"}
              </button>

              <button
                style={{
                  ...styles.btn,
                  ...styles.skipBtn,
                  opacity: loadingAction === "skipToken" ? 0.6 : 1
                }}
                onClick={skipToken}
                disabled={!!loadingAction}
              >
                {loadingAction === "skipToken" ? "Skipping..." : "Skip Token"}
              </button>
            </div>

            {/* secondary row */}
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => fetchOrdersManual(selectedSession)}
                style={{ ...styles.btn, ...styles.refreshBtn }}
              >
                Refresh Orders
              </button>

              <button
                onClick={logout}
                style={{ ...styles.btn, marginLeft: 8, background: "#333", color: "#ffd166" }}
              >
                Logout
              </button>

              <button
                onClick={undoLast}
                style={{
                  ...styles.btn,
                  marginLeft: 8,
                  background: "#222",
                  color: "#ffd166",
                  opacity: loadingAction === "undo" ? 0.6 : 1
                }}
                disabled={!!loadingAction}
              >
                {loadingAction === "undo" ? "Undoing..." : "Undo"}
              </button>
            </div>

            <div style={{ marginTop: 10, ...baseStyles.smallNote }}>Auto-refresh (live) enabled. Manual refresh available.</div>
          </div>

          {/* right panel */}
          <div style={{ background: "#111", padding: 16, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Session Controls</div>

            <button
              style={{
                ...styles.btn,
                background: "#ffd166",
                color: "#111",
                width: "100%",
                marginBottom: 10,
                opacity: loadingAction === "startSession" ? 0.6 : 1
              }}
              onClick={startNewSession}
              disabled={!!loadingAction}
            >
              {loadingAction === "startSession" ? "Starting..." : "Start New Session"}
            </button>

            <div style={{ marginTop: 10 }}>
              <div style={baseStyles.smallNote}>Active Session</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>{session}</div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={baseStyles.smallNote}>Quick actions</div>

              <button
                style={{
                  ...styles.btn,
                  background: "#2ecc71",
                  color: "#01110b",
                  width: "100%",
                  marginTop: 8,
                  opacity: loadingAction === "serveSkipped" ? 0.6 : 1
                }}
                onClick={() => {
                  if (!skipped.length) return alert("No skipped tokens");
                  const tok = Number(prompt("Enter token to serve:", skipped[0]));
                  if (tok) serveSkipped(tok);
                }}
                disabled={!!loadingAction}
              >
                {loadingAction === "serveSkipped" ? "Serving..." : "Serve Skipped"}
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

        {/* pending orders */}
        <div style={baseStyles.approveSection}>
          <h3>Pending Orders (Session: {selectedSession || session})</h3>

          {loading && <div>Loading…</div>}

          {!loading && orders.length === 0 && <div style={{ color: "#666" }}>No pending orders</div>}

          {orders.map((order) => (
            <div key={order.id} style={baseStyles.orderCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{order.customerName || "Unknown"}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{order.phone}</div>
                  <div style={{ marginTop: 8, color: "#ddd" }}>{formatItems(order.items || [])}</div>
                  <div style={{ marginTop: 6, color: "#999", fontSize: 13 }}>
                    Placed: {order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#bfb39a", marginBottom: 6 }}>Status:</div>
                  <div style={{ fontWeight: 800, color: "#ffd166" }}>{order.status}</div>
                  {order.token && (
                    <div style={{ marginTop: 12 }}>
                      Token: <span style={{ fontWeight: 900 }}>{order.token}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={baseStyles.orderActions}>
                <button
                  style={{ ...baseStyles.btn, ...baseStyles.approveBtn }}
                  onClick={() => approveOrder(order.id)}
                  disabled={!!loadingAction}
                >
                  {loadingAction === "approve" ? "Approving..." : "Approve"}
                </button>

                <button style={{ ...baseStyles.btn, ...baseStyles.updateBtn }} onClick={() => updateOrder(order)}>
                  Update
                </button>

                <button style={{ ...baseStyles.btn, ...baseStyles.deleteBtn }} onClick={() => deleteOrder(order.id)}>
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
