/* Streak Lab - script.js
   - localStorage key: 'streaklab_v1'
   - Renders per-habit GitHub-style grid of last 52 weeks (53 columns to cover days)
   - Export/Import (JSON + CSV)
   - Confetti celebration on mark
*/

const LS_KEY = "streaklab_v1";
const TODAY = new Date();
const MS_DAY = 24 * 60 * 60 * 1000;
const WEEKS = 53; // approximate GitHub style width
const DAYS_PER_WEEK = 7;

const habitContainer = document.getElementById("habit-container");
const addHabitBtn = document.getElementById("add-habit");
const exportJsonBtn = document.getElementById("export-json");
const exportCsvBtn = document.getElementById("export-csv");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const totalDoneEl = document.getElementById("total-done");
const totalHabitsEl = document.getElementById("total-habits");

// Confetti setup
const confettiCanvas = document.getElementById("confetti-canvas");
confettiCanvas.width = innerWidth;
confettiCanvas.height = innerHeight;
window.addEventListener('resize', ()=>{ confettiCanvas.width = innerWidth; confettiCanvas.height = innerHeight; });
const confettiCtx = confettiCanvas.getContext('2d');
let confettiPieces = [];

// Utilities
const rand = (min,max)=> Math.random()*(max-min)+min;
const uid = ()=> Date.now().toString(36) + Math.random().toString(36).slice(2,6);

// Default palettes (vibrant, dopamine-oriented)
const PALETTES = [
  ["#ff7eb3","#ff758c","#ffb347"],
  ["#7ce1ff","#5ee7df","#a78bfa"],
  ["#ffd86b","#ffb86b","#ff8a65"],
  ["#a6ffcb","#67f3a6","#34b3ff"],
  ["#ffd6f5","#ffa6f3","#c39cff"],
  ["#b8f18b","#78ffb6","#32d6b6"],
  ["#ffd4b5","#ff8fb1","#ff6969"]
];

// Data model
let store = loadStore(); // { habits: [{id,name,color,createdAt,logs: ["YYYY-MM-DD", ...] }, ...] }

function loadStore(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) {
      const base = { habits: [] };
      localStorage.setItem(LS_KEY, JSON.stringify(base));
      return base;
    }
    return JSON.parse(raw);
  } catch(e){
    console.error("Failed to load store", e);
    return { habits: [] };
  }
}
function saveStore(){ localStorage.setItem(LS_KEY, JSON.stringify(store)); updateGlobalStats(); }

// Date helpers
function dateToISO(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10); }
function isoToDate(iso){ const p = iso.split('-'); return new Date(p[0], p[1]-1, p[2]); }
function daysBetween(a,b){ return Math.round((b - a) / MS_DAY); }

// Build the full list of dates to show (end = today, show WEEKS * 7 days)
function buildDates(){
  const totalDays = WEEKS * DAYS_PER_WEEK;
  const dates = [];
  // Start from earliest date = today - (totalDays - 1)
  const startDate = new Date(TODAY.getTime() - (totalDays - 1) * MS_DAY);
  for(let i=0;i<totalDays;i++){
    const d = new Date(startDate.getTime() + i * MS_DAY);
    dates.push(dateToISO(d));
  }
  return dates;
}
const ALL_DATES = buildDates();

// UI rendering
function render(){
  habitContainer.innerHTML = "";
  store.habits.forEach(habit => {
    habitContainer.appendChild(renderHabitCard(habit));
  });
  updateGlobalStats();
}

