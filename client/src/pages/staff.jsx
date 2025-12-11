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


// -----------------------------------------------------
//  STYLES
// -----------------------------------------------------
const styles = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 20,
    fontFamily: "'Segoe UI', sans-serif"
  },
  container: {
    maxWidth: 1100,
    margin: "auto"
  },
  card: {
    background: "#111",
    padding: 18,
    borderRadius: 12,
    marginBottom: 18
  },
  btn: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 800
  },
  input: {
    width: "100%",
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid #222",
    background: "#0b0b0b",
    color: "#fff",
    fontSize: 16
  },
  responsiveRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16
  }
};



// -----------------------------------------------------
//  MAIN COMPONENT
// -----------------------------------------------------
export default function StaffDashboard() {

  // Authentication state
  const [user, setUser] = useState(null);       // IMPORTANT FIX
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState("");

  // Token state
  const [session, setSession] = useState("Session 1");
  const [selectedSession, setSelectedSession] = useState("");
  const [sessions, setSessions] = useState([]);

  const [current, setCurrent] = useState(0);
  const [lastIssued, setLastIssued] = useState(0);
  const [skipped, setSkipped] = useState([]);

  // Orders
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Subscriptions
  const ordersUnsub = useRef(null);
  const tokensUnsub = useRef(null);
  const autoRefreshRef = useRef(null);



  // -----------------------------------------------------
  //  AUTH LISTENER (FIXES YOUR PROBLEM)
  // -----------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setIsStaff(false);
        stopSubscriptions();
        return;
      }

      const tokenResult = await getIdTokenResult(u, true);

      if (tokenResult.claims?.role === "staff") {
        setIsStaff(true);
        setStaffName(u.email);
        startSubscriptions(selectedSession || session);
      } else {
        setIsStaff(false);
        stopSubscriptions();
      }
    });

    return () => unsubscribe();
  }, []);



  // -----------------------------------------------------
  //  LOAD SESSIONS AT START
  // -----------------------------------------------------
  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, "tokens"));
      const list = snap.docs.map((d) => d.id.replace("session_", ""));
      setSessions(list);

      const ref = await getDoc(doc(db, "settings", "activeSession"));
      const active = ref.exists() ? ref.data().session_id : "Session 1";

      setSession(active);
      setSelectedSession(active);
    }

    load();
  }, []);



  // -----------------------------------------------------
  //  SUBSCRIPTIONS (REALTIME)
  // -----------------------------------------------------
  function startSubscriptions(sess) {

    // Avoid duplicate listeners
    stopSubscriptions();

    // Tokens listener
    tokensUnsub.current = onSnapshot(doc(db, "tokens", "session_" + sess), (snap) => {
      if (snap.exists()) {
        const s = snap.data();
        setCurrent(s.currentToken || 0);
        setLastIssued(s.lastTokenIssued || 0);
        setSkipped(s.skipped || []);
      }
    });

    // Orders listener
    const q = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", sess),
      orderBy("createdAt", "asc")
    );

    ordersUnsub.current = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Auto-refresh every 5 seconds
    autoRefreshRef.current = setInterval(() => {
      fetchOrdersManual(sess);
    }, 5000);
  }


  function stopSubscriptions() {
    if (ordersUnsub.current) ordersUnsub.current();
    if (tokensUnsub.current) tokensUnsub.current();
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
  }




  // -----------------------------------------------------
  //  LOGIN / LOGOUT
  // -----------------------------------------------------
  async function login(e) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      alert("Login failed: " + err.message);
    }
  }

  async function logout() {
    stopSubscriptions();
    await signOut(auth);
    setUser(null);
    setIsStaff(false);
  }



  // -----------------------------------------------------
  //  MANUAL FETCH (AUTO REFRESH FALLBACK)
  // -----------------------------------------------------
  async function fetchOrdersManual(sess) {
    const q = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", sess),
      orderBy("createdAt", "asc")
    );

    const snap = await getDocs(q);
    setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }



  // -----------------------------------------------------
  //  CALL NEXT TOKEN
  // -----------------------------------------------------
  async function callNext() {
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tokenRef);
      const data = snap.data();
      const cur = data.currentToken || 0;
      const last = data.lastTokenIssued || 0;
      const skippedArr = data.skipped || [];

      if (skippedArr.length > 0) {
        const next = Math.min(...skippedArr);
        tx.update(tokenRef, {
          currentToken: next,
          skipped: skippedArr.filter((x) => x !== next),
          lastCalled: next,
          lastCalledAt: serverTimestamp()
        });
      } else {
        if (cur + 1 <= last) {
          tx.update(tokenRef, {
            currentToken: cur + 1,
            lastCalled: cur + 1,
            lastCalledAt: serverTimestamp()
          });
        }
      }
    });
  }



  // -----------------------------------------------------
  //  CALL AGAIN (Does NOT change token)
  // -----------------------------------------------------
  async function callAgain() {
    const ref = doc(db, "tokens", "session_" + selectedSession);
    await updateDoc(ref, {
      lastCalled: current,
      lastCalledAt: serverTimestamp()
    });
  }



  // -----------------------------------------------------
  //  SKIP CURRENT TOKEN
  // -----------------------------------------------------
  async function skipToken() {
    const tokenRef = doc(db, "tokens", "session_" + selectedSession);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tokenRef);
      const data = snap.data();

      const skippedArr = data.skipped || [];
      if (!skippedArr.includes(current)) skippedArr.push(current);

      tx.update(tokenRef, { skipped: skippedArr });
    });

    callNext();
  }



  // -----------------------------------------------------
  //  UI SECTION 1 — LOGIN FORM
  // -----------------------------------------------------
  if (!user) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>

          <div style={styles.card}>
            <h2>Staff Login</h2>

            <form onSubmit={login}>
              <input
                style={styles.input}
                type="email"
                placeholder="Email"
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                style={styles.input}
                type="password"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
              />

              <button style={{ ...styles.btn, background: "#ffd166", width: "100%" }}>
                Login
              </button>
            </form>
          </div>

        </div>
      </div>
    );
  }



  // -----------------------------------------------------
  //  UI SECTION 2 — NOT STAFF WARNING
  // -----------------------------------------------------
  if (user && !isStaff) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>

          <div style={styles.card}>
            <h2>Access Denied</h2>
            <p>Your account is not authorized as staff.</p>

            <button onClick={logout} style={{ ...styles.btn, background: "#ff6b6b" }}>
              Logout
            </button>
          </div>

        </div>
      </div>
    );
  }



  // -----------------------------------------------------
  //  UI SECTION 3 — STAFF DASHBOARD
  // -----------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <h1>Waffle Lounge — Staff Dashboard</h1>
        <p>Logged in as: {staffName}</p>

        <div style={styles.card}>
          <h3>Now Serving</h3>
          <div style={{ fontSize: 60, fontWeight: 900 }}>{current}</div>

          <p>Last Issued: {lastIssued}</p>

          <h4>Skipped Tokens</h4>
          {skipped.length ? skipped.join(", ") : "— none —"}

          {/* ACTION BUTTONS */}
          <div style={{ marginTop: 16, ...styles.responsiveRow }}>
            <button onClick={callNext} style={{ ...styles.btn, background: "#ffd166", flex: 1 }}>
              Call Next
            </button>

            <button onClick={callAgain} style={{ ...styles.btn, background: "#555", flex: 1 }}>
              Call Again
            </button>

            <button onClick={skipToken} style={{ ...styles.btn, background: "#ff7a00", flex: 1 }}>
              Skip Token
            </button>

            <button onClick={logout} style={{ ...styles.btn, background: "#333", color: "#ffd166", flex: 1 }}>
              Logout
            </button>
          </div>
        </div>


        {/* PENDING ORDERS */}
        <div style={styles.card}>
          <h3>Pending Orders (Session: {selectedSession})</h3>

          {orders.length === 0 && <p>No pending orders</p>}

          {orders.map((o) => (
            <div key={o.id} style={{ padding: 8, borderBottom: "1px solid #333" }}>
              <b>{o.customerName}</b> — {o.phone}
              <div>{(o.items || []).map(i => `${i.quantity}×${i.name}`).join(", ")}</div>

              <div style={{ marginTop: 8, ...styles.responsiveRow }}>
                <button
                  onClick={() => approveOrder(o.id)}
                  style={{ ...styles.btn, background: "#2ecc71" }}
                >
                  Approve
                </button>

                <button
                  onClick={() => updateOrder(o)}
                  style={{ ...styles.btn, background: "#ffd166", color: "#111" }}
                >
                  Update
                </button>

                <button
                  onClick={() => deleteOrder(o.id)}
                  style={{ ...styles.btn, background: "#ff6b6b" }}
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
