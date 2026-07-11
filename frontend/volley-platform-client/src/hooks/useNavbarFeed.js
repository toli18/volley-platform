import { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import useNavRoles from "../navigation/useNavRoles";

/**
 * Polling, който НЕ удря бекенда, когато табът е скрит (минимизиран/друг таб),
 * и добавя малък jitter, за да не се синхронизират всички клиенти в един момент.
 * При връщане на фокус прави незабавно опресняване.
 * Връща cleanup функция.
 */
function startVisiblePoll(load, intervalMs) {
  const jitter = Math.floor(Math.random() * 4000);
  const tick = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    load();
  };
  const timer = window.setInterval(tick, intervalMs + jitter);
  const onVisible = () => {
    if (typeof document !== "undefined" && !document.hidden) load();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export default function useNavbarFeed() {
  const { user, isCoachUser, isHeadCoachUser, isPlatformAdmin } = useNavRoles();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [feeAlerts, setFeeAlerts] = useState([]);
  const [feeUnreadCount, setFeeUnreadCount] = useState(0);
  const [taskReports, setTaskReports] = useState([]);
  const [taskReportsUnread, setTaskReportsUnread] = useState(0);
  const [pilotRequests, setPilotRequests] = useState([]);
  const [pilotUnreadCount, setPilotUnreadCount] = useState(0);
  const [clubSeenTick, setClubSeenTick] = useState(0);

  const combinedUnreadCount = useMemo(() => {
    let n = Number(unreadCount) || 0;
    if (isHeadCoachUser) {
      n += Number(feeUnreadCount) || 0;
      n += Number(taskReportsUnread) || 0;
    }
    if (isPlatformAdmin) {
      n += Number(pilotUnreadCount) || 0;
    }
    return n;
  }, [unreadCount, feeUnreadCount, taskReportsUnread, pilotUnreadCount, isHeadCoachUser, isPlatformAdmin]);

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
    let pilotSeen = new Set();
    if (isPlatformAdmin && user?.id) {
      try {
        pilotSeen = new Set(JSON.parse(localStorage.getItem(`vp-pilot-requests-seen-${user.id}`) || "[]"));
      } catch {
        pilotSeen = new Set();
      }
    }
    const out = [];
    (notifications || []).forEach((n) => {
      out.push({ kind: "forum", key: `forum-${n.id}`, ts: n.created_at, unread: !n.is_read, forum: n });
    });
    if (isPlatformAdmin) {
      (pilotRequests || []).forEach((p) => {
        const unread = !p.admin_seen && !pilotSeen.has(Number(p.id));
        out.push({ kind: "pilot", key: `pilot-${p.id}`, ts: p.created_at, unread, pilot: p });
      });
    }
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
  }, [notifications, feeAlerts, taskReports, pilotRequests, isHeadCoachUser, isPlatformAdmin, user, clubSeenTick]);

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

  const markPilotItemSeen = useCallback(
    async (requestId) => {
      if (!user?.id) return;
      const key = `vp-pilot-requests-seen-${user.id}`;
      try {
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        const next = Array.from(new Set([...arr.map(Number), Number(requestId)]));
        localStorage.setItem(key, JSON.stringify(next));
        setPilotUnreadCount(pilotRequests.filter((x) => !x.admin_seen && !next.includes(Number(x.id))).length);
        setClubSeenTick((x) => x + 1);
      } catch {
        // ignore
      }
      try {
        await axiosInstance.patch(API_PATHS.PILOT_REQUEST_UPDATE(requestId), { admin_seen: true });
        setPilotRequests((prev) => prev.map((x) => (x.id === requestId ? { ...x, admin_seen: true } : x)));
      } catch {
        // ignore
      }
    },
    [user, pilotRequests],
  );

  const markAllPilotSeen = useCallback(async () => {
    if (!user?.id) return;
    try {
      await axiosInstance.post(API_PATHS.PILOT_REQUESTS_READ_ALL);
      const key = `vp-pilot-requests-seen-${user.id}`;
      localStorage.setItem(key, JSON.stringify(pilotRequests.map((x) => x.id)));
      setPilotRequests((prev) => prev.map((x) => ({ ...x, admin_seen: true })));
      setPilotUnreadCount(0);
      setClubSeenTick((x) => x + 1);
    } catch {
      // ignore
    }
  }, [user, pilotRequests]);

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
      setTasks([]);
      setNewTaskCount(0);
      setFeeAlerts([]);
      setFeeUnreadCount(0);
      setTaskReports([]);
      setTaskReportsUnread(0);
      setPilotRequests([]);
      setPilotUnreadCount(0);
      return;
    }
    let cancelled = false;

    const applyForum = (forum) => {
      setNotifications(Array.isArray(forum?.items) ? forum.items : []);
      setUnreadCount(Number(forum?.unread_count) || 0);
    };

    const applyTasks = (trainItems, methodItems) => {
      const items = [
        ...(Array.isArray(trainItems) ? trainItems : []),
        ...(Array.isArray(methodItems) ? methodItems : []),
      ];
      setTasks(items.slice(0, 8));
      setNewTaskCount(items.filter((x) => String(x?.status || "").toLowerCase() === "new").length);
    };

    const applyFeeActivity = (items) => {
      const list = Array.isArray(items) ? items : [];
      setFeeAlerts(list);
      try {
        const seen = JSON.parse(localStorage.getItem(`vp-fee-alerts-seen-${user.id}`) || "[]");
        setFeeUnreadCount(list.filter((x) => !seen.includes(Number(x.id))).length);
      } catch {
        setFeeUnreadCount(0);
      }
    };

    const applyTaskReports = (items) => {
      const list = Array.isArray(items) ? items : [];
      setTaskReports(list);
      try {
        const seen = JSON.parse(localStorage.getItem(`vp-task-reports-seen-${user.id}`) || "[]");
        setTaskReportsUnread(list.filter((x) => !seen.includes(Number(x.id))).length);
      } catch {
        setTaskReportsUnread(0);
      }
    };

    const applyPilotRequests = (data) => {
      const list = Array.isArray(data?.items) ? data.items : [];
      setPilotRequests(list);
      setPilotUnreadCount(Number(data?.unread_count) || 0);
      if (isPlatformAdmin && user?.id) {
        try {
          const seen = JSON.parse(localStorage.getItem(`vp-pilot-requests-seen-${user.id}`) || "[]");
          const extra = list.filter((x) => !x.admin_seen && !seen.includes(Number(x.id))).length;
          if (extra > (Number(data?.unread_count) || 0)) {
            setPilotUnreadCount(extra);
          }
        } catch {
          // ignore
        }
      }
    };

    // Резервен вариант
    const loadLegacy = async () => {
      const forumRes = await axiosInstance
        .get(API_PATHS.FORUM_NOTIFICATIONS, { params: { limit: 8 } })
        .catch(() => ({ data: {} }));
      if (cancelled) return;
      applyForum(forumRes.data);

      if (isCoachUser) {
        const [trainRes, methodRes] = await Promise.all([
          axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS).catch(() => ({ data: [] })),
          axiosInstance.get(API_PATHS.MY_METHOD_ASSIGNMENTS).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        applyTasks(trainRes.data, methodRes.data);
      } else {
        applyTasks([], []);
      }

      if (isHeadCoachUser) {
        const [feeRes, repRes] = await Promise.all([
          axiosInstance
            .get(API_PATHS.FEES_PAYMENT_ACTIVITY, { params: { limit: 12 } })
            .catch(() => ({ data: { items: [] } })),
          axiosInstance
            .get(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_ACTIVITY, { params: { limit: 24 } })
            .catch(() => ({ data: { items: [] } })),
        ]);
        if (cancelled) return;
        applyFeeActivity(feeRes.data?.items);
        applyTaskReports(repRes.data?.items);
      } else {
        applyFeeActivity([]);
        applyTaskReports([]);
      }

      if (isPlatformAdmin) {
        const pilotRes = await axiosInstance
          .get(API_PATHS.PILOT_REQUESTS, { params: { limit: 12 } })
          .catch(() => ({ data: { items: [], unread_count: 0 } }));
        if (cancelled) return;
        applyPilotRequests(pilotRes.data);
      } else {
        applyPilotRequests({ items: [], unread_count: 0 });
      }
    };

    const load = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.NAVBAR_FEED);
        if (cancelled) return;
        const data = res.data || {};
        applyForum(data.forum);
        applyTasks(data.tasks_training, data.tasks_method);
        applyFeeActivity(data.fee_activity?.items);
        applyTaskReports(data.task_reports?.items);
        applyPilotRequests(data.pilot_requests);
      } catch {
        if (cancelled) return;
        try {
          await loadLegacy();
        } catch {
          // запазваме предишното състояние при пълен неуспех
        }
      }
    };

    load();
    const stop = startVisiblePoll(load, 45000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [user, isCoachUser, isHeadCoachUser, isPlatformAdmin]);

  return {
    isCoachUser,
    isHeadCoachUser,
    isPlatformAdmin,
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
    markPilotItemSeen,
    markAllPilotSeen,
    setNotifications,
    setUnreadCount,
  };
}
