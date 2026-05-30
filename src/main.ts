import "./style.css";

type Envelope = {
  prize: string;
  value: number | null;
  opened: boolean;
};

const app = document.querySelector<HTMLDivElement>("#app")!;

let envelopes: Envelope[] = [];
let lastPrizes = "5000, 1000, 500, 5000";
let maxValue = 0;
let soundOn = true;

/* ----------------------------- parsing ----------------------------- */

function parsePrizes(raw: string): string[] {
  return raw
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toValue(prize: string): number | null {
  const cleaned = prize.replace(/[\s.]/g, "").replace(/kr$/i, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildEnvelopes(prizes: string[]): Envelope[] {
  const built = shuffle(prizes).map((prize) => ({
    prize,
    value: toValue(prize),
    opened: false,
  }));
  maxValue = Math.max(0, ...built.map((e) => e.value ?? 0));
  return built;
}

function formatNumber(n: number): string {
  return n.toLocaleString("sv-SE");
}

/* ------------------------------ sound ------------------------------ */

let audioCtx: AudioContext | null = null;

function ensureAudio() {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function playOpen() {
  if (!soundOn) return;
  const ctx = ensureAudio();
  const dur = 0.28;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 900;
  const gain = ctx.createGain();
  gain.gain.value = 0.22;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

function playReveal(jackpot: boolean) {
  if (!soundOn) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const notes = jackpot ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = ctx.createGain();
    const t = now + i * 0.085;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  });
}

/* ---------------------------- confetti ----------------------------- */

const CONFETTI_COLORS = ["#FFD700", "#FF6B6B", "#4ECDC4", "#FFE66D", "#FF8C42", "#A06CD5", "#ffffff"];

function confettiBurst(x: number, y: number, amount = 30) {
  for (let i = 0; i < amount; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    const angle = Math.random() * Math.PI * 2;
    const velocity = 60 + Math.random() * 150;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.setProperty("--dx", `${Math.cos(angle) * velocity}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * velocity - 90}px`);
    p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    document.body.appendChild(p);
    window.setTimeout(() => p.remove(), 1300);
  }
}

/* --------------------------- count-up ------------------------------ */

function countUp(el: HTMLElement, target: number, duration = 950) {
  const start = performance.now();
  function frame(now: number) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatNumber(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = formatNumber(target);
  }
  requestAnimationFrame(frame);
  // Guarantee the final value even if rAF is paused (e.g. tab backgrounded mid-reveal).
  window.setTimeout(() => {
    el.textContent = formatNumber(target);
  }, duration + 80);
}

/* ----------------------------- views ------------------------------- */

function setupView() {
  app.innerHTML = `
    <section class="setup">
      <h1 class="brand">MysteryBounty</h1>
      <p class="tagline">Lägg in priserna, förslut dem i hemliga kuvert &mdash; och låt ödet avgöra.</p>
      <div class="field">
        <label for="prizes">Priser (separera med komma)</label>
        <input id="prizes" type="text" autocomplete="off" spellcheck="false"
          placeholder="5000, 1000, 500, 5000" value="${escapeHtml(lastPrizes)}" />
      </div>
      <div class="chips" id="chips"></div>
      <button class="btn" id="createBtn">Skapa kuvert</button>
      <small class="hint" id="hint"></small>
    </section>
  `;

  const input = app.querySelector<HTMLInputElement>("#prizes")!;
  const chips = app.querySelector<HTMLDivElement>("#chips")!;
  const hint = app.querySelector<HTMLElement>("#hint")!;
  const createBtn = app.querySelector<HTMLButtonElement>("#createBtn")!;

  function refresh() {
    const prizes = parsePrizes(input.value);
    chips.innerHTML = prizes.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join("");
    const n = prizes.length;
    hint.textContent = n === 0 ? "Lägg in minst ett pris." : `${n} hemliga kuvert skapas, blandade i slumpmässig ordning.`;
    createBtn.disabled = n === 0;
    lastPrizes = input.value;
  }

  input.addEventListener("input", refresh);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !createBtn.disabled) start();
  });
  createBtn.addEventListener("click", start);

  function start() {
    const prizes = parsePrizes(input.value);
    if (prizes.length === 0) return;
    envelopes = buildEnvelopes(prizes);
    revealView();
  }

  refresh();
  input.focus();
}

