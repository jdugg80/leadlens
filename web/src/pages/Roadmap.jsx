import { useState, useEffect, useCallback } from "react";

// ── Project configs ───────────────────────────────────────────────────────────
// Add new projects here as needed. `context` is injected into Claude's system prompt.
const PROJECTS = [
  {
    id: "leadlens",
    name: "LeadLens",
    color: "#00C9FF",
    context: `LeadLens is a React Native field sales prospecting app for pest control.
Stack: React Native 0.74, Expo SDK 51 (bare workflow), Supabase backend, Google Maps/Places API, MMKV storage, Claude AI API, EAS Build.
Key screens: TerritoryMapScreen, ProspectQueueScreen, SupportScreen, LoginScreen, LeadLockCameraScreen.
Design palette: bg #080A0F, cyan #00C9FF, red #CC1040, purple #7B3FBE, chrome #B8BDD0.
Package: com.okaymedia.leadlens`,
  },
  // Add future projects below:
  // { id: "myapp2", name: "MyApp2", color: "#FF6B35", context: "..." },
];

// ── Supabase ─────────────────────────────────────────────────────────────────
// Uses the portal's existing supabase client — no separate config needed
import { supabase } from '../lib/supabase';

async function supabaseInsert(record) {
  try {
    const { data, error } = await supabase
      .from('feature_requests')
      .insert(record)
      .select();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("Supabase insert failed (local only):", e.message);
    return null;
  }
}

async function supabaseFetch(projectId) {
  try {
    const { data, error } = await supabase
      .from('feature_requests')
      .select('*')
      .eq('project', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("Supabase fetch failed:", e.message);
    return null;
  }
}

// ── Local storage helpers ────────────────────────────────────────────────────
const LS_KEY = "okaydev_roadmap_v1"; // renamed to be project-agnostic
function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveLocal(items) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}

