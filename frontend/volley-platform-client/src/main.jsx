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

import MyDrills from "./pages/MyDrills.jsx";
import MyTrainings from "./pages/MyTrainings.jsx";
import TrainingDetails from "./pages/TrainingDetails.jsx";
import EditTraining from "./pages/EditTraining.jsx";
import AIGenerator from "./pages/AIGenerator.jsx";
import Articles from "./pages/Articles.jsx";
import ArticleDetails from "./pages/ArticleDetails.jsx";
import CreateArticle from "./pages/CreateArticle.jsx";
import EditArticle from "./pages/EditArticle.jsx";

import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import AdminDrills from "./pages/admin/AdminDrills.jsx";
import AdminPending from "./pages/admin/AdminPending.jsx";
import AdminPendingDrill from "./pages/admin/AdminPendingDrill.jsx";
import AdminEditDrill from "./pages/admin/AdminEditDrill.jsx";
import AdminCoaches from "./pages/admin/AdminCoaches.jsx";
import AdminClubs from "./pages/admin/AdminClubs.jsx";
import AdminPendingArticles from "./pages/admin/AdminPendingArticles.jsx";
import AdminArticleModeration from "./pages/admin/AdminArticleModeration.jsx";
import AdminArticles from "./pages/admin/AdminArticles.jsx";
import AdminEditArticle from "./pages/admin/AdminEditArticle.jsx";

import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import AdminGuard from "./auth/AdminGuard.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <Drills /> },

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
