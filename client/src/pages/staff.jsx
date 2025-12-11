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
  const [skipped, setSkipped] = useState([]);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const ordersUnsubRef = useRef(null);
  const tokensUnsubRef = useRef(null);
  const intervalRef = useRef(null);

  // Normalize session name
  function cleanSessionName(s) {
    if (!s) return "";
    return s.trim(); // FIX #1
  }

  // -----------------------------
  // Load all sessions + active session
  // -----------------------------
  useEffect(() => {
    async function loadSessions() {
      try {
        const ref = doc(db, "settings", "activeSession");
        const snap = await getDoc(ref);

        const active = snap.exists() ? snap.data().session_id.trim() : "Session 1";
        setSession(active);
        setSelectedSession(active);
        localStorage.setItem("session", active);

        // Load sessions from tokens
        const tokensSnap = await getDocs(collection(db, "tokens"));
        const list = tokensSnap.docs.map(d => d.id.replace("session_", "").trim());

        setSessions(list);
      } catch (err) {
        console.error("loadSessions error:", err);
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
        return;
      }
      const tokenResult = await getIdTokenResult(user, true);

      if (tokenResult.claims?.role === "staff") {
        setIsStaff(true);
        setStaffName(user.email);
        startSubscriptions(selectedSession || session);
      } else {
        alert("NOT STAFF");
        setIsStaff(false);
      }
    });

    return () => unsub();
  }, []);

  // -----------------------------
  // START SUBSCRIPTIONS
  // -----------------------------
  function startSubscriptions(sess) {
    stopSubscriptions();

    const clean = cleanSessionName(sess); // FIX #2
    const tokenRef = doc(db, "tokens", "session_" + clean);

    // TOKEN SNAPSHOT
    tokensUnsubRef.current = onSnapshot(tokenRef, (snap) => {
      if (!snap.exists()) {
        console.warn("Token doc missing:", "session_" + clean);
        setCurrent(0);
        setLastIssued(0);
        setSkipped([]);
        return;
      }

      const data = snap.data();
      setCurrent(data.currentToken || 0);
      setLastIssued(data.lastTokenIssued || 0);
      setSkipped(data.skipped || []);
    });

    // PENDING ORDERS SNAPSHOT
    const q = query(
      collection(db, "orders"),
      where("status", "==", "pending"),
      where("session_id", "==", clean),
      orderBy("createdAt", "asc")
    );

    ordersUnsubRef.current = onSnapshot(q, (snap) => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(arr);
      setLoading(false);
    });

    // fallback manual refresh
    intervalRef.current = setInterval(() => {
      fetchOrdersManual(clean);
    }, 5000);
  }

  function stopSubscriptions() {
    if (tokensUnsubRef.current) tokensUnsubRef.current();
    if (ordersUnsubRef.current) ordersUnsubRef.current();
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  // restart subscriptions on session change
  useEffect(() => {
    if (!isStaff) return;
    startSubscriptions(selectedSession || session);
  }, [selectedSession, isStaff]);

  // -----------------------------
  // Manual fetch
  // -----------------------------
  async function fetchOrdersManual(sess) {
    const clean = cleanSessionName(sess);
    try {
      const q = query(
        collection(db, "orders"),
        where("status", "==", "pending"),
        where("session_id", "==", clean),
        orderBy("createdAt", "asc")
      );
      const snap = await getDocs(q);
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
  }

  // -----------------------------
  // Call Next — FIXED, SAFE
  // -----------------------------
  async function callNext() {
    const s = cleanSessionName(selectedSession || session);
    const tokenRef = doc(db, "tokens", "session_" + s);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        if (!snap.exists()) return;

        const data = snap.data();
        const cur = data.currentToken || 0;
        const last = data.lastTokenIssued || 0;
        const skippedArr = [...(data.skipped || [])];

        if (skippedArr.length > 0) {
          const next = Math.min(...skippedArr);
          const newArr = skippedArr.filter(t => t !== next);
          tx.update(tokenRef, {
            currentToken: next,
            skipped: newArr
          });
        } else {
          const next = cur + 1;
          if (next <= last) {
            tx.update(tokenRef, { currentToken: next });
          }
        }
      });
    } catch (err) {
      alert(err.message);
    }
  }

  // -----------------------------
  // Call Again
  // -----------------------------
  async function callAgain() {
    const s = cleanSessionName(selectedSession || session);
    const tokenRef = doc(db, "tokens", "session_" + s);

    await updateDoc(tokenRef, {
      lastCalled: current,
      lastCalledAt: serverTimestamp()
    });
  }

  // -----------------------------
  // Skip Token — FIXED
  // -----------------------------
  async function skipToken(tok) {
    const s = cleanSessionName(selectedSession || session);
    const tokenRef = doc(db, "tokens", "session_" + s);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists()) return;

      const data = snap.data();
      let arr = [...(data.skipped || [])];

      if (!arr.includes(tok)) arr.push(tok);
      arr.sort((a, b) => a - b);

      tx.update(tokenRef, { skipped: arr });
    });
  }

  // -----------------------------
  // Serve a skipped token
  // -----------------------------
  async function serveSkipped(tok) {
    const s = cleanSessionName(selectedSession || session);
    const tokenRef = doc(db, "tokens", "session_" + s);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists()) return;

      let arr = [...(snap.data().skipped || [])];
      arr = arr.filter(t => t !== tok);

      tx.update(tokenRef, {
        currentToken: tok,
        skipped: arr
      });
    });
  }

  // -----------------------------
  // Approve Order — same as before but with session fix
  // -----------------------------
  async function approveOrder(orderId) {
    const s = cleanSessionName(selectedSession || session);
    const orderRef = doc(db, "orders", orderId);
    const tokenRef = doc(db, "tokens", "session_" + s);

    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) return;

      const tokenSnap = await tx.get(tokenRef);
      const last = tokenSnap.exists() ? (tokenSnap.data().lastTokenIssued || 0) : 0;
      const next = last + 1;

      tx.update(tokenRef, { lastTokenIssued: next });
      tx.update(orderRef, {
        status: "approved",
        token: next,
        session_id: s,
        approvedAt: serverTimestamp()
      });
    });
  }

  // -----------------------------
  // Update / Delete Order (unchanged)
  // -----------------------------
  function formatItems(items = []) {
    return items.map(i => `${i.quantity}×${i.name}`).join(", ");
  }

  // -----------------------------
  // UI rendering
  // -----------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.headerRow}>
          <div style={styles.titleBlock}>
            <div style={styles.title}>Waffle Lounge — Staff Dashboard</div>
            <div style={styles.subtitle}>Manage tokens and serve customers</div>
          </div>

          <div>
            <div style={styles.smallMuted}>Signed in as</div>
            <div style={{ fontWeight: 800 }}>{staffName}</div>
          </div>
        </div>

        {/* LIVE PANEL */}
        <div style={styles.topPanel}>

          {/* LEFT SIDE */}
          <div style={styles.liveCard}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#bfb39a" }}>Now Serving</div>
                <div style={styles.bigToken}>{current || "-"}</div>
              </div>

              <div>
                <div style={styles.smallMuted}>Last Issued</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#ffd166" }}>
                  {lastIssued}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={styles.smallMuted}>Session</div>
                  <select
                    style={styles.sessionSelect}
                    value={selectedSession}
                    onChange={(e) => setSelectedSession(e.target.value.trim())} // FIX #3
                  >
                    {sessions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SKIPPED */}
            <div style={{ marginTop: 12 }}>
              <div style={styles.smallMuted}>Skipped Tokens</div>

              {skipped.length ? (
                skipped.map(t => (
                  <span key={t} style={styles.skippedChip}>{t}</span>
                ))
              ) : (
                <div style={{ color: "#555" }}>— none —</div>
              )}
            </div>

            {/* BUTTON ROW */}
            <div style={styles.actionsRow}>
              <button style={{ ...styles.btn, ...styles.callBtn }} onClick={callNext}>Call Next</button>
              <button style={{ ...styles.btn, ...styles.callAgainBtn }} onClick={callAgain}>Call Again</button>
              <button style={{ ...styles.btn, ...styles.skipBtn }}
                onClick={() => {
                  const tok = Number(prompt("Skip which token?", current));
                  if (tok) skipToken(tok);
                }}>Skip Token</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <button style={{ ...styles.btn, ...styles.refreshBtn }}
                onClick={() => fetchOrdersManual(selectedSession)}>
                Refresh Orders
              </button>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div style={{ background: "#111", padding: 16, borderRadius: 12 }}>
            <div style={{ fontWeight: 800 }}>Session Controls</div>

            <button
              style={{ ...styles.btn, background: "#ffd166", color: "#111", width: "100%", marginTop: 12 }}
              onClick={() => window.alert("START NEW SESSION LOGIC OK")}
            >
              Start New Session
            </button>

            <div style={{ marginTop: 16 }}>
              <div style={styles.smallMuted}>Active session</div>
              <div style={{ fontWeight: 900 }}>{session}</div>
            </div>
          </div>
        </div>

        {/* PENDING ORDERS */}
        <div style={styles.approveSection}>
          <h3 style={{ color: "#ffd166" }}>
            Pending Orders (Session: {selectedSession})
          </h3>

          {!loading && orders.length === 0 && (
            <div style={{ color: "#666" }}>No pending orders</div>
          )}

          {orders.map(order => (
            <div key={order.id} style={styles.orderCard}>
              <strong>{order.customerName}</strong>
              <div style={{ color: "#999" }}>{order.phone}</div>
              <div style={{ marginTop: 6 }}>{formatItems(order.items)}</div>

              <div style={styles.orderActions}>
                <button style={{ ...styles.btn, ...styles.approveBtn }}
                  onClick={() => approveOrder(order.id)}>
                  Approve
                </button>

                <button style={{ ...styles.btn, ...styles.updateBtn }}
                  onClick={() => updateOrder(order)}>
                  Update
                </button>

                <button style={{ ...styles.btn, ...styles.deleteBtn }}
                  onClick={() => deleteOrder(order.id)}>
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
