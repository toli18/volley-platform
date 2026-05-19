// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "./index.css";

import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import Drills from "./pages/Drills.jsx";
import DrillDetails from "./pages/DrillDetails.jsx";
import EditDrill from "./pages/EditDrill.jsx";
import Generator from "./pages/Generator.jsx";
import CreateDrill from "./pages/CreateDrill.jsx";
import { ToastProvider } from "./components/ToastProvider.jsx";
const Home = React.lazy(() => import("./pages/Home.jsx"));

const MyDrills = React.lazy(() => import("./pages/MyDrills.jsx"));
const MyTrainings = React.lazy(() => import("./pages/MyTrainings.jsx"));
const TrainingDetails = React.lazy(() => import("./pages/TrainingDetails.jsx"));
const EditTraining = React.lazy(() => import("./pages/EditTraining.jsx"));
const AIGenerator = React.lazy(() => import("./pages/AIGenerator.jsx"));
const Articles = React.lazy(() => import("./pages/Articles.jsx"));
const ArticleDetails = React.lazy(() => import("./pages/ArticleDetails.jsx"));
const CreateArticle = React.lazy(() => import("./pages/CreateArticle.jsx"));
const EditArticle = React.lazy(() => import("./pages/EditArticle.jsx"));
const MyArticles = React.lazy(() => import("./pages/MyArticles.jsx"));
const Forum = React.lazy(() => import("./pages/Forum.jsx"));
const ForumTopic = React.lazy(() => import("./pages/ForumTopic.jsx"));
const MonthlyFees = React.lazy(() => import("./pages/MonthlyFees.jsx"));
const Teams = React.lazy(() => import("./pages/Teams.jsx"));
const TeamDetails = React.lazy(() => import("./pages/TeamDetails.jsx"));
const TeamAttendance = React.lazy(() => import("./pages/TeamAttendance.jsx"));
const TeamAttendanceReport = React.lazy(() => import("./pages/TeamAttendanceReport.jsx"));
const TeamAthleteProfile = React.lazy(() => import("./pages/TeamAthleteProfile.jsx"));
const TeamScheduleCalendar = React.lazy(() => import("./pages/TeamScheduleCalendar.jsx"));
const ParentPortal = React.lazy(() => import("./pages/ParentPortal.jsx"));
const ParentLogin = React.lazy(() => import("./pages/ParentLogin.jsx"));
const TeamRoomLogin = React.lazy(() => import("./pages/TeamRoomLogin.jsx"));
const TeamRoomPortal = React.lazy(() => import("./pages/TeamRoomPortal.jsx"));
const ClubHeadDashboard = React.lazy(() => import("./pages/ClubHeadDashboard.jsx"));
const CoachBoard = React.lazy(() => import("./pages/CoachBoard.jsx"));
const CoachMobileLayout = React.lazy(() => import("./components/coachMobile/CoachMobileLayout.jsx"));
const CoachToday = React.lazy(() => import("./pages/coach/CoachToday.jsx"));
const CoachTeamsList = React.lazy(() => import("./pages/coach/CoachTeamsList.jsx"));
const CoachTeamHub = React.lazy(() => import("./pages/coach/CoachTeamHub.jsx"));
const CoachSchedule = React.lazy(() => import("./pages/coach/CoachSchedule.jsx"));
const CoachMenu = React.lazy(() => import("./pages/coach/CoachMenu.jsx"));

const AdminDashboard = React.lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const AdminDrills = React.lazy(() => import("./pages/admin/AdminDrills.jsx"));
const AdminPending = React.lazy(() => import("./pages/admin/AdminPending.jsx"));
const AdminPendingDrill = React.lazy(() => import("./pages/admin/AdminPendingDrill.jsx"));
const AdminEditDrill = React.lazy(() => import("./pages/admin/AdminEditDrill.jsx"));
const AdminCoaches = React.lazy(() => import("./pages/admin/AdminCoaches.jsx"));
const AdminClubs = React.lazy(() => import("./pages/admin/AdminClubs.jsx"));
const AdminPendingArticles = React.lazy(() => import("./pages/admin/AdminPendingArticles.jsx"));
const AdminArticleModeration = React.lazy(() => import("./pages/admin/AdminArticleModeration.jsx"));
const AdminArticles = React.lazy(() => import("./pages/admin/AdminArticles.jsx"));
const AdminEditArticle = React.lazy(() => import("./pages/admin/AdminEditArticle.jsx"));