function renderHabitCard(habit){
  const card = document.createElement("div");
  card.className = "habit-card";
  // palette box - average color
  const palette = habit.color || PALETTES[Math.floor(Math.random()*PALETTES.length)];
  const colorStyle = `background: linear-gradient(135deg, ${palette[0]}, ${palette[1]}); color:#021426;`;

  const head = document.createElement("div");
  head.className = "habit-head";
  head.innerHTML = `
    <div class="habit-title">
      <div class="color-dot" style="${colorStyle}">${habit.name[0].toUpperCase()}</div>
      <div>
        <h3 class="habit-name">${escapeHtml(habit.name)}</h3>
        <div class="muted small">${new Date(habit.createdAt).toLocaleDateString()}</div>
      </div>
    </div>
    <div class="habit-meta">
      <div class="small">Current streak: <strong id="cur-${habit.id}">0</strong></div>
      <div class="small">Best: <strong id="best-${habit.id}">0</strong></div>
    </div>
  `;

  // Grid
  const grid = document.createElement("div");
  grid.className = "grid";
  // each cell corresponds to a date in ALL_DATES
  ALL_DATES.forEach(dateISO => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.date = dateISO;
    if(habit.logs.includes(dateISO)){
      cell.classList.add("done");
      cell.style.background = `linear-gradient(135deg, ${palette[1]}, ${palette[0]})`;
    } else {
      cell.style.background = "rgba(255,255,255,0.02)";
    }

    // tooltip-ish title
    cell.title = `${dateISO} · ${habit.logs.includes(dateISO) ? 'done' : 'not done'}`;

    // click handler toggles
    cell.addEventListener("click", (e) => {
      toggleHabitDay(habit.id, dateISO, cell, palette);
    });

    grid.appendChild(cell);
  });

  // footer with actions
  const footer = document.createElement("div");
  footer.className = "habit-footer";
  footer.innerHTML = `
    <div class="badge small">Total: <span id="total-${habit.id}">0</span></div>
    <div style="display:flex;gap:8px;align-items:center;">
      <button class="btn ghost" data-edit="${habit.id}">Rename</button>
      <button class="btn ghost" data-delete="${habit.id}">Delete</button>
    </div>
  `;

  // listeners for rename/delete
  footer.querySelector('[data-edit]').addEventListener('click', ()=> renameHabit(habit.id));
  footer.querySelector('[data-delete]').addEventListener('click', ()=> deleteHabit(habit.id));

  card.appendChild(head);
  card.appendChild(grid);
  card.appendChild(footer);

  // compute streaks and totals
  computeAndDisplayStats(habit);

  return card;
}

// Escape HTML helper for safety
function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

// Toggle marking
function toggleHabitDay(habitId, dateISO, cellEl, palette){
  const habit = store.habits.find(h => h.id === habitId);
  if(!habit) return;
  const idx = habit.logs.indexOf(dateISO);
  if(idx >= 0){
    habit.logs.splice(idx,1);
    // visual unmark
    cellEl.classList.remove("done");
    cellEl.style.background = "rgba(255,255,255,0.02)";
  } else {
    habit.logs.push(dateISO);
    // Keep logs sorted
    habit.logs.sort();
    // visual mark
    cellEl.classList.add("done");
    cellEl.style.background = `linear-gradient(135deg, ${palette[1]}, ${palette[0]})`;
    // celebration only when marking as done
    launchConfetti();
    animatePulse(cellEl);
  }
  saveStore();
  computeAndDisplayStats(habit);
  updateGlobalStats();
}

// compute current and best streak + totals
function computeAndDisplayStats(habit){
  // build a set for faster lookup
  const set = new Set(habit.logs);
  const totalEl = document.getElementById(`total-${habit.id}`);
  if(totalEl) totalEl.textContent = habit.logs.length;

  // compute current streak: count consecutive days up to today
  let cur = 0;
  for(let i=0;i<365;i++){
    const d = new Date(TODAY.getTime() - i*MS_DAY);
    const iso = dateToISO(d);
    if(set.has(iso)) cur++;
    else break;
  }

  // best streak: scan logs for longest run
  const arr = Array.from(set).sort();
  let best = 0, run = 0;
  for(let i=0;i<arr.length;i++){
    if(i===0){ run=1; }
    else {
      const prev = isoToDate(arr[i-1]);
      const curr = isoToDate(arr[i]);
      if(daysBetween(prev,curr) === 1) run++;
      else run = 1;
    }
    if(run>best) best = run;
  }

  const curEl = document.getElementById(`cur-${habit.id}`);
  const bestEl = document.getElementById(`best-${habit.id}`);
  if(curEl) curEl.textContent = cur;
  if(bestEl) bestEl.textContent = best;
}

