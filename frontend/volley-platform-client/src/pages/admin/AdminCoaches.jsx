// src/pages/admin/AdminCoaches.jsx
import { Routes, Route } from "react-router-dom";
import CoachList from "./coaches/CoachList";
import CreateCoach from "./coaches/CreateCoach";
import CoachDetailsAdmin from "./coaches/CoachDetailsAdmin";

export default function AdminCoaches() {
  return (
    <Routes>
      <Route index element={<CoachList />} />
      <Route path="new" element={<CreateCoach />} />
      <Route path=":id" element={<CoachDetailsAdmin />} />
    </Routes>
  );
}


