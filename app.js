"use strict";

const SUBJECTS = [
  { code: "st",    name: "Sportovní trénink",   quota: 6 },
  { code: "anat",  name: "Anatomie a kineziologie", quota: 5 },
  { code: "psych", name: "Psychologie sportu",  quota: 4 },
  { code: "fyz",   name: "Fyziologie",          quota: 4 },
  { code: "ped",   name: "Pedagogika",          quota: 3 },
  { code: "vyz",   name: "Výživa",              quota: 2 },
  { code: "pp",    name: "První pomoc",         quota: 2 },
  { code: "kc",    name: "Kompenzační cvičení", quota: 2 },
  { code: "mgmt",  name: "Management",          quota: 1 },
  { code: "dop",   name: "Doping",              quota: 1 },
  { code: "prav",  name: "Právo",               quota: 1 },
];
const SUBJ = Object.fromEntries(SUBJECTS.map(s => [s.code, s]));
const EXAM_N = 31, EXAM_PASS = 21, EXAM_MIN = 25;
const TEST_DATE = new Date("2026-10-15T13:00:00+02:00");
const STORE_KEY = "kvizb-v1";
const LETTERS = ["A", "B", "C", "D"];

let QS = [], BYID = {};
let S = loadState();
let session = null;   // current practice or exam session
let timerId = null;

const $app = document.getElementById("app");

/* ---------- storage ---------- */
function loadState() {
  const empty = { q: {}, exams: [], settings: { subjects: [], tier: "all" } };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return empty;
    const s = JSON.parse(raw);
    return { ...empty, ...s, settings: { ...empty.settings, ...(s.settings || {}) } };
  } catch (e) { return empty; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
}
function st(id) { return S.q[id] || { b: 0, c: 0, w: 0, t: 0 }; }
function record(id, correct) {
  const r = { ...st(id) };
  if (correct) { r.b = Math.min(r.b + 1, 5); r.c++; } else { r.b = 0; r.w++; }
  r.t = Date.now();
  S.q[id] = r;
  saveState();
}

