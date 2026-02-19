// src/pages/admin/AdminClubs.jsx
import { Routes, Route } from "react-router-dom";
import ClubList from "./clubs/ClubList";
import CreateClub from "./clubs/CreateClub";

export default function AdminClubs() {
  return (
    <Routes>
      <Route index element={<ClubList />} />
      <Route path="new" element={<CreateClub />} />
    </Routes>
  );
}