// Add / delete / rename
addHabitBtn.addEventListener('click', ()=> {
  const name = prompt("Enter habit name (short):");
  if(!name) return;
  const id = uid();
  const palette = PALETTES[Math.floor(Math.random()*PALETTES.length)];
  store.habits.unshift({
    id, name: name.trim(), color: palette, createdAt: new Date().toISOString(), logs: []
  });
  saveStore();
  render();
});

function renameHabit(id){
  const habit = store.habits.find(h=>h.id===id);
  if(!habit) return;
  const n = prompt("New name:", habit.name);
  if(n && n.trim()){
    habit.name = n.trim();
    saveStore();
    render();
  }
}

function deleteHabit(id){
  if(!confirm("Delete habit and its history? This cannot be undone.")) return;
  store.habits = store.habits.filter(h=>h.id!==id);
  saveStore();
  render();
}

// Export / Import
exportJsonBtn.addEventListener('click', ()=> {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `streaklab-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

exportCsvBtn.addEventListener('click', ()=> {
  // Build CSV: Date,habit1,habit2...
  const dates = ALL_DATES;
  const headers = ['date', ...store.habits.map(h=>h.name)];
  const rows = [headers.join(',')];
  dates.forEach(d => {
    const row = [d];
    store.habits.forEach(h => row.push(h.logs.includes(d) ? 1 : 0));
    rows.push(row.join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `streaklab-csv-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if(data && data.habits){
        if(confirm("Import will replace your current data. Continue?")){
          store = data;
          saveStore();
          render();
        }
      } else alert("Invalid file format.");
    } catch(err){ alert("Failed to parse file."); }
  };
  reader.readAsText(f);
});

// Reset
document.getElementById('reset-data').addEventListener('click', ()=>{
  if(confirm("Reset ALL data? This will delete everything.")){
    store = { habits: [] };
    saveStore();
    render();
  }
});

// Compute global stats
function updateGlobalStats(){
  const totalHabits = store.habits.length;
  const totalDone = store.habits.reduce((s,h)=> s + h.logs.length, 0);
  totalHabitsEl.textContent = totalHabits;
  totalDoneEl.textContent = totalDone;
}

// Animations
function animatePulse(el){
  el.animate([{ transform: 'scale(1.05)' }, { transform:'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.2,1)'});
}

// Confetti simple engine
function launchConfetti(){
  for(let i=0;i<30;i++){
    confettiPieces.push({
      x: rand(0, confettiCanvas.width),
      y: rand(-40, -10),
      vx: rand(-1.5, 1.5),
      vy: rand(2, 6),
      rot: rand(0, 360),
      vr: rand(-6,6),
      size: rand(6,12),
      color: `hsl(${Math.floor(rand(0,360))},70%,60%)`,
      life: 0
    });
  }
}

function drawConfetti(){
  confettiCtx.clearRect(0,0, confettiCanvas.width, confettiCanvas.height);
  for(let i=confettiPieces.length-1;i>=0;i--){
    const p = confettiPieces[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12; // gravity
    p.rot += p.vr;
    p.life++;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate((p.rot * Math.PI)/180);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
    confettiCtx.restore();
    if(p.y > confettiCanvas.height + 60 || p.life > 200) confettiPieces.splice(i,1);
  }
  if(confettiPieces.length) requestAnimationFrame(drawConfetti);
}
requestAnimationFrame(drawConfetti);

// Initial render
render();

// Register simple service worker for PWA offline support (optional)
if('serviceWorker' in navigator){
  try{
    navigator.serviceWorker.register('/sw.js').catch(()=>{/* ignore errors on deploy preview */});
  }catch(e){}
}

/* Utilities for demos / dev */
window.__streaklab = { store, saveStore, render, ALL_DATES };
