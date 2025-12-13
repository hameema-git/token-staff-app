import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { db, serverTimestamp } from "../firebaseInit";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  runTransaction
} from "firebase/firestore";
import Footer from "../components/Footer";

/* ---------------- MENU (SAME AS HOME) ---------------- */
const MENU = [
  { id: "w1", name: "Classic Belgian Waffle", price: 100, img: "/images/waffle1.jpeg", desc: "Crispy outside, fluffy inside. Authentic Belgian taste." },
  { id: "w2", name: "Strawberry Cream Waffle", price: 150, img: "/images/waffle2.jpeg", desc: "Fresh strawberries with smooth whipped cream." },
  { id: "w3", name: "Nutella Chocolate Waffle", price: 180, img: "/images/waffle3.jpeg", desc: "Rich Nutella spread with premium chocolate drizzle." },
  { id: "w4", name: "Banana Caramel Waffle", price: 150, img: "/images/waffle4.jpeg", desc: "Caramelized bananas with golden caramel sauce." },
  { id: "w5", name: "Blueberry Bliss Waffle", price: 180, img: "/images/waffle5.jpeg", desc: "Juicy blueberries with a sweet tangy glaze." }
];

/* ---------------- STYLES (REUSED) ---------------- */
const ui = {
  page: { background: "#0b0b0b", color: "#f6e8c1", minHeight: "100vh", padding: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  brand: { fontSize: 26, fontWeight: 900, color: "#ffd166" },
  headerBtns: { display: "flex", gap: 12 },
  cartBtn: { background: "#ffd166", color: "#111", border: "none", padding: "8px 14px", borderRadius: 20, fontWeight: 900 },
  badge: { position: "absolute", top: -6, right: -6, background: "#e63946", color: "#fff", fontSize: 12, padding: "2px 6px", borderRadius: 20 },
  menuGrid: { display: "grid", gap: 14 },
  card: { display: "flex", gap: 14, padding: 12, background: "#111", borderRadius: 12, alignItems: "center" },
  img: { width: 80, height: 80, borderRadius: 10, objectFit: "cover", cursor: "pointer" },
  addBtn: { background: "#ffd166", border: "none", padding: "8px 14px", borderRadius: 8, fontWeight: 800 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000 },
  modal: { position: "fixed", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: 420, background: "#0f0f0f", display: "flex", flexDirection: "column" }
};

/* ---------------- COMPONENT ---------------- */
export default function StaffPlaceOrder() {
  const [, navigate] = useLocation();

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [session, setSession] = useState("Session 1");

  /* 🔹 Load active session */
  useEffect(() => {
    async function loadSession() {
      const snap = await getDoc(doc(db, "settings", "activeSession"));
      if (snap.exists()) setSession(snap.data().session_id);
    }
    loadSession();
  }, []);

  function add(i) {
    setCart(c =>
      c.find(x => x.id === i.id)
        ? c.map(x => x.id === i.id ? { ...x, qty: x.qty + 1 } : x)
        : [...c, { ...i, qty: 1 }]
    );
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const canSubmit = cart.length > 0;

  /* 🔥 STAFF PLACE ORDER (NO APPROVAL) */
  async function submit() {
    if (!canSubmit) return;

    const tokenRef = doc(db, "tokens", "session_" + session);

    try {
      await runTransaction(db, async (tx) => {
        const tokenSnap = await tx.get(tokenRef);
        if (!tokenSnap.exists()) throw new Error("Session missing");

        const last = tokenSnap.data().lastTokenIssued || 0;
        const nextToken = last + 1;

        tx.update(tokenRef, { lastTokenIssued: nextToken });

        await addDoc(collection(db, "orders"), {
          createdAt: serverTimestamp(),
          customerName: name || "Walk-in",
          phone: phone || "",
          items: cart.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            quantity: i.qty
          })),
          total,
          token: nextToken,
          paid: true,
          status: "paid",          // 🚀 DIRECT TO KITCHEN
          source: "staff",
          session_id: session,
          paidAt: serverTimestamp(),
          approvedAt: serverTimestamp()
        });
      });

      alert("Order placed successfully");
      navigate("/kitchen");

    } catch (err) {
      console.error(err);
      alert("Failed to place order");
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.brand}>Staff Order</div>
        <button style={ui.cartBtn} onClick={() => setCartOpen(true)}>
          🛒 Cart {cart.length > 0 && <span style={ui.badge}>{cart.length}</span>}
        </button>
      </div>

      <div style={ui.menuGrid}>
        {MENU.map(m => (
          <div key={m.id} style={ui.card}>
            <img src={m.img} style={ui.img} />
            <div style={{ flex: 1 }}>
              <b>{m.name}</b><br />₹{m.price}
            </div>
            <button style={ui.addBtn} onClick={() => add(m)}>+ Add</button>
          </div>
        ))}
      </div>

      {cartOpen && (
        <div style={ui.overlay} onClick={() => setCartOpen(false)}>
          <div style={ui.modal} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 16 }}>
              <input placeholder="Customer Name (optional)" value={name} onChange={e => setName(e.target.value)} />
              <input placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} />

              <h3>Total: ₹{total}</h3>

              <button
                onClick={submit}
                style={{ width: "100%", padding: 14, background: "#2ecc71", fontWeight: 900 }}
              >
                Place Order (Paid)
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
