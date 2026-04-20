/* ===================== */
/*  汉语Go – script.js   */
/* ===================== */
'use strict';

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:8000' 
  : ''; // Relative path when hosted together, or replace with your actual production API URL

// ── State ──
const S = {
  view: 'home',
  level: 1,
  learnPage: 0,
  learnPerPage: 50,
  learnData: null,
  fcDeck: [],
  fcIdx: 0,
  quiz: { qs:[], cur:0, right:0, wrong:0, total:10, allWords:[] },
  type: { qs:[], cur:0, right:0, total:10 },
  learned: JSON.parse(localStorage.getItem('hg_learned') || '{}'),
};
let quizTimerInt = null;
function saveLearned() { localStorage.setItem('hg_learned', JSON.stringify(S.learned)); }
function isLearned(w) { return !!S.learned[w]; }
function toggleLearned(w) { S.learned[w] ? delete S.learned[w] : S.learned[w] = 1; saveLearned(); }

// ── Navigation ──
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name)?.classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  S.view = name;
  window.scrollTo(0, 0);
}

// ── API helpers ──
async function api(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// ── HOME ──
const HSK_INFO = [
  { level:1, name:'HSK 1 · Nhập môn',    desc:'Giao tiếp cơ bản hàng ngày',  color:'#16a34a' },
  { level:2, name:'HSK 2 · Sơ cấp',     desc:'Mở rộng từ vựng & ngữ pháp',  color:'#2563eb' },
  { level:3, name:'HSK 3 · Trung sơ',    desc:'Diễn đạt ý kiến, kể chuyện',  color:'#d97706' },
  { level:4, name:'HSK 4 · Trung cấp',   desc:'Đọc báo, hội thoại phức tạp', color:'#ea580c' },
  { level:5, name:'HSK 5 · Cao cấp',     desc:'Văn học, hội thảo chuyên sâu', color:'#7c3aed' },
  { level:6, name:'HSK 6 · Thành thạo',  desc:'Trình độ học thuật cao',       color:'#dc2626' },
];

async function renderHome() {
  let summary;
  try { summary = await api('/api/hsk'); } catch { summary = HSK_INFO.map(h => ({level:h.level,total:0})); }

  const grid = document.getElementById('hsk-grid');
  grid.innerHTML = HSK_INFO.map(h => {
    const info = summary.find(s => s.level === h.level) || { total: 0 };
    const learnedCount = Object.keys(S.learned).filter(w => {
      // approximate: we don't know level per word here, but still show global progress
      return S.learned[w];
    }).length;
    return `
      <div class="hsk-card" data-level="${h.level}">
        <div class="hsk-label" style="color:${h.color}">${h.name}</div>
        <div class="hsk-desc">${h.desc}</div>
        <div class="hsk-count">${info.total} từ</div>
        <div class="hsk-bar"><div class="hsk-bar-fill" style="width:0%;background:${h.color}"></div></div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.hsk-card').forEach(c => {
    c.addEventListener('click', () => { S.level = +c.dataset.level; openLearn(S.level, 0); });
  });
}

// ── LEARN ──
async function openLearn(level, page) {
  showView('learn');
  S.level = level;
  S.learnPage = page;
  const offset = page * S.learnPerPage;
  const info = HSK_INFO.find(h => h.level === level);
  document.getElementById('learn-title').textContent = info?.name || `HSK ${level}`;

  try {
    const data = await api(`/api/hsk/${level}?limit=${S.learnPerPage}&offset=${offset}`);
    S.learnData = data;
    document.getElementById('learn-info').textContent = `${data.total} từ`;
    document.getElementById('learn-progress').textContent = `Trang ${page+1} / ${Math.ceil(data.total/S.learnPerPage)}`;
    renderWordList(data.words, 'word-list');
    renderPagination(data.total, page, 'learn-pagination', (p) => openLearn(level, p));
  } catch (e) {
    document.getElementById('word-list').innerHTML = `<p class="muted center">Lỗi tải dữ liệu. Hãy kiểm tra backend đã chạy chưa.</p>`;
  }
}

function renderWordList(words, containerId) {
  const el = document.getElementById(containerId);
  if (!words || !words.length) { el.innerHTML = '<p class="muted center">Không tìm thấy từ nào.</p>'; return; }
  el.innerHTML = words.map(w => {
    const en = (w.english || []).slice(0, 2).join('; ') || '–';
    const vi = w.vietnamese || '';
    const done = isLearned(w.simplified) ? ' done' : '';
    return `
      <div class="word-item${done}" data-word="${w.simplified}" tabindex="0">
        <div class="wi-zh">${w.simplified}</div>
        <div class="wi-py">${w.pinyin}</div>
        ${vi ? `<div class="wi-vi">${vi}</div>` : ''}
        <div class="wi-en">${en}</div>
      </div>`;
  }).join('');
  el.querySelectorAll('.word-item').forEach(item => {
    item.addEventListener('click', () => openModal(words.find(x => x.simplified === item.dataset.word)));
  });
}

function renderPagination(total, current, containerId, onClick) {
  const pages = Math.ceil(total / S.learnPerPage);
  if (pages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }
  const el = document.getElementById(containerId);
  let html = '';
  for (let i = 0; i < pages; i++) {
    html += `<button class="pg-btn${i === current ? ' active' : ''}" data-p="${i}">${i + 1}</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.pg-btn').forEach(b => b.addEventListener('click', () => onClick(+b.dataset.p)));
}

// ── SEARCH ──
let searchTimer;
async function doSearch(q) {
  if (!q.trim()) {
    document.getElementById('search-results').innerHTML = '<p class="muted center">Nhập từ khóa để tìm kiếm bằng chữ Hán, pinyin, tiếng Anh hoặc tiếng Việt.</p>';
    return;
  }
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}&limit=60`);
    renderWordList(data.results, 'search-results');
  } catch {
    document.getElementById('search-results').innerHTML = '<p class="muted center">Lỗi tìm kiếm.</p>';
  }
}

// ── MODAL ──
let currentWord = null;
let writer = null;

function openModal(w) {
  if (!w) return;
  currentWord = w;
  document.getElementById('m-char').textContent = w.simplified;
  document.getElementById('m-trad').textContent = w.traditional !== w.simplified ? `Phồn thể: ${w.traditional}` : '';
  document.getElementById('m-pinyin').textContent = w.pinyin;
  document.getElementById('m-vi').textContent = w.vietnamese ? `${w.vietnamese}` : '';
  document.getElementById('m-en').textContent = (w.english || []).join(' · ') || '–';
  document.getElementById('m-hsk').innerHTML = w.hsk ? `<span class="pill">HSK ${w.hsk}</span>` : '';
  document.getElementById('modal').classList.remove('hidden');
  
  const charEl = document.getElementById('m-char');
  const writerEl = document.getElementById('m-writer');
  const writerCtrl = document.getElementById('m-writer-ctrl');
  
  if (w.simplified.length === 1 && typeof HanziWriter !== 'undefined') {
      charEl.style.display = 'none';
      writerEl.style.display = 'block';
      writerCtrl.style.display = 'block';
      writerEl.innerHTML = '';
      writer = HanziWriter.create('m-writer', w.simplified, {
        width: 150, height: 150, padding: 5,
        strokeAnimationSpeed: 1.5, delayBetweenStrokes: 50, showOutline: true
      });
  } else {
      charEl.style.display = 'block';
      writerEl.style.display = 'none';
      writerCtrl.style.display = 'none';
  }
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); if(writer) { writer.cancelQuiz(); } }

// ── FLASHCARD ──
async function initFC(level) {
  try {
    const data = await api(`/api/random?level=${level}&count=30`);
    S.fcDeck = data;
    S.fcIdx = 0;
    updateFC();
  } catch { S.fcDeck = []; }
}

function updateFC() {
  const d = S.fcDeck;
  if (!d.length) return;
  const w = d[S.fcIdx];
  document.getElementById('card-char').textContent = w.simplified;
  document.getElementById('cb-char').textContent = w.simplified;
  document.getElementById('cb-pinyin').textContent = w.pinyin;
  document.getElementById('cb-vi').textContent = w.vietnamese ? `${w.vietnamese}` : '';
  document.getElementById('cb-en').textContent = (w.english || []).slice(0, 3).join('; ');
  document.getElementById('fc-idx').textContent = S.fcIdx + 1;
  document.getElementById('fc-total').textContent = d.length;
  document.getElementById('card').classList.remove('flipped');
}
function flipFC() { document.getElementById('card').classList.toggle('flipped'); }
function nextFC(d) { S.fcIdx = (S.fcIdx + d + S.fcDeck.length) % S.fcDeck.length; updateFC(); }
function shuffleFC() {
  for (let i = S.fcDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [S.fcDeck[i], S.fcDeck[j]] = [S.fcDeck[j], S.fcDeck[i]];
  }
  S.fcIdx = 0; updateFC();
}

function resetQuizUI() {
  stopQuizTimer();
  document.getElementById('quiz-setup').classList.remove('hidden');
  document.getElementById('quiz-play').classList.add('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
}

// ── QUIZ ──
async function startQuiz() {
  const level = +document.getElementById('quiz-level').value;
  const count = +document.getElementById('quiz-count').value;
  resetQuizUI();
  try {
    const all = await api(`/api/random?level=${level}&count=80`);
    if (all.length < 4) { alert('Không đủ từ để tạo quiz.'); return; }
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    S.quiz = { qs: shuffled.slice(0, Math.min(count, shuffled.length)), cur: 0, right: 0, wrong: 0, total: Math.min(count, shuffled.length), allWords: all };
    document.getElementById('quiz-setup').classList.add('hidden');
    document.getElementById('quiz-result').classList.add('hidden');
    document.getElementById('quiz-play').classList.remove('hidden');
    renderQ();
  } catch { alert('Lỗi tải dữ liệu quiz.'); }
}

function renderQ() {
  const q = S.quiz;
  if (q.cur >= q.total) { showQuizResult(); return; }
  const w = q.qs[q.cur];
  document.getElementById('qbar-fill').style.width = (q.cur / q.total * 100) + '%';
  document.getElementById('q-progress').textContent = `${q.cur+1}/${q.total}`;
  document.getElementById('q-right').textContent = `✓ ${q.right}`;
  document.getElementById('q-wrong').textContent = `✗ ${q.wrong}`;
  document.getElementById('q-word').textContent = w.simplified;
  document.getElementById('q-sub').textContent = w.pinyin;
  document.getElementById('q-label').textContent = 'Nghĩa của từ:';
  
  startQuizTimer(15);

  // Use Vietnamese for quiz answers if available, fallback to English
  const getAnswer = (word) => word.vietnamese || (word.english || []).slice(0, 2).join('; ');
  const correctAns = getAnswer(w);
  const pool = q.allWords.filter(x => x.simplified !== w.simplified);
  const wrongs = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  const opts = [...wrongs.map(x => getAnswer(x)), correctAns].sort(() => Math.random() - 0.5);

  const container = document.getElementById('q-opts');
  container.innerHTML = opts.map((o, i) => `<button class="q-opt" data-a="${o}">${o}</button>`).join('');
  document.getElementById('q-fb').classList.add('hidden');

  container.querySelectorAll('.q-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      stopQuizTimer();
      const isRight = btn.dataset.a === correctAns;
      container.querySelectorAll('.q-opt').forEach(b => {
        b.disabled = true;
        if (b.dataset.a === correctAns) b.classList.add('correct');
        else if (b === btn && !isRight) b.classList.add('wrong');
      });
      if (isRight) q.right++; else q.wrong++;
      const fb = document.getElementById('q-fb');
      fb.classList.remove('hidden');
      document.getElementById('q-fb-text').innerHTML = isRight
        ? `<strong style="color:var(--green)">Đúng!</strong> ${w.simplified} = ${correctAns}`
        : `<strong style="color:var(--red)">Sai!</strong> Đáp án: ${correctAns}`;
    });
  });
}

function startQuizTimer(sec) {
  stopQuizTimer();
  let time = sec;
  const el = document.getElementById('q-timer');
  el.textContent = `${time}s`;
  el.classList.remove('urgent');
  
  quizTimerInt = setInterval(() => {
    time--;
    el.textContent = `${time}s`;
    if (time <= 5) el.classList.add('urgent');
    if (time <= 0) {
      stopQuizTimer();
      handleQuizTimeout();
    }
  }, 1000);
}

function stopQuizTimer() {
  if (quizTimerInt) clearInterval(quizTimerInt);
  quizTimerInt = null;
}

function handleQuizTimeout() {
  const q = S.quiz;
  const w = q.qs[q.cur];
  const correctAns = w.vietnamese || (w.english || []).slice(0, 2).join('; ');
  
  const container = document.getElementById('q-opts');
  container.querySelectorAll('.q-opt').forEach(b => {
    b.disabled = true;
    if (b.dataset.a === correctAns) b.classList.add('correct');
  });
  
  q.wrong++;
  const fb = document.getElementById('q-fb');
  fb.classList.remove('hidden');
  document.getElementById('q-fb-text').innerHTML = `<strong style="color:var(--red)">Hết giờ!</strong> Đáp án: ${correctAns}`;
}

function showQuizResult() {
  stopQuizTimer();
  const q = S.quiz;
  const pct = Math.round(q.right / q.total * 100);
  document.getElementById('quiz-play').classList.add('hidden');
  document.getElementById('quiz-result').classList.remove('hidden');
  document.getElementById('qr-score').textContent = pct + '%';
  document.getElementById('qr-score').style.color = pct >= 70 ? 'var(--green)' : 'var(--red)';
  document.getElementById('qr-detail').textContent = `Đúng ${q.right} / Sai ${q.wrong} / Tổng ${q.total}`;
  document.getElementById('qr-title').textContent = pct >= 70 ? '🎉 Tốt lắm!' : '😅 Cố gắng thêm!';
}

// ── TYPING ──
async function startTyping() {
  const level = +document.getElementById('type-level').value;
  const count = +document.getElementById('type-count').value;
  try {
    const all = await api(`/api/random?level=${level}&count=${count}`);
    if (all.length < 1) { alert('Không đủ từ để bắt đầu.'); return; }
    S.type = { qs: all, cur: 0, right: 0, total: all.length };
    document.getElementById('type-setup').classList.add('hidden');
    document.getElementById('type-result').classList.add('hidden');
    document.getElementById('type-play').classList.remove('hidden');
    renderType();
  } catch { alert('Lỗi tải dữ liệu.'); }
}

function renderType() {
  const t = S.type;
  if (t.cur >= t.total) { showTypeResult(); return; }
  const w = t.qs[t.cur];
  
  document.getElementById('type-progress').textContent = `${t.cur+1}/${t.total}`;
  document.getElementById('type-right').textContent = `✓ ${t.right}`;
  
  document.getElementById('type-pinyin').style.visibility = 'hidden';
  document.getElementById('type-vi').style.visibility = 'hidden';
  
  document.getElementById('type-word').textContent = w.simplified;
  document.getElementById('type-pinyin').textContent = w.pinyin;
  document.getElementById('type-vi').textContent = w.vietnamese ? w.vietnamese : (w.english||[]).slice(0,2).join('; ');
  
  const inputEl = document.getElementById('type-input');
  inputEl.value = '';
  inputEl.style.borderColor = '#ccc';
  inputEl.focus();
  
  // Create new input to wipe old event listeners
  const newEl = inputEl.cloneNode(true);
  inputEl.parentNode.replaceChild(newEl, inputEl);
  
  newEl.focus();
  newEl.addEventListener('input', e => {
      const inputVal = e.target.value.trim().toLowerCase();
      const targetHanziSimp = w.simplified;
      const targetHanziTrad = w.traditional;
      
      // Chuẩn hóa pinyin: bỏ dấu cách, bỏ dấu ngoặc, chuyển về chữ thường
      const targetPyRaw = w.pinyin.toLowerCase().replace(/[^a-z0-9]/g, ''); // Ví dụ: yi1sheng1
      const targetPyNoTones = w.pinyin.toLowerCase().replace(/[^a-z]/g, ''); // Ví dụ: yisheng
      
      const inputNormalized = inputVal.replace(/\s/g, '');

      if (e.target.value === targetHanziSimp || 
          e.target.value === targetHanziTrad || 
          inputNormalized === targetPyRaw || 
          inputNormalized === targetPyNoTones) {
          
          // Tự động chuyển đổi text trong ô nhập sang chữ Hán để "wow" người dùng
          e.target.value = targetHanziSimp;
          
          e.target.style.borderColor = 'var(--green)';
          e.target.style.backgroundColor = '#e6fffa';
          t.right++;
          setTimeout(() => {
              e.target.style.backgroundColor = '';
              t.cur++;
              renderType();
          }, 350);
      }
  });
}

function showTypeResult() {
  const t = S.type;
  document.getElementById('type-play').classList.add('hidden');
  document.getElementById('type-result').classList.remove('hidden');
  document.getElementById('type-detail').textContent = `Hoàn thành: ${t.right}/${t.total} từ.`;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
    e.preventDefault();
    const v = t.dataset.view;
    showView(v);
    if (v === 'flashcard') initFC(+document.getElementById('fc-level').value);
    if (v === 'quiz') resetQuizUI();
  }));

  document.getElementById('logo-home')?.addEventListener('click', e => { e.preventDefault(); showView('home'); });
  document.getElementById('btn-go')?.addEventListener('click', () => { S.level = 1; openLearn(1, 0); });

  // back buttons
  document.getElementById('learn-back')?.addEventListener('click', () => showView('home'));
  document.getElementById('fc-back')?.addEventListener('click', () => showView('home'));
  document.getElementById('quiz-back')?.addEventListener('click', () => { resetQuizUI(); showView('home'); });
  document.getElementById('type-back')?.addEventListener('click', () => showView('home'));

  document.getElementById('btn-type-hint')?.addEventListener('click', () => {
    document.getElementById('type-pinyin').style.visibility = 'visible';
    document.getElementById('type-vi').style.visibility = 'visible';
  });

  // search
  document.getElementById('search-input')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(e.target.value), 350);
  });

  // modal & writer
  document.getElementById('modal-x')?.addEventListener('click', closeModal);
  document.getElementById('modal')?.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  
  document.getElementById('btn-draw')?.addEventListener('click', () => { if (writer) writer.animateCharacter(); });
  document.getElementById('btn-practice')?.addEventListener('click', () => { if (writer) writer.quiz(); });
  document.getElementById('btn-save-word')?.addEventListener('click', async () => {
    if (!currentWord) return;
    try {
      const dbUrl = `${API}/api/saved_words?word=${encodeURIComponent(currentWord.simplified)}&pinyin=${encodeURIComponent(currentWord.pinyin)}&meaning=${encodeURIComponent(currentWord.vietnamese || (currentWord.english||[]).join(', '))}`;
      const r = await fetch(dbUrl, { method: 'POST' });
      const res = await r.json();
      alert(res.status === 'success' ? '✅ Đã lưu từ vựng!' : '⚠️ Từ này đã được lưu trước đó!');
    } catch(e) {
      alert('❌ Lỗi mất kết nối với server.');
    }
  });

  // flashcard
  document.getElementById('card')?.addEventListener('click', flipFC);
  document.getElementById('fc-next')?.addEventListener('click', () => nextFC(1));
  document.getElementById('fc-prev')?.addEventListener('click', () => nextFC(-1));
  document.getElementById('fc-shuffle')?.addEventListener('click', shuffleFC);
  document.getElementById('fc-easy')?.addEventListener('click', () => {
    const w = S.fcDeck[S.fcIdx];
    if (w) { toggleLearned(w.simplified); }
    nextFC(1);
  });
  document.getElementById('fc-hard')?.addEventListener('click', () => nextFC(1));
  document.getElementById('fc-level')?.addEventListener('change', e => initFC(+e.target.value));

  // keyboard
  document.addEventListener('keydown', e => {
    if (S.view === 'flashcard') {
      if (e.key === 'ArrowRight') nextFC(1);
      if (e.key === 'ArrowLeft') nextFC(-1);
      if (e.key === ' ') { e.preventDefault(); flipFC(); }
    }
    if (S.view === 'type') {
      if (e.key.toLowerCase() === 'h') {
        document.getElementById('type-pinyin').style.visibility = 'visible';
        document.getElementById('type-vi').style.visibility = 'visible';
      }
    }
  });

  // quiz
  document.getElementById('quiz-start')?.addEventListener('click', startQuiz);
  document.getElementById('q-next')?.addEventListener('click', () => { stopQuizTimer(); S.quiz.cur++; renderQ(); });
  document.getElementById('qr-again')?.addEventListener('click', () => {
    document.getElementById('quiz-result').classList.add('hidden');
    document.getElementById('quiz-setup').classList.remove('hidden');
  });

  // typing
  document.getElementById('type-start')?.addEventListener('click', startTyping);
  document.getElementById('type-again')?.addEventListener('click', () => {
    document.getElementById('type-result').classList.add('hidden');
    document.getElementById('type-setup').classList.remove('hidden');
  });

  // boot
  renderHome();
});
