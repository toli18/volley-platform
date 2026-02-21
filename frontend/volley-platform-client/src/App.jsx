// src/App.jsx
import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import "./App.css";

export default function App() {
  return (
    <div className="appShell">
      <Navbar />
      <main className="appContent">
        <Suspense fallback={<div style={{ padding: 24 }}>Зареждане...</div>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="appFooter">
        <span>Volley Coach Platform</span>
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}