// ── Claude AI analysis ───────────────────────────────────────────────────────
async function analyzeWithClaude(rawInput, type, projectContext) {
  const systemPrompt = `You are the technical planning AI for the following project:

${projectContext}

When given a ${type === "bug" ? "bug report" : "feature idea"}, respond ONLY with a valid JSON object — no markdown, no backticks, no preamble.

JSON shape:
{
  "title": "short title (max 8 words)",
  "summary": "1-2 sentence plain English summary",
  "type": "${type}",
  "priority": "critical|high|medium|low",
  "priority_reason": "one sentence explaining priority",
  "complexity": "low|medium|high",
  "affected_screens": ["array of screen names"],
  "dependencies": ["any libs, APIs, or features required"],
  "effort_estimate": "e.g. 2-4 hours / 1-2 days / 3-5 days",
  "suggested_update": "e.g. Beta-49 or Beta-50",
  "deploy_type": "ota|rebuild",
  "deploy_reason": "one sentence explaining why this is OTA or requires a full native rebuild (e.g. new native module, permission change, SDK bump) vs just a JS bundle push",
  "agent_prompt": "A complete copy-paste Claude prompt to implement this fix/feature. Include all project context, file references, and exact instructions needed.",
  "task_breakdown": [
    { "step": 1, "action": "description of step", "file": "filename if applicable" }
  ]
}`;

  const PROXY_URL = "https://qkbvwryucaakkkqaqvka.supabase.co/functions/v1/claude-proxy";
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token}`,
      "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrYnZ3cnl1Y2Fha2trcWFxdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODIyNzUsImV4cCI6MjA5MTk1ODI3NX0.Mfi0ca1Ea_tdJlknL-8XKY2MwZpDAnzExco3saLc5RU",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: rawInput }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Priority config ──────────────────────────────────────────────────────────
const PRIORITY = {
  critical: { label: "CRITICAL", color: "#CC1040", bg: "#2a0010", dot: "🔴" },
  high:     { label: "HIGH",     color: "#FF6B35", bg: "#2a1500", dot: "🟠" },
  medium:   { label: "MEDIUM",   color: "#F5C842", bg: "#2a2200", dot: "🟡" },
  low:      { label: "LOW",      color: "#00C9FF", bg: "#002a30", dot: "🟢" },
};

const DEPLOY_TYPE = {
  ota:     { label: "OTA", color: "#22C55E", bg: "#052015", icon: "⚡", cmd: (pkg) => `eas update --branch production --message "${pkg}"` },
  rebuild: { label: "REBUILD", color: "#F5C842", bg: "#1a1500", icon: "🔨", cmd: () => `npx expo run:android` },
};

const STATUS_COLORS = {
  backlog:     "#555",
  planned:     "#7B3FBE",
  "in-progress": "#FF6B35",
  done:        "#22c55e",
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeadLensRoadmap() {
  const [activeProject, setActiveProject] = useState(PROJECTS[0]);
  const [items, setItems] = useState([]);
  const [view, setView] = useState("backlog"); // backlog | packages | add
  const [inputType, setInputType] = useState("feature");
  const [rawInput, setRawInput] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [agentTab, setAgentTab] = useState("prompt");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [repOnly, setRepOnly] = useState(false);
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Load on project change
  useEffect(() => {
    const local = loadLocal().filter(i => i.project === activeProject.id);
    setItems(local);
    setSelected(null);
    supabaseFetch(activeProject.id).then((remote) => {
        if (remote && remote.length > 0) {
          // Merge remote into local cache (other projects preserved)
          const allLocal = loadLocal();
          const merged = [...allLocal.filter(i => i.project !== activeProject.id), ...remote];
          saveLocal(merged);
          setItems(remote);
        }
      });
  }, [activeProject]);

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Voice not supported in this browser", "#CC1040");
      return;
    }
    if (listening) {
      if (recognitionRef[0]) recognitionRef[0].stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef[0] = recognition;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join("");
      setRawInput(transcript);
    };
    recognition.start();
  };

  const showToast = (msg, color = "#00C9FF") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async () => {
    if (!rawInput.trim()) return;
    setAnalyzing(true);
    try {
      const spec = await analyzeWithClaude(rawInput.trim(), inputType, activeProject.context);
      const newItem = {
        project: activeProject.id,
        id: Date.now().toString(),
        raw_input: rawInput.trim(),
        source: "owner",
        status: "backlog",
        created_at: new Date().toISOString(),
        ...spec,
      };
      const updated = [newItem, ...items];
      setItems(updated);
      saveLocal(updated);
      setRawInput("");
      setView("backlog");
      showToast("✓ Added to roadmap", "#00C9FF");

      // Supabase sync
      setSyncing(true);
      await supabaseInsert(newItem);
      setSyncing(false);
    } catch (e) {
      showToast("AI analysis failed — check console", "#CC1040");
      console.error(e);
    }
    setAnalyzing(false);
  };

  const updateStatus = (id, status) => {
    const updated = items.map((i) => (i.id === id ? { ...i, status } : i));
    setItems(updated);
    saveLocal(updated);
    if (selected?.id === id) setSelected({ ...selected, status });
  };

  const deleteItem = (id) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveLocal(updated);
    setSelected(null);
    showToast("Deleted", "#CC1040");
  };

  // Group items into suggested update packages
  const packages = useCallback(() => {
    const groups = {};
    items.forEach((item) => {
      if (item.status === "done") return;
      const pkg = item.suggested_update || "Unassigned";
      if (!groups[pkg]) groups[pkg] = [];
      groups[pkg].push(item);
    });
    // Sort each group: critical first
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    Object.keys(groups).forEach((k) => {
      groups[k].sort((a, b) => (order[a.priority] || 3) - (order[b.priority] || 3));
    });
    return groups;
  }, [items]);

  const filtered = items.filter((i) => {
    if (filterType !== "all" && i.type !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (repOnly && i.source !== "rep") return false;
    return true;
  });

  const repCount = items.filter(i => i.source === "rep" && i.status === "backlog").length;

  const bugCount = items.filter((i) => i.type === "bug" && i.status !== "done").length;
  const criticalCount = items.filter((i) => i.priority === "critical" && i.status !== "done").length;

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
        }
      `}</style>
      {/* Scanline overlay */}
      <div style={styles.scanlines} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <span style={styles.logoL}>L</span>
            <span style={styles.logoL2}>L</span>
          </div>
          <div>
            <div style={styles.appTitle}>ROADMAP</div>
            <div style={styles.appSubtitle}>COMMAND CENTER</div>
          </div>
          {PROJECTS.length > 1 && (
            <select
              value={activeProject.id}
              onChange={(e) => setActiveProject(PROJECTS.find(p => p.id === e.target.value))}
              style={{
                background: "#0d1018",
                border: "1px solid #1a2030",
                borderRadius: 5,
                color: activeProject.color,
                fontSize: 11,
                letterSpacing: 2,
                padding: "5px 10px",
                fontFamily: "'Courier New', monospace",
                cursor: "pointer",
                marginLeft: 8,
              }}
            >
              {PROJECTS.map(p => (
                <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
              ))}
            </select>
          )}
          {PROJECTS.length === 1 && (
            <div style={{ marginLeft: 8, fontSize: 11, color: activeProject.color, letterSpacing: 2, border: "1px solid " + activeProject.color + "44", padding: "4px 10px", borderRadius: 4 }}>
              {activeProject.name.toUpperCase()}
            </div>
          )}
        </div>
        <div style={styles.headerStats}>
          {criticalCount > 0 && (
            <div style={styles.statBadge}>
              <span style={{ color: "#CC1040" }}>●</span> {criticalCount} CRITICAL
            </div>
          )}
          {bugCount > 0 && (
            <div style={styles.statBadge}>
              <span style={{ color: "#FF6B35" }}>⬡</span> {bugCount} BUGS
            </div>
          )}
          <div style={styles.statBadge}>
            <span style={{ color: "#00C9FF" }}>◈</span> {items.filter(i => i.status !== "done").length} OPEN
          </div>
          {repCount > 0 && (
            <div
              style={{ ...styles.statBadge, color: "#7B3FBE", cursor: "pointer", border: "1px solid #7B3FBE44", padding: "3px 8px", borderRadius: 4 }}
              onClick={() => { setView("backlog"); setRepOnly(true); }}
            >
              👤 {repCount} REP {repCount === 1 ? "SUBMISSION" : "SUBMISSIONS"}
            </div>
          )}
          {syncing && <div style={{ ...styles.statBadge, color: "#7B3FBE" }}>↑ SYNCING</div>}
        </div>
      </div>

      {/* Nav */}
      <div style={styles.nav}>
        {[
          { id: "backlog", label: "BACKLOG" },
          { id: "packages", label: "UPDATE PACKAGES" },
          { id: "add", label: "+ NEW ENTRY" },
        ].map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            style={{
              ...styles.navBtn,
              ...(view === n.id ? styles.navBtnActive : {}),
            }}
          >
            {n.label}
          </button>
        ))}
      </div>

      {/* ── ADD VIEW ── */}
      {view === "add" && (
        <div style={styles.addPane}>
          <div style={styles.addCard}>
            <div style={styles.addTitle}>CAPTURE NEW ENTRY</div>
            <div style={styles.typeRow}>
              {["feature", "bug"].map((t) => (
                <button
                  key={t}
                  onClick={() => setInputType(t)}
                  style={{
                    ...styles.typeBtn,
                    ...(inputType === t
                      ? t === "bug"
                        ? styles.typeBtnActiveBug
                        : styles.typeBtnActiveFeature
                      : {}),
                  }}
                >
                  {t === "bug" ? "🐛 BUG REPORT" : "💡 FEATURE IDEA"}
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={
                  inputType === "bug"
                    ? "Describe the bug... What happened? What screen? How to reproduce? What's the impact?"
                    : "Describe your feature idea... What problem does it solve? Which users benefit? Any specific behavior in mind?"
                }
                style={{ ...styles.textarea, paddingRight: 52 }}
                rows={7}
              />
              <button
                onClick={startVoice}
                title={listening ? "Stop recording" : "Start voice input"}
                style={{
                  position: "absolute", top: 10, right: 10,
                  width: 34, height: 34, borderRadius: "50%",
                  background: listening ? "#CC104022" : "#00C9FF11",
                  border: listening ? "1px solid #CC1040" : "1px solid #00C9FF44",
                  color: listening ? "#CC1040" : "#00C9FF",
                  fontSize: 16, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                  boxShadow: listening ? "0 0 12px #CC104055" : "none",
                  animation: listening ? "pulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                🎙
              </button>
            </div>
            {listening && (
              <div style={{ fontSize: 10, color: "#CC1040", letterSpacing: 2, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#CC1040", display: "inline-block", animation: "pulse 1s ease-in-out infinite" }} />
                LISTENING — TAP MIC TO STOP
              </div>
            )}
            <div style={styles.addHint}>
              Dump your raw thoughts — Claude will structure it into a full spec, priority, effort estimate, update package suggestion, and agent scripts.
            </div>
            <button
              onClick={handleSubmit}
              disabled={analyzing || !rawInput.trim()}
              style={{
                ...styles.submitBtn,
                opacity: analyzing || !rawInput.trim() ? 0.5 : 1,
              }}
            >
              {analyzing ? (
                <span style={styles.analyzingText}>
                  <span style={styles.spinner}>◌</span> ANALYZING WITH AI...
                </span>
              ) : (
                "ANALYZE + ADD TO ROADMAP →"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── BACKLOG VIEW ── */}
      {view === "backlog" && (
        <div style={styles.pane}>
          {/* Filters */}
          <div style={styles.filterRow}>
            <div style={styles.filterGroup}>
              {["all", "feature", "bug"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{ ...styles.filterBtn, ...(filterType === t ? styles.filterBtnActive : {}) }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={styles.filterGroup}>
              {["all", "backlog", "planned", "in-progress", "done"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  style={{ ...styles.filterBtn, ...(filterStatus === s ? styles.filterBtnActive : {}) }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setRepOnly(!repOnly)}
              style={{
                ...styles.filterBtn,
                ...(repOnly ? { borderColor: "#7B3FBE55", color: "#7B3FBE", background: "#7B3FBE0a" } : {}),
              }}
            >
              👤 REP SUBMISSIONS ONLY {repCount > 0 && `(${repCount})`}
            </button>
          </div>

          {filtered.length === 0 && (
            <div style={styles.empty}>
              No entries yet.{" "}
              <span
                style={{ color: "#00C9FF", cursor: "pointer" }}
                onClick={() => setView("add")}
              >
                Add your first one →
              </span>
            </div>
          )}

          <div style={styles.itemGrid}>
            {filtered.map((item) => {
              const p = PRIORITY[item.priority] || PRIORITY.low;
              return (
                <div
                  key={item.id}
                  style={{
                    ...styles.itemCard,
                    borderColor: C.borderLit,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(item)}
                >
                  <div style={{
                    position: "absolute", top: 0, left: 0,
                    width: 40, height: 3,
                    background: p.color,
                    borderTopLeftRadius: 12,
                    opacity: 0.9,
                  }} />
                  <div style={styles.itemCardTop}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10 }}>{p.dot}</span>
                      <span style={{ ...styles.priorityTag, color: p.color, background: p.bg }}>
                        {p.label}
                      </span>
                      <span style={{
                        ...styles.typeTag,
                        color: item.type === "bug" ? "#FF6B35" : "#7B3FBE",
                        background: item.type === "bug" ? "#2a150040" : "#1a0a2a",
                        border: `1px solid ${item.type === "bug" ? "#FF6B3555" : "#7B3FBE55"}`,
                      }}>
                        {item.type === "bug" ? "BUG" : "FEATURE"}
                      </span>
                    </div>
                    <span style={{
                      ...styles.statusDot,
                      background: STATUS_COLORS[item.status] || "#555",
                    }} />
                  </div>
                  <div style={styles.itemTitle}>{item.title}</div>
                  <div style={styles.itemSummary}>{item.summary}</div>
                  <div style={styles.itemMeta}>
                    <span style={styles.metaChip}>{item.suggested_update || "?"}</span>
                    <span style={styles.metaChip}>{item.effort_estimate || "?"}</span>
                    <span style={styles.metaChip}>{item.complexity} complexity</span>
                    {item.deploy_type && (() => {
                      const d = DEPLOY_TYPE[item.deploy_type];
                      return d ? (
                        <span style={{ ...styles.metaChip, color: d.color, borderColor: d.color + "55", background: d.bg }}>
                          {d.icon} {d.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {item.source === "rep" && (
                    <div style={styles.repBadge}>👤 REP SUBMITTED</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PACKAGES VIEW ── */}
      {view === "packages" && (
        <div style={styles.pane}>
          {Object.entries(packages()).length === 0 && (
            <div style={styles.empty}>No items in backlog yet.</div>
          )}
          {Object.entries(packages())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([pkg, pkgItems]) => (
              <div key={pkg} style={styles.packageBlock}>
                <div style={styles.packageHeader}>
                  <span style={styles.packageName}>{pkg}</span>
                  <span style={styles.packageCount}>{pkgItems.length} items</span>
                </div>
                <div style={styles.packageSummary}>
                  Bugs: {pkgItems.filter(i => i.type === "bug").length} ·
                  Features: {pkgItems.filter(i => i.type === "feature").length} ·
                  Est. effort: {pkgItems.filter(i => i.complexity === "high").length > 1 ? "Heavy" : pkgItems.filter(i => i.complexity === "medium").length > 2 ? "Moderate" : "Light"}
                </div>
                {/* Deploy banner — shows if any item needs a rebuild */}
                {(() => {
                  const needsRebuild = pkgItems.some(i => i.deploy_type === "rebuild");
                  const allOta = pkgItems.every(i => i.deploy_type === "ota");
                  const deployCmd = needsRebuild
                    ? DEPLOY_TYPE.rebuild.cmd()
                    : DEPLOY_TYPE.ota.cmd(pkg);
                  const d = needsRebuild ? DEPLOY_TYPE.rebuild : DEPLOY_TYPE.ota;
                  return (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: d.bg, border: `1px solid ${d.color}44`,
                      borderRadius: 7, padding: "8px 12px", marginBottom: 10,
                    }}>
                      <span style={{ fontSize: 11, color: d.color, fontWeight: 700, letterSpacing: 1 }}>
                        {d.icon} {needsRebuild ? "FULL REBUILD REQUIRED" : "OTA DEPLOYABLE"}
                        {!needsRebuild && allOta && <span style={{ color: "#22C55E88", fontWeight: 400, marginLeft: 6 }}>— JS only, no APK needed</span>}
                        {needsRebuild && <span style={{ color: "#F5C84288", fontWeight: 400, marginLeft: 6 }}>— native changes present</span>}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(deployCmd); }}
                        style={{ ...styles.copyBtn, position: "static", fontSize: 9, padding: "4px 10px" }}
                        title="Copy deploy command"
                      >
                        COPY CMD
                      </button>
                    </div>
                  );
                })()}
                {pkgItems.map((item) => {
                  const p = PRIORITY[item.priority] || PRIORITY.low;
                  const d = item.deploy_type ? DEPLOY_TYPE[item.deploy_type] : null;
                  return (
                    <div
                      key={item.id}
                      style={{ ...styles.packageItem, borderLeftColor: p.color, cursor: "pointer" }}
                      onClick={() => { setSelected(item); setView("backlog"); }}
                    >
                      <span style={{ fontSize: 11 }}>{p.dot}</span>
                      <span style={styles.packageItemTitle}>{item.title}</span>
                      <span style={{
                        ...styles.typeTag,
                        color: item.type === "bug" ? "#FF6B35" : "#7B3FBE",
                        background: "transparent",
                        border: "none",
                        fontSize: 10,
                      }}>
                        {item.type === "bug" ? "🐛" : "💡"}
                      </span>
                      {d && (
                        <span style={{ fontSize: 9, color: d.color, fontWeight: 700, letterSpacing: 1 }}>
                          {d.icon} {d.label}
                        </span>
                      )}
                      <span style={styles.metaChip}>{item.effort_estimate}</span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {selected && (
        <div style={styles.modalOverlay} onClick={() => setSelected(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    ...styles.priorityTag,
                    color: PRIORITY[selected.priority]?.color || "#ccc",
                    background: PRIORITY[selected.priority]?.bg || "#111",
                    fontSize: 11,
                  }}>
                    {PRIORITY[selected.priority]?.dot} {PRIORITY[selected.priority]?.label}
                  </span>
                  <span style={{
                    ...styles.typeTag,
                    color: selected.type === "bug" ? "#FF6B35" : "#7B3FBE",
                    background: selected.type === "bug" ? "#2a1500" : "#1a0a2a",
                    border: `1px solid ${selected.type === "bug" ? "#FF6B3555" : "#7B3FBE55"}`,
                  }}>
                    {selected.type === "bug" ? "BUG" : "FEATURE"}
                  </span>
                </div>
                <div style={styles.modalTitle}>{selected.title}</div>
                <div style={styles.modalSummary}>{selected.summary}</div>
              </div>
              <button onClick={() => setSelected(null)} style={styles.closeBtn}>✕</button>
            </div>

            {/* Meta row */}
            <div style={styles.modalMetaRow}>
              {[
                ["UPDATE", selected.suggested_update],
                ["EFFORT", selected.effort_estimate],
                ["COMPLEXITY", selected.complexity],
                ["SOURCE", selected.source],
              ].map(([label, val]) => (
                <div key={label} style={styles.modalMetaChip}>
                  <div style={styles.modalMetaLabel}>{label}</div>
                  <div style={styles.modalMetaVal}>{val || "—"}</div>
                </div>
              ))}
              {selected.deploy_type && (() => {
                const d = DEPLOY_TYPE[selected.deploy_type];
                return d ? (
                  <div style={{ ...styles.modalMetaChip, background: d.bg, border: `1px solid ${d.color}55` }}>
                    <div style={{ ...styles.modalMetaLabel, color: d.color }}>DEPLOY</div>
                    <div style={{ ...styles.modalMetaVal, color: d.color }}>{d.icon} {d.label}</div>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Deploy reason */}
            {selected.deploy_type && (() => {
              const d = DEPLOY_TYPE[selected.deploy_type];
              const deployCmd = d?.cmd(selected.suggested_update || "update");
              return (
                <div style={{ ...styles.sectionBlock, background: d?.bg, border: `1px solid ${d?.color}44` }}>
                  <div style={{ ...styles.sectionLabel, color: d?.color }}>DEPLOY METHOD — {d?.label}</div>
                  <div style={{ ...styles.sectionText, marginBottom: deployCmd ? 10 : 0 }}>
                    {selected.deploy_reason || (selected.deploy_type === "ota" ? "JS-only changes — push via EAS Update, no APK required." : "Requires native rebuild — run a full EAS build or local compile.")}
                  </div>
                  {deployCmd && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <code style={{ flex: 1, fontSize: 11, color: d?.color, background: C.bg, border: `1px solid ${d?.color}33`, borderRadius: 6, padding: "7px 12px", fontFamily: "'Courier New', monospace" }}>
                        {deployCmd}
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(deployCmd); showToast("✓ Deploy command copied"); }}
                        style={{ ...styles.copyBtn, position: "static", fontSize: 9, padding: "6px 12px", flexShrink: 0 }}
                      >
                        COPY
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Priority reason */}
            <div style={styles.sectionBlock}>
              <div style={styles.sectionLabel}>PRIORITY RATIONALE</div>
              <div style={styles.sectionText}>{selected.priority_reason}</div>
            </div>

            {/* Affected screens + deps */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ ...styles.sectionBlock, flex: 1, marginBottom: 0 }}>
                <div style={styles.sectionLabel}>AFFECTED SCREENS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {(selected.affected_screens || []).map((s) => (
                    <span key={s} style={styles.chipSmall}>{s}</span>
                  ))}
                </div>
              </div>
              <div style={{ ...styles.sectionBlock, flex: 1, marginBottom: 0 }}>
                <div style={styles.sectionLabel}>DEPENDENCIES</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {(selected.dependencies || []).map((d) => (
                    <span key={d} style={{ ...styles.chipSmall, borderColor: "#7B3FBE55", color: "#b090e0" }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Status control */}
            <div style={styles.sectionBlock}>
              <div style={styles.sectionLabel}>STATUS</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {["backlog", "planned", "in-progress", "done"].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(selected.id, s)}
                    style={{
                      ...styles.statusBtn,
                      background: selected.status === s ? STATUS_COLORS[s] + "33" : "transparent",
                      borderColor: selected.status === s ? STATUS_COLORS[s] : "#333",
                      color: selected.status === s ? STATUS_COLORS[s] : "#666",
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent Scripts */}
            <div style={styles.sectionBlock}>
              <div style={styles.sectionLabel}>AGENT SCRIPTS</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, marginTop: 6 }}>
                <button
                  onClick={() => setAgentTab("prompt")}
                  style={{ ...styles.tabBtn, ...(agentTab === "prompt" ? styles.tabBtnActive : {}) }}
                >
                  COPY-PASTE PROMPT
                </button>
                <button
                  onClick={() => setAgentTab("steps")}
                  style={{ ...styles.tabBtn, ...(agentTab === "steps" ? styles.tabBtnActive : {}) }}
                >
                  TASK BREAKDOWN
                </button>
              </div>

              {agentTab === "prompt" && (
                <div style={styles.codeBlock}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selected.agent_prompt || "");
                      showToast("✓ Copied to clipboard");
                    }}
                    style={styles.copyBtn}
                  >
                    COPY
                  </button>
                  <pre style={styles.codeText}>{selected.agent_prompt}</pre>
                </div>
              )}

              {agentTab === "steps" && (
                <div style={styles.stepsList}>
                  {(selected.task_breakdown || []).map((step) => (
                    <div key={step.step} style={styles.stepItem}>
                      <div style={styles.stepNum}>{step.step}</div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.stepAction}>{step.action}</div>
                        {step.file && (
                          <div style={styles.stepFile}>{step.file}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Raw input */}
            <div style={styles.sectionBlock}>
              <div style={styles.sectionLabel}>ORIGINAL INPUT</div>
              <div style={styles.rawText}>{selected.raw_input}</div>
            </div>

            {/* Delete */}
            <button onClick={() => deleteItem(selected.id)} style={styles.deleteBtn}>
              DELETE ENTRY
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, borderColor: toast.color, color: toast.color }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const C = {
  bg:        "#0A0D14",
  surface:   "#0E1219",
  card:      "#121820",
  cardHover: "#161D28",
  border:    "#1C2333",
  borderLit: "#252E42",
  cyan:      "#00C9FF",
  red:       "#CC1040",
  purple:    "#7B3FBE",
  chrome:    "#E8EAF2",
  text:      "#D8DCF0",
  textDim:   "#8892B0",
  textMuted: "#4A5578",
  orange:    "#FF6B35",
  green:     "#22C55E",
};

const styles = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    position: "relative",
  },
  scanlines: {
    position: "fixed", inset: 0,
    background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 4px)",
    pointerEvents: "none", zIndex: 0,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "0 28px",
    height: 64,
    background: C.surface,
    borderBottom: `3px solid transparent`,
    borderImage: `linear-gradient(90deg, ${C.purple}, ${C.red}) 1`,
    position: "relative", zIndex: 10,
    boxShadow: "0 2px 20px rgba(0,0,0,0.5)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  logo: {
    width: 40, height: 40,
    background: `linear-gradient(135deg, ${C.cyan}33, ${C.purple}44)`,
    border: `1px solid ${C.cyan}66`,
    borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative",
    boxShadow: `0 0 16px ${C.cyan}33`,
  },
  logoL:  { color: C.cyan,   fontSize: 16, fontWeight: 800, lineHeight: 1 },
  logoL2: { color: C.purple, fontSize: 10, fontWeight: 800, position: "absolute", bottom: 3, right: 4 },
  appTitle:    { color: C.chrome, fontSize: 15, fontWeight: 800, letterSpacing: 3 },
  appSubtitle: { color: C.textMuted, fontSize: 9, letterSpacing: 3, marginTop: 1 },
  headerStats: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  statBadge: {
    fontSize: 10, letterSpacing: 1, color: C.textDim,
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 10px", borderRadius: 5,
    background: `${C.border}88`,
    border: `1px solid ${C.borderLit}`,
  },
  nav: {
    display: "flex",
    background: C.surface,
    borderBottom: `1px solid ${C.borderLit}`,
    position: "relative", zIndex: 1,
    paddingLeft: 8,
  },
  navBtn: {
    padding: "14px 22px",
    background: "transparent", border: "none",
    borderBottom: "2px solid transparent",
    color: C.textMuted, fontSize: 11, fontWeight: 600,
    letterSpacing: 2, cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
  },
  navBtnActive: {
    color: C.cyan,
    borderBottomColor: C.cyan,
    background: `${C.cyan}08`,
  },
  pane:    { padding: "24px 28px", position: "relative", zIndex: 1, minHeight: "calc(100vh - 120px)" },
  addPane: { padding: "40px 28px", display: "flex", justifyContent: "center", position: "relative", zIndex: 1 },
  addCard: {
    width: "100%", maxWidth: 700,
    background: C.card,
    border: `1px solid ${C.borderLit}`,
    borderTop: `3px solid ${C.cyan}`,
    borderRadius: 12, padding: 32,
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  },
  addTitle: { fontSize: 12, letterSpacing: 3, color: C.cyan, marginBottom: 20, fontWeight: 700 },
  typeRow:  { display: "flex", gap: 10, marginBottom: 18 },
  typeBtn: {
    flex: 1, padding: "11px 0",
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.textMuted,
    fontSize: 12, fontWeight: 600, letterSpacing: 1, cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
  },
  typeBtnActiveFeature: { background: `${C.purple}22`, borderColor: C.purple, color: "#c090f0" },
  typeBtnActiveBug:     { background: `${C.orange}18`, borderColor: C.orange, color: C.orange },
  textarea: {
    width: "100%", background: C.bg,
    border: `1px solid ${C.borderLit}`,
    borderRadius: 8, color: C.text,
    fontSize: 13, lineHeight: 1.7,
    padding: "14px 16px", resize: "vertical",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    outline: "none", boxSizing: "border-box",
  },
  addHint: { fontSize: 11, color: C.textMuted, marginTop: 8, marginBottom: 18, lineHeight: 1.6 },
  submitBtn: {
    width: "100%", padding: "14px 0",
    background: `linear-gradient(135deg, ${C.cyan}22, ${C.purple}22)`,
    border: `1px solid ${C.cyan}88`,
    borderRadius: 8, color: C.cyan,
    fontSize: 12, fontWeight: 700, letterSpacing: 2,
    cursor: "pointer", fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
    boxShadow: `0 0 16px ${C.cyan}18`,
  },
  analyzingText: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  spinner: { display: "inline-block", animation: "spin 1s linear infinite" },
  filterRow:   { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  filterGroup: { display: "flex", gap: 6 },
  filterBtn: {
    padding: "5px 14px",
    background: "transparent", border: `1px solid ${C.borderLit}`,
    borderRadius: 5, color: C.textDim,
    fontSize: 10, fontWeight: 600, letterSpacing: 1,
    cursor: "pointer", fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
  },
  filterBtnActive: { borderColor: `${C.cyan}88`, color: C.cyan, background: `${C.cyan}10` },
  empty: { color: C.textMuted, fontSize: 13, padding: "60px 0", textAlign: "center" },
  itemGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 14,
  },
  itemCard: {
    background: C.card,
    border: `1px solid ${C.borderLit}`,
    borderRadius: 12, padding: 18,
    cursor: "pointer",
    transition: "transform 0.1s, box-shadow 0.15s",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
    position: "relative",
    overflow: "hidden",
  },
  itemCardTop:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  priorityTag:  { fontSize: 9, letterSpacing: 2, padding: "3px 8px", borderRadius: 4, fontWeight: 700 },
  typeTag:      { fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4, fontWeight: 600 },
  statusDot:    { width: 8, height: 8, borderRadius: "50%" },
  itemTitle:    { fontSize: 14, color: C.chrome, marginBottom: 6, lineHeight: 1.4, fontWeight: 700 },
  itemSummary:  { fontSize: 12, color: "#9AA5C0", lineHeight: 1.6, marginBottom: 12 },
  itemMeta:     { display: "flex", gap: 6, flexWrap: "wrap" },
  metaChip: {
    fontSize: 10, color: C.textDim,
    background: `${C.border}88`,
    border: `1px solid ${C.borderLit}`,
    borderRadius: 4, padding: "2px 8px",
    letterSpacing: 0.5,
  },
  repBadge: { fontSize: 9, color: C.purple, marginTop: 8, letterSpacing: 1, fontWeight: 600 },
  packageBlock: {
    background: C.card,
    border: `1px solid ${C.borderLit}`,
    borderLeft: `3px solid ${C.cyan}`,
    borderRadius: 12, padding: 18,
    marginBottom: 14,
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
  },
  packageHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  packageName:     { color: C.cyan, fontSize: 14, letterSpacing: 3, fontWeight: 700 },
  packageCount:    { fontSize: 10, color: C.textMuted },
  packageSummary:  { fontSize: 11, color: C.textMuted, marginBottom: 14, letterSpacing: 0.5 },
  packageItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 0 9px 12px",
    borderBottom: `1px solid ${C.border}`,
    borderLeft: "2px solid",
    marginBottom: 2,
  },
  packageItemTitle: { flex: 1, fontSize: 12, color: C.text },
  modalOverlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.88)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    zIndex: 100, padding: "24px 16px",
    overflowY: "auto",
  },
  modal: {
    width: "100%", maxWidth: 740,
    background: C.surface,
    border: `1px solid ${C.borderLit}`,
    borderTop: `3px solid ${C.purple}`,
    borderRadius: 12, padding: 28,
    position: "relative",
    boxShadow: `0 8px 40px rgba(0,0,0,0.6)`,
  },
  modalHeader:  { display: "flex", gap: 16, marginBottom: 18 },
  modalTitle:   { fontSize: 18, color: C.chrome, lineHeight: 1.3, marginBottom: 6, fontWeight: 800 },
  modalSummary: { fontSize: 13, color: "#9AA5C0", lineHeight: 1.6 },
  closeBtn: {
    background: "transparent", border: "none",
    color: C.textMuted, fontSize: 20, cursor: "pointer",
    padding: 4, flexShrink: 0, lineHeight: 1,
  },
  modalMetaRow:  { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" },
  modalMetaChip: {
    background: C.card, border: `1px solid ${C.borderLit}`,
    borderRadius: 8, padding: "10px 14px", minWidth: 85,
  },
  modalMetaLabel: { fontSize: 8, color: C.textMuted, letterSpacing: 2, marginBottom: 4, fontWeight: 700 },
  modalMetaVal:   { fontSize: 12, color: C.chrome, fontWeight: 700 },
  sectionBlock: {
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: 14, marginBottom: 10,
  },
  sectionLabel: { fontSize: 9, letterSpacing: 3, color: C.textDim, marginBottom: 8, fontWeight: 700, textTransform: "uppercase" },
  sectionText:  { fontSize: 13, color: "#9AA5C0", lineHeight: 1.6 },
  chipSmall: {
    fontSize: 10, color: C.textDim,
    background: `${C.border}88`,
    border: `1px solid ${C.borderLit}`,
    borderRadius: 4, padding: "2px 8px",
  },
  statusBtn: {
    padding: "7px 16px",
    border: "1px solid", borderRadius: 6,
    background: "transparent",
    fontSize: 10, letterSpacing: 1, fontWeight: 600,
    cursor: "pointer", fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
  },
  tabBtn: {
    padding: "7px 16px",
    background: "transparent",
    border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.textDim,
    fontSize: 10, letterSpacing: 1, fontWeight: 600,
    cursor: "pointer", fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
  },
  tabBtnActive: { borderColor: `${C.cyan}66`, color: C.cyan, background: `${C.cyan}10` },
  codeBlock: {
    background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: 16, position: "relative",
  },
  copyBtn: {
    position: "absolute", top: 10, right: 10,
    background: `${C.cyan}18`, border: `1px solid ${C.cyan}55`,
    borderRadius: 5, color: C.cyan,
    fontSize: 9, letterSpacing: 2, fontWeight: 700,
    cursor: "pointer", padding: "5px 12px",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  codeText: {
    fontSize: 12, color: "#88A8CC",
    whiteSpace: "pre-wrap", lineHeight: 1.7,
    margin: 0, paddingRight: 70,
    fontFamily: "'Courier New', monospace",
  },
  stepsList: { display: "flex", flexDirection: "column", gap: 8 },
  stepItem: {
    display: "flex", gap: 12, alignItems: "flex-start",
    background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: 12,
  },
  stepNum: {
    width: 24, height: 24, borderRadius: "50%",
    background: `${C.purple}22`, border: `1px solid ${C.purple}66`,
    color: C.purple, fontSize: 11, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  stepAction: { fontSize: 12, color: C.chrome, lineHeight: 1.6 },
  stepFile:   { fontSize: 10, color: C.purple, marginTop: 4, letterSpacing: 0.5, fontWeight: 600 },
  rawText:    { fontSize: 12, color: C.textDim, lineHeight: 1.6, fontStyle: "italic" },
  deleteBtn: {
    marginTop: 10, padding: "9px 18px",
    background: "transparent", border: `1px solid ${C.red}55`,
    borderRadius: 6, color: C.red,
    fontSize: 10, letterSpacing: 2, fontWeight: 700,
    cursor: "pointer", fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "all 0.15s",
  },
  toast: {
    position: "fixed", bottom: 28, left: "50%",
    transform: "translateX(-50%)",
    background: C.surface, border: "1px solid",
    borderRadius: 8, padding: "12px 24px",
    fontSize: 11, letterSpacing: 2, fontWeight: 600,
    zIndex: 200,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  },
};
