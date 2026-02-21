// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
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
const Forum = React.lazy(() => import("./pages/Forum.jsx"));
const ForumTopic = React.lazy(() => import("./pages/ForumTopic.jsx"));
const MonthlyFees = React.lazy(() => import("./pages/MonthlyFees.jsx"));

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

      { path: "drills", element: <Drills /> },
      { path: "articles", element: <Articles /> },
      { path: "articles/:id", element: <ArticleDetails /> },
      { path: "drills/new", element: <CreateDrill /> },
      { path: "drills/:id", element: <DrillDetails /> },
      { path: "generator", element: <Generator /> },

      // Coach-only
        {
        element: <ProtectedRoute allowRoles={["coach", "federation_admin"]} />,
        children: [
          { path: "my-drills", element: <MyDrills /> },

          { path: "my-trainings", element: <MyTrainings /> },
          { path: "trainings/:id", element: <TrainingDetails /> },
          { path: "trainings/:id/edit", element: <EditTraining /> },
          { path: "ai-generator", element: <AIGenerator /> },
          { path: "articles/new", element: <CreateArticle /> },
          { path: "articles/:id/edit", element: <EditArticle /> },
          { path: "forum", element: <Forum /> },
          { path: "forum/:id", element: <ForumTopic /> },
          { path: "monthly-fees", element: <MonthlyFees /> },
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
