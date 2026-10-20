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
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 저장 불가 환경이면 메모리만 */ } }
  const S = () => load();

  const Store = {
    get: S, save,
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
