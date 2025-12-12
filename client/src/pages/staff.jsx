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
 * StaffDashboard.jsx
 * - Option A workflow:
 *    Approve -> status = "approved" (if unpaid)
 *    If paid && approved -> status = "paid" (sent to kitchen)
 *    If paid before approve: approve will set status="paid" immediately.
 *
 * - Staff view: only pending orders (status === "pending")
 * - Kitchen view (external page): only orders where status === "paid"
 */

/* ---------- Styles ---------- */
const base = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 16, fontFamily: "'Segoe UI', Roboto, Arial, sans-serif" },
  container: { maxWidth: 1100, margin: "auto" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 900, color: "#ffd166" },
  subtitle: { color: "#bfb39a", fontSize: 13 },
  topPanel: { display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 18 },
  liveCard: { background: "#111", padding: 16, borderRadius: 12, borderLeft: "8px solid #ffd166", minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "space-between" },
  bigToken: { fontSize: 56, fontWeight: 900, color: "#ffd166", textAlign: "center", letterSpacing: 2 },
  smallMuted: { color: "#bfb39a", fontSize: 13 },
  skippedChip: { display: "inline-block", background: "#222", color: "#ffd166", padding: "6px 10px", borderRadius: 999, marginRight: 8, marginBottom: 8, fontWeight: 700, cursor: "pointer" },
  actionsRow: { display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" },
  btn: { padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800 },
  callBtn: { background: "#ffd166", color: "#111", minWidth: 140, flex: 1 },
  callAgainBtn: { background: "#444", color: "#ffd166", minWidth: 120 },
  skipBtn: { background: "#ff7a00", color: "#111", minWidth: 120 },
  refreshBtn: { background: "#333", color: "#ffd166", minWidth: 120 },
  sessionSelect: { padding: 10, fontSize: 14, borderRadius: 8, background: "#0c0c0c", color: "#fff", border: "1px solid #222" },
  approveSection: { marginTop: 16 },
  orderCard: { background: "#111", padding: 14, borderRadius: 10, borderLeft: "6px solid #333", marginBottom: 12, cursor: "pointer" },
  orderActions: { marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" },
  approveBtn: { background: "#2ecc71", color: "#01100b", flex: 1 },
  updateBtn: { background: "#ffd166", color: "#111", flex: 1 },
  deleteBtn: { background: "#ff6b6b", color: "#fff", flex: 1 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
  modal: { background: "#0f0f0f", padding: 18, borderRadius: 10, width: "min(920px, 96%)", color: "#f6e8c1", boxShadow: "0 6px 24px rgba(0,0,0,0.6)" },
  topRightLogout: { position: "absolute", right: 18, top: 18 },
  smallNote: { color: "#bfb39a", fontSize: 13 }
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
  const [skipped, setSkipped] = useState([]); // numbers

  // orders (staff sees only pending)
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // subscriptions & refs
  const tokensUnsubRef = useRef(null);
  const ordersUnsubRef = useRef(null);
  const intervalRef = useRef(null);
  const [subscribing, setSubscribing] = useState(false);

  // UI state
  const [loadingAction, setLoadingAction] = useState(""); // "", "callNext", etc.
  const [modalOrder, setModalOrder] = useState(null); // order object for popup
  const [isMobile, setIsMobile] = useState(window.innerWidth < 720);

  // --- responsive resize handler
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // --- auth listener
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
        if (role !== "staff") {
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

  // --- load sessions (active + token docs)
  async function loadSessions() {
    try {
      const activeSnap = await getDoc(doc(db, "settings", "activeSession"));
      const active = activeSnap.exists() ? activeSnap.data().session_id : "Session 1";
      setSession(active);
      setSelectedSession((prev) => prev || active);

      const tokensSnap = await getDocs(collection(db, "tokens"));
      const list = tokensSnap.docs
        .map((d) => d.id.replace("session_", ""))
        .filter(Boolean)
        .sort((a, b) => {
          const na = Number((a || "").split(" ")[1]) || 0;
          const nb = Number((b || "").split(" ")[1]) || 0;
          return na - nb;
        });
      setSessions(list);
    } catch (err) {
      console.error("loadSessions error", err);
    }
  }
  useEffect(() => {
    loadSessions();
  }, []);

  // --- subscriptions
  function startSubscriptions(sess) {
    if (!sess) return;
    if (subscribing) return;
    setSubscribing(true);
    setLoading(true);

    // tokens doc
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
        const data = snap.data();
        setCurrent(data.currentToken || 0);
        setLastIssued(data.lastTokenIssued || 0);
        setSkipped(Array.isArray(data.skipped) ? data.skipped.slice().sort((a, b) => a - b) : []);
        setLoading(false);
      },
      (err) => {
        console.error("tokens onSnapshot", err);
      }
    );

    // pending orders listener
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
      (err) => console.error("orders onSnapshot", err)
    );

    // fallback: manual fetch every 5s
    intervalRef.current = setInterval(() => {
      fetchOrdersManual(sess).catch(() => {});
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

  // restart when selectedSession or staff toggles
  useEffect(() => {
    if (!isStaff) return;
    stopSubscriptions();
    startSubscriptions(selectedSession || session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, isStaff, session]);

  useEffect(() => {
    return () => stopSubscriptions();
  }, []);

  // --- manual fetch fallback
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

  // --- logout (top-right)
  async function logout() {
    try {
      await signOut(auth);
      stopSubscriptions();
      setIsStaff(false);
      navigate("/staff-login");
    } catch (err) {
      console.error("logout error", err);
      alert("Logout failed");
    }
  }

  /* ------------- Token actions ------------- */

  // Call next: moves to next numeric token NOT in skipped[] (does not auto-serve skipped)
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

        // find next candidate numeric that's NOT skipped
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

  // Re-announce current
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

  // Skip a token: add token to skipped[]; if skipping current, move current to next NON-skipped numeric or clear to 0
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

        // If skipping the current token, advance to next non-skipped numeric
        if (tok === currentToken) {
          let candidate = currentToken + 1;
          while (skipped.includes(candidate) && candidate <= lastTokenIssued) candidate++;
          if (candidate <= lastTokenIssued) {
            tx.update(ref, { currentToken: candidate, lastCalled: candidate, lastCalledAt: serverTimestamp(), lastPrev: currentToken });
          } else {
            // no candidate: clear current token so UI doesn't show skipped as current
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

  // Serve a skipped token (explicit)
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

  // Undo last (uses lastPrev in tokens doc)
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

  // Start new session (creates tokens/session_x and sets activeSession)
  async function startNewSession() {
    if (loadingAction) return;
    setLoadingAction("startSession");
    try {
      await loadSessions();
      // compute next session number
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

  /* ------------- Orders: approve / markPaid / update / delete ------------- */

  // Approve: assign token. Option A behavior:
  // - If order.paid === true at approval time -> set status: "paid" (send to kitchen)
  // - Else set status: "approved" and token assigned (remains in DB, but staff still sees only pending orders)
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

        // update token doc: bump lastTokenIssued (merge existing skipped/current)
        tx.update(tokenRef, { lastTokenIssued: next });

        // If already paid -> directly mark as paid (send to kitchen), else mark approved
        if (order.paid) {
          tx.update(orderRef, { token: next, status: "paid", approvedAt: serverTimestamp(), paidAt: order.paidAt || serverTimestamp(), session_id: selectedSession || session });
        } else {
          tx.update(orderRef, { token: next, status: "approved", approvedAt: serverTimestamp(), session_id: selectedSession || session });
        }
      });
      // close modal if open
      setModalOrder(null);
    } catch (err) {
      alert("Approve failed: " + (err.message || err));
      console.error(err);
    } finally {
      setLoadingAction("");
    }
  }

  // Mark paid: if order.status === "approved" -> status = "paid" (send to kitchen)
  // else just set paid: true so later approval detects it
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
      // refresh UI and close modal
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
      // refresh (listener will update)
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

  /* ---------------- Helpers ---------------- */

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

  /* --------------- Render --------------- */
  return (
    <div style={{ ...base.page }}>
      <div style={{ ...base.container, position: "relative" }}>
        {/* logout top-right */}
        <div style={{ position: "absolute", right: 16, top: 12 }}>
          <button onClick={logout} style={{ ...base.btn, background: "#333", color: "#ffd166" }}>
            Logout
          </button>
        </div>

        <button
  onClick={() => navigate("/kitchen")}
  style={{
    background: "#444",
    color: "#ffd166",
    padding: "10px 14px",
    fontWeight: 800,
    borderRadius: 8,
    marginRight: 10
  }}
>
  Kitchen
</button>


        {/* header */}
        <div style={base.headerRow}>
          <div>
            <div style={base.title}>Waffle Lounge — Staff Dashboard</div>
            <div style={base.subtitle}>Approve orders • Call tokens • Send to kitchen</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={base.smallMuted}>Signed in as</div>
            <div style={{ fontWeight: 800 }}>{isStaff ? staffName : "—"}</div>
            <div style={{ marginTop: 6, ...base.smallMuted }}>Active session</div>
            <div style={{ fontWeight: 800 }}>{session}</div>
          </div>
        </div>

        {/* top panels */}
        <div style={{ ...base.topPanel, gridTemplateColumns: isMobile ? "1fr" : base.topPanel.gridTemplateColumns }}>
          {/* left: live card */}
          <div style={base.liveCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={base.smallMuted}>Now Serving</div>
                <div style={base.bigToken}>{current || "-"}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={base.smallMuted}>Last Issued</div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#ffd166" }}>{lastIssued || 0}</div>

                <div style={{ marginTop: 8 }}>
                  <div style={base.smallMuted}>Session</div>
                  <select
                    style={base.sessionSelect}
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
            <div style={{ marginTop: 12 }}>
              <div style={base.smallMuted}>Skipped Tokens</div>
              <div style={{ marginTop: 8 }}>
                {skipped && skipped.length ? (
                  skipped.map((t) => (
                    <span
                      key={t}
                      style={base.skippedChip}
                      onClick={() => {
                        if (window.confirm(`Serve skipped token ${t} now?`)) serveSkipped(t);
                      }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <div style={{ color: "#6b6b6b", marginTop: 8 }}>— none —</div>
                )}
              </div>
            </div>

            {/* actions */}
            <div style={base.actionsRow}>
              <button
                onClick={callNext}
                disabled={!!loadingAction}
                style={{
                  ...base.btn,
                  ...base.callBtn,
                  opacity: loadingAction === "callNext" ? 0.6 : 1
                }}
              >
                {loadingAction === "callNext" ? "Processing..." : "Call Next"}
              </button>

              <button
                onClick={callAgain}
                disabled={!!loadingAction}
                style={{ ...base.btn, ...base.callAgainBtn, opacity: loadingAction === "callAgain" ? 0.6 : 1 }}
              >
                {loadingAction === "callAgain" ? "Calling..." : "Call Again"}
              </button>

              <button
                onClick={skipToken}
                disabled={!!loadingAction}
                style={{ ...base.btn, ...base.skipBtn, opacity: loadingAction === "skipToken" ? 0.6 : 1 }}
              >
                {loadingAction === "skipToken" ? "Skipping..." : "Skip Token"}
              </button>
            </div>

            {/* secondary row */}
            <div style={{ marginTop: 8 }}>
              <button onClick={() => fetchOrdersManual(selectedSession || session)} style={{ ...base.btn, ...base.refreshBtn }}>
                Refresh Orders
              </button>
              <button onClick={startNewSession} disabled={!!loadingAction} style={{ ...base.btn, marginLeft: 8, background: "#ffd166", color: "#111", opacity: loadingAction === "startSession" ? 0.6 : 1 }}>
                {loadingAction === "startSession" ? "Starting..." : "Start New Session"}
              </button>

              <button onClick={undoLast} disabled={!!loadingAction} style={{ ...base.btn, marginLeft: 8, background: "#222", color: "#ffd166" }}>
                Undo
              </button>
            </div>

            <div style={{ marginTop: 10, ...base.smallNote }}>Auto-refresh (live) enabled. Manual refresh available.</div>
          </div>

          {/* right: controls */}
          <div style={{ background: "#111", padding: 14, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Session Controls</div>

            <div style={{ marginBottom: 10 }}>
              <button onClick={startNewSession} disabled={!!loadingAction} style={{ ...base.btn, background: "#ffd166", color: "#111", width: "100%" }}>
                {loadingAction === "startSession" ? "Starting..." : "Start New Session"}
              </button>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={base.smallMuted}>Active session</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>{session}</div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={base.smallMuted}>Quick actions</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    if (!skipped.length) return alert("No skipped tokens");
                    const tok = Number(prompt("Enter token to serve:", skipped[0]));
                    if (tok) serveSkipped(tok);
                  }}
                  style={{ ...base.btn, background: "#2ecc71", color: "#01110b", flex: 1 }}
                >
                  Serve Skipped
                </button>

                <button onClick={() => navigate("/approved")} style={{ ...base.btn, background: "#444", color: "#ffd166", flex: 1 }}>
                  Approved Orders
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* pending orders list (staff only sees 'pending') */}
        <div style={base.approveSection}>
          <h3>Pending Orders (Session: {selectedSession || session})</h3>

          {loading && <div style={{ color: "#bfb39a" }}>Loading…</div>}
          {!loading && orders.length === 0 && <div style={{ color: "#6b6b6b" }}>No pending orders</div>}

          {orders.map((order) => (
            <div
              key={order.id}
              style={base.orderCard}
              onClick={() => {
                // open popup with full details
                setModalOrder(order);
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ maxWidth: "70%" }}>
                  <div style={{ fontWeight: 900 }}>{order.customerName || "Unknown"}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{order.phone}</div>
                  <div style={{ marginTop: 8, color: "#ddd" }}>{formatItems(order.items || [])}</div>
                  <div style={{ marginTop: 6, color: "#999", fontSize: 13 }}>Placed: {formatTimestamp(order.createdAt)}</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#bfb39a", marginBottom: 6 }}>Status:</div>
                  <div style={{ fontWeight: 800, color: "#ffd166" }}>{order.status}</div>
                  {order.token && <div style={{ marginTop: 8 }}>Token: <strong>{order.token}</strong></div>}
                  <div style={{ marginTop: 8, color: order.paid ? "#2ecc71" : "#ffb86b", fontWeight: 800 }}>{order.paid ? "PAID" : "UNPAID"}</div>
                </div>
              </div>
              <div style={base.orderActions}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    approveOrder(order.id);
                  }}
                  disabled={!!loadingAction}
                  style={{ ...base.btn, ...base.approveBtn }}
                >
                  {loadingAction === "approve" ? "Approving..." : "Approve"}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateOrder(order);
                  }}
                  style={{ ...base.btn, ...base.updateBtn }}
                >
                  Update
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!window.confirm("Delete this order?")) return;
                    deleteOrder(order.id);
                  }}
                  style={{ ...base.btn, ...base.deleteBtn }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal / popup for order details */}
        {modalOrder && (
          <div style={base.modalBackdrop} onClick={() => setModalOrder(null)}>
            <div style={base.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{modalOrder.customerName || "Unknown"}</div>
                  <div style={{ color: "#bfb39a", marginTop: 6 }}>{modalOrder.phone}</div>
                  <div style={{ marginTop: 8, color: "#ddd" }}>{formatItems(modalOrder.items || [])}</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ ...base.smallMuted }}>Status</div>
                  <div style={{ fontWeight: 800, color: "#ffd166" }}>{modalOrder.status}</div>

                  <div style={{ marginTop: 8 }}>
                    <div style={base.smallMuted}>Token</div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>{modalOrder.token || "—"}</div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={base.smallMuted}>Amount</div>
                    <div style={{ fontWeight: 900, color: "#ffd166" }}>₹{Number(modalOrder.total || 0).toFixed(2)}</div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={base.smallMuted}>Paid</div>
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
                  onClick={() => {
                    // Approve from modal: uses same flow as approveOrder
                    approveOrder(modalOrder.id);
                  }}
                  disabled={!!loadingAction}
                  style={{ ...base.btn, ...base.approveBtn }}
                >
                  {loadingAction === "approve" ? "Approving..." : modalOrder.paid ? "Approve & Send to Kitchen" : "Approve (awaiting payment)"}
                </button>

                <button
                  onClick={() => {
                    // Mark paid
                    if (!window.confirm("Mark this order as PAID?")) return;
                    markPaid(modalOrder.id);
                  }}
                  disabled={!!loadingAction || modalOrder.paid}
                  style={{ ...base.btn, ...base.callAgainBtn }}
                >
                  {loadingAction === "markPaid" ? "Marking..." : (modalOrder.paid ? "Already Paid" : "Mark Paid")}
                </button>

                <button
                  onClick={() => {
                    updateOrder(modalOrder);
                  }}
                  style={{ ...base.btn, ...base.updateBtn }}
                >
                  Update
                </button>

                <button
                  onClick={() => {
                    if (!window.confirm("Delete this order?")) return;
                    deleteOrder(modalOrder.id);
                  }}
                  style={{ ...base.btn, ...base.deleteBtn }}
                >
                  Delete
                </button>

                <div style={{ flex: 1 }} />

                <button onClick={() => setModalOrder(null)} style={{ ...base.btn, background: "#222", color: "#ffd166" }}>
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
