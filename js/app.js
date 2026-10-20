/* 앱 본체: 헬퍼, 데이터 로딩, 라우터, 홈 화면 */
(function (root) {
  'use strict';
  const C = root.Core, St = root.Store;

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  // ``` 코드블록을 <pre>로, 나머지는 줄바꿈 유지 텍스트로 (항상 textContent → XSS 없음)
  function rich(text) {
    const f = document.createDocumentFragment();
    String(text || '').split(/```[a-z]*\n?/).forEach((part, i) => {
      if (i % 2 === 1) f.append(h('pre', null, h('code', null, part.replace(/\n$/, ''))));
      else if (part.trim()) f.append(h('div', { class: 'txt' }, part.trim()));
    });
    return f;
  }
  const pct = (r) => (r == null ? '—' : Math.round(r * 100) + '%');
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(s) {
    const d = new Date(C.diffDays(s, '1970-01-01') * 86400000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
  }

  const App = {
    data: null, routes: [], timer: null,
    h, rich, pct, fmtDate,

    async load() {
      const get = async (p, opt) => {
        try { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return await r.json(); }
        catch (e) { if (opt) return null; throw e; }
      };
      const plan = await get('plan.json');
      const man = await get('content/manifest.json');
      const lessons = [], questions = [];
      for (const f of man.lessons) (await get('content/' + f, true) || []).forEach((x) => lessons.push(x));
      for (const f of man.questions.concat(man.extra || [])) (await get('content/' + f, true) || []).forEach((x) => questions.push(x));
      const qmap = {}; questions.forEach((q) => { qmap[q.id] = q; });
      App.data = { plan, lessons, questions, qmap };
    },

    // 현재 상태 한 번에 계산
    ctx() {
      const s = St.get(), plan = App.data.plan;
      const today = C.kstToday();
      const n = plan.days.length;
      const day = C.currentDay(today, s.override, n, plan.start_date);
      const exam = day > n;
      const dayPlan = exam ? null : plan.days[day - 1];
      const lessons = exam ? [] : App.data.lessons.filter((l) => l.day === day);
      const due = C.dueIds(s.leitner, today).filter((id) => App.data.qmap[id]);
      const quizSess = Object.values(s.sessions).filter((x) => x.mode === 'quiz' && x.day === day && x.submittedAt)
        .sort((a, b) => b.submittedAt - a.submittedAt);
      const last = quizSess[0];
      const lastWrong = last ? last.qids.filter((id) => !C.finalVerdict(s.attempts.find((a) => a.sid === last.sid && a.qid === id))) : [];
      const steps = [
        { k: 'lesson', name: '오늘의 학습', href: '#/lesson', done: lessons.length > 0 && lessons.every((l) => s.read[l.id]),
          sub: `${lessons.filter((l) => s.read[l.id]).length}/${lessons.length} 읽음` },
        { k: 'quiz', name: '30분 퀴즈', href: '#/quiz', done: !!last, sub: last ? `${last.qids.length - lastWrong.length}/${last.qids.length} 정답` : '계산·코드 5 + 용어 12' },
        { k: 'notes', name: '채점·오답 체크', href: last ? '#/result/' + last.sid : '#/notes',
          done: !!last && lastWrong.every((id) => (s.checks[id] || 0) >= last.submittedAt),
          sub: last ? `오답 ${lastWrong.length}개` : '퀴즈 후에' },
        { k: 'review', name: '복습 큐', href: '#/review', done: !!s.reviewDone[today] || (!!last && due.length === 0),
          sub: due.length ? `오늘 복습 ${due.length}문제` : '복습할 문제 없음' },
      ];
      return { s, plan, today, day, exam, dayPlan, lessons, due, steps, last, lastWrong, dday: C.dday(today, plan.exam_date) };
    },

    go(hash) { if (location.hash === hash) App.render(); else location.hash = hash; },

    route(pattern, fn) { App.routes.push({ parts: pattern.split('/'), fn }); },
    render() {
      clearInterval(App.timer);
      const hash = (location.hash || '#/').replace(/^#\/?/, '');
      const segs = hash.split('/').filter(Boolean);
      const appEl = document.getElementById('app');
      let hit = null;
      for (const r of App.routes) {
        const ps = r.parts.filter(Boolean);
        if (ps.length !== segs.length) continue;
        const params = {};
        if (ps.every((p, i) => p[0] === ':' ? (params[p.slice(1)] = segs[i], true) : p === segs[i])) { hit = { r, params }; break; }
      }
      appEl.replaceChildren();
      try { appEl.append(hit ? hit.r.fn(hit.params, App.ctx()) : h('p', { class: 'pad' }, '없는 페이지예요. ', h('a', { href: '#/' }, '홈으로'))); }
      catch (e) { appEl.append(h('pre', null, '오류: ' + e.message)); console.error(e); }
      App.chrome(segs[0] || 'home');
      window.scrollTo(0, 0);
    },

    // 상단 D-day 칩, 일차 선택, 하단 탭 강조
    chrome(key) {
      const c = App.ctx(), plan = App.data.plan;
      document.getElementById('dchip').textContent = c.dday > 0 ? 'D-' + c.dday : c.dday === 0 ? 'D-Day' : 'D+' + (-c.dday);
      const sel = document.getElementById('daysel');
      sel.replaceChildren(h('option', { value: '' }, '자동'),
        ...plan.days.map((d) => h('option', { value: d.day }, `${d.day}일차 (${fmtDate(d.date)})`)),
        h('option', { value: plan.days.length + 1 }, `시험일(${fmtDate(plan.exam.date)})`));
      sel.value = c.s.override ? String(c.s.override.day) : '';
      document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.k === key ||
        (a.dataset.k === 'quiz' && (key === 'run' || key === 'review')) || (a.dataset.k === 'notes' && key === 'result')));
    },

    start: async function () {
      try { await App.load(); }
      catch (e) { document.getElementById('app').replaceChildren(h('p', { class: 'pad' }, '콘텐츠를 불러오지 못했어요: ' + e.message)); return; }
      document.getElementById('daysel').addEventListener('change', (e) => {
        const v = e.target.value; St.setOverrideDay(v ? Number(v) : null, C.kstToday()); App.render();
      });
      window.addEventListener('hashchange', App.render);
      App.render();
      if (App.Sync) App.Sync.init().then(() => { if (!/^#\/run/.test(location.hash)) App.render(); });
    },
  };
  root.App = App;

  // ---------- 홈 ----------
  App.route('', (_, c) => {
    const { s, plan } = c;
    const wrap = h('div');
    const dd = c.dday;
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'row', style: 'align-items:center' },
        h('div', null, h('div', { class: 'big' }, dd > 0 ? 'D-' + dd : dd === 0 ? 'D-Day' : '시험 종료'),
          h('div', { class: 'muted small' }, `시험 ${plan.exam_date} (${plan.exam.weekday}) · 오늘 ${fmtDate(c.today)}`)),
        h('div', null,
          c.exam ? h('h2', null, '시험일 아침') : h('h2', null, `${c.day}일차 · ${c.dayPlan.hours}시간`),
          h('div', { class: 'muted small' }, c.exam ? plan.exam.title : c.dayPlan.title)))));

    if (c.exam) {
      wrap.append(h('div', { class: 'card' }, h('h2', null, '새 공부는 하지 않아요'),
        h('p', { class: 'txt' }, '15분만 복습하고 가세요. 약점 요약 → 몰라요 카드 → 틀렸던 계산 문제 3개 순서예요.'),
        h('a', { class: 'btn', href: '#/final/morning' }, '15분 복습 시작')));
    } else {
      const done = c.steps.filter((x) => x.done).length;
      wrap.append(h('div', { class: 'card' }, h('h2', null, `오늘의 체크리스트 ${done}/4`),
        h('div', { class: 'prog' }, h('i', { style: `width:${done * 25}%` })),
        h('ul', { class: 'steps' }, c.steps.map((x, i) => h('li', { class: x.done ? 'done' : '' },
          h('a', { href: x.href }, h('span', { class: 'ck' }, x.done ? '✓' : i + 1),
            h('span', null, h('b', null, x.name), h('div', { class: 'muted small' }, x.sub))))))));
      wrap.append(h('a', { class: 'btn' + (c.due.length ? '' : ' sec'), href: '#/review', style: 'margin-bottom:12px' },
        c.due.length ? `오늘 복습 시작 (${c.due.length}문제)` : '오늘 복습할 문제 없음'));
      if (c.dayPlan.topics.includes('약점 보강') || c.day === 5) {
        wrap.append(h('div', { class: 'card' }, h('b', null, c.day === 5 ? '오늘은 종합 모의고사' : '약점 보강일'),
          h('div', { class: 'small muted' }, c.day === 5 ? '퀴즈가 오답·약점 위주로 자동 구성돼요. 끝나면 /최종 탭에서 마지막 복습.' : '오답노트와 아래 정답률 낮은 토픽부터 다시 보세요.')));
      }
    }

    // 토픽별 정답률
    const st = C.topicStats(s.attempts);
    const topics = [];
    plan.days.forEach((d) => d.topics.forEach((t) => { if (t !== '약점 보강' && t !== '종합 모의고사' && !topics.includes(t)) topics.push(t); }));
    wrap.append(h('div', { class: 'card' }, h('h2', null, '토픽별 정답률'),
      topics.map((t) => {
        const r = st[t] ? st[t].rate : null;
        return h('div', { class: 'trow' }, h('span', null, t),
          h('div', { class: 'prog' }, h('i', { class: r == null ? '' : r < 0.5 ? 'low' : r < 0.8 ? 'mid' : 'hi', style: `width:${r == null ? 0 : Math.round(r * 100)}%` })),
          h('span', { class: 'muted' }, pct(r)));
      })));

    wrap.append(h('a', { class: 'btn sec', href: '#/sync' }, '💾 저장 / 불러오기 (파일)'));
    return wrap;
  });
})(window);
