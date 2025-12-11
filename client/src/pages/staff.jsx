// client/src/pages/StaffDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
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
  updateDoc,
  onSnapshot,
  where
} from "firebase/firestore";

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
    borderLeft: "8px solid #ffd166"
  },
  bigToken: {
    fontSize: 60,
    fontWeight: 900,
    color: "#ffd166",
    letterSpacing: 2
  },
  smallMuted: { color: "#bfb39a", fontSize: 13 },
  infoRow: { display: "flex", justifyContent: "space-between", marginTop: 8 },

  skippedChip: {
    display: "inline-block",
    background: "#222",
    color: "#ffd166",
    padding: "6px 10px",
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    fontWeight: 700
  },

  actionsRow: {
    display: "flex",
    gap: 12,
    marginTop: 12
  },
  btn: {
    padding: "12px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 800
  },
  callBtn: { background: "#ffd166", color: "#111", flex: 1 },
  callAgainBtn: { background: "#444", color: "#ffd166" },
  skipBtn: { background: "#ff7a00", color: "#111" },
  refreshBtn: { background: "#333", color: "#ffd166" },

  approveSection: {
    marginTop: 16
  },
  orderCard: {
    background: "#111",
    padding: 14,
    borderRadius: 10,
    borderLeft: "6px solid #333",
    marginBottom: 12
  },
  orderActions: { marginTop: 8, display: "flex", gap: 8 },
  approveBtn: { background: "#2ecc71", color: "#01100b" },
  updateBtn: { background: "#ffd166", color: "#111" },
  deleteBtn: { background: "#ff6b6b", color: "#fff" },

  sessionSelect: {
    padding: 10,
    fontSize: 15,
    borderRadius: 8,
    background: "#0c0c0c",
    color: "#fff",
    border: "1px solid #222"
  },

  smallNote: { color: "#bfb39a", fontSize: 13 },

  // simple flash styles (inline style toggles)
  flashGreen: { boxShadow: "0 0 0 4px rgba(46,204,113,0.12)" },
  flashGold: { boxShadow: "0 0 0 4px rgba(255,209,102,0.12)" },
  flashOrange: { boxShadow: "0 0 0 4px rgba(255,122,0,0.12)" }
};

