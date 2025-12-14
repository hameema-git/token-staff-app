// client/src/pages/StaffDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { auth, db, serverTimestamp } from "../firebaseInit";
import { signOut, onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { useShop } from "../context/ShopContext";

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

/**
 * Mobile-first Staff Dashboard (Option A)
 *
 * - Main list shows only orders with status === "pending"
 * - Approve assigns token; if order.paid === true at approval -> status "paid" (goes to kitchen)
 * - Staff may markPaid (if they receive cash), which if already approved turns status -> "paid"
 * - Now Serving number is clickable to view the order that holds that token (if exists)
 * - Skipped tokens are kept in tokens/session_x.skipped (array)
 * - Call Next will advance to next numeric token that is NOT in skipped[] (no auto-serving skipped)
 * - ServeSkipped explicitly serves a skipped token (removes it from skipped and sets as current)
 *
 * Important: The server/firestore rules and other pages (Kitchen, Approved, Completed) should
 * be implemented separately and must rely on `status` to determine visibility.
 */

const styles = {
  // page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 14, fontFamily: "'Segoe UI', Roboto, Arial, sans-serif" },
  page: {
  background: "var(--bg)",
  color: "var(--text)",
  minHeight: "100vh",
  padding: 14,
  fontFamily: "'Segoe UI', Roboto, Arial, sans-serif"
},
  container: { maxWidth: 900, margin: "auto", position: "relative" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  titleCol: { display: "flex", flexDirection: "column" },
  title: { fontSize: 20, fontWeight: 900, color: "#ffd166" },
  subtitle: { color: "#bfb39a", fontSize: 12 },
  userCol: { textAlign: "right", fontSize: 12 },
  liveCard: { background: "#111", padding: 14, borderRadius: 12, borderLeft: "6px solid #ffd166", marginBottom: 12 },
  nowServingWrap: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  nowServingClickable: { cursor: "pointer" },
  nowServingLabel: { color: "#bfb39a", fontSize: 12 },
  bigToken: { fontSize: 56, fontWeight: 900, color: "#ffd166", letterSpacing: 2, textAlign: "center" },
  smallMuted: { color: "#bfb39a", fontSize: 12 },
  actionsRow: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  btn: { padding: "12px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14 },
  callBtn: { background: "#ffd166", color: "#111", flex: 1 },
  callAgainBtn: { background: "#444", color: "#ffd166", minWidth: 110 },
  skipBtn: { background: "#ff7a00", color: "#111", minWidth: 110 },
  smallBtn: { padding: "8px 10px", borderRadius: 8, fontSize: 13 },
  sessionSelect: { padding: 10, borderRadius: 8, background: "#0f0f0f", border: "1px solid #222", color: "#fff", width: "100%" },
  pendingList: { marginTop: 6 },
  orderCard: { background: "#111", padding: 12, borderRadius: 10, marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  orderLeft: { maxWidth: "65%" },
  orderRight: { textAlign: "right" },
  orderActions: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" },
  approveBtn: { background: "#2ecc71", color: "#01110b" },
  updateBtn: { background: "#ffd166", color: "#111" },
  deleteBtn: { background: "#ff6b6b", color: "#fff" },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
  modal: { background: "#0f0f0f", padding: 16, borderRadius: 10, width: "min(720px, 96%)", color: "#f6e8c1" },
  menuButton: { background: "transparent", color: "#ffd166", border: "none", fontSize: 20, padding: 8 },
  drawer: { position: "fixed", top: 0, left: 0, height: "100%", width: 260, background: "#0f0f0f", boxShadow: "2px 0 10px rgba(0,0,0,0.6)", zIndex: 10000, padding: 14 },
  drawerClose: { position: "absolute", right: 10, top: 8, background: "transparent", border: "none", color: "#ffd166", fontSize: 18 }
};

export default function StaffDashboard() {
  const [, navigate] = useLocation();
  const { shop, loading: shopLoading } = useShop();


  // auth
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // sessions & tokens
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("Session 1"); // active session document id (human)
  const [selectedSession, setSelectedSession] = useState("");
  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);

  // orders (staff sees only pending)
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // subscriptions
  const tokensUnsubRef = useRef(null);
  const ordersUnsubRef = useRef(null);
  const intervalRef = useRef(null);

  // UI
  const [loadingAction, setLoadingAction] = useState(""); // "", "callNext", "approve", "markPaid", etc
  const [modalOrder, setModalOrder] = useState(null); // full order shown in modal
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 720);


  // const [shopOpen, setShopOpen] = useState(true);
  // const [shopMessage, setShopMessage] = useState("");
  // responsive
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // --- Auth listener (ensure staff only)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsStaff(false);
        navigate("/staff-login");
        return;
      }
      try {
        const tokenResult = await getIdTokenResult(user, true);
        const role = tokenResult.claims?.role;
        // keep staff-only view
        if (role !== "staff") {
          alert("Not authorized as staff. Signing out.");
          await signOut(auth);
          navigate("/staff-login");
          return;
        }
        setIsStaff(true);
        setStaffName(user.displayName || user.email || "staff");
      } catch (err) {
        console.error("auth", err);
        setIsStaff(false);
        navigate("/staff-login");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Load sessions and set default (active / latest)
  async function loadSessions() {
    try {
      // get activeSession setting first
      const settingsRef = doc(db, "settings", "activeSession");
      const settingsSnap = await getDocs(collection(db, "tokens")); // get tokens to build session list
      const tokenDocs = settingsSnap.docs;
      const list = tokenDocs.map((d) => d.id.replace("session_", "")).filter(Boolean);
      // sort by numeric suffix (Session 1, Session 2 ...)
      list.sort((a, b) => {
        const na = Number((a || "").split(" ")[1]) || 0;
        const nb = Number((b || "").split(" ")[1]) || 0;
        return na - nb;
      });
      setSessions(list);

      // try activeSession doc
      const activeSnap = await (async () => {
        try {
          const s = await (await import("firebase/firestore")).getDoc(settingsRef);
          return s;
        } catch {
          return null;
        }
      })();

      let active = null;
      if (activeSnap && activeSnap.exists()) {
        active = activeSnap.data().session_id;
      }
      // if no active in settings, pick newest session in list
      const pick = active || list[list.length - 1] || "Session 1";
      setSession(pick);
      setSelectedSession((prev) => prev || pick);
    } catch (err) {
      console.error("loadSessions", err);
      // fallback
      setSelectedSession((prev) => prev || "Session 1");
    }
  }

  // useEffect(() => {
  //   const ref = doc(db, "settings", "shop");
  //   return onSnapshot(ref, snap => {
  //     if (snap.exists()) {
  //       setShopOpen(!!snap.data().isOpen);
  //       setShopMessage(snap.data().message || "");
  //     }
  //   });
  // }, []);

  //  async function openShop() {
  //   await setDoc(doc(db, "settings", "shop"), { isOpen: true, message: "" }, { merge: true });
  // }
  async function openShop() {
  await setDoc(
    doc(db, "settings", "shop"),
    { isOpen: true, message: "" },
    { merge: true }
  );
}


  // async function closeShop() {
  //   const msg = prompt("Closing message", shopMessage || "Shop is closed");
  //   if (msg === null) return;
  //   await setDoc(doc(db, "settings", "shop"), { isOpen: false, message: msg }, { merge: true });
  // }

  async function closeShop() {
  const msg = prompt(
    "Closing message",
    shop?.message || "Shop is closed"
  );
  if (msg === null) return;

  await setDoc(
    doc(db, "settings", "shop"),
    { isOpen: false, message: msg },
    { merge: true }
  );
}

  // 🔒 Prevent showing COMPLETED tokens in "Now Serving"
useEffect(() => {
  if (!current || !selectedSession) return;

  async function validateCurrentToken() {
    const q = query(
      collection(db, "orders"),
      where("session_id", "==", selectedSession),
      where("token", "==", current)
    );

    const snap = await getDocs(q);

    // ❌ No order OR already completed → invalid token
    if (
      snap.empty ||
      snap.docs[0].data().status === "completed"
    ) {
      callNext(); // auto-skip safely
    }
  }

  validateCurrentToken();
}, [current, selectedSession]);


  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Start realtime subscriptions (tokens + pending orders)
  function startSubscriptions(sess) {
    if (!sess) return;
    setLoading(true);

    // tokens doc (session_x)
    const tokenRef = doc(db, "tokens", "session_" + sess);
    if (tokensUnsubRef.current) tokensUnsubRef.current();
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
        setLoading(false);
      }
    );

    // pending orders only
    if (ordersUnsubRef.current) ordersUnsubRef.current();
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
          // normalize items to array
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
        setLoading(false);
      }
    );

    // fallback manual refresh every 6s (safe)
    if (intervalRef.current) clearInterval(intervalRef.current);
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
  }

  // restart subscriptions when session changes
  useEffect(() => {
    if (!isStaff) return;
    stopSubscriptions();
    startSubscriptions(selectedSession || session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, isStaff, session]);

  useEffect(() => {
    return () => stopSubscriptions();
  }, []);

  // Manual fetch fallback
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

  // --- Auth utilities
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

  // ---------- Token actions ----------
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
      // compute next session id from sessions
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
    } catch (err) {
      alert("Start session failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  // ---------- Orders actions ----------
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

        if (order.paid) {
          // already paid => go straight to 'paid' so kitchen will pick up
          tx.update(orderRef, {
            token: next,
            status: "paid",
            approvedAt: serverTimestamp(),
            paidAt: order.paidAt || serverTimestamp(),
            session_id: selectedSession || session
          });
        } else {
          // mark as approved; remains out of kitchen until paid
          tx.update(orderRef, {
            token: next,
            status: "approved",
            approvedAt: serverTimestamp(),
            session_id: selectedSession || session
          });
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
          // approved -> convert to paid and set paidAt (kitchen picks it up)
          tx.update(orderRef, { paid: true, paidAt: serverTimestamp(), status: "paid" });
        } else {
          // not approved -> just set paid flag; staff can approve later
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

  async function deleteOrder(orderId) {
    if (!window.confirm("Delete this order?")) return;
    try {
      await deleteDoc(doc(db, "orders", orderId));
      setModalOrder(null);
    } catch (err) {
      console.error("deleteOrder", err);
      alert("Delete failed");
    }
  }

  // open current token details by querying order with token === current
  async function openCurrentTokenDetails() {
    if (!current) return alert("No current token");
    setLoadingAction("openCurrent");
    try {
      const q = query(collection(db, "orders"), where("session_id", "==", selectedSession || session), where("token", "==", current));
      const snap = await getDocs(q);
      if (snap.empty) {
        alert("No order found for current token");
      } else {
        const d = snap.docs[0].data();
        const id = snap.docs[0].id;
        let items = [];
        if (Array.isArray(d.items)) items = d.items;
        else if (d.items && typeof d.items === "object") items = Object.values(d.items);
        setModalOrder({ id, ...d, items });
      }
    } catch (err) {
      console.error("openCurrent", err);
      alert("Failed to open current token details");
    } finally {
      setLoadingAction("");
    }
  }

  // helpers
  function formatItems(items = []) {
    return (items || []).map((i) => `${i.quantity}× ${i.name}`).join(", ");
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

  // UI: choose session from drawer (switches live listeners)
  function handleSelectSession(s) {
    setSelectedSession(s);
    setDrawerOpen(false);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* top bar */}
        <div style={styles.header}>
          <div style={styles.titleCol}>
            <div style={styles.title}>Waffle Spot</div>
            <div style={styles.subtitle}>Staff — Manage tokens & orders</div>
          </div>

          <div style={styles.userCol}>
            <div style={{ color: "#bfb39a", fontSize: 12 }}>Signed in as</div>
            <div style={{ fontWeight: 800 }}>{isStaff ? staffName : "—"}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={styles.menuButton} onClick={() => setDrawerOpen(true)}>☰</button>
              <button onClick={logout} style={{ ...styles.btn, ...styles.smallBtn, background: "#333", color: "#ffd166" }}>Logout</button>
            </div>
          </div>
        </div>

        {/* live area */}
        <div style={styles.liveCard}>
          <div style={styles.nowServingWrap}>
            <div
              onClick={openCurrentTokenDetails}
              style={{ ...styles.nowServingClickable, flex: 1 }}
              aria-label="Open current token details"
            >
              <div style={styles.nowServingLabel}>Now Serving</div>
              <div style={styles.bigToken}>{current || "-"}</div>
            </div>

            <div style={{ width: 120, textAlign: "right" }}>
              <div style={styles.smallMuted}>Last Issued</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#ffd166" }}>{lastIssued || 0}</div>

              <div style={{ marginTop: 10 }}>
                <div style={styles.smallMuted}>Session</div>
                <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} style={styles.sessionSelect}>
                  {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* skipped chips */}
          <div style={{ marginTop: 10 }}>
            <div style={styles.smallMuted}>Skipped</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {skipped && skipped.length ? skipped.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    if (!window.confirm(`Serve skipped token ${t} now?`)) return;
                    serveSkipped(t);
                  }}
                  className="skipped-chip"
                  style={{ background: "#222", color: "#ffd166", padding: "6px 10px", borderRadius: 999, border: "none", fontWeight: 800 }}
                >
                  {t}
                </button>
              )) : (<div style={{ color: "#6b6b6b" }}>— none —</div>)}
            </div>
          </div>

          {/* actions */}
          <div style={styles.actionsRow}>
            <button onClick={callNext} disabled={!!loadingAction} style={{ ...styles.btn, ...styles.callBtn }}>
              {loadingAction === "callNext" ? "Processing..." : "Call Next"}
            </button>

            <button onClick={callAgain} disabled={!!loadingAction} style={{ ...styles.btn, ...styles.callAgainBtn }}>
              {loadingAction === "callAgain" ? "Calling..." : "Call Again"}
            </button>

            <button onClick={skipToken} disabled={!!loadingAction} style={{ ...styles.btn, ...styles.skipBtn }}>
              {loadingAction === "skipToken" ? "Skipping..." : "Skip Token"}
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={() => fetchOrdersManual(selectedSession || session)} style={{ ...styles.btn, background: "#333", color: "#ffd166" }}>Refresh</button>

            <button onClick={undoLast} disabled={!!loadingAction} style={{ ...styles.btn, background: "#222", color: "#ffd166" }}>{loadingAction === "undo" ? "Undoing..." : "Undo"}</button>
          </div>
        </div>

        {/* pending orders */}
        <div style={styles.pendingList}>
          <h3 style={{ marginBottom: 8 }}>Pending Orders — {selectedSession || session}</h3>

          {loading && <div style={{ color: "#bfb39a" }}>Loading…</div>}
          {!loading && orders.length === 0 && <div style={{ color: "#6b6b6b" }}>No pending orders</div>}

          {orders.map((order) => (
            <div key={order.id} style={styles.orderCard} onClick={() => setModalOrder(order)}>
              <div style={styles.orderLeft}>
                <div style={{ fontWeight: 900 }}>{order.customerName || "Unknown"}</div>
                <div style={{ color: "#bfb39a", marginTop: 6 }}>{order.phone}</div>
                <div style={{ marginTop: 8, color: "#ddd" }}>{formatItems(order.items || [])}</div>
                <div style={{ marginTop: 6, color: "#999", fontSize: 12 }}>Placed: {formatTimestamp(order.createdAt)}</div>
              </div>

              <div style={styles.orderRight}>
                <div style={{ color: "#bfb39a", fontSize: 12 }}>Status</div>
                <div style={{ fontWeight: 900, color: "#ffd166" }}>{order.status}</div>
                {order.token && <div style={{ marginTop: 8 }}>Token: <strong>{order.token}</strong></div>}
                <div style={{ marginTop: 8, fontWeight: 800, color: order.paid ? "#2ecc71" : "#ffb86b" }}>{order.paid ? "PAID" : "UNPAID"}</div>

                <div style={styles.orderActions}>
                  <button onClick={(e) => { e.stopPropagation(); approveOrder(order.id); }} disabled={!!loadingAction} style={{ ...styles.btn, ...styles.approveBtn }}>{loadingAction === "approve" ? "Approving..." : "Approve"}</button>

                  <button onClick={(e) => { e.stopPropagation(); updateOrder(order); }} style={{ ...styles.btn, ...styles.updateBtn }}>Update</button>

                  <button onClick={(e) => { e.stopPropagation(); if (!window.confirm("Delete this order?")) return; deleteOrder(order.id); }} style={{ ...styles.btn, ...styles.deleteBtn }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>

     {/* Drawer / menu */}
{drawerOpen && (
  <div style={styles.drawer} role="dialog" aria-modal="true">
    <button
      style={styles.drawerClose}
      onClick={() => setDrawerOpen(false)}
    >
      ✕
    </button>
    <h3 style={{ color: "#ffd166", marginBottom: 10 }}>Shop Control</h3>

{/* Status Row */}
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    background: "#111",
    borderRadius: 10,
    marginBottom: 14,
    border: "1px solid #222"
  }}
>
  <div>
    <div style={{ fontSize: 13, color: "#bfb39a" }}>Current Status</div>
    <div
      style={{
        fontWeight: 900,
        // color: shopOpen ? "#2ecc71" : "#ff6b6b",
        color: shop?.isOpen ? "#2ecc71" : "#ff6b6b",

        marginTop: 2
      }}
    >
      {/* {shopOpen ? "SHOP OPEN" : "SHOP CLOSED"} */}
      {shop?.isOpen ? "SHOP OPEN" : "SHOP CLOSED"}

    </div>
  </div>

  {/* Toggle Switch */}
  <div
    onClick={() => {
      // if (shopOpen) {
      //   closeShop();
      // } else {
      //   openShop();
      // }
      if (shop?.isOpen) {
  closeShop();
} else {
  openShop();
}

    }}
    style={{
      width: 52,
      height: 28,
      borderRadius: 999,
      // background: shopOpen ? "#2ecc71" : "#555",
      background: shop?.isOpen ? "#2ecc71" : "#555",

      position: "relative",
      cursor: "pointer",
      transition: "background 0.25s ease"
    }}
  >
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "#0b0b0b",
        position: "absolute",
        top: 3,
        // left: shopOpen ? 27 : 3,
        left: shop?.isOpen ? 27 : 3,

        transition: "left 0.25s ease"
      }}
    />
  </div>
</div>


    <h3 style={{ color: "#ffd166", marginTop: 8 }}>Menu</h3>

    {/* NAVIGATION */}
    <div style={{ marginTop: 16 }}>
      <div style={{ color: "#bfb39a", marginBottom: 6 }}>Navigate</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
  style={{ ...styles.btn, background: "#2ecc71", color: "#01110b", marginBottom: 10 }}
  onClick={() => navigate("/staff-place-order")}
>
  + Place Order (Staff)
</button>
        <button
          style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
          onClick={() => { setDrawerOpen(false); navigate("/approved"); }}
        >
          Approved Orders
        </button>

        <button
          style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
          onClick={() => { setDrawerOpen(false); navigate("/completed"); }}
        >
          Completed Orders
        </button>

        <button
          style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
          onClick={() => { setDrawerOpen(false); navigate("/kitchen"); }}
        >
          Kitchen
        </button>
          <button
          style={{ ...styles.btn, background: "#333", color: "#ffd166" }}
          onClick={() => { setDrawerOpen(false); navigate("/owner-summary"); }}
        >
          Summary
        </button>
        <button  style={{ ...styles.btn, background: "#333", color: "#ffd166" }} onClick={() => navigate("/menu-manage")}>
  Manage Menu
</button>

      </div>
    </div>

    {/* DANGER ZONE — BOTTOM */}
    <div style={{ marginTop: 24 }}>
      <div style={{ color: "#bfb39a", marginBottom: 6 }}>Danger</div>

      <button
        style={{
          ...styles.btn,
          background: "#551111",
          color: "#fff",
          marginBottom: 8
        }}
        onClick={() => {
          if (!window.confirm("Reset skipped tokens for this session?")) return;
          (async () => {
            try {
              await updateDoc(
                doc(db, "tokens", "session_" + (selectedSession || session)),
                { skipped: [] }
              );
              alert("Skipped cleared");
            } catch (err) {
              alert("Failed");
              console.error(err);
            }
          })();
        }}
      >
        Clear Skipped
      </button>

      {/* 🔥 START NEW SESSION — VERY BOTTOM */}
      <button
        style={{
          ...styles.btn,
          background: "#551111",
          color: "#fff"
        }}
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

        {/* Modal popup for order details */}
        {modalOrder && (
          <div style={styles.modalBackdrop} onClick={() => setModalOrder(null)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{modalOrder.customerName || "Unknown"}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{modalOrder.phone}</div>
                  <div style={{ marginTop: 10, color: "#ddd" }}>{formatItems(modalOrder.items || [])}</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={styles.smallMuted}>Status</div>
                  <div style={{ fontWeight: 900, color: "#ffd166" }}>{modalOrder.status}</div>

                  <div style={{ marginTop: 8 }}>
                    <div style={styles.smallMuted}>Token</div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>{modalOrder.token || "—"}</div>
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
                <button onClick={() => approveOrder(modalOrder.id)} disabled={!!loadingAction} style={{ ...styles.btn, ...styles.approveBtn }}>
                  {loadingAction === "approve" ? "Approving..." : (modalOrder.paid ? "Approve & Send to Kitchen" : "Approve (awaiting payment)")}
                </button>

                <button onClick={() => { if (!window.confirm("Mark this order as PAID?")) return; markPaid(modalOrder.id); }} disabled={!!loadingAction || modalOrder.paid} style={{ ...styles.btn, ...styles.callAgainBtn }}>
                  {loadingAction === "markPaid" ? "Marking..." : (modalOrder.paid ? "Already Paid" : "Mark Paid")}
                </button>

                <button onClick={() => updateOrder(modalOrder)} style={{ ...styles.btn, ...styles.updateBtn }}>Update</button>

                <button onClick={() => { if (!window.confirm("Delete this order?")) return; deleteOrder(modalOrder.id); }} style={{ ...styles.btn, ...styles.deleteBtn }}>Delete</button>

                <div style={{ flex: 1 }} />

                <button onClick={() => setModalOrder(null)} style={{ ...styles.btn, background: "#222", color: "#ffd166" }}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}