/* ---------- helpers ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function stars(t) { return "★".repeat(t); }
function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
function toast(msg) {
  const d = document.createElement("div"); d.className = "toast"; d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2200);
}
function weightedPick(items, weightFn) {
  let total = 0; const ws = items.map(x => { const w = weightFn(x); total += w; return w; });
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function isMistake(q) { const r = st(q.id); return r.w > 0 && r.b < 2; }
function mastered(q) { return st(q.id).b >= 2; }
function selectedSubjects() { return S.settings.subjects.length ? S.settings.subjects : SUBJECTS.map(s => s.code); }
function tierOk(q) { const t = S.settings.tier; return t === "all" || (t === "23" ? q.tier >= 2 : q.tier === 3); }

/* ---------- home ---------- */
function home() {
  stopTimer(); session = null;
  const days = Math.ceil((TEST_DATE - new Date()) / 86400000);
  const total = QS.length, mast = QS.filter(mastered).length, seen = QS.filter(q => st(q.id).t).length;
  const mistakes = QS.filter(isMistake).length;
  const lastExams = S.exams.slice(-3).reverse();
  const sel = new Set(selectedSubjects());

  $app.innerHTML = `
    <div class="top"><h1>Kvíz B</h1><span class="muted">${days > 0 ? `test za ${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"}` : "test je dnes"}</span></div>
    <div class="card">
      <div class="row"><div><b>${mast}</b> / ${total} zvládnuto</div><div class="muted" style="text-align:right">${seen} viděno · ${mistakes} v chybníku</div></div>
      <div class="bar" style="margin-top:8px"><i style="width:${pct(mast, total)}%"></i></div>
      <div class="muted small" style="margin-top:6px">Zvládnuto = 2× za sebou správně.</div>
    </div>

    <button class="btn primary" id="go-train">Trénovat<span class="sub">vybrané předměty, nejdřív nové a chybné otázky</span></button>
    <button class="btn" id="go-mist">Chybník (${mistakes})<span class="sub">jen to, co jsi netrefil, dokud to 2× nedáš</span></button>
    <button class="btn" id="go-exam">Zkouška nanečisto<span class="sub">31 otázek · ${EXAM_MIN} minut · poměr předmětů jako v testu</span></button>
    <button class="btn" id="go-pre">Přehled otázek<span class="sub">celý seznam s odpověďmi po předmětech</span></button>

    <h2>Předměty pro trénink</h2>
    <div class="chips" id="chips">
      ${SUBJECTS.map(s => `<span class="chip ${sel.has(s.code) && S.settings.subjects.length ? "on" : ""}" data-c="${s.code}">${esc(s.name)}</span>`).join("")}
    </div>
    <div class="muted small" style="margin-top:6px">${S.settings.subjects.length ? "" : "Nic nevybráno = všechny předměty."}</div>
    <h2>Jistota otázek</h2>
    <div class="chips" id="tiers">
      <span class="chip ${S.settings.tier === "3" ? "on" : ""}" data-t="3">jen ★★★</span>
      <span class="chip ${S.settings.tier === "23" ? "on" : ""}" data-t="23">★★★ + ★★</span>
      <span class="chip ${S.settings.tier === "all" ? "on" : ""}" data-t="all">všechny</span>
    </div>

    <h2>Pokrok po předmětech</h2>
    <div class="card">${SUBJECTS.map(s => {
      const qs = QS.filter(q => q.subject === s.code); const m = qs.filter(mastered).length; const mi = qs.filter(isMistake).length;
      return `<div class="subj"><div>${esc(s.name)}</div><div class="n">${m}/${qs.length}${mi ? ` · ${mi} chyb` : ""}</div><div class="bar"><i style="width:${pct(m, qs.length)}%"></i></div></div>`;
    }).join("")}</div>

    ${lastExams.length ? `<h2>Poslední zkoušky nanečisto</h2><div class="card">${lastExams.map(e =>
      `<div class="subj"><div>${new Date(e.date).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</div><div class="${e.score >= EXAM_PASS ? "pass" : "fail"}"><b>${e.score}/${e.n}</b></div></div>`).join("")}</div>` : ""}

    <h2>Další</h2>
    <button class="btn" id="go-export">Zkopírovat chyby pro Clauda<span class="sub">vloží se jako text do schránky</span></button>
    <button class="btn" id="go-reset">Smazat pokrok<span class="sub">vynuluje statistiky v tomto telefonu</span></button>
    <p class="muted small center">${total} otázek · pokrok se ukládá jen v tomto prohlížeči</p>`;

  document.getElementById("go-train").onclick = () => startPractice("train");
  document.getElementById("go-mist").onclick = () => startPractice("mist");
  document.getElementById("go-exam").onclick = startExam;
  document.getElementById("go-pre").onclick = prehled;
  document.getElementById("go-export").onclick = exportMistakes;
  document.getElementById("go-reset").onclick = () => {
    if (confirm("Opravdu smazat všechen pokrok?")) { S.q = {}; S.exams = []; saveState(); home(); }
  };
  document.querySelectorAll("#chips .chip").forEach(el => el.onclick = () => {
    const c = el.dataset.c; const set = new Set(S.settings.subjects);
    set.has(c) ? set.delete(c) : set.add(c);
    S.settings.subjects = SUBJECTS.map(s => s.code).filter(x => set.has(x)); saveState(); home();
  });
  document.querySelectorAll("#tiers .chip").forEach(el => el.onclick = () => { S.settings.tier = el.dataset.t; saveState(); home(); });
  window.scrollTo(0, 0);
}

/* ---------- practice ---------- */
function practicePool(mode) {
  if (mode === "mist") return QS.filter(isMistake);
  const subs = new Set(selectedSubjects());
  return QS.filter(q => subs.has(q.subject) && tierOk(q));
}
function startPractice(mode) {
  const pool = practicePool(mode);
  if (!pool.length) { toast(mode === "mist" ? "Chybník je prázdný 🎉" : "Žádné otázky pro tenhle výběr"); return; }
  session = { kind: "practice", mode, recent: [], done: 0, right: 0 };
  nextPractice();
}
function practiceWeight(q) {
  const r = st(q.id);
  let w;
  if (!r.t) w = 3; else if (r.b === 0) w = 6; else if (r.b === 1) w = 3; else if (r.b === 2) w = 1.2; else if (r.b === 3) w = 0.6; else w = 0.25;
  return w * (q.tier === 3 ? 1.6 : q.tier === 2 ? 1.25 : 1);
}
function nextPractice() {
  let pool = practicePool(session.mode);
  if (!pool.length) { toast("Chybník je prázdný 🎉"); home(); return; }
  const keep = Math.min(10, pool.length - 1);
  const recent = new Set(session.recent.slice(-keep));
  let cand = pool.filter(q => !recent.has(q.id));
  if (!cand.length) cand = pool;
  // Nejdřív předmět podle váhy v testu (jinak by přehlušila Anatomie se 185 otázkami),
  // pak otázka v něm podle Leitnerova boxu a jistoty.
  const subs = [...new Set(cand.map(q => q.subject))];
  const sub = weightedPick(subs, c => SUBJ[c]?.quota || 1);
  const q = weightedPick(cand.filter(x => x.subject === sub), practiceWeight);
  session.recent.push(q.id);
  session.current = { q, order: shuffle([0, 1, 2, 3]), answered: null };
  renderPractice();
}
function questionHtml(q, order, chosen, reveal) {
  const r = st(q.id);
  return `
    <div class="meta"><span class="tag">${esc(SUBJ[q.subject]?.name || q.subject)}</span><span class="tag">${stars(q.tier)}</span>${q.repeat || r.w ? `<span class="tag rep">🔁 ${r.w ? `${r.w}× chyba` : "chybník"}</span>` : ""}</div>
    <div class="stem">${esc(q.q)}</div>
    ${order.map((oi, k) => {
      let cls = "opt";
      if (reveal) { if (oi === q.answer) cls += " ok"; else if (oi === chosen) cls += " bad"; }
      else if (oi === chosen) cls += " sel";
      return `<button class="${cls}" data-o="${oi}" ${reveal ? "disabled" : ""}><span class="k">${LETTERS[k]}</span><span>${esc(q.options[oi])}</span></button>`;
    }).join("")}`;
}
function renderPractice() {
  const { q, order, answered } = session.current;
  const reveal = answered !== null;
  const ok = reveal && answered === q.answer;
  $app.innerHTML = `
    <div class="top"><button class="link" id="back">‹ Domů</button><span class="muted">${session.mode === "mist" ? "Chybník · " : ""}${session.right}/${session.done}</span></div>
    <div class="card">${questionHtml(q, order, answered, reveal)}
      ${reveal ? `<div class="explain ${ok ? "ok" : "bad"}"><b>${ok ? "Správně." : "Špatně."}</b> ${esc(q.explain || "")}<div class="src">${esc(q.source || "")}</div></div>` : ""}
    </div>
    ${reveal ? `<div class="sticky"><button class="btn primary" id="next">Další</button></div>` : ""}`;
  document.getElementById("back").onclick = home;
  if (!reveal) document.querySelectorAll(".opt").forEach(b => b.onclick = () => {
    const o = +b.dataset.o; session.current.answered = o;
    const good = o === q.answer; record(q.id, good); session.done++; if (good) session.right++;
    renderPractice();
  });
  else document.getElementById("next").onclick = nextPractice;
  window.scrollTo(0, 0);
}

/* ---------- exam ---------- */
function startExam() {
  const picked = [];
  for (const s of SUBJECTS) {
    let pool = QS.filter(q => q.subject === s.code);
    for (let i = 0; i < s.quota && pool.length; i++) {
      const q = weightedPick(pool, x => x.tier === 3 ? 3 : x.tier === 2 ? 2 : 1);
      picked.push(q); pool = pool.filter(x => x.id !== q.id);
    }
  }
  const qs = shuffle(picked).slice(0, EXAM_N);
  session = { kind: "exam", items: qs.map(q => ({ q, order: shuffle([0, 1, 2, 3]), chosen: null })), i: 0, end: Date.now() + EXAM_MIN * 60000 };
  startTimer(); renderExam();
}
function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    const el = document.getElementById("timer"); const left = session && session.end - Date.now();
    if (!session || session.kind !== "exam") return stopTimer();
    if (left <= 0) { stopTimer(); finishExam(); return; }
    if (el) { el.textContent = fmt(left); el.classList.toggle("low", left < 3 * 60000); }
  }, 500);
}
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function renderExam() {
  const it = session.items[session.i]; const n = session.items.length;
  const answered = session.items.filter(x => x.chosen !== null).length;
  $app.innerHTML = `
    <div class="top"><button class="link" id="quit">‹ Ukončit</button><span class="timer" id="timer">${fmt(session.end - Date.now())}</span><span class="muted">${session.i + 1}/${n}</span></div>
    <div class="card">${questionHtml(it.q, it.order, it.chosen, false).replace(/<span class="tag rep">.*?<\/span>/, "")}</div>
    <div class="row"><button class="btn center" id="prev" ${session.i === 0 ? "disabled" : ""}>‹ Předchozí</button><button class="btn center" id="nxt">${session.i === n - 1 ? "Na konec" : "Další ›"}</button></div>
    <button class="btn primary" id="submit">Odevzdat (${answered}/${n} zodpovězeno)</button>
    <div class="chips" style="margin-top:8px">${session.items.map((x, k) => `<span class="chip ${x.chosen !== null ? "on" : ""}" data-j="${k}" style="${k === session.i ? "outline:2px solid var(--accent)" : ""}">${k + 1}</span>`).join("")}</div>`;
  document.querySelectorAll(".opt").forEach(b => b.onclick = () => { it.chosen = +b.dataset.o; renderExam(); });
  document.getElementById("prev").onclick = () => { session.i = Math.max(0, session.i - 1); renderExam(); };
  document.getElementById("nxt").onclick = () => { session.i = Math.min(n - 1, session.i + 1); renderExam(); };
  document.getElementById("submit").onclick = () => {
    const left = session.items.filter(x => x.chosen === null).length;
    if (!left || confirm(`Nezodpovězeno ${left}. Přesto odevzdat?`)) finishExam();
  };
  document.getElementById("quit").onclick = () => { if (confirm("Ukončit zkoušku bez vyhodnocení?")) home(); };
  document.querySelectorAll(".chips .chip").forEach(c => c.onclick = () => { session.i = +c.dataset.j; renderExam(); });
}
function finishExam() {
  stopTimer();
  const items = session.items;
  let score = 0; const bySub = {};
  for (const it of items) {
    const ok = it.chosen === it.q.answer; if (ok) score++;
    if (it.chosen !== null) record(it.q.id, ok); else record(it.q.id, false);
    const b = bySub[it.q.subject] || (bySub[it.q.subject] = { ok: 0, n: 0 }); b.n++; if (ok) b.ok++;
  }
  S.exams.push({ date: Date.now(), score, n: items.length }); saveState();
  const wrong = items.filter(it => it.chosen !== it.q.answer);
  const pass = score >= EXAM_PASS;
  session = { kind: "result" };
  $app.innerHTML = `
    <div class="top"><button class="link" id="back">‹ Domů</button><span class="muted">Výsledek</span></div>
    <div class="card center"><div class="big ${pass ? "pass" : "fail"}">${score} / ${items.length}</div><div>${pass ? "Prošel bys ✔" : `Na úspěch chybí ${EXAM_PASS - score}`} · hranice ${EXAM_PASS}</div></div>
    <div class="card">${SUBJECTS.filter(s => bySub[s.code]).map(s => `<div class="subj"><div>${esc(s.name)}</div><div class="n">${bySub[s.code].ok}/${bySub[s.code].n}</div></div>`).join("")}</div>
    ${wrong.length ? `<h2>Chyby (${wrong.length}), přidány do chybníku</h2>` : "<h2>Bez chyby!</h2>"}
    ${wrong.map(it => `<div class="card">
      <div class="meta"><span class="tag">${esc(SUBJ[it.q.subject]?.name || "")}</span><span class="tag">${stars(it.q.tier)}</span></div>
      <div class="stem">${esc(it.q.q)}</div>
      ${it.chosen !== null ? `<div class="opt bad" style="cursor:default"><span class="k">✗</span><span>${esc(it.q.options[it.chosen])}</span></div>` : `<div class="muted small">nezodpovězeno</div>`}
      <div class="opt ok" style="cursor:default"><span class="k">✓</span><span>${esc(it.q.options[it.q.answer])}</span></div>
      <div class="explain">${esc(it.q.explain || "")}<div class="src">${esc(it.q.source || "")}</div></div></div>`).join("")}
    <button class="btn primary" id="again">Další zkouška</button>`;
  document.getElementById("back").onclick = home;
  document.getElementById("again").onclick = startExam;
  window.scrollTo(0, 0);
}

/* ---------- overview ---------- */
async function prehled() {
  stopTimer(); session = null;
  $app.innerHTML = `<div class="top"><button class="link" id="back">‹ Domů</button><span class="muted">Přehled</span></div><div class="prehled" id="pre"><p class="muted">Načítám…</p></div>`;
  document.getElementById("back").onclick = home;
  try {
    const r = await fetch("prehled.html"); document.getElementById("pre").innerHTML = await r.text();
  } catch (e) { document.getElementById("pre").innerHTML = `<p class="muted">Přehled se nepodařilo načíst (offline a ještě neuložený).</p>`; }
  window.scrollTo(0, 0);
}

/* ---------- export ---------- */
async function exportMistakes() {
  const list = QS.filter(q => st(q.id).w > 0).sort((a, b) => st(b.id).w - st(a.id).w || st(a.id).b - st(b.id).b);
  if (!list.length) { toast("Zatím žádné chyby"); return; }
  const lines = list.map(q => { const r = st(q.id); return `[${SUBJ[q.subject]?.name}] ${q.q} → ${q.options[q.answer]} (chyb ${r.w}, teď ${r.b >= 2 ? "zvládnuto" : "ještě ne"})`; });
  const text = `Moje chyby z Kvízu B (${new Date().toLocaleString("cs-CZ")}):\n` + lines.join("\n");
  try { await navigator.clipboard.writeText(text); toast(`Zkopírováno ${list.length} chyb`); }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(`Zkopírováno ${list.length} chyb`); } catch (e2) { alert(text); }
    ta.remove();
  }
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const r = await fetch("questions.json"); QS = await r.json();
  } catch (e) { $app.innerHTML = `<p>Otázky se nepodařilo načíst. Zkus to znovu s připojením.</p>`; return; }
  BYID = Object.fromEntries(QS.map(q => [q.id, q]));
  home();
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
boot();
