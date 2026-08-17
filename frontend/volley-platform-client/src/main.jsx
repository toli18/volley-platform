// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "./index.css";

import App from "./App.jsx";
import RouteErrorPage from "./pages/RouteErrorPage.jsx";
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
const CoachAthletes = React.lazy(() => import("./pages/coach/CoachAthletes.jsx"));
const Teams = React.lazy(() => import("./pages/Teams.jsx"));
const TeamDetails = React.lazy(() => import("./pages/TeamDetails.jsx"));
const TeamAttendance = React.lazy(() => import("./pages/TeamAttendance.jsx"));
const TeamAttendanceReport = React.lazy(() => import("./pages/TeamAttendanceReport.jsx"));
const TeamAthleteProfile = React.lazy(() => import("./pages/TeamAthleteProfile.jsx"));
const ParentPortal = React.lazy(() => import("./pages/ParentPortal.jsx"));
const ParentLogin = React.lazy(() => import("./pages/ParentLogin.jsx"));
const TeamRoomLogin = React.lazy(() => import("./pages/TeamRoomLogin.jsx"));
const TeamRoomPortal = React.lazy(() => import("./pages/TeamRoomPortal.jsx"));
const PublicMatchWatch = React.lazy(() => import("./pages/PublicMatchWatch.jsx"));
const PublicForm03bSign = React.lazy(() => import("./pages/PublicForm03bSign.jsx"));
const ClubHeadDashboard = React.lazy(() => import("./pages/ClubHeadDashboard.jsx"));
const CoachBoard = React.lazy(() => import("./pages/CoachBoard.jsx"));
const CoachMobileLayout = React.lazy(() => import("./components/coachMobile/CoachMobileLayout.jsx"));
const CoachToday = React.lazy(() => import("./pages/coach/CoachToday.jsx"));
const CoachTeamHub = React.lazy(() => import("./pages/coach/CoachTeamHub.jsx"));
const CoachSchedule = React.lazy(() => import("./pages/coach/CoachSchedule.jsx"));
const CoachMenu = React.lazy(() => import("./pages/coach/CoachMenu.jsx"));
const CoachClubHub = React.lazy(() => import("./pages/coach/CoachClubHub.jsx"));
const CoachBvfHub = React.lazy(() => import("./pages/coach/CoachBvfHub.jsx"));
const CoachBvfAdmin = React.lazy(() => import("./pages/coach/CoachBvfAdmin.jsx"));
const CoachBvfCardIndexes = React.lazy(() => import("./pages/coach/CoachBvfCardIndexes.jsx"));
const CoachBvfUniversalPlayers = React.lazy(() => import("./pages/coach/CoachBvfUniversalPlayers.jsx"));
const CoachBvfCardIndexDetail = React.lazy(() => import("./pages/coach/CoachBvfCardIndexDetail.jsx"));
const CoachClubProfile = React.lazy(() => import("./pages/coach/CoachClubProfile.jsx"));
const CoachClubAdminHub = React.lazy(() => import("./pages/coach/CoachClubAdminHub.jsx"));
const CoachAssessmentSession = React.lazy(() => import("./pages/coach/CoachAssessmentSession.jsx"));
const CoachTestingHub = React.lazy(() => import("./pages/coach/CoachTestingHub.jsx"));
const CoachGroupWorkHub = React.lazy(() => import("./pages/coach/CoachGroupWorkHub.jsx"));
const CoachLearningHub = React.lazy(() => import("./pages/coach/CoachLearningHub.jsx"));
const CoachMyContentHub = React.lazy(() => import("./pages/coach/CoachMyContentHub.jsx"));
const AthleteDevelopmentCard = React.lazy(() => import("./pages/coach/AthleteDevelopmentCard.jsx"));
const CoachTestBattery = React.lazy(() => import("./pages/coach/CoachTestBattery.jsx"));
const CoachScoutingTable = React.lazy(() => import("./pages/coach/CoachScoutingTable.jsx"));
const CoachProgramWeek = React.lazy(() => import("./pages/coach/CoachProgramWeek.jsx"));
const CoachAthleteProfile = React.lazy(() => import("./pages/coach/CoachAthleteProfile.jsx"));
const CoachMyTrainings = React.lazy(() => import("./pages/coach/CoachMyTrainings.jsx"));
const CoachAttendanceTeams = React.lazy(() => import("./pages/coach/CoachAttendanceTeams.jsx"));
const CoachTeamAttendanceMonth = React.lazy(() => import("./pages/coach/CoachTeamAttendanceMonth.jsx"));
const CoachMatches = React.lazy(() => import("./pages/coach/CoachMatches.jsx"));
const CoachMatchSetup = React.lazy(() => import("./pages/coach/CoachMatchSetup.jsx"));
const CoachMatchLive = React.lazy(() => import("./pages/coach/CoachMatchLive.jsx"));
const CoachMatchReport = React.lazy(() => import("./pages/coach/CoachMatchReport.jsx"));
const CoachCompetitions = React.lazy(() => import("./pages/coach/CoachCompetitions.jsx"));
const CoachEnrollments = React.lazy(() => import("./pages/coach/CoachEnrollments.jsx"));
const PublicClubPage = React.lazy(() => import("./pages/PublicClubPage.jsx"));
const CoachChat = React.lazy(() => import("./pages/CoachChat.jsx"));
const CoachChatList = React.lazy(() => import("./pages/coach/CoachChatList.jsx"));
const CoachChatRoom = React.lazy(() => import("./pages/coach/CoachChatRoom.jsx"));
const CoachParentNewsList = React.lazy(() => import("./pages/coach/CoachParentNewsList.jsx"));
const CoachParentNewsRoom = React.lazy(() => import("./pages/coach/CoachParentNewsRoom.jsx"));