export default function StaffDashboard() {
  // auth fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // session & tokens
  const [session, setSession] = useState("Session 1");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]); // array of token numbers

  // orders
  const [orders, setOrders] = useState([]); // pending orders
  const [loading, setLoading] = useState(false);

  // UI helpers
  const [subscribing, setSubscribing] = useState(false);
  const ordersUnsubRef = useRef(null);
  const tokensUnsubRef = useRef(null);
  const intervalRef = useRef(null);

  // visual flash states
  const [flashCallNext, setFlashCallNext] = useState(false);
  const [flashCallAgain, setFlashCallAgain] = useState(false);
  const [flashSkip, setFlashSkip] = useState(false);
  const [flashViewApproved, setFlashViewApproved] = useState(false);

  // last action info (read from tokens doc)
  const [lastCalled, setLastCalled] = useState(null);
  const [lastPrev, setLastPrev] = useState(null);

  // -----------------------------
  // Load sessions (active + list)
  // -----------------------------
  useEffect(() => {
    async function loadSessions() {
      try {
        const ref = doc(db, "settings", "activeSession");
        const snap = await getDoc(ref);
        const active = snap.exists() ? snap.data().session_id : "Session 1";
        setSession(active);
        setSelectedSession(active);
        localStorage.setItem("session", active);

        // get tokens collection to list sessions
        const tokensSnap = await getDocs(collection(db, "tokens"));
        const sessionList = tokensSnap.docs
          .map((d) => d.id.replace("session_", ""))
          .sort((a, b) => {
            const na = Number(a.split(" ")[1]) || 0;
            const nb = Number(b.split(" ")[1]) || 0;
            return na - nb;
          });

        setSessions(sessionList);
      } catch (err) {
        console.error("loadSessions error", err);
      }
    }

    loadSessions();
  }, []);

  // -----------------------------
  // Auth handling
  // -----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsStaff(false);
        setOrders([]);
        setStaffName("");
        stopSubscriptions();
        return;
      }
      try {
        const tokenResult = await getIdTokenResult(user, true);
        const role = tokenResult.claims?.role;
        if (role === "staff") {
          setIsStaff(true);
          setStaffName(user.displayName || user.email);
          startSubscriptions(selectedSession || session);
        } else {
          setIsStaff(false);
          alert("This user is NOT staff.");
        }
      } catch (err) {
        console.error("auth token error", err);
        setIsStaff(false);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Start/Stop subscriptions
  // -----------------------------
  function startSubscriptions(sess) {
    if (subscribing) return;
    setSubscribing(true);

    // tokens listener
    const tokenRef = doc(db, "tokens", "session_" + sess);
    tokensUnsubRef.current = onSnapshot(tokenRef, (snap) => {
      if (!snap.exists()) {
        setCurrent(0);
        setLastIssued(0);
        setSkipped([]);
        setLastCalled(null);
        setLastPrev(null);
        return;
      }
      const data = snap.data();
      setCurrent(data.currentToken || 0);
      setLastIssued(data.lastTokenIssued || 0);
      setSkipped(Array.isArray(data.skipped) ? data.skipped.slice() : []);
      setLastCalled(data.lastCalled || null);
      setLastPrev(data.lastPrev || null);
    });

    // orders listener for pending orders in selectedSession
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
        console.error("orders onSnapshot error", err);
      }
    );

    // additional auto-refresh fallback every 5 seconds (safe — listeners are primary)
    intervalRef.current = setInterval(() => {
      fetchOrdersManual(sess);
    }, 5000);
  }

  function stopSubscriptions() {
    if (tokensUnsubRef.current) tokensUnsubRef.current();
    if (ordersUnsubRef.current) ordersUnsubRef.current();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSubscribing(false);
  }

  // when selectedSession changes, restart subs
  useEffect(() => {
    if (!isStaff) return;
    stopSubscriptions();
    startSubscriptions(selectedSession || session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, isStaff, session]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopSubscriptions();
    };
  }, []);

  // -----------------------------
  // Manual login/logout
  // -----------------------------
  async function login(e) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    } catch (err) {
      alert("Login failed: " + err.message);
    }
  }

  async function logout() {
    try {
      await signOut(auth);
      stopSubscriptions();
      setIsStaff(false);
    } catch (err) {
      console.error("logout error", err);
    }
  }

  // -----------------------------
  // Fetch orders manually (fallback)
  // -----------------------------
  async function fetchOrdersManual(sess) {
    if (!sess) return;
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
      console.error("fetchOrdersManual error", err);
      setLoading(false);
    }
  }

  // -----------------------------
  // Start new session
  // -----------------------------
  async function startNewSession() {
    try {
      // compute next session name
      let newNum = 1;
      if (session && session.includes(" ")) {
        const n = Number(session.split(" ")[1]);
        if (!isNaN(n)) newNum = n + 1;
      }
      const newSession = `Session ${newNum}`;

      // update settings
      await setDoc(doc(db, "settings", "activeSession"), {
        session_id: newSession
      });

      // initialize tokens doc (with skipped array)
      await setDoc(
        doc(db, "tokens", "session_" + newSession),
        { session_id: newSession, currentToken: 0, lastTokenIssued: 0, skipped: [], lastCalled: 0, lastPrev: 0 },
        { merge: true }
      );

      setSession(newSession);
      setSelectedSession(newSession);
      localStorage.setItem("session", newSession);
      // refresh session list
      const tokensSnap = await getDocs(collection(db, "tokens"));
      const sessionList = tokensSnap.docs.map((d) => d.id.replace("session_", ""));
      setSessions(sessionList);
      alert("New session started: " + newSession);
    } catch (err) {
      console.error("startNewSession error", err);
      alert("Failed to start new session");
    }
  }

  // -----------------------------
  // Approve order (assign token)
  // -----------------------------
  async function approveOrder(orderId) {
    try {
      const orderRef = doc(db, "orders", orderId);

      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order missing");

        const order = orderSnap.data();
        if (order.status !== "pending") throw new Error("Already approved");

        const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
        const tokenSnap = await tx.get(tokenRef);

        let last = tokenSnap.exists() ? tokenSnap.data().lastTokenIssued || 0 : 0;
        const next = last + 1;

        tx.set(
          tokenRef,
          {
            session_id: selectedSession || session,
            currentToken: tokenSnap.exists() ? tokenSnap.data().currentToken : 0,
            lastTokenIssued: next,
            skipped: tokenSnap.exists() ? tokenSnap.data().skipped || [] : []
          },
          { merge: true }
        );

        tx.update(orderRef, {
          token: next,
          status: "approved",
          approvedAt: serverTimestamp(),
          session_id: selectedSession || session
        });
      });
    } catch (err) {
      alert("Approve failed: " + err.message);
      console.error(err);
    }
  }

  // -----------------------------
  // Call Next (serving logic)
  // - store lastPrev to allow undo
  // - if skipped[] exists, serve smallest skipped token first
  // - else increment currentToken (if <= lastTokenIssued)
  // -----------------------------
  async function callNext() {
    // visual flash
    setFlashCallNext(true);
    setTimeout(() => setFlashCallNext(false), 700);

    const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);

        let cur = 0;
        let last = 0;
        let skippedArr = [];

        if (snap.exists()) {
          const data = snap.data();
          cur = data.currentToken || 0;
          last = data.lastTokenIssued || 0;
          skippedArr = Array.isArray(data.skipped) ? data.skipped.slice() : [];
        }

        // Save previous value for undo
        const prev = cur;

        if (skippedArr.length > 0) {
          // serve smallest skipped token first
          const nextSkipped = Math.min(...skippedArr);
          const newSkipped = skippedArr.filter((t) => t !== nextSkipped);
          tx.update(tokenRef, {
            currentToken: nextSkipped,
            skipped: newSkipped,
            lastCalled: nextSkipped,
            lastPrev: prev,
            lastCalledAt: serverTimestamp()
          });
        } else {
          // normal increment — go to next if available
          const candidate = cur + 1;
          if (candidate <= last) {
            tx.update(tokenRef, {
              currentToken: candidate,
              lastCalled: candidate,
              lastPrev: prev,
              lastCalledAt: serverTimestamp()
            });
          } else {
            throw new Error("No next token available");
          }
        }
      });
    } catch (err) {
      alert("Call Next failed: " + (err.message || err));
      console.error(err);
    }
  }

  // -----------------------------
  // Call Again (reannounce current)
  // -----------------------------
  async function callAgain() {
    setFlashCallAgain(true);
    setTimeout(() => setFlashCallAgain(false), 600);

    const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        if (!snap.exists()) throw new Error("No token doc");
        const cur = snap.data().currentToken || 0;
        if (!cur || cur === 0) throw new Error("No current token to call");
        tx.update(tokenRef, { lastCalled: cur, lastCalledAt: serverTimestamp() });
      });
    } catch (err) {
      alert("Call Again failed: " + (err.message || err));
      console.error(err);
    }
  }

  // -----------------------------
  // Undo Last Call (single step back)
  // -----------------------------
  async function undoLastCall() {
    try {
      const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        if (!snap.exists()) throw new Error("No token doc");
        const data = snap.data();
        const prev = data.lastPrev;
        if (prev === undefined || prev === null) throw new Error("No previous token to undo to");
        tx.update(tokenRef, {
          currentToken: prev,
          lastCalled: prev,
          lastPrev: null,
          lastCalledAt: serverTimestamp()
        });
      });
    } catch (err) {
      alert("Undo failed: " + (err.message || err));
      console.error(err);
    }
  }

  // -----------------------------
  // Skip a token (mark as missed)
  // -----------------------------
  async function skipToken(tokenToSkip) {
    setFlashSkip(true);
    setTimeout(() => setFlashSkip(false), 600);

    if (!window.confirm(`Mark token ${tokenToSkip} as NOT PRESENT (skip)?`)) return;

    const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        let cur = 0;
        let skippedArr = [];
        let last = 0;
        if (snap.exists()) {
          cur = snap.data().currentToken || 0;
          skippedArr = Array.isArray(snap.data().skipped) ? snap.data().skipped.slice() : [];
          last = snap.data().lastTokenIssued || 0;
        }
        // add tokenToSkip if not present
        if (!skippedArr.includes(tokenToSkip)) skippedArr.push(tokenToSkip);
        // sort skipped ascending (so smallest served first later)
        skippedArr = skippedArr.sort((a, b) => a - b);

        tx.set(tokenRef, { skipped: skippedArr }, { merge: true });

        // If we're skipping the currently called token, then advance to next (callNext logic):
        if (tokenToSkip === cur) {
          const nextSkipped = skippedArr.filter((t) => t !== cur);
          if (nextSkipped.length > 0) {
            const candidate = Math.min(...nextSkipped);
            const newSkipped = skippedArr.filter((t) => t !== candidate && t !== cur);
            tx.update(tokenRef, { currentToken: candidate, skipped: newSkipped, lastCalled: candidate, lastPrev: cur, lastCalledAt: serverTimestamp() });
          } else {
            const candidate = cur + 1;
            if (candidate <= last) {
              tx.update(tokenRef, { currentToken: candidate, lastCalled: candidate, lastPrev: cur, lastCalledAt: serverTimestamp() });
            } else {
              // nothing to advance to; keep current as-is (but skipped recorded)
              tx.update(tokenRef, { lastCalled: cur, lastCalledAt: serverTimestamp() });
            }
          }
        }
      });
    } catch (err) {
      alert("Skip failed: " + (err.message || err));
      console.error(err);
    }
  }

  // -----------------------------
  // Serve specific skipped token immediately
  // -----------------------------
  async function serveSkipped(tokenNumber) {
    if (!window.confirm(`Serve skipped token ${tokenNumber} now?`)) return;
    const tokenRef = doc(db, "tokens", "session_" + (selectedSession || session));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        if (!snap.exists()) throw new Error("No token doc");
        let arr = Array.isArray(snap.data().skipped) ? snap.data().skipped.slice() : [];
        arr = arr.filter((t) => t !== tokenNumber);
        tx.update(tokenRef, { currentToken: tokenNumber, skipped: arr, lastCalled: tokenNumber, lastPrev: snap.data().currentToken || 0, lastCalledAt: serverTimestamp() });
      });
    } catch (err) {
      alert("Serve skipped failed: " + (err.message || err));
      console.error(err);
    }
  }

  // -----------------------------
  // Mark Paid (customer paid at counter)
  // - find order by token & session and set status = 'paid'
  // -----------------------------
  async function markPaidForCurrent() {
    if (!current || current === 0) { alert("No current token"); return; }

    try {
      // find order with this token for this session (approved)
      const q = query(
        collection(db, "orders"),
        where("token", "==", current),
        where("session_id", "==", selectedSession || session),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) { alert("Order not found for current token"); return; }

      const orderRef = doc(db, "orders", snap.docs[0].id);
      await updateDoc(orderRef, { status: "paid", paidAt: serverTimestamp() });
      alert(`Marked token ${current} as PAID`);
    } catch (err) {
      console.error("markPaid error", err);
      alert("Failed to mark paid");
    }
  }

  // -----------------------------
  // Finish (kitchen finished) -> set status 'completed'
  // - the token/order will no longer show in staff/approved lists
  // -----------------------------
  async function finishForCurrent() {
    if (!current || current === 0) { alert("No current token"); return; }

    if (!window.confirm(`Mark token ${current} as COMPLETED (remove from dashboard)?`)) return;

    try {
      const q = query(
        collection(db, "orders"),
        where("token", "==", current),
        where("session_id", "==", selectedSession || session),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) { alert("Order not found for current token"); return; }

      const orderRef = doc(db, "orders", snap.docs[0].id);
      await updateDoc(orderRef, { status: "completed", completedAt: serverTimestamp() });
      alert(`Token ${current} marked completed`);
    } catch (err) {
      console.error("finish error", err);
      alert("Failed to finish order");
    }
  }

  // -----------------------------
  // Update / Delete order (kept from your code)
  // -----------------------------
  async function updateOrder(order) {
    const newName = prompt("Update name:", order.customerName);
    if (newName === null) return;

    const newPhone = prompt("Update phone:", order.phone);
    if (newPhone === null) return;

    const newItems = prompt(
      "Update Items (qty×name, ...):",
      (order.items || []).map((i) => `${i.quantity}×${i.name}`).join(", ")
    );
    if (newItems === null) return;

    const parsedItems = newItems.split(",").map((str) => {
      const [qty, name] = str.split("×");
      return { quantity: Number(qty.trim()), name: name.trim() };
    });

    try {
      await updateDoc(doc(db, "orders", order.id), {
        customerName: newName.trim(),
        phone: newPhone.trim(),
        items: parsedItems
      });
      alert("Order updated!");
    } catch (err) {
      console.error("updateOrder err", err);
      alert("Update failed");
    }
  }

  async function deleteOrder(orderId) {
    if (!window.confirm("Delete this order?")) return;
    try {
      await deleteDoc(doc(db, "orders", orderId));
    } catch (err) {
      console.error("deleteOrder err", err);
      alert("Delete failed");
    }
  }

  // -----------------------------
  // Approve view navigation kept
  // -----------------------------
  function goApprovedPage() {
    setFlashViewApproved(true);
    setTimeout(() => setFlashViewApproved(false), 500);
    window.location.href = "/approved";
  }

  // -----------------------------
  // small helper: format item text
  // -----------------------------
  function formatItems(items = []) {
    return items.map((i) => `${i.quantity}×${i.name}`).join(", ");
  }

  // helper: find approved/order by token locally (not guaranteed but helpful)
  async function findOrderByToken(tokenNum) {
    // first search local pending orders (unlikely to find approved)
    const local = orders.find((o) => o.token === tokenNum);
    if (local) return local;

    // fallback to query approved/paid/completed
    try {
      const q = query(
        collection(db, "orders"),
        where("token", "==", tokenNum),
        where("session_id", "==", selectedSession || session),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (err) {
      console.error("findOrderByToken err", err);
    }
    return null;
  }

  // -----------------------------
  // UI rendering
  // -----------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* header */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.title}>Waffle Lounge — Staff Dashboard</div>
            <div style={styles.subtitle}>Manage tokens, approve orders and serve customers</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={styles.smallMuted}>Signed in as</div>
            <div style={{ fontWeight: 800 }}>{isStaff ? staffName : "Not signed in"}</div>
          </div>
        </div>

        {/* top panel: live token + session controls */}
        <div style={styles.topPanel}>
          <div style={styles.liveCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#bfb39a" }}>Now Serving</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={styles.bigToken}>{current || "-"}</div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={styles.smallMuted}>Last Issued</div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#ffd166" }}>{lastIssued}</div>

                <div style={{ marginTop: 8 }}>
                  <div style={styles.smallMuted}>Session</div>
                  <select
                    style={styles.sessionSelect}
                    value={selectedSession}
                    onChange={(e) => {
                      setSelectedSession(e.target.value);
                      fetchOrdersManual(e.target.value);
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

            {/* skipped chips */}
            <div style={{ marginTop: 12 }}>
              <div style={styles.smallMuted}>Skipped Tokens</div>
              <div style={{ marginTop: 8 }}>
                {skipped && skipped.length ? (
                  skipped.map((t) => (
                    <span key={t} style={styles.skippedChip}>
                      {t}
                    </span>
                  ))
                ) : (
                  <div style={{ color: "#6b6b6b", marginTop: 8 }}>— none —</div>
                )}
              </div>
            </div>

            {/* actions */}
            <div style={styles.actionsRow}>
              <button
                onClick={callNext}
                style={{
                  ...styles.btn,
                  ...styles.callBtn,
                  ...(flashCallNext ? styles.flashGreen : {})
                }}
              >
                Call Next
              </button>

              <button
                onClick={callAgain}
                style={{
                  ...styles.btn,
                  ...styles.callAgainBtn,
                  ...(flashCallAgain ? styles.flashGold : {})
                }}
              >
                Call Again
              </button>

              <button
                onClick={() => {
                  const tok = Number(prompt("Token to mark as not present (skip):", String(current || "")));
                  if (!tok) return;
                  skipToken(tok);
                }}
                style={{
                  ...styles.btn,
                  ...styles.skipBtn,
                  ...(flashSkip ? styles.flashOrange : {})
                }}
              >
                Skip Token
              </button>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => {
                  fetchOrdersManual(selectedSession || session);
                }}
                style={{ ...styles.btn, ...styles.refreshBtn }}
              >
                Refresh Orders
              </button>

              <button
                onClick={() => goApprovedPage()}
                style={{ ...styles.btn, marginLeft: 8, background: "#333", color: "#ffd166" }}
              >
                View Approved
              </button>

              <button onClick={logout} style={{ ...styles.btn, marginLeft: 8, background: "#333", color: "#ffd166" }}>
                Logout
              </button>

              {/* Undo button visible when lastPrev exists and is different */}
              {lastPrev !== null && lastPrev !== undefined && lastPrev !== current && (
                <button
                  onClick={undoLastCall}
                  style={{ ...styles.btn, marginLeft: 8, background: "#6b6b6b", color: "#fff" }}
                >
                  Undo Last Call
                </button>
              )}
            </div>

            <div style={{ marginTop: 10, ...styles.smallNote }}>Auto-refresh (live) enabled. Manual refresh available.</div>
          </div>

          {/* right column: actions / start session */}
          <div style={{ background: "#111", padding: 16, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Session Controls</div>

            <div style={{ marginBottom: 10 }}>
              <button onClick={startNewSession} style={{ ...styles.btn, background: "#ffd166", color: "#111", width: "100%" }}>
                Start New Session
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ color: "#bfb39a" }}>Active session</label>
              <div style={{ fontWeight: 800, marginTop: 6 }}>{session}</div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ color: "#bfb39a", marginBottom: 6 }}>Quick actions</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ ...styles.btn, background: "#2ecc71", color: "#01100b", flex: 1 }}
                  onClick={() => {
                    const t = Number(prompt("Serve skipped token (enter token):", skipped[0] || ""));
                    if (!t) return;
                    serveSkipped(t);
                  }}
                >
                  Serve Skipped
                </button>

                <button
                  style={{ ...styles.btn, background: "#222", color: "#ffd166", flex: 1 }}
                  onClick={() => goApprovedPage()}
                >
                  Approved Orders
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Approve queue */}
        <div style={styles.approveSection}>
          <h3>Pending Orders (Session: {selectedSession || session})</h3>
          {loading && <div>Loading…</div>}

          {!loading && orders.length === 0 && <div style={{ color: "#6b6b6b" }}>No pending orders</div>}

          {!loading &&
            orders.map((order) => (
              <div key={order.id} style={styles.orderCard}>
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
                    <div style={{ marginTop: 12 }}>{order.token ? <div>Token: <span style={{ fontWeight: 900 }}>{order.token}</span></div> : null}</div>
                  </div>
                </div>

                <div style={styles.orderActions}>
                  <button
                    onClick={() => approveOrder(order.id)}
                    style={{ ...styles.btn, ...styles.approveBtn }}
                  >
                    Approve
                  </button>

                  <button
                    onClick={() => updateOrder(order)}
                    style={{ ...styles.btn, ...styles.updateBtn }}
                  >
                    Update
                  </button>

                  <button
                    onClick={() => deleteOrder(order.id)}
                    style={{ ...styles.btn, ...styles.deleteBtn }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>

        {/* When current token has an order (quick actions Paid / Finish) */}
        <div style={{ marginTop: 22 }}>
          <h3>Current Token Actions</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ color: "#bfb39a" }}>Current: </div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#ffd166" }}>{current || "-"}</div>

            <button onClick={markPaidForCurrent} style={{ ...styles.btn, background: "#6ab04c", color: "#01100b" }}>
              Mark Paid
            </button>

            <button onClick={finishForCurrent} style={{ ...styles.btn, background: "#6c5ce7", color: "#fff" }}>
              Finish (Complete)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
