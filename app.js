const { useState, useEffect, useCallback, useMemo } = React;
const { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } = Recharts;
const { Flame, Plus, Check, X, Wallet, Target, TrendingDown, TrendingUp, Trash2, ChevronLeft, ChevronRight, ListChecks, Sunrise, CalendarRange, CalendarDays, Sun, Compass, Star, Sparkles } = LucideReact;


const HABITS_KEY = "daily-habits-v1";
const SPEND_KEY = "daily-spending-v1";
const PLAN_KEY = "daily-plans-v1";
const GOALS_KEY = "daily-goals-v1";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtNaira = (n) => "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(n);
const dayShort = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
const isToday = (iso) => iso === todayISO();

const CATEGORY_COLORS = {
  Food: "#E8A33D",
  Transport: "#6B9080",
  Family: "#8E7CC3",
  Business: "#4A7C8C",
  Airtime: "#D65F5F",
  Other: "#9B9280",
};
const CATEGORIES = Object.keys(CATEGORY_COLORS);

function last7Days() {
  const arr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function tomorrowLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function weekRangeLabel() {
  const now = new Date();
  const start = new Date(now);
  const dow = start.getDay(); // 0 = Sunday
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function monthLabelNow() {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function DailyTracker() {
  const [tab, setTab] = useState("habits");
  const [loading, setLoading] = useState(true);

  const [habits, setHabits] = useState([]); // [{id, name, log: {isoDate: true}}]
  const [newHabit, setNewHabit] = useState("");

  const [expenses, setExpenses] = useState([]); // [{id, amount, category, date, note}]
  const [budget, setBudget] = useState(5000); // daily naira budget
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");

  const [dayOffset, setDayOffset] = useState(0); // for spending day nav
  const viewDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  }, [dayOffset]);

  const [plans, setPlans] = useState({ today: [], tomorrow: [], week: [], month: [] });
  const [newToday, setNewToday] = useState("");
  const [newTomorrow, setNewTomorrow] = useState("");
  const [newWeek, setNewWeek] = useState("");
  const [newMonth, setNewMonth] = useState("");
  const [planView, setPlanView] = useState("today"); // sub-tab within Plan
  const [lastSeenDate, setLastSeenDate] = useState(null);
  const [rolloverPending, setRolloverPending] = useState(false);

  const [goals, setGoals] = useState([]); // [{id, text, month, done, createdAt}]
  const [newGoal, setNewGoal] = useState("");
  const [goalUseDate, setGoalUseDate] = useState(false);
  const [goalDate, setGoalDate] = useState(() => todayISO()); // YYYY-MM-DD
  const [goalUseMonthYear, setGoalUseMonthYear] = useState(true);
  const [goalMonthYear, setGoalMonthYear] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [goalUseTime, setGoalUseTime] = useState(false);
  const [goalTime, setGoalTime] = useState("12:00");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await window.storage.get(HABITS_KEY, false);
      if (h && h.value) setHabits(JSON.parse(h.value));
    } catch (e) {}
    try {
      const s = await window.storage.get(SPEND_KEY, false);
      if (s && s.value) {
        const parsed = JSON.parse(s.value);
        setExpenses(parsed.expenses || []);
        setBudget(parsed.budget || 5000);
      }
    } catch (e) {}
    try {
      const p = await window.storage.get(PLAN_KEY, false);
      if (p && p.value) {
        const parsed = JSON.parse(p.value);
        const loadedPlans = { today: parsed.today || [], tomorrow: parsed.tomorrow || [], week: parsed.week || [], month: parsed.month || [] };
        setPlans(loadedPlans);
        const today = todayISO();
        const storedLastSeen = parsed.lastSeenDate || null;
        if (storedLastSeen && storedLastSeen !== today && loadedPlans.tomorrow.length > 0) {
          // A new day has started and there are unmoved plans — ask before touching anything
          setLastSeenDate(storedLastSeen);
          setRolloverPending(true);
        } else if (storedLastSeen !== today) {
          // New day but nothing to move — just sync the marker quietly
          setLastSeenDate(today);
          persistPlansRaw(loadedPlans, today);
        } else {
          setLastSeenDate(today);
        }
      } else {
        setLastSeenDate(todayISO());
      }
    } catch (e) {
      setLastSeenDate(todayISO());
    }
    try {
      const g = await window.storage.get(GOALS_KEY, false);
      if (g && g.value) setGoals(JSON.parse(g.value));
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const persistHabits = async (next) => {
    try { await window.storage.set(HABITS_KEY, JSON.stringify(next), false); } catch (e) {}
  };
  const persistSpend = async (nextExpenses, nextBudget) => {
    try { await window.storage.set(SPEND_KEY, JSON.stringify({ expenses: nextExpenses, budget: nextBudget }), false); } catch (e) {}
  };
  const persistPlansRaw = async (nextPlans, nextLastSeen) => {
    try { await window.storage.set(PLAN_KEY, JSON.stringify({ ...nextPlans, lastSeenDate: nextLastSeen }), false); } catch (e) {}
  };
  const persistPlans = async (next) => {
    persistPlansRaw(next, lastSeenDate || todayISO());
  };
  const persistGoals = async (next) => {
    try { await window.storage.set(GOALS_KEY, JSON.stringify(next), false); } catch (e) {}
  };

  const moveTomorrowToToday = () => {
    const merged = {
      ...plans,
      today: [...plans.today, ...plans.tomorrow.map((t) => ({ ...t, id: t.id + "-m" }))],
      tomorrow: [],
    };
    const today = todayISO();
    setPlans(merged);
    setLastSeenDate(today);
    persistPlansRaw(merged, today);
    setRolloverPending(false);
  };
  const dismissRollover = () => {
    const today = todayISO();
    setLastSeenDate(today);
    persistPlansRaw(plans, today);
    setRolloverPending(false);
  };

  const addPlanItem = (listKey, text, setInput) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = { ...plans, [listKey]: [...plans[listKey], { id: Date.now().toString(), text: trimmed, done: false }] };
    setPlans(next);
    persistPlans(next);
    setInput("");
  };
  const togglePlanItem = (listKey, id) => {
    const next = { ...plans, [listKey]: plans[listKey].map((t) => (t.id === id ? { ...t, done: !t.done } : t)) };
    setPlans(next);
    persistPlans(next);
  };
  const removePlanItem = (listKey, id) => {
    const next = { ...plans, [listKey]: plans[listKey].filter((t) => t.id !== id) };
    setPlans(next);
    persistPlans(next);
  };
  const clearDonePlanItems = (listKey) => {
    const next = { ...plans, [listKey]: plans[listKey].filter((t) => !t.done) };
    setPlans(next);
    persistPlans(next);
  };

  // Goals logic
  const addGoal = () => {
    const text = newGoal.trim();
    if (!text) return;
    const next = [...goals, {
      id: Date.now().toString(),
      text,
      date: goalUseDate ? goalDate : null,
      monthYear: goalUseMonthYear ? goalMonthYear : null,
      time: goalUseTime ? goalTime : null,
      done: false,
      createdAt: todayISO(),
    }];
    setGoals(next);
    persistGoals(next);
    setNewGoal("");
  };
  const toggleGoal = (id) => {
    const next = goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g));
    setGoals(next);
    persistGoals(next);
  };
  const removeGoal = (id) => {
    const next = goals.filter((g) => g.id !== id);
    setGoals(next);
    persistGoals(next);
  };
  const monthLabelFor = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };
  const dateLabelFor = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  const timeLabelFor = (t) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };
  // Group goals by monthYear when set, otherwise bucket under "No month set"
  const goalsByMonth = useMemo(() => {
    const map = {};
    goals.forEach((g) => {
      const key = g.monthYear || "**none**";
      if (!map[key]) map[key] = [];
      map[key].push(g);
    });
    const keys = Object.keys(map).sort((a, b) => {
      if (a === "**none**") return 1;
      if (b === "**none**") return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({
      month: key,
      label: key === "**none**" ? "No month set" : monthLabelFor(key),
      items: map[key],
    }));
  }, [goals]);
  const goalsDoneCount = goals.filter((g) => g.done).length;

  // Habits logic
  const addHabit = () => {
    const name = newHabit.trim();
    if (!name) return;
    const next = [...habits, { id: Date.now().toString(), name, log: {} }];
    setHabits(next);
    persistHabits(next);
    setNewHabit("");
  };
  const toggleHabit = (id, iso) => {
    const next = habits.map((h) => {
      if (h.id !== id) return h;
      const log = { ...h.log };
      if (log[iso]) delete log[iso]; else log[iso] = true;
      return { ...h, log };
    });
    setHabits(next);
    persistHabits(next);
  };
  const removeHabit = (id) => {
    const next = habits.filter((h) => h.id !== id);
    setHabits(next);
    persistHabits(next);
  };
  const habitStreak = (h) => {
    let count = 0;
    const d = new Date();
    for (;;) {
      const iso = d.toISOString().slice(0, 10);
      if (h.log[iso]) { count++; d.setDate(d.getDate() - 1); } else break;
    }
    return count;
  };

  const week = last7Days();
  const totalTicksToday = habits.filter((h) => h.log[todayISO()]).length;

  // Weekly combined chart data — total habit ticks per day across ALL habits
  const weeklyHabitData = week.map((iso) => ({
    day: dayShort(iso),
    count: habits.filter((h) => h.log[iso]).length,
    isToday: isToday(iso),
  }));
  const maxPossiblePerDay = habits.length || 1;

  // Per-habit consistency this week, used to generate a focus insight
  const habitConsistency = habits.map((h) => {
    const doneCount = week.filter((iso) => h.log[iso]).length;
    return { name: h.name, doneCount, rate: doneCount / 7, streak: habitStreak(h) };
  });
  const strongest = habitConsistency.length
    ? [...habitConsistency].sort((a, b) => b.rate - a.rate || b.streak - a.streak)[0]
    : null;
  const weakest = habitConsistency.length
    ? [...habitConsistency].sort((a, b) => a.rate - b.rate || a.streak - b.streak)[0]
    : null;
  const overallRate = habits.length
    ? weeklyHabitData.reduce((s, d) => s + d.count, 0) / (habits.length * 7)
    : 0;

  let insightText = "";
  if (habits.length === 0) {
    insightText = "Add a habit above and check back after a few days — patterns show up once there's data to read.";
  } else if (habits.length === 1) {
    insightText = strongest.rate >= 0.7
      ? `You're doing well with "${strongest.name}" — ${strongest.doneCount}/7 days this week. Add one more habit once this feels automatic.`
      : `"${strongest.name}" is at ${strongest.doneCount}/7 days this week. Try anchoring it to something you already do daily, like checking your phone in the morning.`;
  } else if (strongest.name === weakest.name || strongest.rate === weakest.rate) {
    insightText = overallRate >= 0.7
      ? "Strong week across the board — every habit is holding steady. This is exactly the consistency that compounds."
      : "Your habits are fairly even this week — none standing out yet. Pick one to focus on hard for the next 7 days.";
  } else {
    insightText = `You're most consistent with "${strongest.name}" (${strongest.doneCount}/7 days, ${strongest.streak}-day streak) — keep that going. "${weakest.name}" is slipping at ${weakest.doneCount}/7 days — that's the one to protect this week. Stack it right after "${strongest.name}" to borrow its momentum.`;
  }
  // Spending logic
  const addExpense = () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    const next = [...expenses, { id: Date.now().toString(), amount: num, category, date: viewDate, note: note.trim() }];
    setExpenses(next);
    persistSpend(next, budget);
    setAmount("");
    setNote("");
  };
  const removeExpense = (id) => {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    persistSpend(next, budget);
  };
  const dayExpenses = expenses.filter((e) => e.date === viewDate);
  const daySpent = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const dayRemaining = budget - daySpent;
  const pieData = CATEGORIES.map((c) => ({
    name: c,
    value: dayExpenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
  })).filter((d) => d.value > 0);

  const weekSpent = week.reduce((sum, iso) => sum + expenses.filter((e) => e.date === iso).reduce((s, e) => s + e.amount, 0), 0);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1E2A3A" }}>
        <p style={{ color: "#F6F2E9", fontFamily: "system-ui" }}>Loading your day…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1E2A3A", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", paddingBottom: 30 }}>
      <style>{`* { box-sizing: border-box; } .serif { font-family: Georgia, 'Times New Roman', serif; } button, input, select { font-family: inherit; } input:focus, button:focus, select:focus { outline: 2px solid #E8A33D; outline-offset: 2px; } .tabbtn { transition: color 0.2s, border-color 0.2s; } .ring { transition: stroke-dashoffset 0.4s ease; } @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }`}</style>

      {/* Header */}
      <header style={{ padding: "28px 20px 16px" }}>
        <h1 className="serif" style={{ color: "#F6F2E9", fontSize: 22, margin: 0, fontWeight: 400 }}>
          Today's Ledger
        </h1>
        <p style={{ color: "#8B93A3", fontSize: 12.5, margin: "4px 0 0" }}>
          Build the habit. Watch the wallet.
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 20, background: "#263547", borderRadius: 10, padding: 4 }}>
          <button
            className="tabbtn"
            onClick={() => setTab("habits")}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 7, border: "none", cursor: "pointer",
              background: tab === "habits" ? "#E8A33D" : "transparent",
              color: tab === "habits" ? "#1E2A3A" : "#8B93A3",
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Flame size={14} /> Habits
          </button>
          <button
            className="tabbtn"
            onClick={() => setTab("spending")}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 7, border: "none", cursor: "pointer",
              background: tab === "spending" ? "#E8A33D" : "transparent",
              color: tab === "spending" ? "#1E2A3A" : "#8B93A3",
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Wallet size={14} /> Spending
          </button>
          <button
            className="tabbtn"
            onClick={() => setTab("plan")}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 7, border: "none", cursor: "pointer",
              background: tab === "plan" ? "#E8A33D" : "transparent",
              color: tab === "plan" ? "#1E2A3A" : "#8B93A3",
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <ListChecks size={14} /> To-Do
          </button>
          <button
            className="tabbtn"
            onClick={() => setTab("goals")}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 7, border: "none", cursor: "pointer",
              background: tab === "goals" ? "#E8A33D" : "transparent",
              color: tab === "goals" ? "#1E2A3A" : "#8B93A3",
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Star size={14} /> Goals
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
        {tab === "habits" ? (
          <>
            {/* Today summary ring */}
            <section style={{ background: "#263547", borderRadius: 14, padding: 20, marginBottom: 18, display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="#1E2A3A" strokeWidth="8" />
                  <circle
                    className="ring"
                    cx="36" cy="36" r="30" fill="none" stroke="#E8A33D" strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 30}
                    strokeDashoffset={habits.length === 0 ? 2 * Math.PI * 30 : 2 * Math.PI * 30 * (1 - totalTicksToday / habits.length)}
                    strokeLinecap="round"
                    transform="rotate(-90 36 36)"
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#F6F2E9", fontSize: 14, fontWeight: 700 }}>
                  {totalTicksToday}/{habits.length || 0}
                </div>
              </div>
              <div>
                <div className="serif" style={{ color: "#F6F2E9", fontSize: 16 }}>Today's progress</div>
                <div style={{ color: "#8B93A3", fontSize: 12.5, marginTop: 3 }}>
                  {habits.length === 0 ? "Add your first habit below" : totalTicksToday === habits.length ? "All done — well played 🔥" : `${habits.length - totalTicksToday} left for today`}
                </div>
              </div>
            </section>

            {/* Weekly combined chart */}
            <section style={{ background: "#263547", borderRadius: 14, padding: "18px 14px 10px", marginBottom: 14 }}>
              <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#8B93A3", margin: "0 0 8px 4px", fontWeight: 600 }}>
                This week, combined
              </h2>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={weeklyHabitData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8B93A3" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} domain={[0, Math.max(maxPossiblePerDay, 1)]} tick={{ fontSize: 10, fill: "#8B93A3" }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip formatter={(v) => [`${v}/${maxPossiblePerDay} habits`, "Completed"]} contentStyle={{ fontSize: 12, borderRadius: 8, background: "#1E2A3A", border: "1px solid #354357" }} labelStyle={{ color: "#F6F2E9" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {weeklyHabitData.map((d, i) => (
                      <Cell key={i} fill={d.isToday ? "#E8A33D" : "#4A7C8C"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Focus insight */}
            <section style={{
              background: "#3A2E1E", border: "1px solid #5A4526", borderRadius: 14, padding: 16, marginBottom: 20,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Compass size={17} color="#E8A33D" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11.5, color: "#E8A33D", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>
                  What to focus on
                </div>
                <p style={{ fontSize: 13, color: "#E5DCC8", margin: 0, lineHeight: 1.5 }}>
                  {insightText}
                </p>
              </div>
            </section>

            {/* Add habit */}
            <section style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input
                type="text"
                placeholder="e.g. Post on TikTok"
                value={newHabit}
                onChange={(e) => setNewHabit(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #354357", background: "#263547", color: "#F6F2E9", fontSize: 14.5 }}
              />
              <button
                onClick={addHabit}
                style={{ padding: "0 16px", borderRadius: 10, border: "none", background: "#E8A33D", color: "#1E2A3A", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <Plus size={18} />
              </button>
            </section>

            {/* Habit list with week grid */}
            {habits.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 20px", color: "#5A6478", fontSize: 13.5 }}>
                <Target size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p>No habits yet. Try "Save daily" or "Post content" — small, repeatable actions work best.</p>
              </div>
            ) : (
              habits.map((h) => {
                const streak = habitStreak(h);
                return (
                  <div key={h.id} style={{ background: "#263547", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#F6F2E9", fontSize: 14.5, fontWeight: 600 }}>{h.name}</span>
                        {streak > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3, background: "#3A2E1E", color: "#E8A33D", fontSize: 11, padding: "2px 7px", borderRadius: 20 }}>
                            <Flame size={11} /> {streak}
                          </span>
                        )}
                      </div>
                      <button onClick={() => removeHabit(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5A6478" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {week.map((iso) => {
                        const done = !!h.log[iso];
                        const today = isToday(iso);
                        return (
                          <button
                            key={iso}
                            onClick={() => toggleHabit(h.id, iso)}
                            style={{
                              flex: 1, aspectRatio: "1", borderRadius: 8, cursor: "pointer",
                              border: today ? "1.5px solid #E8A33D" : "1px solid #354357",
                              background: done ? "#E8A33D" : "transparent",
                              color: done ? "#1E2A3A" : "#5A6478",
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                              fontSize: 9.5, gap: 2, padding: 4,
                            }}
                          >
                            <span>{dayShort(iso)}</span>
                            {done ? <Check size={11} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </>
        ) : tab === "goals" ? (
          <>
            {/* Intro */}
            <section style={{
              background: "#3A2E1E", border: "1px solid #5A4526", borderRadius: 14, padding: 16, marginBottom: 18,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Sparkles size={17} color="#E8A33D" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11.5, color: "#E8A33D", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>
                  Plans to achieve
                </div>
                <p style={{ fontSize: 13, color: "#E5DCC8", margin: 0, lineHeight: 1.5 }}>
                  Write down what you're working toward this month and beyond. Keep it here so it stays in view — a reminder of why you're showing up every day.
                </p>
              </div>
            </section>

            {/* Add goal */}
            <section style={{ background: "#263547", borderRadius: 14, padding: 18, marginBottom: 18 }}>
              <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#8B93A3", margin: "0 0 12px", fontWeight: 600 }}>
                Add a goal
              </h2>
              <input
                type="text"
                placeholder="e.g. Hit 1,000 subscribers on The Edge of Becoming"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGoal()}
                style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #354357", background: "#1E2A3A", color: "#F6F2E9", fontSize: 14, marginBottom: 12 }}
              />

              {/* Month & Year toggle row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setGoalUseMonthYear((v) => !v)}
                  style={{
                    width: 40, height: 22, borderRadius: 20, flexShrink: 0, cursor: "pointer", border: "none", position: "relative",
                    background: goalUseMonthYear ? "#E8A33D" : "#1E2A3A",
                  }}
                  aria-label={goalUseMonthYear ? "Turn off month & year" : "Turn on month & year"}
                >
                  <span style={{
                    position: "absolute", top: 2, left: goalUseMonthYear ? 20 : 2, width: 18, height: 18, borderRadius: 20,
                    background: goalUseMonthYear ? "#1E2A3A" : "#5A6478", transition: "left 0.15s ease",
                  }} />
                </button>
                <span style={{ fontSize: 12.5, color: goalUseMonthYear ? "#F6F2E9" : "#5A6478", width: 78, flexShrink: 0 }}>Month & year</span>
                <input
                  type="month"
                  value={goalMonthYear}
                  onChange={(e) => setGoalMonthYear(e.target.value)}
                  disabled={!goalUseMonthYear}
                  style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #354357", background: goalUseMonthYear ? "#1E2A3A" : "#20293700", color: goalUseMonthYear ? "#F6F2E9" : "#4A5568", fontSize: 13, opacity: goalUseMonthYear ? 1 : 0.5 }}
                />
              </div>

              {/* Date toggle row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setGoalUseDate((v) => !v)}
                  style={{
                    width: 40, height: 22, borderRadius: 20, flexShrink: 0, cursor: "pointer", border: "none", position: "relative",
                    background: goalUseDate ? "#E8A33D" : "#1E2A3A",
                  }}
                  aria-label={goalUseDate ? "Turn off date" : "Turn on date"}
                >
                  <span style={{
                    position: "absolute", top: 2, left: goalUseDate ? 20 : 2, width: 18, height: 18, borderRadius: 20,
                    background: goalUseDate ? "#1E2A3A" : "#5A6478", transition: "left 0.15s ease",
                  }} />
                </button>
                <span style={{ fontSize: 12.5, color: goalUseDate ? "#F6F2E9" : "#5A6478", width: 78, flexShrink: 0 }}>Exact date</span>
                <input
                  type="date"
                  value={goalDate}
                  onChange={(e) => setGoalDate(e.target.value)}
                  disabled={!goalUseDate}
                  style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #354357", background: goalUseDate ? "#1E2A3A" : "#20293700", color: goalUseDate ? "#F6F2E9" : "#4A5568", fontSize: 13, opacity: goalUseDate ? 1 : 0.5 }}
                />
              </div>

              {/* Time toggle row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <button
                  onClick={() => setGoalUseTime((v) => !v)}
                  style={{
                    width: 40, height: 22, borderRadius: 20, flexShrink: 0, cursor: "pointer", border: "none", position: "relative",
                    background: goalUseTime ? "#E8A33D" : "#1E2A3A",
                  }}
                  aria-label={goalUseTime ? "Turn off time" : "Turn on time"}
                >
                  <span style={{
                    position: "absolute", top: 2, left: goalUseTime ? 20 : 2, width: 18, height: 18, borderRadius: 20,
                    background: goalUseTime ? "#1E2A3A" : "#5A6478", transition: "left 0.15s ease",
                  }} />
                </button>
                <span style={{ fontSize: 12.5, color: goalUseTime ? "#F6F2E9" : "#5A6478", width: 78, flexShrink: 0 }}>Time</span>
                <input
                  type="time"
                  value={goalTime}
                  onChange={(e) => setGoalTime(e.target.value)}
                  disabled={!goalUseTime}
                  style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #354357", background: goalUseTime ? "#1E2A3A" : "#20293700", color: goalUseTime ? "#F6F2E9" : "#4A5568", fontSize: 13, opacity: goalUseTime ? 1 : 0.5 }}
                />
              </div>

              <button
                onClick={addGoal}
                style={{ width: "100%", padding: 12, borderRadius: 9, border: "none", background: "#E8A33D", color: "#1E2A3A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 700, fontSize: 14 }}
              >
                <Plus size={16} /> Add goal
              </button>
            </section>

            {/* Summary */}
            {goals.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "0 4px" }}>
                <span style={{ fontSize: 12, color: "#8B93A3" }}>{goals.length} goal{goals.length > 1 ? "s" : ""} total</span>
                <span style={{ fontSize: 12, color: "#E8A33D", fontWeight: 700 }}>{goalsDoneCount} achieved</span>
              </div>
            )}
            {/* Goals grouped by month */}
            {goals.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 20px", color: "#5A6478", fontSize: 13.5 }}>
                <Star size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p>No goals yet. Write down something you want to achieve — big or small.</p>
              </div>
            ) : (
              goalsByMonth.map(({ month, label, items }) => (
                <div key={month} style={{ marginBottom: 20 }}>
                  <div className="serif" style={{ color: "#F6F2E9", fontSize: 14.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
                    <CalendarRange size={14} color="#E8A33D" /> {label}
                  </div>
                  {items.map((g) => {
                    const hasMeta = g.date || g.time;
                    return (
                    <div
                      key={g.id}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#263547", borderRadius: 10, padding: "13px 14px", marginBottom: 8, opacity: g.done ? 0.55 : 1 }}
                    >
                      <button
                        onClick={() => toggleGoal(g.id)}
                        aria-label={g.done ? "Mark not achieved" : "Mark achieved"}
                        style={{
                          width: 22, height: 22, borderRadius: 20, flexShrink: 0, cursor: "pointer", marginTop: 1,
                          border: g.done ? "none" : "1.5px solid #5A6478",
                          background: g.done ? "#E8A33D" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {g.done ? <Check size={13} color="#1E2A3A" /> : <Star size={11} color="#5A6478" />}
                      </button>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, color: "#F6F2E9", textDecoration: g.done ? "line-through" : "none" }}>
                          {g.text}
                        </span>
                        {hasMeta && (
                          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                            {g.date && (
                              <span style={{ fontSize: 11, color: "#8B93A3", display: "flex", alignItems: "center", gap: 4 }}>
                                <CalendarDays size={11} /> {dateLabelFor(g.date)}
                              </span>
                            )}
                            {g.time && (
                              <span style={{ fontSize: 11, color: "#8B93A3", display: "flex", alignItems: "center", gap: 4 }}>
                                <Sun size={11} /> {timeLabelFor(g.time)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeGoal(g.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5A6478", flexShrink: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );})}
                </div>
              ))
            )}
          </>
        ) : tab === "spending" ? (
          <>
            {/* Day nav */}
            <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button onClick={() => setDayOffset((d) => d - 1)} style={{ background: "#263547", border: "none", borderRadius: 8, padding: 8, color: "#F6F2E9", cursor: "pointer" }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ color: "#F6F2E9", fontSize: 13.5, fontWeight: 600 }}>
                {isToday(viewDate) ? "Today" : new Date(viewDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <button
                onClick={() => setDayOffset((d) => Math.min(0, d + 1))}
                disabled={dayOffset === 0}
                style={{ background: "#263547", border: "none", borderRadius: 8, padding: 8, color: dayOffset === 0 ? "#3A4658" : "#F6F2E9", cursor: dayOffset === 0 ? "default" : "pointer" }}
              >
                <ChevronRight size={16} />
              </button>
            </section>

            {/* Budget summary */}
            <section style={{ background: "#263547", borderRadius: 14, padding: 20, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: "#8B93A3", textTransform: "uppercase", letterSpacing: 0.5 }}>Spent today</span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const val = parseFloat(e.target.textContent.replace(/[^0-9.]/g, "")) || budget;
                    setBudget(val);
                    persistSpend(expenses, val);
                  }}
                  style={{ fontSize: 11.5, color: "#8B93A3", borderBottom: "1px dotted #5A6478", cursor: "text" }}
                  title="Tap to edit daily budget"
                >
                  Budget {fmtNaira(budget)}
                </span>
              </div>
              <div className="serif" style={{ fontSize: 28, color: "#F6F2E9", fontWeight: 700, marginBottom: 10 }}>
                {fmtNaira(daySpent)}
              </div>
              <div style={{ height: 9, background: "#1E2A3A", borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(100, (daySpent / (budget || 1)) * 100)}%`,
                  height: "100%",
                  background: daySpent > budget ? "#D65F5F" : "#6B9080",
                  borderRadius: 6, transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, color: dayRemaining >= 0 ? "#6B9080" : "#D65F5F" }}>
                {dayRemaining >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {dayRemaining >= 0 ? `${fmtNaira(dayRemaining)} left today` : `${fmtNaira(Math.abs(dayRemaining))} over budget`}
              </div>
            </section>

            {/* Add expense */}
            <section style={{ background: "#263547", borderRadius: 14, padding: 20, marginBottom: 18 }}>
              <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#8B93A3", margin: "0 0 12px", fontWeight: 600 }}>
                Log an expense
              </h2>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ flex: 1, padding: "11px 12px", borderRadius: 8, border: "1px solid #354357", background: "#1E2A3A", color: "#F6F2E9", fontSize: 14.5 }}
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ padding: "11px 8px", borderRadius: 8, border: "1px solid #354357", background: "#1E2A3A", color: "#F6F2E9", fontSize: 13 }}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input
                type="text"
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: "100%", padding: "11px 12px", borderRadius: 8, border: "1px solid #354357", background: "#1E2A3A", color: "#F6F2E9", fontSize: 13.5, marginBottom: 10 }}
              />
              <button
                onClick={addExpense}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#E8A33D", color: "#1E2A3A", fontSize: 14.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <Plus size={16} /> Add expense
              </button>
            </section>

            {/* Pie breakdown */}
            {pieData.length > 0 && (
              <section style={{ background: "#263547", borderRadius: 14, padding: "18px 12px", marginBottom: 18 }}>
                <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#8B93A3", margin: "0 0 8px 10px", fontWeight: 600 }}>
                  Where it went
                </h2>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <ResponsiveContainer width="55%" height={140}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={3}>
                        {pieData.map((d) => <Cell key={d.name} fill={CATEGORY_COLORS[d.name]} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtNaira(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    {pieData.map((d) => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[d.name] }} />
                        <span style={{ color: "#F6F2E9", flex: 1 }}>{d.name}</span>
                        <span style={{ color: "#8B93A3" }}>{fmtNaira(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Expense list */}
            <section>
              <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#8B93A3", margin: "0 0 10px 4px", fontWeight: 600 }}>
                {isToday(viewDate) ? "Today's spending" : "That day's spending"}
              </h2>
              {dayExpenses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 20px", color: "#5A6478", fontSize: 13 }}>
                  Nothing logged for this day yet.
                </div>
              ) : (
                dayExpenses.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#263547", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[e.category], flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#F6F2E9" }}>{fmtNaira(e.amount)}</div>
                        <div style={{ fontSize: 11.5, color: "#8B93A3" }}>{e.category}{e.note ? ` · ${e.note}` : ""}</div>
                      </div>
                    </div>
                    <button onClick={() => removeExpense(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5A6478" }}>
                      <X size={15} />
                    </button>
                  </div>
                ))
              )}
            </section>

            <section style={{ marginTop: 18, padding: 16, background: "#263547", borderRadius: 10, fontSize: 12.5, color: "#8B93A3", display: "flex", justifyContent: "space-between" }}>
              <span>Last 7 days total</span>
              <span style={{ color: "#F6F2E9", fontWeight: 700 }}>{fmtNaira(weekSpent)}</span>
            </section>
          </>
        ) : (
          <>
            {/* Day rollover prompt */}
            {rolloverPending && (
              <section style={{ background: "#2E4A3A", border: "1px solid #3E6B52", borderRadius: 14, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Sunrise size={17} color="#8FD9B0" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 11.5, color: "#8FD9B0", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>
                      New day
                    </div>
                    <p style={{ fontSize: 13, color: "#E5F2EA", margin: 0, lineHeight: 1.5 }}>
                      You planned {plans.tomorrow.length} thing{plans.tomorrow.length > 1 ? "s" : ""} for today, back when it was still "tomorrow." Move {plans.tomorrow.length > 1 ? "them" : "it"} into today's list?
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={moveTomorrowToToday}
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#8FD9B0", color: "#1E2A3A", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    Move to today
                  </button>
                  <button
                    onClick={dismissRollover}
                    style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #3E6B52", background: "transparent", color: "#8FD9B0", fontSize: 13, cursor: "pointer" }}
                  >
                    Not now
                  </button>
                </div>
              </section>
            )}

            {/* Plan sub-tabs */}
            <section style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {[
                { key: "today", label: "Today", icon: Sun },
                { key: "tomorrow", label: "Tomorrow", icon: Sunrise },
                { key: "week", label: "This week", icon: CalendarDays },
                { key: "month", label: "This month", icon: CalendarRange },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setPlanView(key)}
                  style={{
                    flex: 1, padding: "9px 4px", borderRadius: 9, cursor: "pointer",
                    border: planView === key ? "1.5px solid #E8A33D" : "1px solid #354357",
                    background: planView === key ? "#3A2E1E" : "#263547",
                    color: planView === key ? "#E8A33D" : "#8B93A3",
                    fontSize: 11.5, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </section>

            {(() => {
              const config = {
                today: { label: todayLabel(), placeholder: "e.g. Reply to comments, edit today's footage", input: newToday, setInput: setNewToday, empty: "Anything else you want to get done today? Add it here." },
                tomorrow: { label: tomorrowLabel(), placeholder: "e.g. Record TikTok reaction video", input: newTomorrow, setInput: setNewTomorrow, empty: "Plan tomorrow tonight — future you will thank you." },
                week: { label: weekRangeLabel(), placeholder: "e.g. Publish 3 videos on TheSnackJudge", input: newWeek, setInput: setNewWeek, empty: "What does a good week look like? Write 2-3 targets." },
                month: { label: monthLabelNow(), placeholder: "e.g. Hit 1,000 subscribers on The Edge of Becoming", input: newMonth, setInput: setNewMonth, empty: "Set the big wins for this month — the ones that matter." },
              };
              const cfg = config[planView];
              const list = plans[planView];
              const doneCount = list.filter((t) => t.done).length;
              return (
                <>
                  <section style={{ background: "#263547", borderRadius: 14, padding: 18, marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                      <div className="serif" style={{ color: "#F6F2E9", fontSize: 15 }}>{cfg.label}</div>
                      {list.length > 0 && (
                        <span style={{ fontSize: 11.5, color: "#8B93A3" }}>{doneCount}/{list.length} done</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder={cfg.placeholder}
                        value={cfg.input}
                        onChange={(e) => cfg.setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addPlanItem(planView, cfg.input, cfg.setInput)}
                        style={{ flex: 1, padding: "11px 13px", borderRadius: 9, border: "1px solid #354357", background: "#1E2A3A", color: "#F6F2E9", fontSize: 14 }}
                      />
                      <button
                        onClick={() => addPlanItem(planView, cfg.input, cfg.setInput)}
                        style={{ padding: "0 15px", borderRadius: 9, border: "none", background: "#E8A33D", color: "#1E2A3A", cursor: "pointer", display: "flex", alignItems: "center" }}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                  </section>

                  {list.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "26px 20px", color: "#5A6478", fontSize: 13 }}>
                      <ListChecks size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                      <p>{cfg.empty}</p>
                    </div>
                  ) : (
                    <>
                      {list.map((t) => (
                        <div
                          key={t.id}
                          style={{ display: "flex", alignItems: "center", gap: 10, background: "#263547", borderRadius: 10, padding: "12px 14px", marginBottom: 8, opacity: t.done ? 0.55 : 1 }}
                        >
                          <button
                            onClick={() => togglePlanItem(planView, t.id)}
                            aria-label={t.done ? "Mark not done" : "Mark done"}
                            style={{
                              width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer",
                              border: t.done ? "none" : "1.5px solid #5A6478",
                              background: t.done ? "#E8A33D" : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {t.done && <Check size={13} color="#1E2A3A" />}
                          </button>
                          <span style={{ flex: 1, fontSize: 14, color: "#F6F2E9", textDecoration: t.done ? "line-through" : "none" }}>
                            {t.text}
                          </span>
                          <button onClick={() => removePlanItem(planView, t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5A6478" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {doneCount > 0 && (
                        <button
                          onClick={() => clearDonePlanItems(planView)}
                          style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 9, border: "1px dashed #354357", background: "transparent", color: "#8B93A3", fontSize: 12.5, cursor: "pointer" }}
                        >
                          Clear {doneCount} completed
                        </button>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<DailyTracker />);
