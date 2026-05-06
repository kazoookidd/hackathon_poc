"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

type AuthMode = "login" | "register";
type DashboardTab = "chat" | "tasks" | "analytics";
type Task = { id: number; title: string; duration: number; explanation?: string; microtasks?: string[]; depends_on?: string[] };
type Message = { role: "user" | "coach"; content: string };
type PlannerMessage = { role: "user" | "assistant"; content: string };
type AttackPlan = { objective: string; steps: string[] };
type CalendarEvent = { task_id: number; title: string; when: string };
type Reminder = { when: string; message: string };
type FocusCheckResponse = {
  status: "focused" | "distraction_detected";
  detected_apps: string[];
  detected_processes: string[];
  checked_at: string;
  message: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const initialForm = { email: "", password: "", first_name: "", last_name: "", age: 18, profession: "", goal: "" };

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [tab, setTab] = useState<DashboardTab>("chat");
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [form, setForm] = useState(initialForm);
  const [authError, setAuthError] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "coach", content: "Je suis FOCA. Donne-moi ton objectif et je te le découpe tout de suite." }]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [batchEditInput, setBatchEditInput] = useState("");
  const [attackPlan, setAttackPlan] = useState<AttackPlan | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskDraft, setTaskDraft] = useState<{ title: string; duration: number; explanation: string; microtasksText: string }>({
    title: "",
    duration: 15,
    explanation: "",
    microtasksText: "",
  });
  const [done, setDone] = useState<number[]>([]);
  const [doneMicro, setDoneMicro] = useState<string[]>([]);
  const [plannerMessages, setPlannerMessages] = useState<PlannerMessage[]>([]);
  const [plannerInput, setPlannerInput] = useState("");
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [focusShieldEnabled, setFocusShieldEnabled] = useState(false);
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [blockedKeywordsInput, setBlockedKeywordsInput] = useState("discord, steam, youtube, twitch, tiktok, instagram");
  const [focusStatus, setFocusStatus] = useState<"idle" | "focused" | "distraction_detected">("idle");
  const [detectedApps, setDetectedApps] = useState<string[]>([]);
  const [focusXp, setFocusXp] = useState(0);
  const [focusStreak, setFocusStreak] = useState(0);
  const [focusFunMessage, setFocusFunMessage] = useState("Active le Focus Shield pour détecter les apps distrayantes.");
  const totalMicro = useMemo(() => tasks.reduce((sum, t) => sum + (t.microtasks?.length || 0), 0), [tasks]);
  const totalUnits = useMemo(() => tasks.length + totalMicro, [tasks.length, totalMicro]);
  const completedUnits = useMemo(() => done.length + doneMicro.length, [done.length, doneMicro.length]);
  const progress = useMemo(() => (totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0), [completedUnits, totalUnits]);
  const isTaskBlocked = (task: Task) => {
    const deps = task.depends_on || [];
    if (!deps.length) return false;
    return deps.some((depTitle) => {
      const depTask = tasks.find((t) => t.title === depTitle);
      return depTask ? !done.includes(depTask.id) : false;
    });
  };

  const cacheKey = useMemo(() => (userId ? `foca-cache-${userId}` : null), [userId]);

  useEffect(() => {
    if (!cacheKey) return;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.goal) setGoal(parsed.goal);
      if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks);
      if (Array.isArray(parsed.done)) setDone(parsed.done);
      if (Array.isArray(parsed.doneMicro)) setDoneMicro(parsed.doneMicro);
      if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
      if (Array.isArray(parsed.plannerMessages)) setPlannerMessages(parsed.plannerMessages);
      if (parsed.attackPlan) setAttackPlan(parsed.attackPlan);
      if (Array.isArray(parsed.calendarEvents)) setCalendarEvents(parsed.calendarEvents);
      if (Array.isArray(parsed.reminders)) setReminders(parsed.reminders);
      if (typeof parsed.focusShieldEnabled === "boolean") setFocusShieldEnabled(parsed.focusShieldEnabled);
      if (typeof parsed.alarmEnabled === "boolean") setAlarmEnabled(parsed.alarmEnabled);
      if (typeof parsed.blockedKeywordsInput === "string") setBlockedKeywordsInput(parsed.blockedKeywordsInput);
      if (parsed.focusStatus) setFocusStatus(parsed.focusStatus);
      if (Array.isArray(parsed.detectedApps)) setDetectedApps(parsed.detectedApps);
      if (typeof parsed.focusXp === "number") setFocusXp(parsed.focusXp);
      if (typeof parsed.focusStreak === "number") setFocusStreak(parsed.focusStreak);
      if (typeof parsed.focusFunMessage === "string") setFocusFunMessage(parsed.focusFunMessage);
    } catch {
      // ignore corrupted cache
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    const payload = {
      goal,
      tasks,
      done,
      doneMicro,
      messages,
      plannerMessages,
      attackPlan,
      calendarEvents,
      reminders,
      focusShieldEnabled,
      alarmEnabled,
      blockedKeywordsInput,
      focusStatus,
      detectedApps,
      focusXp,
      focusStreak,
      focusFunMessage,
    };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  }, [
    cacheKey,
    goal,
    tasks,
    done,
    doneMicro,
    messages,
    plannerMessages,
    attackPlan,
    calendarEvents,
    reminders,
    focusShieldEnabled,
    alarmEnabled,
    blockedKeywordsInput,
    focusStatus,
    detectedApps,
    focusXp,
    focusStreak,
    focusFunMessage,
  ]);

  useEffect(() => {
    if (!userId) return;
    const loadSavedPlan = async () => {
      try {
        const res = await fetch(`${API}/users/${userId}/plan`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.goal === "string") setGoal(data.goal);
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
        setAttackPlan(null);
        setCalendarEvents([]);
        setReminders([]);
      } catch {
        // ignore when there is no saved plan yet
      }
    };
    void loadSavedPlan();
  }, [userId]);

  const savePlanToServer = async (nextGoal: string, nextTasks: Task[]) => {
    if (!userId) return;
    try {
      await fetch(`${API}/users/${userId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: nextGoal, tasks: nextTasks }),
      });
    } catch {
      // keep app usable even if persistence fails
    }
  };

  const playAlarm = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.6);
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.72);
    } catch {
      // silent fail
    }
  };

  const checkFocusApps = async () => {
    if (!focusShieldEnabled || !userId) return;
    try {
      const custom = blockedKeywordsInput
        .split(/[,|\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await fetch(`${API}/focus/check-apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_blocked_keywords: custom }),
      });
      const data = (await res.json()) as FocusCheckResponse;
      if (!res.ok) throw new Error(data.message || "Erreur de surveillance focus");
      setDetectedApps(Array.isArray(data.detected_apps) ? data.detected_apps : []);
      if (data.status === "distraction_detected") {
        setFocusStatus("distraction_detected");
        setFocusStreak(0);
        setFocusFunMessage(`Alerte Focus: ${data.detected_apps.join(", ") || "app distractive"} détectée. Ferme-la et reprends ton objectif.`);
        if (alarmEnabled) playAlarm();
      } else {
        setFocusStatus("focused");
        setFocusStreak((prev) => prev + 1);
        setFocusXp((prev) => prev + 5);
        const funLines = [
          "Mode ninja activé: +5 XP focus.",
          "Ton cerveau est en zone de combat productive.",
          "Combo focus maintenu, continue.",
        ];
        setFocusFunMessage(funLines[Math.floor(Math.random() * funLines.length)]);
      }
    } catch (err) {
      setFocusFunMessage(err instanceof Error ? err.message : "Erreur de surveillance Focus Shield.");
    }
  };

  useEffect(() => {
    if (!focusShieldEnabled || !userId) return;
    void checkFocusApps();
    const timer = setInterval(() => {
      void checkFocusApps();
    }, 12000);
    return () => clearInterval(timer);
  }, [focusShieldEnabled, userId, blockedKeywordsInput, alarmEnabled]);

  const onAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const endpoint = authMode === "register" ? "/register" : "/login";
      const payload = authMode === "register" ? form : { email: form.email, password: form.password };
      const res = await fetch(`${API}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur d'authentification");
      setUserId(data.user_id);
      setUserName(data.first_name);
      setGoal(form.goal);
      setServerMessage(data.message || "Connecté.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const sendToCoach = async () => {
    if (!chatInput.trim()) return;
    const next = [...messages, { role: "user" as const, content: chatInput }];
    setMessages(next);
    setChatInput("");
    setIsTyping(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, tasks_context: tasks, current_goal: goal }),
      });
      const data = await res.json();
      setMessages([...next, { role: "coach", content: data.reply || "On lance 5 minutes maintenant." }]);
    } catch {
      setMessages([...next, { role: "coach", content: "Erreur réseau côté IA. Vérifie le backend et Ollama." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const analyzeTasksWithPlanner = async (extraConversation?: PlannerMessage[]) => {
    if (!goal.trim()) return;
    setPlannerLoading(true);
    try {
      const conversation = extraConversation || plannerMessages;
      const res = await fetch(`${API}/plan-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks_text: goal, conversation }),
      });
      const data = await res.json();
      const summary = data.summary || "Analyse du plan effectuée.";
      const nextTasks = (data.tasks || []) as Task[];
      if (nextTasks.length > 0) {
        const normalizedTasks = nextTasks.map((t: Task, i: number) => ({ ...t, id: i + 1 }));
        setTasks(normalizedTasks);
        setSelectedTaskIds([]);
        setDone([]);
        setDoneMicro([]);
        await savePlanToServer(goal, normalizedTasks);
      }
      if (data.status === "needs_clarification") {
        const questions = (data.questions || []) as string[];
        const cleanQuestions = questions.filter((q) => typeof q === "string" && q.trim().length > 0);
        setPlannerMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: cleanQuestions.length > 0 ? `${summary}\n${cleanQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}` : summary,
          },
        ]);
        setServerMessage("Plan de base généré. Tu peux répondre aux questions pour l'affiner.");
      } else {
        setPlannerMessages((prev) => [...prev, { role: "assistant", content: summary }]);
        setServerMessage("Programme généré avec dépendances.");
      }
    } catch {
      setPlannerMessages((prev) => [...prev, { role: "assistant", content: "Erreur pendant la planification IA. Réessaie." }]);
    } finally {
      setPlannerLoading(false);
    }
  };

  const sendPlannerMessage = async () => {
    if (!plannerInput.trim()) return;
    const next = [...plannerMessages, { role: "user" as const, content: plannerInput }];
    setPlannerMessages(next);
    setPlannerInput("");
    await analyzeTasksWithPlanner(next);
  };

  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setTaskDraft({
      title: task.title,
      duration: task.duration,
      explanation: task.explanation || "",
      microtasksText: (task.microtasks || []).join("\n"),
    });
  };

  const saveTaskEdit = () => {
    if (editingTaskId === null) return;
    setTasks((prev) => {
      const updatedTasks = prev.map((t) =>
        t.id === editingTaskId
          ? {
              ...t,
              title: taskDraft.title.trim() || t.title,
              duration: Math.max(5, taskDraft.duration || 15),
              explanation: taskDraft.explanation.trim(),
              microtasks: taskDraft.microtasksText
                .split("\n")
                .map((m) => m.trim())
                .filter(Boolean),
            }
          : t
      );
      void savePlanToServer(goal, updatedTasks);
      return updatedTasks;
    });
    setEditingTaskId(null);
  };

  const toggleTaskSelection = (taskId: number) => {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  };

  const modifySelectedTasksWithAI = async () => {
    if (!userId) return;
    if (selectedTaskIds.length === 0) {
      setServerMessage("Sélectionne au moins une tâche.");
      return;
    }
    setPlannerLoading(true);
    try {
      const res = await fetch(`${API}/tasks/modify-selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          goal,
          selected_task_ids: selectedTaskIds,
          instructions: batchEditInput,
          done_task_ids: done,
          current_tasks: tasks,
          conversation: plannerMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur de modification");
      const nextTasks = Array.isArray(data.tasks) ? (data.tasks as Task[]) : [];
      if (nextTasks.length > 0) {
        setTasks(nextTasks);
        await savePlanToServer(goal, nextTasks);
      }
      setAttackPlan(data.attack_plan && typeof data.attack_plan === "object" ? (data.attack_plan as AttackPlan) : null);
      setCalendarEvents(Array.isArray(data.calendar) ? (data.calendar as CalendarEvent[]) : []);
      setReminders(Array.isArray(data.reminders) ? (data.reminders as Reminder[]) : []);
      const summary = data.summary || "Tâches sélectionnées mises à jour.";
      if (data.status === "needs_clarification") {
        const questions = Array.isArray(data.questions) ? data.questions : [];
        const text = questions.length ? `${summary}\n${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}` : summary;
        setPlannerMessages((prev) => [...prev, { role: "assistant", content: text }]);
        setServerMessage("L'IA demande des précisions avant d'aller plus loin.");
      } else {
        setPlannerMessages((prev) => [...prev, { role: "assistant", content: summary }]);
        setServerMessage("Tâches sélectionnées modifiées.");
        setSelectedTaskIds([]);
      }
    } catch (err) {
      setServerMessage(err instanceof Error ? err.message : "Erreur de modification IA");
    } finally {
      setPlannerLoading(false);
    }
  };

  const submitScore = async () => {
    const res = await fetch(`${API}/score`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: completedUnits, total: totalUnits }) });
    const data = await res.json();
    setServerMessage(`${data.score}% - ${data.message}`);
  };

  const resetSite = async () => {
    const res = await fetch(`${API}/admin/reset-site`, { method: "POST" });
    const data = await res.json();
    setServerMessage(data.message || "Réinitialisé.");
    setUserId(null);
    setUserName("");
    setForm(initialForm);
    setMessages([{ role: "coach", content: "Nouveau départ. Prêt ?" }]);
    setTasks([]);
    setDone([]);
    setDoneMicro([]);
    setPlannerMessages([]);
    setAttackPlan(null);
    setCalendarEvents([]);
    setReminders([]);
    setFocusShieldEnabled(false);
    setAlarmEnabled(true);
    setDetectedApps([]);
    setFocusStatus("idle");
    setFocusXp(0);
    setFocusStreak(0);
    setFocusFunMessage("Active le Focus Shield pour détecter les apps distrayantes.");
    if (cacheKey) localStorage.removeItem(cacheKey);
  };

  if (!userId) {
    return (
      <main style={authWrapper}>
        <section style={authHero}>
          <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.08 }}>FOCA</h1>
          <p style={{ fontSize: 18, color: "#9dc0ff", marginTop: 8 }}>Coach IA anti-procrastination</p>
          <p style={{ color: "#c8d3ee", maxWidth: 500 }}>Une interface claire, des plans concrets, et un assistant connecté à ton backend IA.</p>
          <div style={{ display: "flex", gap: 10 }}>
            {["Menu dashboard", "Chat IA", "Plan de tâches"].map((pill) => (
              <span key={pill} style={pillStyle}>{pill}</span>
            ))}
          </div>
        </section>
        <section style={authCard}>
          <div style={{ display: "flex", marginBottom: 14, gap: 8 }}>
            <button type="button" onClick={() => setAuthMode("register")} style={{ ...tabButton, ...(authMode === "register" ? activeTab : {}) }}>Inscription</button>
            <button type="button" onClick={() => setAuthMode("login")} style={{ ...tabButton, ...(authMode === "login" ? activeTab : {}) }}>Connexion</button>
          </div>
          <form onSubmit={onAuth} style={{ display: "grid", gap: 10 }}>
            <input required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" style={inputStyle} />
            <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mot de passe" style={inputStyle} />
            {authMode === "register" && (
              <>
                <input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Prénom" style={inputStyle} />
                <input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Nom" style={inputStyle} />
                <input required type="number" min={13} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} placeholder="Age" style={inputStyle} />
                <input required value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} placeholder="Profession" style={inputStyle} />
                <input required value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Objectif principal" style={inputStyle} />
              </>
            )}
            {authError && <small style={{ color: "#ff9f9f" }}>{authError}</small>}
            <button style={primaryButton} disabled={loading}>{loading ? "Chargement..." : authMode === "register" ? "Créer le compte" : "Se connecter"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main style={dashboardWrapper}>
      <aside style={sidebar}>
        <h2 style={{ marginTop: 0 }}>FOCA</h2>
        <p style={{ color: "#90a6dd", marginTop: 0 }}>Bonjour {userName}</p>
        {(["chat", "tasks", "analytics"] as DashboardTab[]).map((item) => (
          <button key={item} onClick={() => setTab(item)} style={{ ...menuItem, ...(tab === item ? activeMenuItem : {}) }}>
            {item === "chat" ? "Coach IA" : item === "tasks" ? "Tâches" : "Stats"}
          </button>
        ))}
        <button onClick={resetSite} style={{ ...primaryButton, marginTop: "auto", background: "linear-gradient(90deg,#ff5f6d,#ff9966)" }}>Réinitialiser</button>
      </aside>

      <section style={content}>
        <header style={topbar}>
          <h1 style={{ margin: 0 }}>{tab === "chat" ? "Discussion avec le coach" : tab === "tasks" ? "Plan d'action" : "Suivi"}</h1>
          <div style={statusBadge}>{serverMessage || "Système prêt"}</div>
        </header>

        {tab === "chat" && (
          <div style={panelStyle}>
            <div style={chatArea}>
              {messages.map((m, i) => (
                <div key={i} style={{ ...chatBubble, alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#4f6fff" : "#1b2540" }}>
                  <strong>{m.role === "user" ? "Vous" : "FOCA"}</strong>
                  <div>{m.content}</div>
                </div>
              ))}
              {isTyping && <div style={{ color: "#9ab3eb" }}>FOCA écrit...</div>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ex: je bloque sur mon rapport..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={sendToCoach} style={primaryButton}>Envoyer</button>
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div style={panelStyle}>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ color: "#aac1f4", fontSize: 14 }}>Entre tes tâches (une ligne = une tâche)</label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={"Ex:\nRédiger l'introduction du rapport\nFaire les slides de présentation\nRéviser le chapitre 4"}
                style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => analyzeTasksWithPlanner()} style={{ ...primaryButton, width: "fit-content" }} disabled={plannerLoading}>
                  {plannerLoading ? "Analyse..." : "Analyser avec l'IA"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14, border: "1px solid #2d3f66", borderRadius: 12, padding: 10, background: "#111a30" }}>
              <div style={{ fontSize: 13, color: "#aac1f4", marginBottom: 8 }}>Discussion de planification</div>
              <div style={{ maxHeight: 150, overflow: "auto", display: "grid", gap: 6, marginBottom: 8 }}>
                {plannerMessages.length === 0 && <div style={{ color: "#93a9d7", fontSize: 13 }}>L&apos;IA peut te poser des questions sur priorités, deadlines et dépendances.</div>}
                {plannerMessages.map((m, idx) => (
                  <div key={idx} style={{ fontSize: 13, color: m.role === "assistant" ? "#c8d9ff" : "#ffffff", whiteSpace: "pre-wrap" }}>
                    <strong>{m.role === "assistant" ? "IA" : "Toi"}:</strong> {m.content}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={plannerInput}
                  onChange={(e) => setPlannerInput(e.target.value)}
                  placeholder="Réponds aux questions de l'IA..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={sendPlannerMessage} style={primaryButton} disabled={plannerLoading}>Envoyer</button>
              </div>
            </div>

            <div style={{ marginTop: 14, border: "1px solid #2d3f66", borderRadius: 12, padding: 10, background: "#111a30", display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#aac1f4" }}>
                Modification ciblée: {selectedTaskIds.length} tâche(s) sélectionnée(s)
              </div>
              <textarea
                value={batchEditInput}
                onChange={(e) => setBatchEditInput(e.target.value)}
                placeholder="Ex: raccourcis les tâches sélectionnées à 10 minutes et rends les micro-étapes plus concrètes."
                style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              />
              <button onClick={modifySelectedTasksWithAI} style={{ ...primaryButton, width: "fit-content" }} disabled={plannerLoading}>
                {plannerLoading ? "Modification..." : "Modifier uniquement les tâches sélectionnées"}
              </button>
            </div>

            <div style={{ marginTop: 14, border: "1px solid #2d3f66", borderRadius: 12, padding: 10, background: "#111a30", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "#aac1f4" }}>Focus Shield (anti distractions)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setFocusShieldEnabled((v) => !v)}
                    style={{ ...primaryButton, background: focusShieldEnabled ? "linear-gradient(90deg,#2aa85f,#1f7e4a)" : "#384665" }}
                  >
                    {focusShieldEnabled ? "Désactiver shield" : "Activer shield"}
                  </button>
                  <button
                    onClick={() => setAlarmEnabled((v) => !v)}
                    style={{ ...primaryButton, background: alarmEnabled ? "linear-gradient(90deg,#ff6b6b,#ff8f5b)" : "#384665" }}
                  >
                    {alarmEnabled ? "Alarme ON" : "Alarme OFF"}
                  </button>
                  <button onClick={() => void checkFocusApps()} style={{ ...primaryButton, background: "#2b3d63" }}>
                    Vérifier maintenant
                  </button>
                </div>
              </div>
              <input
                value={blockedKeywordsInput}
                onChange={(e) => setBlockedKeywordsInput(e.target.value)}
                placeholder="Mots-clés bloqués, séparés par des virgules (ex: discord, steam, youtube)"
                style={inputStyle}
              />
              <div style={{ fontSize: 13, color: focusStatus === "distraction_detected" ? "#ffb4b4" : "#b5ffd8" }}>
                {focusStatus === "distraction_detected" ? "🚨 Distraction détectée" : focusStatus === "focused" ? "🛡️ Focus propre" : "⏸️ Shield en attente"}
              </div>
              {!!detectedApps.length && <div style={{ fontSize: 13, color: "#ffd38a" }}>Apps détectées: {detectedApps.join(", ")}</div>}
              <div style={{ fontSize: 13, color: "#9fc4ff" }}>XP Focus: {focusXp} | Streak: {focusStreak}</div>
              <div style={{ fontSize: 13, color: "#c8d9ff" }}>{focusFunMessage}</div>
            </div>

            {(attackPlan || calendarEvents.length > 0 || reminders.length > 0) && (
              <div style={{ marginTop: 14, border: "1px solid #2d3f66", borderRadius: 12, padding: 10, background: "#111a30", display: "grid", gap: 10 }}>
                {attackPlan && (
                  <div>
                    <div style={{ fontSize: 13, color: "#aac1f4", marginBottom: 4 }}>Plan d&apos;attaque</div>
                    <div style={{ color: "#ffffff", fontWeight: 600, marginBottom: 4 }}>{attackPlan.objective}</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {attackPlan.steps.map((step, idx) => (
                        <div key={`attack-${idx}`} style={{ fontSize: 13, color: "#c8d9ff" }}>
                          {idx + 1}. {step}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {calendarEvents.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, color: "#aac1f4", marginBottom: 4 }}>Calendrier suggéré</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {calendarEvents.map((event, idx) => (
                        <div key={`calendar-${idx}`} style={{ fontSize: 13, color: "#ffe3a8" }}>
                          {event.when} - {event.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {reminders.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, color: "#aac1f4", marginBottom: 4 }}>Rappels</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {reminders.map((item, idx) => (
                        <div key={`reminder-${idx}`} style={{ fontSize: 13, color: "#b5ffd8" }}>
                          {item.when} - {item.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ margin: "12px 0", color: "#9ab3eb" }}>Progression: {progress}%</div>
            <div style={{ display: "grid", gap: 8 }}>
              {tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    ...taskItem,
                    background: done.includes(task.id) ? "#1f6d49" : isTaskBlocked(task) ? "#2c2432" : "#17203a",
                    borderColor: isTaskBlocked(task) ? "#7d5a90" : "#33456f",
                    opacity: isTaskBlocked(task) && !done.includes(task.id) ? 0.75 : 1,
                  }}
                >
                  <button
                    onClick={() => {
                      if (isTaskBlocked(task) && !done.includes(task.id)) return;
                      setDone((d) => (d.includes(task.id) ? d.filter((x) => x !== task.id) : [...d, task.id]));
                    }}
                    style={{ background: "transparent", border: "none", color: "white", width: "100%", textAlign: "left", cursor: "pointer", padding: 0, fontSize: 15, fontWeight: 600 }}
                  >
                    {done.includes(task.id) ? "✅" : "⬜"} {task.title} - {task.duration} min
                  </button>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button
                      onClick={() => toggleTaskSelection(task.id)}
                      style={{
                        background: selectedTaskIds.includes(task.id) ? "#2f4f7f" : "#1d2a47",
                        border: "1px solid #3e568f",
                        color: "#dce7ff",
                        borderRadius: 8,
                        padding: "0.3rem 0.55rem",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {selectedTaskIds.includes(task.id) ? "Sélectionnée" : "Sélectionner pour modification IA"}
                    </button>
                    <button
                      onClick={() => startEditingTask(task)}
                      style={{ background: "#253252", border: "1px solid #3e568f", color: "#dce7ff", borderRadius: 8, padding: "0.3rem 0.55rem", cursor: "pointer", fontSize: 12 }}
                    >
                      Modifier cette tâche
                    </button>
                  </div>
                  {editingTaskId === task.id && (
                    <div style={{ marginTop: 8, display: "grid", gap: 6, border: "1px solid #3a4a73", padding: 8, borderRadius: 10, background: "#101a30" }}>
                      <input value={taskDraft.title} onChange={(e) => setTaskDraft((d) => ({ ...d, title: e.target.value }))} style={inputStyle} placeholder="Titre" />
                      <input type="number" min={5} value={taskDraft.duration} onChange={(e) => setTaskDraft((d) => ({ ...d, duration: Number(e.target.value) }))} style={inputStyle} placeholder="Durée" />
                      <input value={taskDraft.explanation} onChange={(e) => setTaskDraft((d) => ({ ...d, explanation: e.target.value }))} style={inputStyle} placeholder="Explication" />
                      <textarea value={taskDraft.microtasksText} onChange={(e) => setTaskDraft((d) => ({ ...d, microtasksText: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} placeholder="Une micro-étape par ligne" />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveTaskEdit} style={primaryButton}>Enregistrer</button>
                        <button onClick={() => setEditingTaskId(null)} style={{ ...primaryButton, background: "#384665" }}>Annuler</button>
                      </div>
                    </div>
                  )}
                  {isTaskBlocked(task) && !done.includes(task.id) && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#f2b3ff" }}>Bloquée: termine d&apos;abord la dépendance.</div>
                  )}
                  {!isTaskBlocked(task) && !done.includes(task.id) && <div style={{ marginTop: 6, fontSize: 12, color: "#8fd3b6" }}>Prête</div>}
                  {!!task.depends_on?.length && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#ffd38a" }}>
                      Dépend de: {task.depends_on.join(", ")}
                    </div>
                  )}
                  {task.explanation && <p style={{ margin: "8px 0", color: "#b7c8ee", fontSize: 13 }}>{task.explanation}</p>}
                  <div style={{ display: "grid", gap: 6 }}>
                    {(task.microtasks || []).map((micro, idx) => {
                      const key = `${task.id}-${idx}`;
                      const checked = doneMicro.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() =>
                            setDoneMicro((prev) => {
                              if (isTaskBlocked(task) && !done.includes(task.id)) {
                                return prev;
                              }
                              const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
                              const microCount = task.microtasks?.length || 0;
                              const doneCount = Array.from({ length: microCount }).filter((_, i) => next.includes(`${task.id}-${i}`)).length;
                              setDone((prevDone) => {
                                if (doneCount === microCount && microCount > 0) {
                                  return prevDone.includes(task.id) ? prevDone : [...prevDone, task.id];
                                }
                                if (prevDone.includes(task.id)) {
                                  return prevDone.filter((id) => id !== task.id);
                                }
                                return prevDone;
                              });
                              return next;
                            })
                          }
                          style={{ background: "#131c33", border: "1px solid #2d3f66", borderRadius: 8, color: checked ? "#8bbd9c" : "#d6e3ff", textAlign: "left", padding: "0.45rem 0.55rem", cursor: "pointer", textDecoration: checked ? "line-through" : "none" }}
                        >
                          {checked ? "☑" : "☐"} {micro}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={submitScore} style={{ ...primaryButton, marginTop: 12 }}>Calculer le score</button>
          </div>
        )}

        {tab === "analytics" && (
          <div style={panelStyle}>
            <div style={statsGrid}>
              <div style={statCard}><strong>{tasks.length}</strong><span>Tâches générées</span></div>
              <div style={statCard}><strong>{doneMicro.length}</strong><span>Sous-tâches cochées</span></div>
              <div style={statCard}><strong>{progress}%</strong><span>Progression</span></div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const authWrapper: CSSProperties = { minHeight: "100vh", display: "grid", gridTemplateColumns: "1.2fr 1fr", background: "radial-gradient(circle at 15% 20%, #2b1f56 0%, #11172a 45%, #0a0f1f 100%)", color: "#f5f8ff", padding: "2.3rem", gap: "1.5rem" };
const authHero: CSSProperties = { display: "flex", flexDirection: "column", justifyContent: "center", padding: "2rem", borderRadius: 18, background: "linear-gradient(160deg, rgba(87,124,255,0.2), rgba(68,197,255,0.08))", border: "1px solid #324772" };
const authCard: CSSProperties = { alignSelf: "center", padding: "1.2rem", borderRadius: 18, background: "rgba(14, 21, 38, 0.92)", border: "1px solid #2f4169" };
const dashboardWrapper: CSSProperties = { minHeight: "100vh", display: "grid", gridTemplateColumns: "260px 1fr", background: "linear-gradient(160deg,#090f1f,#0f1730)", color: "#ecf3ff" };
const sidebar: CSSProperties = { padding: "1rem", borderRight: "1px solid #2f3c5f", display: "flex", flexDirection: "column", gap: 10, background: "rgba(11,18,34,0.95)" };
const content: CSSProperties = { padding: "1.2rem" };
const topbar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" };
const statusBadge: CSSProperties = { background: "#17203b", border: "1px solid #344569", borderRadius: 999, padding: "0.4rem 0.8rem", color: "#aac2ff", fontSize: 13 };
const panelStyle: CSSProperties = { border: "1px solid #2d3c62", borderRadius: 16, background: "rgba(13,19,37,0.92)", padding: "1rem" };
const inputStyle: CSSProperties = { border: "1px solid #33466f", background: "#131d34", borderRadius: 10, color: "#f5f8ff", padding: "0.67rem 0.75rem", width: "100%" };
const primaryButton: CSSProperties = { border: "none", borderRadius: 10, background: "linear-gradient(90deg,#557cff,#7f58ff)", color: "white", padding: "0.65rem 0.95rem", cursor: "pointer" };
const tabButton: CSSProperties = { flex: 1, borderRadius: 8, border: "1px solid #32456f", background: "#16223f", color: "#dce7ff", padding: "0.55rem" };
const activeTab: CSSProperties = { background: "linear-gradient(90deg,#506ffe,#7652f7)" };
const menuItem: CSSProperties = { borderRadius: 10, border: "1px solid #2f3f64", background: "#121d35", color: "#dbe7ff", textAlign: "left", padding: "0.7rem 0.75rem", cursor: "pointer" };
const activeMenuItem: CSSProperties = { background: "linear-gradient(90deg,#4e6dff,#724ef4)" };
const chatArea: CSSProperties = { height: 420, overflow: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 };
const chatBubble: CSSProperties = { maxWidth: "70%", borderRadius: 12, padding: "0.7rem 0.8rem", border: "1px solid #364a7a" };
const taskItem: CSSProperties = { border: "1px solid #33456f", borderRadius: 10, color: "white", textAlign: "left", padding: "0.7rem", cursor: "pointer" };
const statsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 };
const statCard: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, borderRadius: 12, border: "1px solid #304268", background: "#131d34", padding: "1rem" };
const pillStyle: CSSProperties = { border: "1px solid #3e5380", borderRadius: 999, padding: "0.35rem 0.7rem", color: "#a8bded", fontSize: 13 };