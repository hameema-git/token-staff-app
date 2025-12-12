import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { auth, db, serverTimestamp } from "../firebaseInit";
import {
  onAuthStateChanged,
  signOut,
  getIdTokenResult
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  orderBy
} from "firebase/firestore";

/* -------------------- STYLES -------------------- */
const ui = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 14 },
  container: { maxWidth: 900, margin: "auto" },
  title: { fontSize: 20, fontWeight: 900, color: "#ffd166" },
  muted: { fontSize: 12, color: "#bfb39a" },
  card: { background: "#111", padding: 14, borderRadius: 12, marginBottom: 12 },
  tokenBig: { fontSize: 56, fontWeight: 900, color: "#ffd166" },
  btn: { padding: "12px", borderRadius: 10, fontWeight: 800, border: "none", cursor: "pointer" },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  select: { width: "100%", padding: 10, borderRadius: 8, background: "#0f0f0f", color: "#ffd166" },
  chip: { padding: "6px 10px", borderRadius: 999, background: "#222", color: "#ffd166", fontWeight: 800 }
};

/* -------------------- COMPONENT -------------------- */
export default function StaffDashboard() {
  const [, navigate] = useLocation();

  const [staff, setStaff] = useState("");
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState("");
  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);
  const [orders, setOrders] = useState([]);

  const busy = useRef(false);
  const unsubTokens = useRef(null);
  const unsubOrders = useRef(null);

  /* -------------------- AUTH -------------------- */
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate("/staff-login");
      const claims = await getIdTokenResult(user, true);
      if (claims.claims?.role !== "staff") {
        await signOut(auth);
        return navigate("/staff-login");
      }
      setStaff(user.email);
    });
  }, []);

  /* -------------------- LOAD SESSIONS -------------------- */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs
        .map(d => d.id.replace("session_", ""))
        .sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));
      setSessions(list);
      setSession(list[list.length - 1]);
    })();
  }, []);

  /* -------------------- SUBSCRIBE -------------------- */
  useEffect(() => {
    if (!session) return;

    unsubTokens.current?.();
    unsubOrders.current?.();

    unsubTokens.current = onSnapshot(
      doc(db, "tokens", "session_" + session),
      snap => {
        const d = snap.data();
        setCurrent(d?.currentToken || 0);
        setLastIssued(d?.lastTokenIssued || 0);
        setSkipped(d?.skipped || []);
      }
    );

    unsubOrders.current = onSnapshot(
      query(
        collection(db, "orders"),
        where("session_id", "==", session),
        where("status", "==", "pending"),
        orderBy("createdAt")
      ),
      snap => {
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsubTokens.current?.();
      unsubOrders.current?.();
    };
  }, [session]);

  /* -------------------- TOKEN ACTIONS -------------------- */
  async function safe(fn) {
    if (busy.current) return;
    busy.current = true;
    try { await fn(); }
    finally { busy.current = false; }
  }

  function callNext() {
    safe(async () => {
      const ref = doc(db, "tokens", "session_" + session);
      await runTransaction(db, async tx => {
        const s = (await tx.get(ref)).data();
        let n = (s.currentToken || 0) + 1;
        while (s.skipped?.includes(n)) n++;
        if (n <= s.lastTokenIssued)
          tx.update(ref, { currentToken: n, lastPrev: s.currentToken });
      });
    });
  }

  function callAgain() {
    safe(async () =>
      updateDoc(doc(db, "tokens", "session_" + session), {
        lastCalled: current,
        lastCalledAt: serverTimestamp()
      })
    );
  }

  function skipToken() {
    safe(async () => {
      const t = Number(prompt("Token to skip:", current));
      if (!t) return;
      const ref = doc(db, "tokens", "session_" + session);
      await runTransaction(db, async tx => {
        const d = (await tx.get(ref)).data();
        const sk = [...new Set([...(d.skipped || []), t])];
        tx.update(ref, { skipped: sk });
      });
    });
  }

  function serveSkipped(t) {
    safe(async () => {
      const ref = doc(db, "tokens", "session_" + session);
      await runTransaction(db, async tx => {
        const d = (await tx.get(ref)).data();
        tx.update(ref, {
          currentToken: t,
          skipped: d.skipped.filter(x => x !== t),
          lastPrev: d.currentToken
        });
      });
    });
  }

  function undo() {
    safe(async () => {
      const ref = doc(db, "tokens", "session_" + session);
      await runTransaction(db, async tx => {
        const d = (await tx.get(ref)).data();
        if (d.lastPrev != null)
          tx.update(ref, { currentToken: d.lastPrev, lastPrev: null });
      });
    });
  }

  function startSession() {
    safe(async () => {
      const next = `Session ${sessions.length + 1}`;
      await setDoc(doc(db, "tokens", "session_" + next), {
        session_id: next,
        currentToken: 0,
        lastTokenIssued: 0,
        skipped: []
      });
      setSessions(s => [...s, next]);
      setSession(next);
    });
  }

  async function logout() {
    await signOut(auth);
    navigate("/staff-login");
  }

  /* -------------------- UI -------------------- */
  return (
    <div style={ui.page}>
      <div style={ui.container}>
        <h1 style={ui.title}>Staff Dashboard</h1>
        <div style={ui.muted}>{staff}</div>

        <div style={ui.card}>
          <div style={ui.tokenBig}>{current || "-"}</div>
          <div style={ui.muted}>Last Issued: {lastIssued}</div>

          <select style={ui.select} value={session} onChange={e => setSession(e.target.value)}>
            {sessions.map(s => <option key={s}>{s}</option>)}
          </select>

          <div style={ui.row}>
            <button style={{ ...ui.btn, background: "#ffd166" }} onClick={callNext}>Call Next</button>
            <button style={{ ...ui.btn, background: "#444", color: "#ffd166" }} onClick={callAgain}>Call Again</button>
            <button style={{ ...ui.btn, background: "#ff7a00" }} onClick={skipToken}>Skip</button>
            <button style={{ ...ui.btn, background: "#333", color: "#ffd166" }} onClick={undo}>Undo</button>
          </div>

          <div style={{ marginTop: 8 }}>
            {skipped.map(t => (
              <button key={t} style={ui.chip} onClick={() => serveSkipped(t)}>
                {t}
              </button>
            ))}
          </div>

          <button style={{ ...ui.btn, background: "#2ecc71", marginTop: 10 }} onClick={startSession}>
            Start New Session
          </button>
        </div>

        <div style={ui.card}>
          <h3>Pending Orders</h3>
          {orders.map(o => (
            <div key={o.id}>
              <b>{o.customerName}</b> ({o.phone})
            </div>
          ))}
        </div>

        <button style={{ ...ui.btn, background: "#333", color: "#ffd166" }} onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