function revealView() {
  const total = envelopes.length;
  app.innerHTML = `
    <section class="reveal">
      <div class="topbar">
        <button class="btn ghost" id="backBtn">&larr; Nytt</button>
        <h1 class="brand">MysteryBounty</h1>
        <button class="btn ghost" id="soundBtn">${soundOn ? "Ljud: på" : "Ljud: av"}</button>
      </div>
      <div class="stats">
        Avslöjat <b id="openedCount">0</b> / ${total}
        &nbsp;&middot;&nbsp; Summa <b id="revealedTotal">0</b>
      </div>
      <div class="envelopes" id="envelopes">
        ${envelopes.map((_, i) => envelopeHtml(i)).join("")}
      </div>
      <div class="actions">
        <button class="btn" id="revealAllBtn">Öppna alla</button>
        <button class="btn ghost" id="shuffleBtn">Blanda om</button>
      </div>
    </section>
  `;

  app.querySelector<HTMLButtonElement>("#backBtn")!.addEventListener("click", setupView);
  app.querySelector<HTMLButtonElement>("#shuffleBtn")!.addEventListener("click", () => {
    envelopes = buildEnvelopes(envelopes.map((e) => e.prize));
    revealView();
  });
  const soundBtn = app.querySelector<HTMLButtonElement>("#soundBtn")!;
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "Ljud: på" : "Ljud: av";
    if (soundOn) ensureAudio();
  });
  app.querySelector<HTMLButtonElement>("#revealAllBtn")!.addEventListener("click", revealAll);

  app.querySelectorAll<HTMLDivElement>(".envelope-wrap").forEach((wrap) => {
    wrap.addEventListener("click", () => {
      const i = Number(wrap.dataset.i);
      openSqueeze(i);
    });
  });
}

function envelopeHtml(i: number): string {
  return `
    <div class="envelope-wrap" data-i="${i}">
      <div class="prize-card">
        <span class="card-label">Pris</span>
        <span class="card-value">?</span>
      </div>
      <div class="envelope">
        <div class="envelope-back"></div>
        <div class="pocket-front"></div>
        <div class="flap"></div>
        <div class="seal">?</div>
      </div>
      <div class="tap-hint">Tryck för att öppna</div>
    </div>
  `;
}

/* ------------------------- squeeze reveal --------------------------- */

function isJackpotEnv(env: Envelope): boolean {
  return env.value !== null && env.value === maxValue && maxValue > 0;
}

// Fill the small grid card as a persistent record of an opened envelope.
function fillGridCard(wrap: HTMLElement, env: Envelope) {
  const card = wrap.querySelector<HTMLDivElement>(".prize-card")!;
  const valueEl = card.querySelector<HTMLSpanElement>(".card-value")!;
  valueEl.textContent = env.value !== null ? formatNumber(env.value) : env.prize;
  if (env.value !== null && !card.querySelector(".card-currency")) {
    const cur = document.createElement("span");
    cur.className = "card-currency";
    cur.textContent = "kr";
    card.appendChild(cur);
  }
  if (isJackpotEnv(env) && !card.querySelector(".jackpot-tag")) {
    card.classList.add("jackpot");
    const tag = document.createElement("span");
    tag.className = "jackpot-tag";
    tag.textContent = "STORVINST";
    card.appendChild(tag);
  }
  wrap.classList.add("opened");
}

