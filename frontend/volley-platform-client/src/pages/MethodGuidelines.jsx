import { Navigate } from "react-router-dom";

/** Legacy URL — методиката е в учебника БФВ. */
export default function MethodGuidelines() {
  return <Navigate to="/textbook" replace />;
}
