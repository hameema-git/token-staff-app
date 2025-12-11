// client/src/pages/StaffLogin.jsx
import React, { useState } from "react";
import { auth } from "../firebaseInit";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      window.location.href = "/staff"; // redirect to dashboard
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Staff Login</h2>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Staff Email"
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" style={styles.button}>
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#0b0b0b",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  card: {
    background: "#111",
    padding: 30,
    borderRadius: 12,
    width: "100%",
    maxWidth: 350,
    boxShadow: "0 0 10px rgba(0,0,0,0.4)"
  },
  title: {
    color: "#ffd166",
    textAlign: "center",
    marginBottom: 20
  },
  input: {
    width: "100%",
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#0c0c0c",
    color: "#fff"
  },
  button: {
    width: "100%",
    padding: 12,
    marginTop: 20,
    borderRadius: 8,
    border: "none",
    background: "#ffd166",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer"
  },
  errorBox: {
    background: "#ff4444",
    padding: 10,
    borderRadius: 8,
    color: "#fff",
    marginBottom: 10
  }
};
