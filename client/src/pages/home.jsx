import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { db, serverTimestamp } from "../firebaseInit";
import { collection, addDoc } from "firebase/firestore";

const MENU = [
  { id: "m1", name: "Artisan Coffee", price: 4.5 },
  { id: "m2", name: "Avocado Toast", price: 12 },
  { id: "m3", name: "Daily Pastry", price: 5.5 },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  function addToCart(item) {
    setCart(prev => {
      const p = prev.find(x => x.id === item.id);
      if (p) return prev.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { ...item, qty: 1 }];
    });
  }
  function removeFromCart(id) {
    setCart(prev => prev.filter(x => x.id !== id));
  }

  const total = cart.reduce((s, it) => s + it.price * it.qty, 0);

  // async function submit(e) {
  //   e.preventDefault();
  //   if (!name.trim() || !phone.trim() || cart.length === 0) {
  //     alert("Please enter name, phone and add items.");
  //     return;
  //   }
  //   try {
  //     const session_id = new Date().toISOString().slice(0, 10);
  //     const items = cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.qty }));
  //     const payload = {
  //       createdAt: serverTimestamp(),
  //       customerName: name.trim(),
  //       phone: String(phone).trim(),
  //       items,
  //       total,
  //       token: null,
  //       status: "pending",
  //       session_id
  //     };
  //     const ref = await addDoc(collection(db, "orders"), payload);
  //     // Save phone locally for quick lookup
  //     try { localStorage.setItem("myPhone", String(phone).trim()); } catch (e) {}
  //     setLocation(`/mytoken?phone=${encodeURIComponent(phone.trim())}`);
  //   } catch (err) {
  //     console.error(err);
  //     alert("Failed to place order. Try again.");
  //   }
  // }


  async function submit(e) {
  e.preventDefault();

  // DEBUG LOG 1 — Check if button works
  console.log("SUBMIT CLICKED");

  if (!name.trim() || !phone.trim() || cart.length === 0) {
    alert("Please enter name, phone and add items.");
    return;
  }

  try {
    // const session_id = new Date().toISOString().slice(0, 10);
    const session_id = localStorage.getItem("session") || "Session 1";


    const items = cart.map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.qty
    }));

    const payload = {
      createdAt: serverTimestamp(),
      customerName: name.trim(),
      phone: String(phone).trim(),
      items,
      total,
      token: null,
      status: "pending",
      session_id
    };

    // DEBUG LOG 2 — Data being sent to Firestore
    console.log("ADDING ORDER TO FIRESTORE:", payload);

    const ref = await addDoc(collection(db, "orders"), payload);

    // DEBUG LOG 3 — Firestore saved successfully
    console.log("ORDER SAVED WITH ID:", ref.id);

    // Save phone locally
    localStorage.setItem("myPhone", String(phone).trim());

    // Redirect to token page
    setLocation(`/mytoken?phone=${encodeURIComponent(phone.trim())}`);

  } catch (err) {
    console.error("ERROR WHILE SAVING ORDER:", err);
    alert("Failed to place order. Try again.");
  }
}

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: "auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Cafe Queue</h1>
     

        <Link href="/staff">Staff</Link>
      </header>
  <button 
  onClick={() => {
    const ph = localStorage.getItem("myPhone");
    if (!ph) {
      alert("No recent order found. Please place an order first.");
      return;
    }
    setLocation(`/mytoken?phone=${encodeURIComponent(ph)}`);
  }}
  style={{ padding: "8px 14px", marginLeft: 10 }}
>
  Check My Token Status
</button>


      <section style={{ marginTop: 20 }}>
        <h2>Menu</h2>
        {MENU.map(item => (
          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: 8, borderBottom: "1px solid #eee" }}>
            <div>
              <div style={{ fontWeight: "600" }}>{item.name}</div>
              <div style={{ fontSize: 13, color: "#666" }}>${item.price.toFixed(2)}</div>
            </div>
            <div>
              <button onClick={() => addToCart(item)}>+ Add</button>
            </div>
          </div>
        ))}
      </section>

      {cart.length > 0 && (
        <section style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
          <h3>Your Cart</h3>
          {cart.map(i => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: 6 }}>
              <div>{i.qty}× {i.name}</div>
              <div>
                ${(i.price * i.qty).toFixed(2)} <button onClick={() => removeFromCart(i.id)} style={{ marginLeft: 8 }}>Remove</button>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 12, fontWeight: 700 }}>Total: ${total.toFixed(2)}</div>

          <form onSubmit={submit} style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <button type="submit">Place Order</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
