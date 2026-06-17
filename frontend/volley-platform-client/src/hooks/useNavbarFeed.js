import { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import useNavRoles from "../navigation/useNavRoles";

export default function useNavbarFeed() {
  const { user, isCoachUser, isHeadCoachUser } = useNavRoles();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [feeAlerts, setFeeAlerts] = useState([]);
  const [feeUnreadCount, setFeeUnreadCount] = useState(0);
  const [taskReports, setTaskReports] = useState([]);
  const [taskReportsUnread, setTaskReportsUnread] = useState(0);
  const [clubSeenTick, setClubSeenTick] = useState(0);

  const combinedUnreadCount = useMemo(() => {
    let n = Number(unreadCount) || 0;
    if (isHeadCoachUser) {
      n += Number(feeUnreadCount) || 0;
      n += Number(taskReportsUnread) || 0;
    }
    return n;
  }, [unreadCount, feeUnreadCount, taskReportsUnread, isHeadCoachUser]);

  const unifiedFeedItems = useMemo(() => {
    let feeSeen = new Set();
    let taskSeen = new Set();
    if (isHeadCoachUser && user?.id) {
      try {
        feeSeen = new Set(JSON.parse(localStorage.getItem(`vp-fee-alerts-seen-${user.id}`) || "[]"));
      } catch {
        feeSeen = new Set();
      }
      try {
        taskSeen = new Set(JSON.parse(localStorage.getItem(`vp-task-reports-seen-${user.id}`) || "[]"));
      } catch {
        taskSeen = new Set();
      }
    }
    const out = [];
    (notifications || []).forEach((n) => {
      out.push({ kind: "forum", key: `forum-${n.id}`, ts: n.created_at, unread: !n.is_read, forum: n });
    });
    if (isHeadCoachUser) {
      (feeAlerts || []).forEach((f) => {
        out.push({ kind: "fee", key: `fee-${f.id}`, ts: f.paid_at, unread: !feeSeen.has(f.id), fee: f });
      });
      (taskReports || []).forEach((t) => {
        out.push({ kind: "task", key: `task-${t.id}`, ts: t.updated_at, unread: !taskSeen.has(t.id), task: t });
      });
    }
    out.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
    return out.slice(0, 28);
  }, [notifications, feeAlerts, taskReports, isHeadCoachUser, user, clubSeenTick]);

  const markFeeItemSeen = useCallback(
    (paymentId) => {
      if (!user?.id) return;
      const key = `vp-fee-alerts-seen-${user.id}`;
      try {
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        const next = Array.from(new Set([...arr.map(Number), Number(paymentId)]));
        localStorage.setItem(key, JSON.stringify(next));
        setFeeUnreadCount(feeAlerts.filter((x) => !next.includes(Number(x.id))).length);
        setClubSeenTick((x) => x + 1);
      } catch {
        // ignore
      }
    },
    [user, feeAlerts],
  );

  const markTaskItemSeen = useCallback(
    (assignmentId) => {
      if (!user?.id) return;
      const key = `vp-task-reports-seen-${user.id}`;
      try {
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        const next = Array.from(new Set([...arr.map(Number), Number(assignmentId)]));
        localStorage.setItem(key, JSON.stringify(next));
        setTaskReportsUnread(taskReports.filter((x) => !next.includes(Number(x.id))).length);
        setClubSeenTick((x) => x + 1);
      } catch {
        // ignore
      }
    },
    [user, taskReports],
  );

  const markAllClubFeedSeen = useCallback(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`vp-fee-alerts-seen-${user.id}`, JSON.stringify(feeAlerts.map((x) => x.id)));
      localStorage.setItem(`vp-task-reports-seen-${user.id}`, JSON.stringify(taskReports.map((x) => x.id)));
      setFeeUnreadCount(0);
      setTaskReportsUnread(0);
      setClubSeenTick((x) => x + 1);
    } catch {
      // ignore
    }
  }, [user, feeAlerts, taskReports]);

  const markForumItemRead = useCallback((item) => {
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - (item.is_read ? 0 : 1)));
  }, []);

  const markAllForumRead = useCallback(async () => {
    try {
      await axiosInstance.post(API_PATHS.FORUM_NOTIFICATIONS_READ_ALL);
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.FORUM_NOTIFICATIONS, { params: { limit: 8 } });
        if (cancelled) return;
        setNotifications(Array.isArray(res.data?.items) ? res.data.items : []);
        setUnreadCount(Number(res.data?.unread_count) || 0);
      } catch {
        if (!cancelled) {
          setNotifications([]);
          setUnreadCount(0);
        }
      }
    };
    load();
    const timer = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    if (!isCoachUser || !user) {
      setNewTaskCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [trainRes, methodRes] = await Promise.all([
          axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS),
          axiosInstance.get(API_PATHS.MY_METHOD_ASSIGNMENTS).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const items = [
          ...(Array.isArray(trainRes.data) ? trainRes.data : []),
          ...(Array.isArray(methodRes.data) ? methodRes.data : []),
        ];
        setNewTaskCount(items.filter((x) => String(x?.status || "").toLowerCase() === "new").length);
      } catch {
        if (!cancelled) setNewTaskCount(0);
      }
    };
    load();
    const timer = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isCoachUser, user]);

  useEffect(() => {
    if (!isHeadCoachUser || !user) {
      setFeeAlerts([]);
      setFeeUnreadCount(0);
      return;
    }
    const storageKey = `vp-fee-alerts-seen-${user.id}`;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.FEES_PAYMENT_ACTIVITY, { params: { limit: 12 } });
        if (cancelled) return;
        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        setFeeAlerts(items);
        const seen = JSON.parse(localStorage.getItem(storageKey) || "[]");
        setFeeUnreadCount(items.filter((x) => !seen.includes(Number(x.id))).length);
      } catch {
        if (!cancelled) {
          setFeeAlerts([]);
          setFeeUnreadCount(0);
        }
      }
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isHeadCoachUser, user]);

  useEffect(() => {
    if (!isHeadCoachUser || !user) {
      setTaskReports([]);
      setTaskReportsUnread(0);
      return;
    }
    const storageKey = `vp-task-reports-seen-${user.id}`;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_ACTIVITY, { params: { limit: 24 } });
        if (cancelled) return;
        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        setTaskReports(items);
        const seen = JSON.parse(localStorage.getItem(storageKey) || "[]");
        setTaskReportsUnread(items.filter((x) => !seen.includes(Number(x.id))).length);
      } catch {
        if (!cancelled) {
          setTaskReports([]);
          setTaskReportsUnread(0);
        }
      }
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isHeadCoachUser, user]);

  useEffect(() => {
    if (!isCoachUser || !user) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [trainRes, methodRes] = await Promise.all([
          axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS),
          axiosInstance.get(API_PATHS.MY_METHOD_ASSIGNMENTS).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const items = [
          ...(Array.isArray(trainRes.data) ? trainRes.data : []),
          ...(Array.isArray(methodRes.data) ? methodRes.data : []),
        ];
        setTasks(items.slice(0, 8));
      } catch {
        if (!cancelled) setTasks([]);
      }
    };
    load();
    const timer = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isCoachUser, user]);

  return {
    isCoachUser,
    isHeadCoachUser,
    newTaskCount,
    tasks,
    combinedUnreadCount,
    unreadCount,
    unifiedFeedItems,
    markFeeItemSeen,
    markTaskItemSeen,
    markAllClubFeedSeen,
    markForumItemRead,
    markAllForumRead,
    setNotifications,
    setUnreadCount,
  };
}
