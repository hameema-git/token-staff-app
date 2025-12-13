import React, { useState } from "react";
import { useLocation } from "wouter";
import { db, serverTimestamp } from "../firebaseInit";
import {
  collection,
  addDoc,
  doc,
  runTransaction
} from "firebase/firestore";

export default function StaffPlaceOrder() {
  const [, navigate] = useLocation();

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [cart, setCart] = useState([]);

  // ⚠️ Replace with your real menu source
  const menu = [
    { id: "w1", name: "Classic Waffle", price: 100 },
    { id: "w2", name: "Chocolate Waffle", price: 130 }
  ];

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  function addToCart(item) {
    setCart(c => {
      const found = c.find(x => x.id === item.id);
      if (found) {
        return c.map(x =>
          x.id === item.id ? { ...x, qty: x.qty + 1 } : x
        );
      }
      return [...c, { ...item, qty: 1 }];
    });
  }

  async function placeOrder() {
    if (!cart.length) return alert("Cart empty");

    try {
      const tokenRef = doc(db, "tokens", "session_" + "Session 1"); // or active session

      await runTransaction(db, async (tx) => {
        const tokenSnap = await tx.get(tokenRef);
        if (!tokenSnap.exists()) throw new Error("Session missing");

        const last = tokenSnap.data().lastTokenIssued || 0;
        const nextToken = last + 1;

        tx.update(tokenRef, { lastTokenIssued: nextToken });

        await addDoc(collection(db, "orders"), {
          customerName: customerName || "Walk-in",
          phone,
          items: cart,
          total,
          token: nextToken,
          paid: true,
          status: "paid", // 🚀 goes directly to kitchen
          source: "staff",
          session_id: "Session 1",
          createdAt: serverTimestamp(),
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
    <div style={{ padding: 20, background: "#0b0b0b", minHeight: "100vh", color: "#ffd166" }}>
      <h2>Staff Order</h2>

      <input
        placeholder="Customer Name (optional)"
        value={customerName}
        onChange={e => setCustomerName(e.target.value)}
      />

      <input
        placeholder="Phone (optional)"
        value={phone}
        onChange={e => setPhone(e.target.value)}
      />

      <h3>Menu</h3>
      {menu.map(m => (
        <button key={m.id} onClick={() => addToCart(m)}>
          {m.name} ₹{m.price}
        </button>
      ))}

      <h3>Cart</h3>
      {cart.map(i => (
        <div key={i.id}>
          {i.name} × {i.qty}
        </div>
      ))}

      <h3>Total: ₹{total}</h3>

      <button
        onClick={placeOrder}
        style={{ padding: 14, background: "#2ecc71", fontWeight: 900 }}
      >
        Place Order (Paid)
      </button>
    </div>
  );
}
