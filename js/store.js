/* 진행 기록 저장소: localStorage (브라우저별). content/*.json 과 분리되어 있어 콘텐츠를 갱신해도 기록이 유지된다. */
(function (root) {
  'use strict';
  const KEY = 'ipsa-d5.v1';
  let mem = null;
  const empty = () => ({
    v: 1, override: null, read: {}, attempts: [], leitner: {}, quiz: null,
    sessions: {}, checks: {}, cards: {}, reviewDone: {}, seq: 0,
  });
  function load() {
    if (mem) return mem;
    try { const r = localStorage.getItem(KEY); mem = Object.assign(empty(), r ? JSON.parse(r) : {}); }
    catch (e) { mem = empty(); }
    return mem;
  }
  const hooks = [];
  function save(quiet) {
    if (mem && !quiet) mem.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 저장 불가 환경이면 메모리만 */ }
    if (!quiet) hooks.forEach((f) => f());
  }
  const S = () => load();

  const Store = {
    get: S, save, onSave(f) { hooks.push(f); },
    // 다른 기기 기록과 병합: 풀이·세션·읽음·체크는 합집합, 카드·라이트너·일차 지정은 더 최근 쪽
    merge(remote) {
      const l = S(), r = Object.assign(empty(), remote);
      const seen = new Set(l.attempts.map((a) => a.sid + '|' + a.qid));
      const mine = (l.updatedAt || 0) >= (r.updatedAt || 0);
      r.attempts.forEach((a) => { if (!seen.has(a.sid + '|' + a.qid)) l.attempts.push(a); });
      l.attempts.sort((a, b) => a.ts - b.ts);
      Object.assign(l.sessions, Object.assign({}, r.sessions, l.sessions));
      Object.assign(l.read, Object.assign({}, r.read, l.read));
      Object.assign(l.reviewDone, r.reviewDone, l.reviewDone);
      for (const k of Object.keys(r.checks)) l.checks[k] = Math.max(l.checks[k] || 0, r.checks[k]);
      if (!mine) { l.leitner = r.leitner; l.cards = r.cards; l.override = r.override; if (!l.quiz) l.quiz = r.quiz; }
      l.updatedAt = Math.max(l.updatedAt || 0, r.updatedAt || 0);
      save(true);
    },
    exportJSON() { return JSON.stringify(S()); },
    importJSON(text) { const o = JSON.parse(text); if (!o || o.v !== 1) throw new Error('형식이 다릅니다'); mem = Object.assign(empty(), o); save(); },
    reset() { mem = empty(); save(); },
    setOverrideDay(day, today) { S().override = day ? { day, set: today } : null; save(); },
    markRead(id, on) { if (on) S().read[id] = Date.now(); else delete S().read[id]; save(); },
    nextSid() { const s = S(); s.seq++; save(); return 's' + s.seq + '-' + Date.now().toString(36); },

    // 세션 채점 제출. questions: id→문제. 시도 기록 + 라이트너 갱신.
    submitSession(sess, qmap, today) {
      const s = S();
      sess.submittedAt = Date.now();
      sess.results = {};
      for (const qid of sess.qids) {
        const q = qmap[qid];
        const ans = (sess.answers && sess.answers[qid]) || '';
        const v = root.Core.judge(ans, q.answers).verdict;
        const ok = v === 'correct';
        const prev = s.leitner[qid] ? JSON.parse(JSON.stringify(s.leitner[qid])) : null;
        const next = root.Core.leitnerUpdate(prev || undefined, ok, today, sess.mode);
        if (next) s.leitner[qid] = next;
        s.attempts.push({
          sid: sess.sid, qid, topic: q.topic, type: q.type, day: q.day, date: today, ts: sess.submittedAt,
          answer: ans, auto: v, override: null, mode: sess.mode, prev,
        });
        sess.results[qid] = v;
      }
      s.sessions[sess.sid] = sess;
      s.quiz = null;
      if (sess.mode === 'review') s.reviewDone[today] = true;
      save();
    },
    // 사용자가 "맞음/틀림"으로 직접 고침 → 최종 판정 우선, 라이트너 재계산
    setOverride(sid, qid, val) {
      const s = S();
      const at = s.attempts.find((a) => a.sid === sid && a.qid === qid);
      if (!at) return;
      at.override = val;
      const ok = root.Core.finalVerdict(at);
      const next = root.Core.leitnerUpdate(at.prev || undefined, ok, at.date, at.mode);
      if (next) s.leitner[qid] = next; else if (!at.prev) delete s.leitner[qid];
      save();
    },
  };
  root.Store = Store;
})(window);
