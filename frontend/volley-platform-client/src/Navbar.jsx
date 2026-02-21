// src/Navbar.jsx
import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext";

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [logoError, setLogoError] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const userLabel = useMemo(() => user?.email || user?.username || "Потребител", [user]);
  const roleLabel = useMemo(() => (user?.role ? String(user.role) : "guest"), [user]);
  const isAdminUser = Boolean(isAdmin);
  const isCoachUser = user?.role === "coach";
  const isPlatformAdmin = user?.role === "platform_admin";

  return (
    <header className="appHeader">
      <div className="accountTopRight">
        {!user ? (
          <Link className="navBtnOutline" to="/login">
            Вход
          </Link>
        ) : (
          <div className="accountArea">
            <div className="accountMeta">
              <span className="accountUser">{userLabel}</span>
              <span className="accountRole">{roleLabel}</span>
            </div>
            <button className="navBtnOutline" onClick={onLogout}>
              Изход
            </button>
          </div>
        )}
      </div>

      <div className="appHeaderTop">
        <Link className="logoLink logoLeft" to="/drills" title="Българска федерация по волейбол">
          {!logoError ? (
            <img
              src="/bfvb-logo.png"
              alt="Българска федерация по волейбол"
              className="brandLogo"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="brandLogoFallback">БФВ</div>
          )}
        </Link>

        <Link className="brand" to="/drills" title="Volley Coach Platform">
          <div className="brandText">
            <div className="brandTitle brandTitleTri">
              <span className="triWhite">Volley</span>
              <span className="triGreen">Coach</span>
              <span className="triRed">Platform</span>
            </div>
            <div className="brandSubtitle brandSubtitleTri">
              <span className="triWhite">Единна платформа</span>
              <span className="triGreen">за волейболните треньори</span>
              <span className="triRed">в България</span>
            </div>
          </div>
        </Link>
      </div>

      <nav className="appNav">
        <Link className="appNavLink" to="/drills">
          Упражнения
        </Link>
        <Link className="appNavLink" to="/generator">
          Генератор
        </Link>
        {user && (
          <Link className="appNavLink" to="/articles">
            Статии
          </Link>
        )}

        {user && (
          <>
            <Link className="appNavLink" to="/ai-generator">
              AI Генератор
            </Link>
            <Link className="appNavLink" to="/my-drills">
              Моите упражнения
            </Link>
            <Link className="appNavLink" to="/my-trainings">
              Моите тренировки
            </Link>
            <Link className="appNavLink" to="/forum">
              Форум
            </Link>
            {isCoachUser && (
              <Link className="appNavLink" to="/articles/new">
                Нова статия
              </Link>
            )}
          </>
        )}

        {isAdminUser && (
          <>
            <span className="appNavDivider" />
            <Link className="appNavLink" to="/admin">
              Админ
            </Link>
            <Link className="appNavLink" to="/admin/drills">
              Всички упражнения
            </Link>
            <Link className="appNavLink" to="/admin/coaches">
              Треньори
            </Link>
            <Link className="appNavLink" to="/admin/clubs">
              Клубове
            </Link>
            <Link className="appNavLink" to="/admin/pending">
              Чакащи упражнения
            </Link>
            {isPlatformAdmin && (
              <Link className="appNavLink" to="/admin/articles/pending">
                Чакащи статии
              </Link>
            )}
            {isPlatformAdmin && (
              <Link className="appNavLink" to="/admin/articles">
                Всички статии
              </Link>
            )}
          </>
        )}
      </nav>
    </header>
  );
}