const AdminDashboard = React.lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const AdminDrills = React.lazy(() => import("./pages/admin/AdminDrills.jsx"));
const AdminPending = React.lazy(() => import("./pages/admin/AdminPending.jsx"));
const AdminPendingDrill = React.lazy(() => import("./pages/admin/AdminPendingDrill.jsx"));
const AdminEditDrill = React.lazy(() => import("./pages/admin/AdminEditDrill.jsx"));
const AdminCoaches = React.lazy(() => import("./pages/admin/AdminCoaches.jsx"));
const AdminClubs = React.lazy(() => import("./pages/admin/AdminClubs.jsx"));
const AdminPilotRequests = React.lazy(() => import("./pages/admin/AdminPilotRequests.jsx"));
const AdminPendingArticles = React.lazy(() => import("./pages/admin/AdminPendingArticles.jsx"));
const AdminArticleModeration = React.lazy(() => import("./pages/admin/AdminArticleModeration.jsx"));
const AdminArticles = React.lazy(() => import("./pages/admin/AdminArticles.jsx"));
const AdminEditArticle = React.lazy(() => import("./pages/admin/AdminEditArticle.jsx"));
const AdminNationalLibrary = React.lazy(() => import("./pages/admin/AdminNationalLibrary.jsx"));
const FederationDashboard = React.lazy(() => import("./pages/admin/FederationDashboard.jsx"));
const NationalNormMachine = React.lazy(() => import("./pages/admin/NationalNormMachine.jsx"));
const AdminAssessmentBattery = React.lazy(() => import("./pages/admin/AdminAssessmentBattery.jsx"));
const NationalLibrary = React.lazy(() => import("./pages/NationalLibrary.jsx"));
const Textbook = React.lazy(() => import("./pages/Textbook.jsx"));
const MethodGuidelines = React.lazy(() => import("./pages/MethodGuidelines.jsx"));

import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import AdminGuard from "./auth/AdminGuard.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import {
  CoachMobileCanonicalRedirect,
  RedirectPreserveSearch,
} from "./components/routing/coachCanonicalRoutes.jsx";

