// ---------- utilities ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const stateKey = "quiz_state_v1";
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const moduleSel = $("#moduleSel");
const lengthBtns = $("#lengthBtns");
const startBtn = $("#startBtn");
const resumeBtn = $("#resumeBtn");
const resetAll = $("#resetAll");

const countersBox = $("#countersBox");
const runCounter = $("#runCounter");
const remainingCounter = $("#remainingCounter");
const progressBar = $("#progressBar");
const progressFill = $("#progressFill");
const progressLabel = $("#progressLabel");

const launcher = $("#launcher");
const quiz = $("#quiz");
const questionText = $("#questionText");
const optionsForm = $("#optionsForm");
const submitBtn = $("#submitBtn");
const nextBtn = $("#nextBtn");
const feedback = $("#feedback");
const answerLine = $("#answerLine");
const rationale = $("#rationale");

const summary = $("#summary");
const firstTrySummary = $("#firstTrySummary");
const firstTryPct = $("#firstTryPct");
const firstTryCount = $("#firstTryCount");
const firstTryTotal = $("#firstTryTotal");
const reviewList = $("#reviewList");
const restartBtnSummary = $("#restartBtnSummary");

// ---------- modules manifest (Cloudflare static) ----------
async function fetchModules() {
  try {
    // Read a static file committed at the repo root.
    const res = await fetch(`/modules.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("modules.json request failed");
    const data = await res.json();
    const list = Array.isArray(data.modules) ? data.modules : [];
    // filter out accidental entries
    return list.filter((m) => m && m.toLowerCase() !== "vercel");
  } catch (e) {
    console.warn("Using fallback module list:", e);
    return [
      "Module_1","Module_2","Module_3","Module_4",
      "Pharm_Quiz_1","Pharm_Quiz_2","Pharm_Quiz_3","Pharm_Quiz_4",
      "Learning_Questions_Module_1_2","Learning_Questions_Module_3_4"
    ];
  }
}

// ---------- load & normalize a bank ----------
async function loadBank(name) {
  const url = `/${encodeURIComponent(name)}.json?_=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${name}.json`);
  const raw = await res.json();
  return normalizeQuestions(raw);
}

// Try to handle different JSON shapes
function normalizeQuestions(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.questions || raw.items || []);
  const norm = [];
  for (const item of arr) {
    // text / prompt
    const text = item.question || item.q || item.prompt || item.stem || item.text || item.Question || item.title;
    // answers/choices/options
    let options = item.options || item.choices || item.answers || item.Options;
    if (!options && typeof item === "object") {
      // Sometimes stored as an object {A:"..",B:".."}
      const keys = Object.keys(item).filter(k => /^[A-Ha-h]$/.test(k));
      if (keys.length) options = keys.sort().map(k => item[k]);
    }
    if (!Array.isArray(options)) options = [];
    // correct: index or letter or exact text
    let correct = item.correct ?? item.answer ?? item.key ?? item.correctIndex ?? item.CorrectAnswer;
    let rationale = item.rationale || item.explanation || item.reason || item.why || "";

    // translate letter/text → index
    let correctIdx = -1;
    if (typeof correct === "number") {
      correctIdx = correct;
    } else if (typeof correct === "string") {
      const letterIdx = letters.indexOf(correct.trim().toUpperCase());
      if (letterIdx >= 0) correctIdx = letterIdx;
      else {
        // match by exact text
        correctIdx = options.findIndex((o) => String(o).trim() === correct.trim());
      }
    }

    // fallback: if no correct given, accept first item as correct
    if (correctIdx < 0 && options.length > 0) correctIdx = 0;

    if (text && options.length > 0) {
      norm.push({ text: String(text), options: options.map(String), correctIdx, rationale: String(rationale || "") });
    }
  }
  return norm;
}

// ---------- quiz engine ----------
let run = null;

function newRun({ moduleName, questions, length }) {
  const pool = questions.slice();
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cap = length === "full" ? pool.length : Math.min(parseInt(length, 10), pool.length);
  run = {
    moduleName,
    length: cap,
    pool: pool.slice(0, cap),
    i: 0,
    firstTryRight: 0,
    answeredOnce: false,
    review: [],
  };
  saveState();
}

function saveState() {
  try { sessionStorage.setItem(stateKey, JSON.stringify(run)); } catch {}
}
function loadState() {
  try { return JSON.parse(sessionStorage.getItem(stateKey) || ""); } catch { return null; }
}
function clearState() {
  try { sessionStorage.removeItem(stateKey); } catch {}
}

// ---------- UI helpers ----------
function setCounters() {
  if (!run) return;
  countersBox.classList.remove("hidden");
  resetAll.classList.remove("hidden");
  runCounter.textContent = `Question: ${Math.min(run.i + 1, run.length)} / ${run.length}`;
  remainingCounter.textContent = `Remaining to master: ${Math.max(0, run.length - run.firstTryRight)}`;
  const pct = Math.round((run.firstTryRight / run.length) * 100) || 0;
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute("aria-valuenow", String(pct));
  progressLabel.textContent = `${pct}% mastered`;
}

function setView(name) {
  launcher.classList.toggle("hidden", name !== "launch");
  quiz.classList.toggle("hidden", name !== "quiz");
  summary.classList.toggle("hidden", name !== "summary");
}

function renderQuestion() {
  const q = run.pool[run.i];
  questionText.textContent = q.text;
  optionsForm.innerHTML = "";

  q.options.forEach((opt, idx) => {
    const id = `opt_${idx}`;
    const row = document.createElement("label");
    row.className = "option-row";
    row.setAttribute("data-idx", String(idx));
    row.innerHTML = `
      <input type="checkbox" id="${id}" />
      <span><strong>${letters[idx] || String(idx + 1)}.</strong> ${opt}</span>
    `;
    optionsForm.appendChild(row);
  });

  submitBtn.disabled = true;
  nextBtn.classList.add("hidden");
  feedback.textContent = "";
  answerLine.textContent = "";
  rationale.classList.add("hidden");
  rationale.textContent = "";

  optionsForm.addEventListener("change", onOptionChange, { once: true });
  optionsForm.addEventListener("click", (e) => {
    const row = e.target.closest(".option-row");
    if (!row) return;
    const input = row.querySelector("input");
    input.checked = !input.checked;
    submitBtn.disabled = !$$(".option-row input:checked").length;
  });
}

function onOptionChange() {
  submitBtn.disabled = !$$(".option-row input:checked").length;
}

function grade() {
  const selectedIdxs = $$(".option-row input")
    .map((inp, i) => (inp.checked ? i : -1))
    .filter((i) => i >= 0);

  const q = run.pool[run.i];
  const isRight = selectedIdxs.length === 1 && selectedIdxs[0] === q.correctIdx;

  // first-try credit
  if (!run.answeredOnce && isRight) run.firstTryRight += 1;

  // mark UI
  $$(".option-row").forEach((row, idx) => {
    if (idx === q.correctIdx) row.classList.add("correct");
    if (selectedIdxs.includes(idx) && idx !== q.correctIdx) row.classList.add("incorrect");
  });

  feedback.textContent = isRight ? "✅ Correct!" : "❌ Not quite.";
  answerLine.textContent = `Answer: ${letters[q.correctIdx]}. ${q.options[q.correctIdx]}`;
  if (q.rationale) {
    rationale.classList.remove("hidden");
    rationale.textContent = q.rationale;
  }

  run.review.push({
    n: run.i + 1,
    text: q.text,
    correct: `${letters[q.correctIdx]}. ${q.options[q.correctIdx]}`,
    your: selectedIdxs.length ? selectedIdxs.map(i => `${letters[i]}. ${q.options[i]}`).join(", ") : "(no answer)"
  });

  submitBtn.disabled = true;
  nextBtn.classList.remove("hidden");
  run.answeredOnce = true;
  setCounters();
  saveState();
}

function next() {
  run.i += 1;
  run.answeredOnce = false;
  if (run.i >= run.length) return showSummary();
  renderQuestion();
  setCounters();
  saveState();
}

function showSummary() {
  setView("summary");
  const pct = Math.round((run.firstTryRight / run.length) * 100) || 0;
  firstTryPct.textContent = `${pct}%`;
  firstTryCount.textContent = String(run.firstTryRight);
  firstTryTotal.textContent = String(run.length);
  reviewList.innerHTML = run.review.map(r =>
    `<div class="card">
       <div><strong>Q${r.n}.</strong> ${r.text}</div>
       <div class="answer-line"><strong>Answer:</strong> ${r.correct}</div>
       <div class="answer-line"><strong>Your:</strong> ${r.your}</div>
     </div>`).join("");
  clearState();
}

// ---------- boot ----------
async function init() {
  // modules
  const mods = await fetchModules();
  moduleSel.innerHTML = mods.map(m => `<option value="${m}">${m.replaceAll("_"," ")}</option>`).join("");

  // length buttons
  let selectedLen = "10";
  lengthBtns.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $$(".seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedLen = btn.dataset.len || "10";
  });
  const firstBtn = lengthBtns.querySelector(".seg-btn");
  if (firstBtn) firstBtn.classList.add("active");

  // resume?
  const prior = loadState();
  if (prior && prior.pool && Number.isInteger(prior.i)) {
    run = prior;
    resumeBtn.classList.remove("hidden");
  } else {
    resumeBtn.classList.add("hidden");
  }

  startBtn.addEventListener("click", async () => {
    const mod = moduleSel.value;
    const bank = await loadBank(mod);
    newRun({ moduleName: mod, questions: bank, length: selectedLen });
    setView("quiz");
    renderQuestion();
    setCounters();
  });

  resumeBtn.addEventListener("click", () => {
    run = loadState();
    if (!run) return;
    setView("quiz");
    renderQuestion();
    setCounters();
  });

  resetAll.addEventListener("click", () => {
    clearState();
    location.reload();
  });

  submitBtn.addEventListener("click", (e) => { e.preventDefault(); grade(); });
  nextBtn.addEventListener("click", (e) => { e.preventDefault(); next(); });
  restartBtnSummary.addEventListener("click", () => {
    setView("launch");
    countersBox.classList.add("hidden");
  });

  // keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (!quiz || quiz.classList.contains("hidden")) return;
    const idx = letters.indexOf(e.key.toUpperCase());
    if (idx >= 0) {
      const row = optionsForm.querySelectorAll(".option-row")[idx];
      if (row) row.click();
    } else if (e.key === "Enter") {
      if (!submitBtn.disabled) submitBtn.click();
      else if (!nextBtn.classList.contains("hidden")) nextBtn.click();
    }
  });
}
document.addEventListener("DOMContentLoaded", init);
