/* 순수 로직(브라우저/Node 공용): 날짜·일차, 채점 정규화, 라이트너, 퀴즈 구성, 통계 */
(function (root) {
  'use strict';

  const EXAM_DATE = '2026-10-25';
  const PLAN_START = '2026-10-20';

  // ---------- 날짜 (KST 기준, YYYY-MM-DD 문자열) ----------
  function kstToday(now) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now || new Date());
  }
  function dayNum(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }
  function diffDays(a, b) { return dayNum(a) - dayNum(b); }
  function addDays(s, n) { return new Date((dayNum(s) + n) * 86400000).toISOString().slice(0, 10); }
  function dday(today, exam) { return diffDays(exam || EXAM_DATE, today); }

  // 오늘이 몇 일차인지. studyDays=5이면 6이 시험일(아침 복습 모드).
  // override={day, set}: "set 날짜에 오늘을 day일차로 지정" → 이후 날짜마다 자동으로 +1.
  function currentDay(today, override, studyDays, start) {
    const n = studyDays || 5;
    const idx = override ? override.day + diffDays(today, override.set)
      : diffDays(today, start || PLAN_START) + 1;
    return Math.max(1, Math.min(n + 1, idx));
  }

  // ---------- 채점 정규화 ----------
  const UNIT = /(번째|바이트|bytes?|회|번|개|초|ms|ns|건|명|칸|단계|%)$/;

  function stripBrackets(s) {
    let prev;
    do { prev = s; s = s.replace(/[(\[{（【][^()\[\]{}（）【】]*[)\]}）】]/g, ''); } while (s !== prev);
    return s;
  }
  function squash(s) {
    return s.normalize('NFKC').toLowerCase()
      .replace(/[\s\-_,·ㆍ‐‑–—'"`]/g, '')
      .replace(/[()\[\]{}]/g, '')
      .replace(/\.(?!\d)/g, '');
  }
  function variants(s) {
    const n = s.normalize('NFKC');
    return Array.from(new Set([squash(n), squash(stripBrackets(n))].filter(Boolean)));
  }
  function toNum(s) {
    let t = s.normalize('NFKC').toLowerCase().replace(/[\s,]/g, '');
    t = t.replace(UNIT, '');
    return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }
  function lev(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  // → {verdict: 'correct' | 'wrong' | 'unsure'}
  function judge(input, answers) {
    const raw = String(input == null ? '' : input).trim();
    if (!raw) return { verdict: 'wrong', reason: 'empty' };
    const n = toNum(raw);
    let numericAnswer = false;
    if (n !== null) {
      for (const a of answers) {
        const m = toNum(String(a));
        if (m !== null) { numericAnswer = true; if (Math.abs(n - m) < 1e-6) return { verdict: 'correct' }; }
      }
      if (numericAnswer) return { verdict: 'wrong' };
    }
    const uv = variants(raw);
    for (const a of answers) {
      const av = variants(String(a));
      if (uv.some((x) => av.includes(x))) return { verdict: 'correct' };
    }
    // 애매: 오타 1~2자, 또는 한쪽이 다른 쪽을 포함(3자 이상)
    for (const a of answers) {
      for (const x of variants(String(a))) {
        for (const u of uv) {
          if (Math.min(x.length, u.length) < 3) continue;
          if (x.replace(/\D/g, '') !== u.replace(/\D/g, '')) continue; // 숫자가 다르면 오타가 아니라 다른 답
          const d = lev(x, u);
          if (d <= (x.length >= 8 ? 2 : 1)) return { verdict: 'unsure' };
          const [s, l] = x.length <= u.length ? [x, u] : [u, x];
          if (l.includes(s) && s.length / l.length >= 0.5) return { verdict: 'unsure' };
        }
      }
    }
    return { verdict: 'wrong' };
  }

  // ---------- 라이트너 ----------
  // state: {box, due, graduated} | undefined. 반환: 새 state 또는 undefined(큐에 없음).
  // mode: 'quiz'(틀리면 오늘 다시) | 'review' 등(틀리면 내일 다시)
  function leitnerUpdate(state, correct, today, mode, exam) {
    const last = exam || EXAM_DATE;
    const cap = (d) => (d > last ? null : d);
    if (!correct) {
      return { box: 1, due: cap(mode === 'quiz' ? today : addDays(today, 1)), graduated: false };
    }
    if (!state) return undefined;
    if (state.graduated) return state;
    const box = state.box + 1;
    if (box >= 3) return { box: 3, due: null, graduated: true };
    return { box, due: cap(addDays(today, box === 2 ? 2 : 1)), graduated: false };
  }
  function dueIds(leitner, today) {
    return Object.keys(leitner)
      .filter((id) => { const s = leitner[id]; return s && !s.graduated && s.due && s.due <= today; })
      .sort((a, b) => leitner[a].due.localeCompare(leitner[b].due) || leitner[a].box - leitner[b].box);
  }

  // ---------- 통계 ----------
  function finalVerdict(at) { return at.override != null ? !!at.override : at.auto === 'correct'; }
  function topicStats(attempts) {
    const st = {};
    for (const at of attempts) {
      const t = (st[at.topic] = st[at.topic] || { total: 0, correct: 0 });
      t.total++; if (finalVerdict(at)) t.correct++;
    }
    for (const k of Object.keys(st)) st[k].rate = st[k].total ? st[k].correct / st[k].total : null;
    return st;
  }
  function wrongCounts(attempts) {
    const wc = {};
    for (const at of attempts) if (!finalVerdict(at)) wc[at.qid] = (wc[at.qid] || 0) + 1;
    return wc;
  }

  // ---------- 퀴즈 구성 ----------
  const isCalc = (q) => q.type === 'calc' || q.type === 'code';
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // 그날 문제 위주 + 복습 큐 일부 + 모자라면 약점·오답 위주로 이전 일차에서 보충.
  function pickQuiz(o) {
    const rng = o.rng || Math.random;
    const calcTarget = o.calcTarget || 5, termTarget = o.termTarget || 12;
    const maxDueCalc = o.maxDueCalc == null ? 2 : o.maxDueCalc;
    const maxDueTerm = o.maxDueTerm == null ? 3 : o.maxDueTerm;
    const qs = o.questions.filter((q) => q.day <= o.day);
    const byId = {}; qs.forEach((q) => { byId[q.id] = q; });
    const tried = new Set(o.attempts.map((a) => a.qid));
    const stats = topicStats(o.attempts), wc = wrongCounts(o.attempts);
    const out = { calc: [], term: [] }, used = new Set();
    const target = { calc: calcTarget, term: termTarget };
    const add = (q) => {
      const k = isCalc(q) ? 'calc' : 'term';
      if (used.has(q.id) || out[k].length >= target[k]) return false;
      used.add(q.id); out[k].push(q); return true;
    };
    // 1) 복습 큐 (종류별 상한)
    let dc = 0, dt = 0;
    for (const id of dueIds(o.leitner, o.today)) {
      const q = byId[id]; if (!q) continue;
      if (isCalc(q) ? dc < maxDueCalc : dt < maxDueTerm) { if (add(q)) { if (isCalc(q)) dc++; else dt++; } }
    }
    // 2) 그날 문제 (안 푼 것 먼저)
    const today = shuffle(qs.filter((q) => q.day === o.day), rng)
      .sort((a, b) => (tried.has(a.id) ? 1 : 0) - (tried.has(b.id) ? 1 : 0));
    today.forEach(add);
    // 3) 보충: 오답 횟수·토픽 약점·미풀이 순
    const score = (q) => (wc[q.id] || 0) * 10
      + (stats[q.topic] ? (1 - stats[q.topic].rate) * 5 : 2) + (tried.has(q.id) ? 0 : 1) + rng() * 0.5;
    qs.filter((q) => !used.has(q.id)).sort((a, b) => score(b) - score(a)).forEach(add);
    return out.calc.concat(out.term).map((q) => q.id);
  }

  const api = {
    EXAM_DATE, PLAN_START, kstToday, diffDays, addDays, dday, currentDay,
    judge, normalize: squash, toNum, leitnerUpdate, dueIds, finalVerdict, topicStats, wrongCounts,
    isCalc, shuffle, pickQuiz,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