function LegacyChatRoute() {
  return (
    <CoachMobileCanonicalRedirect to="/coach/chat">
      <CoachChat />
    </CoachMobileCanonicalRedirect>
  );
}

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
    errorElement: <RouteErrorPage />,
    children: [
      { path: "login", element: <Login /> },
      { path: "parent/login", element: <ParentLogin /> },
      { path: "parent/portal", element: <ParentPortal /> },
      { path: "parent", element: <Navigate to="/parent/login" replace /> },
      { path: "parent/:token", element: <ParentPortal /> },
      { path: "room/login", element: <TeamRoomLogin /> },
      { path: "room/portal", element: <TeamRoomPortal /> },
      { path: "room", element: <Navigate to="/room/login" replace /> },
      { path: "watch/:token", element: <PublicMatchWatch /> },
      { path: "sign/form-03b/:token", element: <PublicForm03bSign /> },
      { path: "c/:slug", element: <PublicClubPage /> },
      { path: "team/:token", element: <Navigate to="/room/login" replace /> },
      { path: "team", element: <Navigate to="/room/login" replace /> },

      // Изисква вписан потребител (всяка роля) — без сесия пренасочва към /login
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <Home /> },
          { path: "drills", element: <Drills /> },
          { path: "articles", element: <Articles /> },
          { path: "articles/:id", element: <ArticleDetails /> },
          { path: "drills/new", element: <CreateDrill /> },
          { path: "drills/:id", element: <DrillDetails /> },
          { path: "generator", element: <Generator /> },
        ],
      },

      // Coach-only
        {
        element: <ProtectedRoute allowRoles={["coach", "club_head_coach", "federation_admin"]} />,
        children: [
          { path: "method-guidelines", element: <MethodGuidelines /> },
          { path: "textbook", element: <Textbook /> },
          { path: "textbook/:slug", element: <Textbook /> },
          { path: "national-library", element: <NationalLibrary /> },
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
          { path: "monthly-fees", element: <RedirectPreserveSearch to="/coach/fees" /> },
          { path: "teams", element: <RedirectPreserveSearch to="/coach/teams" /> },
          { path: "teams/schedule", element: <RedirectPreserveSearch to="/coach/schedule" /> },
          { path: "teams/:teamId", element: <TeamDetails /> },
          { path: "teams/:teamId/attendance", element: <TeamAttendance /> },
          { path: "teams/:teamId/report", element: <TeamAttendanceReport /> },
          { path: "teams/athletes/:athleteId", element: <TeamAthleteProfile /> },
          { path: "chat", element: <LegacyChatRoute /> },
          { path: "club-head", element: <ClubHeadDashboard /> },
          { path: "coach-board", element: <CoachBoard /> },
          {
            path: "coach",
            element: <CoachMobileLayout />,
            children: [
              { index: true, element: <Navigate to="today" replace /> },
              { path: "today", element: <CoachToday /> },
              { path: "teams", element: <Teams /> },
              { path: "teams/:teamId", element: <CoachTeamHub /> },
              { path: "teams/:teamId/attendance-month", element: <CoachTeamAttendanceMonth /> },
              { path: "teams/:teamId/matches", element: <CoachMatches /> },
              { path: "teams/:teamId/matches/:matchId", element: <CoachMatchSetup /> },
              { path: "teams/:teamId/matches/:matchId/live", element: <CoachMatchLive /> },
              { path: "teams/:teamId/matches/:matchId/report", element: <CoachMatchReport /> },
              { path: "attendance", element: <CoachAttendanceTeams /> },
              { path: "schedule", element: <CoachSchedule /> },
              { path: "competitions", element: <CoachCompetitions /> },
              { path: "enrollments", element: <CoachEnrollments /> },
              { path: "club", element: <CoachClubHub /> },
              { path: "club-admin", element: <CoachClubAdminHub /> },
              { path: "group-work", element: <CoachGroupWorkHub /> },
              { path: "program-week", element: <CoachProgramWeek /> },
              { path: "chat", element: <CoachChatList /> },
              { path: "chat/parents", element: <CoachParentNewsList /> },
              { path: "chat/parents/:teamId", element: <CoachParentNewsRoom /> },
              { path: "chat/:teamId", element: <CoachChatRoom /> },
              { path: "bvf", element: <CoachBvfHub /> },
              { path: "bvf-admin", element: <CoachBvfAdmin /> },
              { path: "club-profile", element: <CoachClubProfile /> },
              { path: "bvf-card-indexes", element: <CoachBvfCardIndexes /> },
              { path: "bvf-card-indexes/universal", element: <CoachBvfUniversalPlayers /> },
              { path: "bvf-card-indexes/:localId", element: <CoachBvfCardIndexDetail /> },
              { path: "learning", element: <CoachLearningHub /> },
              { path: "my-content", element: <CoachMyContentHub /> },
              { path: "assessment", element: <CoachTestingHub /> },
              { path: "assessment/session", element: <CoachAssessmentSession /> },
              { path: "assessment/battery", element: <CoachTestBattery /> },
              { path: "assessment/scouting", element: <CoachScoutingTable /> },
              { path: "assessment/athletes/:athleteId", element: <AthleteDevelopmentCard /> },
              { path: "menu", element: <CoachMenu /> },
              { path: "fees", element: <MonthlyFees /> },
              { path: "trainings", element: <CoachMyTrainings /> },
              { path: "athletes", element: <CoachAthletes /> },
              { path: "athletes/:athleteId", element: <CoachAthleteProfile /> },
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
          { path: "pilot-requests", element: <AdminPilotRequests /> },
          { path: "articles", element: <AdminArticles /> },
          { path: "articles/pending", element: <AdminPendingArticles /> },
          { path: "articles/:id", element: <AdminArticleModeration /> },
          { path: "articles/:id/edit", element: <AdminEditArticle /> },
          { path: "national-library", element: <AdminNationalLibrary /> },
          { path: "federation", element: <FederationDashboard /> },
          { path: "national-norms", element: <NationalNormMachine /> },
          { path: "assessment-battery", element: <AdminAssessmentBattery /> },
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
