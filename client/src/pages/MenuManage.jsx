import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { auth, db, serverTimestamp } from "../firebaseInit";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  orderBy,
  query
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* ---------------- STYLES ---------------- */
const styles = {
  page: {
    background: "#0b0b0b",
    color: "#f6e8c1",
    minHeight: "100vh",
    padding: 16
  },
  container: { maxWidth: 900, margin: "auto" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 10
  },
  title: { fontSize: 24, fontWeight: 900, color: "#ffd166" },

  backBtn: {
    background: "#222",
    color: "#ffd166",
    border: "1px solid #333",
    padding: "8px 14px",
    borderRadius: 20,
    fontWeight: 800,
    cursor: "pointer"
  },

  addBtn: {
    background: "#2ecc71",
    color: "#01110b",
    border: "none",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer"
  },

  card: {
    background: "#111",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },

  itemInfo: { flex: 1 },
  name: { fontWeight: 900 },
  desc: { color: "#bfb39a", fontSize: 13 },
  price: { marginTop: 6, fontWeight: 800, color: "#ffd166" },

  badge: (active) => ({
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: active ? "#2ecc71" : "#444",
    color: active ? "#01110b" : "#aaa"
  }),

  btn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    fontWeight: 800,
    cursor: "pointer"
  },

  editBtn: { background: "#ffd166", color: "#111" },
  toggleBtn: { background: "#333", color: "#ffd166" },

  /* MODAL */
  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999
  },
  modal: {
    background: "#0f0f0f",
    padding: 18,
    borderRadius: 12,
    width: "95%",
    maxWidth: 420
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    background: "#111",
    border: "1px solid #222",
    color: "#fff"
  }
};

/* ---------------- COMPONENT ---------------- */
export default function MenuManage() {
  const [, navigate] = useLocation();

  const [menu, setMenu] = useState([]);
  const [modalItem, setModalItem] = useState(null);

  /* ---------------- AUTH (STAFF ONLY) ---------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/staff-login");
    });
    return () => unsub();
  }, []);

  /* ---------------- LOAD MENU ---------------- */
  useEffect(() => {
    const q = query(collection(db, "menu"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMenu(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  /* ---------------- SAVE ITEM ---------------- */
  async function saveItem() {
    const { id, name, price, desc, img, active } = modalItem;

    if (!name || !price) {
      alert("Name and price are required");
      return;
    }

    if (id) {
      await updateDoc(doc(db, "menu", id), {
        name,
        price: Number(price),
        desc: desc || "",
        img: img || "",
        active,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "menu"), {
        name,
        price: Number(price),
        desc: desc || "",
        img: img || "",
        active: true,
        createdAt: serverTimestamp()
      });
    }

    setModalItem(null);
  }

  /* ---------------- TOGGLE ACTIVE ---------------- */
  async function toggleActive(item) {
    await updateDoc(doc(db, "menu", item.id), {
      active: !item.active
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate("/staff")}>
            ← Back
          </button>
          <div style={styles.title}>Manage Menu</div>
          <button
            style={styles.addBtn}
            onClick={() =>
              setModalItem({
                name: "",
                price: "",
                desc: "",
                img: "",
                active: true
              })
            }
          >
            + Add Item
          </button>
        </div>

        {/* MENU LIST */}
        {menu.map((m) => (
          <div key={m.id} style={styles.card}>
            <div style={styles.itemInfo}>
              <div style={styles.name}>{m.name}</div>
              <div style={styles.desc}>{m.desc}</div>
              <div style={styles.price}>₹{m.price}</div>
            </div>

            <span style={styles.badge(m.active)}>
              {m.active ? "ACTIVE" : "HIDDEN"}
            </span>

            <button
              style={{ ...styles.btn, ...styles.editBtn }}
              onClick={() => setModalItem(m)}
            >
              Edit
            </button>

            <button
              style={{ ...styles.btn, ...styles.toggleBtn }}
              onClick={() => toggleActive(m)}
            >
              {m.active ? "Disable" : "Enable"}
            </button>
          </div>
        ))}

        {/* MODAL */}
        {modalItem && (
          <div style={styles.modalBg} onClick={() => setModalItem(null)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ color: "#ffd166" }}>
                {modalItem.id ? "Edit Item" : "Add Item"}
              </h3>

              <input
                style={styles.input}
                placeholder="Item name"
                value={modalItem.name}
                onChange={(e) =>
                  setModalItem({ ...modalItem, name: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Price"
                type="number"
                value={modalItem.price}
                onChange={(e) =>
                  setModalItem({ ...modalItem, price: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Description"
                value={modalItem.desc}
                onChange={(e) =>
                  setModalItem({ ...modalItem, desc: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Image URL (optional)"
                value={modalItem.img}
                onChange={(e) =>
                  setModalItem({ ...modalItem, img: e.target.value })
                }
              />

              <button
                style={{
                  ...styles.btn,
                  background: "#2ecc71",
                  color: "#01110b",
                  marginTop: 14,
                  width: "100%"
                }}
                onClick={saveItem}
              >
                Save
              </button>

              <button
                style={{
                  ...styles.btn,
                  background: "#333",
                  color: "#ffd166",
                  marginTop: 8,
                  width: "100%"
                }}
                onClick={() => setModalItem(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
