/* 오늘의 학습 · 퀴즈 진행 · 결과/채점 */
(function (root) {
  'use strict';
  const { h, rich, pct, fmtDate } = root.App, App = root.App, C = root.Core, St = root.Store;

  // ---------- 레슨 ----------
  function lessonCard(l, s) {
    const card = h('div', { class: 'card' });
    card.append(h('span', { class: 'pill' }, l.topic), h('h2', null, l.title));
    if (l.analogy) card.append(h('div', { class: 'lab' }, '① 비유'), rich(l.analogy));
    if (l.rule) card.append(h('div', { class: 'lab' }, '② 규칙'), rich(l.rule));
    if (l.items && l.items.length) {
      card.append(h('div', { class: 'lab' }, '③ 핵심 용어'),
        h('table', { class: 't' }, l.items.map((it) => h('tr', null, h('td', null, h('b', null, it[0])), h('td', null, it[1])))));
    }
    (l.examples || []).forEach((ex, i) => {
      card.append(h('div', { class: 'lab' }, `③ 예제 ${i + 1}`), rich(ex.q),
        h('ol', { class: 'steps2' }, (ex.steps || []).map((x) => h('li', null, x))),
        ex.answer ? h('div', { class: 'txt' }, h('b', null, '답: '), ex.answer) : null);
    });
    if (l.summary) card.append(h('div', { class: 'lab' }, '④ 한 줄 정리'), h('div', { class: 'sum' }, l.summary));
    if (l.mnemonic) card.append(h('div', { class: 'lab' }, '⑤ 암기 문장'), h('div', { class: 'mn' }, l.mnemonic));
    const cb = h('input', { type: 'checkbox', checked: s.read[l.id] ? true : null, onchange: (e) => { St.markRead(l.id, e.target.checked); } });
    card.append(h('label', { class: 'chk' }, cb, '읽었어요'));
    return card;
  }
  App.route('lesson', (_, c) => {
    const w = h('div', null, h('h1', null, c.exam ? '시험일' : `${c.day}일차 학습`));
    if (c.exam) return h('div', { class: 'card' }, '시험일엔 새 공부 대신 15분 복습만 해요. ', h('a', { href: '#/final/morning' }, '15분 코스'));
    w.append(h('p', { class: 'muted small' }, c.dayPlan.topics.join(' · ')));
    if (!c.lessons.length) w.append(h('div', { class: 'card' }, '이 날 레슨이 아직 없어요.'));
    c.lessons.forEach((l) => w.append(lessonCard(l, c.s)));
    w.append(h('a', { class: 'btn', href: '#/quiz' }, '퀴즈 하러 가기'));
    return w;
  });

  // ---------- 퀴즈 시작/이어하기 ----------
  function newSession(mode, day, qids, minutes) {
    return { sid: St.nextSid(), mode, day, qids, answers: {}, startedAt: Date.now(), minutes };
  }
  App.startSession = function (mode, day, qids, minutes) {
    const s = St.get();
    s.quiz = newSession(mode, day, qids, minutes); St.save(); App.go('#/run');
  };
  App.route('quiz', (_, c) => {
    const w = h('div', null, h('h1', null, '30분 퀴즈'));
    if (c.exam) return h('div', { class: 'card' }, '시험일엔 퀴즈 대신 15분 복습이에요. ', h('a', { href: '#/final/morning' }, '이동'));
    if (c.s.quiz) {
      w.append(h('div', { class: 'card' }, h('b', null, '진행 중인 ' + modeName(c.s.quiz.mode) + '이(가) 있어요'),
        h('a', { class: 'btn', href: '#/run', style: 'margin-top:8px' }, '이어서 풀기'),
        h('button', { class: 'btn sec', style: 'margin-top:8px', onclick: () => { if (confirm('진행 중인 풀이를 버릴까요?')) { c.s.quiz = null; St.save(); App.render(); } } }, '버리고 새로')));
      return w;
    }
    const preview = C.pickQuiz({ questions: App.data.questions, day: c.day, today: c.today, leitner: c.s.leitner, attempts: c.s.attempts });
    const nCalc = preview.filter((id) => C.isCalc(App.data.qmap[id])).length;
    const nDue = preview.filter((id) => c.due.includes(id)).length;
    w.append(h('div', { class: 'card' },
      h('p', { class: 'txt' }, `계산·코드 ${nCalc}문제 + 용어 ${preview.length - nCalc}문제 (복습 큐 ${nDue}문제 포함). 답은 짧게 입력해요. 30분이 지나도 강제로 끝나지 않아요.` +
        (c.day === 5 ? '\n오늘은 오답·약점 위주 종합 모의고사예요.' : '')),
      h('button', { class: 'btn', disabled: preview.length ? null : true, onclick: () => {
        const ids = C.pickQuiz({ questions: App.data.questions, day: c.day, today: c.today, leitner: c.s.leitner, attempts: c.s.attempts });
        App.startSession('quiz', c.day, ids, 30);
      } }, '퀴즈 시작')));
    return w;
  });
  const modeName = (m) => ({ quiz: '퀴즈', review: '복습', morning: '아침 복습' }[m] || '풀이');

  // ---------- 풀이 화면 ----------
  App.route('run', (_, c) => {
    const sess = c.s.quiz;
    if (!sess) return h('div', { class: 'card' }, '진행 중인 풀이가 없어요. ', h('a', { href: '#/quiz' }, '퀴즈로'));
    const w = h('div');
    const title = { quiz: '30분 퀴즈', review: '오늘 복습', morning: '아침 복습: 계산 문제' }[sess.mode];
    w.append(h('h1', null, title));
    if (sess.minutes) {
      const tm = h('span'), box = h('div', { class: 'timer' }, h('span', null, '남은 시간'), tm);
      const tick = () => {
        const left = sess.minutes * 60 - Math.floor((Date.now() - sess.startedAt) / 1000);
        const a = Math.abs(left), t = `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
        tm.textContent = left >= 0 ? t : `+${t} 초과 · 제출해 주세요`;
        box.classList.toggle('over', left < 0);
      };
      tick(); App.timer = setInterval(tick, 1000); w.append(box);
    }
    sess.qids.forEach((id, i) => {
      const q = App.data.qmap[id];
      const inp = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'text',
        placeholder: '정답 (단답)', value: sess.answers[id] || '',
        oninput: (e) => { sess.answers[id] = e.target.value; St.save(); },
        onkeydown: (e) => { if (e.key === 'Enter') { const n = w.querySelectorAll('.q input')[i + 1]; if (n) { e.preventDefault(); n.focus(); } } } });
      w.append(h('div', { class: 'card q' }, h('div', null, h('span', { class: 'qno' }, `Q${i + 1}. `), h('span', { class: 'pill' }, q.topic), h('span', { class: 'pill' }, C.isCalc(q) ? (q.type === 'code' ? '코드' : '계산') : '용어')),
        rich(q.prompt), inp));
    });
    w.append(h('button', { class: 'btn', onclick: () => {
      const blank = sess.qids.filter((id) => !(sess.answers[id] || '').trim()).length;
      if (blank && !confirm(`빈 문제가 ${blank}개 있어요. 그래도 제출할까요?`)) return;
      St.submitSession(sess, App.data.qmap, C.kstToday());
      App.go('#/result/' + sess.sid);
    } }, '제출하고 채점'));
    w.append(h('button', { class: 'btn sec', style: 'margin-top:8px', onclick: () => { if (confirm('이 풀이를 버릴까요?')) { c.s.quiz = null; St.save(); App.go('#/'); } } }, '풀이 버리기'));
    return w;
  });

  // ---------- 결과 ----------
  const VL = { correct: ['정답', 'ok'], wrong: ['오답', 'bad'], unsure: ['애매', 'warn'] };
  App.resultCard = function (sess, qid, s, opts) {
    const q = App.data.qmap[qid], at = s.attempts.find((a) => a.sid === sess.sid && a.qid === qid);
    const fin = C.finalVerdict(at);
    const card = h('div', { class: 'card' });
    const redo = () => card.replaceWith(App.resultCard(sess, qid, s, opts));
    card.append(h('div', null, h('span', { class: 'pill ' + (fin ? 'ok' : 'bad') }, fin ? '정답' : '오답'),
      at.auto === 'unsure' && at.override == null ? h('span', { class: 'pill warn' }, '자동판정 애매') : null,
      at.override != null ? h('span', { class: 'pill' }, '내가 수정') : null, h('span', { class: 'pill' }, q.topic)),
      rich(q.prompt),
      h('div', { class: 'txt' }, h('b', null, '내 답: '), at.answer || '(빈칸)'),
      h('div', { class: 'txt' }, h('b', null, '정답: '), q.answers.slice(0, 3).join('  /  ')),
      h('details', null, h('summary', null, '해설 대본 보기'), rich(q.explanation)),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'btn ok', style: 'min-height:44px', onclick: () => { St.setOverride(sess.sid, qid, true); redo(); } }, '맞음으로'),
        h('button', { class: 'btn bad', style: 'min-height:44px', onclick: () => { St.setOverride(sess.sid, qid, false); redo(); } }, '틀림으로')));
    if (!fin) {
      const done = (s.checks[qid] || 0) >= sess.submittedAt;
      card.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: done ? true : null,
        onchange: (e) => { if (e.target.checked) s.checks[qid] = Date.now(); else delete s.checks[qid]; St.save(); } }), '오답 확인했어요'));
    }
    return card;
  };
  App.route('result/:sid', (p, c) => {
    const sess = c.s.sessions[p.sid];
    if (!sess) return h('div', { class: 'card' }, '결과를 찾을 수 없어요.');
    const n = sess.qids.filter((id) => C.finalVerdict(c.s.attempts.find((a) => a.sid === sess.sid && a.qid === id))).length;
    const w = h('div', null, h('h1', null, `결과 ${n}/${sess.qids.length}`),
      h('p', { class: 'muted small' }, '자동 판정이 틀렸으면 "맞음/틀림"으로 고치세요. 최종 판정은 내 선택이 우선이고, 오답노트·복습 큐에 바로 반영돼요.'));
    sess.qids.forEach((id) => w.append(App.resultCard(sess, id, c.s)));
    w.append(h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/review' }, '복습 하러 가기'), h('a', { class: 'btn sec', href: '#/' }, '홈으로')));
    return w;
  });
})(window);