import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import AdminGuard from "./auth/AdminGuard.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";

// Prevent white-screen after deploy when browser has stale cached chunk references.
if (typeof window !== "undefined") {
  const reloadKey = "vp-preload-reload-once";
  const reloadOnce = () => {
    const alreadyReloaded = sessionStorage.getItem(reloadKey) === "1";
    if (!alreadyReloaded) {
      sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
    } else {
      sessionStorage.removeItem(reloadKey);
    }
  };

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnce();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = String(event?.reason?.message || event?.reason || "");
    if (message.includes("Failed to fetch dynamically imported module")) {
      event.preventDefault();
      reloadOnce();
    }
  });
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    ),
    children: [
      { index: true, element: <Home /> },

      { path: "login", element: <Login /> },
      { path: "parent/login", element: <ParentLogin /> },
      { path: "parent/portal", element: <ParentPortal /> },
      { path: "parent", element: <Navigate to="/parent/login" replace /> },
      { path: "parent/:token", element: <ParentPortal /> },
      { path: "room/login", element: <TeamRoomLogin /> },
      { path: "room/portal", element: <TeamRoomPortal /> },
      { path: "room", element: <Navigate to="/room/login" replace /> },
      { path: "team/:token", element: <Navigate to="/room/login" replace /> },
      { path: "team", element: <Navigate to="/room/login" replace /> },

      { path: "drills", element: <Drills /> },
      { path: "articles", element: <Articles /> },
      { path: "articles/:id", element: <ArticleDetails /> },
      { path: "drills/new", element: <CreateDrill /> },
      { path: "drills/:id", element: <DrillDetails /> },
      { path: "generator", element: <Generator /> },

      // Coach-only
        {
        element: <ProtectedRoute allowRoles={["coach", "club_head_coach", "federation_admin"]} />,
        children: [
          { path: "my-drills", element: <MyDrills /> },

          { path: "my-trainings", element: <MyTrainings /> },
          { path: "trainings/:id", element: <TrainingDetails /> },
          { path: "trainings/:id/edit", element: <EditTraining /> },
          { path: "ai-generator", element: <AIGenerator /> },
          { path: "articles/new", element: <CreateArticle /> },
          { path: "articles/my", element: <MyArticles /> },
          { path: "articles/:id/edit", element: <EditArticle /> },
          { path: "forum", element: <Forum /> },
          { path: "forum/:id", element: <ForumTopic /> },
          { path: "monthly-fees", element: <MonthlyFees /> },
          { path: "teams", element: <Teams /> },
          { path: "teams/schedule", element: <TeamScheduleCalendar /> },
          { path: "teams/:teamId", element: <TeamDetails /> },
          { path: "teams/:teamId/attendance", element: <TeamAttendance /> },
          { path: "teams/:teamId/report", element: <TeamAttendanceReport /> },
          { path: "teams/athletes/:athleteId", element: <TeamAthleteProfile /> },
          { path: "club-head", element: <ClubHeadDashboard /> },
          { path: "coach-board", element: <CoachBoard /> },
          {
            path: "coach",
            element: <CoachMobileLayout />,
            children: [
              { index: true, element: <Navigate to="today" replace /> },
              { path: "today", element: <CoachToday /> },
              { path: "teams", element: <CoachTeamsList /> },
              { path: "teams/:teamId", element: <CoachTeamHub /> },
              { path: "schedule", element: <CoachSchedule /> },
              { path: "menu", element: <CoachMenu /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute allowRoles={["platform_admin", "federation_admin"]} />,
        children: [{ path: "drills/:id/edit", element: <EditDrill /> }],
      },

      // Admin-only
      {
        path: "admin",
        element: <AdminGuard />,
        children: [
          { index: true, element: <AdminDashboard /> },

          { path: "drills", element: <AdminDrills /> },
          { path: "drills/:id/edit", element: <AdminEditDrill /> },

          { path: "pending", element: <AdminPending /> },
          { path: "pending/:id", element: <AdminPendingDrill /> },

          { path: "coaches/*", element: <AdminCoaches /> },
          { path: "clubs/*", element: <AdminClubs /> },
          { path: "articles", element: <AdminArticles /> },
          { path: "articles/pending", element: <AdminPendingArticles /> },
          { path: "articles/:id", element: <AdminArticleModeration /> },
          { path: "articles/:id/edit", element: <AdminEditArticle /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