// Focused, draggable "card squeeze": slide the cover out to the left so the
// prize digits emerge one at a time, from right to left.
function openSqueeze(i: number) {
  const env = envelopes[i];
  if (!env || env.opened) return;
  ensureAudio();
  playOpen();

  const jackpot = isJackpotEnv(env);
  const display = env.value !== null ? formatNumber(env.value) : env.prize;
  const digits = [...display].map((c) => `<span class="dig">${escapeHtml(c)}</span>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="squeeze${jackpot ? " jackpot" : ""}">
      <button class="squeeze-close" aria-label="Stäng">&times;</button>
      <div class="squeeze-stage">
        <div class="squeeze-prize">
          <span class="squeeze-label">Pris</span>
          <span class="squeeze-number">${digits}</span>
          ${env.value !== null ? '<span class="squeeze-cur">kr</span>' : ""}
        </div>
        <div class="squeeze-cover">
          <div class="cover-shine"></div>
          <span class="cover-q">?</span>
        </div>
      </div>
      <p class="squeeze-hint">Dra kortet åt vänster för att avslöja</p>
      <button class="btn squeeze-action">Visa hela</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const stage = overlay.querySelector<HTMLElement>(".squeeze-stage")!;
  const cover = overlay.querySelector<HTMLElement>(".squeeze-cover")!;
  const digs = [...overlay.querySelectorAll<HTMLElement>(".dig")];
  const hint = overlay.querySelector<HTMLElement>(".squeeze-hint")!;
  const action = overlay.querySelector<HTMLButtonElement>(".squeeze-action")!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>(".squeeze-close")!;

  let width = stage.clientWidth;
  let tx = 0;
  let dragging = false;
  let startX = 0;
  let done = false;

  // Light up each digit the moment the cover's right edge clears it.
  function applyTx(v: number) {
    tx = Math.max(-width, Math.min(0, v));
    cover.style.transform = `translateX(${tx}px)`;
    const coverRight = stage.getBoundingClientRect().left + width + tx;
    for (const d of digs) {
      if (d.getBoundingClientRect().left >= coverRight - 2) d.classList.add("lit");
    }
  }

  function animateTo(target: number, cb?: () => void) {
    const from = tx;
    const start = performance.now();
    const dur = 320;
    function step(now: number) {
      const t = Math.min(1, (now - start) / dur);
      applyTx(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
      else cb?.();
    }
    requestAnimationFrame(step);
  }

  function reveal() {
    if (done) return;
    done = true;
    env.opened = true;
    cover.classList.add("gone");
    for (const d of digs) d.classList.add("lit");
    playReveal(jackpot);
    const r = stage.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top + r.height / 2, jackpot ? 70 : 38);
    hint.textContent = jackpot ? "STORVINST!" : "Avslöjat!";
    action.textContent = "Klar";
    const wrap = app.querySelector<HTMLElement>(`.envelope-wrap[data-i="${i}"]`);
    if (wrap) fillGridCard(wrap, env);
    updateStats();
  }

  function finish() {
    if (!done) animateTo(-width, reveal);
  }

  function close() {
    overlay.classList.remove("show");
    document.removeEventListener("keydown", onKey);
    window.setTimeout(() => overlay.remove(), 320);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  cover.addEventListener("pointerdown", (e) => {
    if (done) return;
    dragging = true;
    width = stage.clientWidth;
    startX = e.clientX - tx;
    try {
      cover.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported for this pointer */
    }
  });
  cover.addEventListener("pointermove", (e) => {
    if (!dragging || done) return;
    applyTx(e.clientX - startX);
    if (tx <= -width * 0.85) {
      dragging = false;
      finish();
    }
  });
  cover.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      cover.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (tx <= -width * 0.5) finish();
    else animateTo(0);
  });

  action.addEventListener("click", () => (done ? close() : finish()));
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
}

function revealAll() {
  let delay = 0;
  envelopes.forEach((env, i) => {
    if (env.opened) return;
    window.setTimeout(() => {
      env.opened = true;
      const wrap = app.querySelector<HTMLElement>(`.envelope-wrap[data-i="${i}"]`);
      if (wrap) {
        fillGridCard(wrap, env);
        const card = wrap.querySelector<HTMLElement>(".prize-card")!;
        const r = card.getBoundingClientRect();
        confettiBurst(r.left + r.width / 2, r.top + r.height / 2, isJackpotEnv(env) ? 40 : 24);
      }
      playReveal(isJackpotEnv(env));
      updateStats();
    }, delay);
    delay += 240;
  });
}

function updateStats() {
  const opened = envelopes.filter((e) => e.opened);
  const total = opened.reduce((sum, e) => sum + (e.value ?? 0), 0);
  const countEl = app.querySelector<HTMLElement>("#openedCount");
  const totalEl = app.querySelector<HTMLElement>("#revealedTotal");
  if (countEl) countEl.textContent = String(opened.length);
  if (totalEl) countUp(totalEl, total, 600);
}

/* ------------------------------ util ------------------------------- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

setupView();
