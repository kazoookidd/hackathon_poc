"use client";

import { useState, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Task = {
  id: number;
  title: string;
  duration: number;
  microtasks: string[];
};

type Message = {
  role: "user" | "coach";
  content: string;
};

type Tab = "chat" | "tasks" | "stats";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

function generateMicrotasks(title: string): string[] {
  const lc = title.toLowerCase();
  if (lc.includes("ouvrir") || lc.includes("préparer"))
    return ["Fermer les distractions", "Mettre musique de travail", "Préparer l'espace"];
  if (lc.includes("lire"))
    return ["Première lecture rapide", "Identifier les points clés", "Résumer en 3 mots"];
  if (lc.includes("écrire") || lc.includes("rédiger"))
    return ["Écrire juste 1 paragraphe", "Relire et corriger", "Passer au suivant"];
  return ["Commencer par le plus simple", "Avancer 15 min sans pause", "Vérifier le résultat"];
}

const COACH_SYSTEM = `Tu es FOCA, un coach anti-procrastination bienveillant mais direct. Tu parles en français, de façon courte et motivante.

Tes rôles :
1. Décomposer les objectifs en micro-tâches TRÈS concrètes (3-5 étapes de 5-15 min chacune)
2. Détecter les excuses et reformuler positivement
3. Motiver avec des défis précis (ex: "commence juste 5 min")
4. Proposer des alternatives si l'utilisateur bloque
5. Célébrer les victoires

Style : direct, chaleureux, jamais moralisateur. Pas de listes à puces. Réponses courtes (2-4 phrases max).
Si l'utilisateur partage un objectif, propose toujours de l'ajouter dans l'onglet Tâches à la fin.`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    { role: "coach", content: "Bonjour ! Je suis FOCA, ton coach anti-procrastination. Quel est ton objectif du jour ?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Tasks state
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [doneMicro, setDoneMicro] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState("Tu avais prévu des tâches — on commence par 5 min ?");
  const [notifType, setNotifType] = useState<"warning" | "success">("warning");

  // Stats state
  const [streak] = useState(3);
  const [totalDone, setTotalDone] = useState(0);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Score calculation ──────────────────────────────────────────────────────

  const progress = tasks.length === 0 ? 0 : Math.round((completed.size / tasks.length) * 100);
  const circumference = 175.9;
  const ringOffset = circumference - (circumference * progress) / 100;

  const scoreMessage = () => {
    if (progress === 100) return "Journée accomplie 🏆";
    if (progress >= 75) return "Presque fini !";
    if (progress >= 50) return "Plus de la moitié — wow !";
    if (progress > 0) return "Tu avances, continue !";
    return "Commence ta première tâche !";
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendToCoach = async (userMsg: string) => {
    if (!userMsg.trim()) return;
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: COACH_SYSTEM,
          messages: newMessages.map((m) => ({ role: m.role === "coach" ? "assistant" : "user", content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Je suis là pour t'aider ! Dis-moi ton objectif.";
      setMessages([...newMessages, { role: "coach", content: reply }]);

      // Pre-fill goal if user mentions a task
      const lc = userMsg.toLowerCase();
      if (lc.includes("faire") || lc.includes("terminer") || lc.includes("finir") || lc.includes("travail")) {
        setGoal(userMsg);
      }
    } catch {
      setMessages([...newMessages, { role: "coach", content: "Je suis là ! Dis-moi ton objectif du jour et je te génère un plan." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const quickReplies = (msg: string) => {
    const lc = msg.toLowerCase();
    if (lc.includes("procrastin") || lc.includes("bloque") || lc.includes("flemme"))
      return ["Juste 5 minutes", "Pourquoi je bloque ?", "Donne-moi un défi"];
    if (lc.includes("faire") || lc.includes("terminer") || lc.includes("finir"))
      return ["Générer le plan ⚡", "Découper en micro-tâches", "Comment commencer ?"];
    return ["Je procrastine...", "Nouveau défi", "Mon score"];
  };

  const lastCoachMsg = [...messages].reverse().find((m) => m.role === "coach")?.content || "";

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const generatePlan = async () => {
    if (!goal.trim()) return;
    setIsGenerating(true);
    setCompleted(new Set());

    try {
      const res = await fetch(`${API}/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      const raw: Task[] = data.tasks || [];
      setTasks(raw.map((t, i) => ({ ...t, id: i + 1, microtasks: t.microtasks || generateMicrotasks(t.title) })));
    } catch {
      setTasks([
        { id: 1, title: "Ouvrir les outils nécessaires", duration: 5, microtasks: ["Fermer les onglets inutiles", "Mettre le téléphone en silencieux", "Préparer un verre d'eau"] },
        { id: 2, title: "Lire les consignes et noter 3 points clés", duration: 10, microtasks: ["Lire une première fois", "Surligner les mots-clés", "Écrire l'objectif en une phrase"] },
        { id: 3, title: `Avancer sur : ${goal}`, duration: 20, microtasks: ["Commencer par la partie la plus simple", "Travailler 15 min sans distraction", "Faire un bilan rapide"] },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTask = (id: number) => {
    const next = new Set(completed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      setTotalDone((d) => d + 1);
      const tips = ["Excellent ! Tu es en mouvement 🔥", "Parfait, continue sur ta lancée !", "Tâche terminée — pause de 5 min méritée", "Incroyable ! Plus que quelques tâches 💪"];
      setNotification(tips[Math.min(next.size - 1, tips.length - 1)]);
      setNotifType("success");
    }
    setCompleted(next);
    setExpandedTask(id);
  };

  const toggleMicro = (key: string) => {
    const next = new Set(doneMicro);
    next.has(key) ? next.delete(key) : next.add(key);
    setDoneMicro(next);
  };

  const submitScore = async () => {
    if (!tasks.length) return;
    try {
      const res = await fetch(`${API}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: completed.size, total: tasks.length }),
      });
      const data = await res.json();
      setNotification(`${data.score}% — ${data.message}`);
      setNotifType("success");
    } catch {
      setNotification(`${progress}% ${progress === 100 ? "— Parfait 🔥" : progress >= 70 ? "— Très bon travail 💪" : "— On fait mieux demain 💥"}`);
      setNotifType("success");
    }
  };

  // ── Week dots ──────────────────────────────────────────────────────────────

  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const today = new Date().getDay();
  const weekPattern = [true, true, true, false, false, false, false];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main style={{ fontFamily: "'DM Sans', sans-serif", background: "#0F0E0C", color: "#F5F0E8", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #2E2D2A; border-radius: 2px; }
        textarea { outline: none; }
        .qr-btn:hover { border-color: #FF4D1C !important; color: #FF4D1C !important; }
        .task-card:hover { border-color: rgba(255,77,28,0.3) !important; }
        .send-btn:hover { transform: scale(1.05); }
        .gen-btn:hover:not(:disabled) { background: #ff3800 !important; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", minHeight: "100vh", paddingBottom: tab === "chat" ? 80 : 20 }}>

        {/* HEADER */}
        <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: "#FF4D1C", letterSpacing: "-0.5px" }}>FOCA⚡</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,77,28,0.15)", border: "1px solid rgba(255,77,28,0.3)", borderRadius: 100, padding: "6px 14px", fontSize: 13, fontWeight: 500, color: "#FF4D1C" }}>
            🔥 {streak} jours
          </div>
        </div>

        {/* SCORE CARD */}
        <div style={{ margin: "16px 20px", padding: 20, background: "linear-gradient(135deg, #FF4D1C 0%, #FF7A00 100%)", borderRadius: 20, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -20, top: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1 }}>Score du jour</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 52, fontWeight: 800, lineHeight: 1, margin: "4px 0" }}>{progress}%</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>{scoreMessage()}</div>
          <svg style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)" }} width="70" height="70" viewBox="0 0 70 70">
            <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
            <circle cx="35" cy="35" r="28" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={ringOffset}
              transform="rotate(-90 35 35)" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
          </svg>
        </div>

        {/* NOTIFICATION */}
        <div style={{ margin: "0 20px 12px", padding: "12px 16px", background: notifType === "success" ? "rgba(76,175,125,0.1)" : "rgba(255,179,71,0.1)", border: `1px solid ${notifType === "success" ? "rgba(76,175,125,0.25)" : "rgba(255,179,71,0.25)"}`, borderRadius: 12, fontSize: 13, color: notifType === "success" ? "#4CAF7D" : "#FFB347", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{notifType === "success" ? "🎉" : "💬"}</span>
          <span>{notification}</span>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", margin: "0 20px", gap: 4, background: "#1A1917", borderRadius: 12, padding: 4 }}>
          {(["chat", "tasks", "stats"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 10, border: "none", background: tab === t ? "#242320" : "transparent", color: tab === t ? "#F5F0E8" : "#8A8680", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: "pointer", transition: "all 0.2s" }}>
              {t === "chat" ? "Coach IA" : t === "tasks" ? "Tâches" : "Stats"}
            </button>
          ))}
        </div>

        {/* ── CHAT TAB ── */}
        {tab === "chat" && (
          <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "coach" ? "#2E2D2A" : "#FF4D1C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: m.role === "coach" ? 16 : 14, fontWeight: 700, flexShrink: 0 }}>
                  {m.role === "coach" ? "🤖" : "T"}
                </div>
                <div style={{ maxWidth: "80%", padding: "12px 16px", borderRadius: 18, borderBottomLeftRadius: m.role === "coach" ? 4 : 18, borderBottomRightRadius: m.role === "user" ? 4 : 18, fontSize: 14, lineHeight: 1.5, background: m.role === "coach" ? "#1A1917" : "#FF4D1C", color: "#F5F0E8", textAlign: m.role === "user" ? "right" : "left" }}>
                  {m.content}
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2E2D2A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
                <div style={{ padding: "14px 18px", borderRadius: 18, borderBottomLeftRadius: 4, background: "#1A1917", display: "flex", gap: 4 }}>
                  {[0, 200, 400].map((delay) => (
                    <div key={delay} style={{ width: 7, height: 7, borderRadius: "50%", background: "#8A8680", animation: "blink 1.2s infinite", animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Quick replies */}
            {!isTyping && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 42 }}>
                {quickReplies(lastCoachMsg).map((r) => (
                  <button key={r} className="qr-btn" onClick={() => sendToCoach(r)} style={{ padding: "8px 14px", borderRadius: 100, border: "1px solid rgba(245,240,232,0.08)", background: "#1A1917", color: "#F5F0E8", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
                    {r}
                  </button>
                ))}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}

        {/* ── TASKS TAB ── */}
        {tab === "tasks" && (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ background: "#1A1917", borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#8A8680", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Objectif du jour</div>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ex: Terminer le rapport de projet, Réviser les maths..."
                style={{ width: "100%", background: "#2E2D2A", border: "1px solid rgba(245,240,232,0.08)", borderRadius: 10, padding: 12, color: "#F5F0E8", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", minHeight: 70 }}
              />
              <button
                className="gen-btn"
                onClick={generatePlan}
                disabled={isGenerating || !goal.trim()}
                style={{ width: "100%", marginTop: 10, padding: 13, border: "none", background: "#FF4D1C", color: "white", borderRadius: 10, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: isGenerating ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: isGenerating || !goal.trim() ? 0.5 : 1 }}
              >
                {isGenerating ? "Génération en cours..." : "⚡ Générer mon plan d'action"}
              </button>
            </div>

            {tasks.length > 0 && (
              <>
                <div style={{ background: "#1A1917", borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Progression</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: "#FF4D1C" }}>{progress}%</div>
                  </div>
                  <div style={{ height: 8, background: "#2E2D2A", borderRadius: 100, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "linear-gradient(90deg, #FF4D1C, #FFB347)", borderRadius: 100, width: `${progress}%`, transition: "width 0.4s ease" }} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {tasks.map((task) => {
                    const done = completed.has(task.id);
                    const expanded = expandedTask === task.id;
                    return (
                      <div
                        key={task.id}
                        className="task-card"
                        onClick={() => toggleTask(task.id)}
                        style={{ background: done ? "rgba(76,175,125,0.05)" : "#1A1917", borderRadius: 14, padding: 16, border: `1px solid ${done ? "rgba(76,175,125,0.3)" : "rgba(245,240,232,0.08)"}`, display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden" }}
                      >
                        {done && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#4CAF7D" }} />}
                        <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${done ? "#4CAF7D" : "rgba(245,240,232,0.08)"}`, background: done ? "#4CAF7D" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, transition: "all 0.2s" }}>
                          {done && <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 6, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{task.title}</div>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#FF4D1C", background: "rgba(255,77,28,0.12)", padding: "2px 8px", borderRadius: 100, fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>Tâche {task.id}</span>
                            <span style={{ fontSize: 11, color: "#8A8680" }}>⏱ {task.duration} min</span>
                          </div>
                          {(done || expanded) && (
                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                              {task.microtasks.map((m, idx) => {
                                const key = `${task.id}-${idx}`;
                                const mdone = doneMicro.has(key);
                                return (
                                  <div key={key} onClick={() => toggleMicro(key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#2E2D2A", borderRadius: 8, fontSize: 12, color: mdone ? "#8A8680" : "#8A8680", cursor: "pointer", textDecoration: mdone ? "line-through" : "none" }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: mdone ? "#4CAF7D" : "rgba(245,240,232,0.15)", flexShrink: 0 }} />
                                    <span>{m}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={submitScore}
                  style={{ width: "100%", padding: 14, border: "none", borderRadius: 12, marginTop: 16, background: completed.size > 0 ? "#4CAF7D" : "#2E2D2A", color: completed.size > 0 ? "white" : "#8A8680", fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s" }}
                >
                  Voir mon score final 🏆
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STATS TAB ── */}
        {tab === "stats" && (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { icon: "🔥", val: streak, label: "Streak actuel", color: "#FF4D1C" },
                { icon: "⚡", val: `${progress}%`, label: "Score du jour", color: "#FF4D1C" },
                { icon: "✅", val: totalDone, label: "Tâches faites", color: "#F5F0E8" },
                { icon: "⏱", val: `${tasks.reduce((s, t) => s + t.duration, 0)}m`, label: "Temps prévu", color: "#F5F0E8" },
              ].map(({ icon, val, label, color }) => (
                <div key={label} style={{ background: "#1A1917", borderRadius: 14, padding: 16, border: "1px solid rgba(245,240,232,0.08)" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, color }}>{val}</div>
                  <div style={{ fontSize: 11, color: "#8A8680", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, background: "#1A1917", borderRadius: 14, padding: 16, border: "1px solid rgba(245,240,232,0.08)" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Semaine en cours</div>
              <div style={{ display: "flex", gap: 8 }}>
                {dayNames.map((day, i) => {
                  const isToday = i === today;
                  const isDone = weekPattern[i] && i < today;
                  return (
                    <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: isDone ? "#FF4D1C" : "#2E2D2A", border: isToday ? "2px solid #FF4D1C" : "1px solid rgba(245,240,232,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                        {isDone ? "✓" : ""}
                      </div>
                      <div style={{ fontSize: 10, color: "#8A8680" }}>{day}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 12, background: "rgba(255,77,28,0.1)", border: "1px solid rgba(255,77,28,0.25)", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 28 }}>🏆</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Défi du jour</div>
                <div style={{ fontSize: 12, color: "#8A8680" }}>Complète 3 tâches sans pause &gt; 5 min</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CHAT INPUT (fixed bottom) */}
      {tab === "chat" && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, padding: "12px 20px 20px", background: "#0F0E0C", borderTop: "1px solid rgba(245,240,232,0.08)", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToCoach(chatInput); } }}
            placeholder="Dis-moi ce que tu veux faire..."
            rows={1}
            style={{ flex: 1, background: "#1A1917", border: "1px solid rgba(245,240,232,0.08)", borderRadius: 20, padding: "12px 16px", color: "#F5F0E8", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", minHeight: 44, maxHeight: 120 }}
          />
          <button
            className="send-btn"
            onClick={() => sendToCoach(chatInput)}
            style={{ width: 44, height: 44, borderRadius: "50%", background: "#FF4D1C", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.15s" }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
          </button>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }
      `}</style>
    </main>
  );
}