import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";
import { Button, Card, Input } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result?.success) {
        toast.success("Успешен вход.");
        navigate("/", { replace: true });
      } else {
        const message = result?.error || "Невалиден имейл или парола. Моля, опитай отново.";
        setError(message);
        toast.error(message);
      }
    } catch {
      const message = "Невалиден имейл или парола. Моля, опитай отново.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="uiPage" style={{ maxWidth: 420, margin: "40px auto" }}>
      <Card title="Вход" subtitle="Влез в платформата с твоите данни.">
        {error && <div className="uiAlert uiAlert--danger">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <Input
            label="Имейл"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            required
            placeholder="ваш@имейл.com"
          />

          <Input
            label="Парола"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            required
            placeholder="Въведете парола"
          />

          <Button type="submit" disabled={loading} block>
            {loading ? "Влизане..." : "Влез"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
