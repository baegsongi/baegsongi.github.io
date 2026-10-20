/* 오답노트 · 복습 큐 */
(function (root) {
  'use strict';
  const { h, rich, fmtDate } = root.App, App = root.App, C = root.Core, St = root.Store;

  App.route('notes', (_, c) => {
    const wc = C.wrongCounts(c.s.attempts);
    const ids = Object.keys(wc).filter((id) => App.data.qmap[id]).sort((a, b) => wc[b] - wc[a]);
    const w = h('div', null, h('h1', null, `오답노트 (${ids.length})`));
    if (!ids.length) w.append(h('div', { class: 'card' }, '아직 틀린 문제가 없어요. 퀴즈를 풀면 여기에 쌓여요.'));
    ids.forEach((id) => {
      const q = App.data.qmap[id], L = c.s.leitner[id];
      const last = c.s.attempts.filter((a) => a.qid === id).pop();
      const stat = !L ? '' : L.graduated ? '졸업' : L.due ? `박스${L.box} · 다음 ${fmtDate(L.due)}` : `박스${L.box} · 시험일 이후라 미배정`;
      w.append(h('div', { class: 'card' },
        h('div', null, h('span', { class: 'pill bad' }, `${wc[id]}회 오답`), h('span', { class: 'pill' }, q.topic), stat ? h('span', { class: 'pill' }, stat) : null),
        rich(q.prompt), h('div', { class: 'txt' }, h('b', null, '정답: '), q.answers.slice(0, 3).join(' / ')),
        h('div', { class: 'txt muted' }, '내 마지막 답: ' + (last.answer || '(빈칸)')),
        h('details', null, h('summary', null, '해설 대본'), rich(q.explanation)),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: (c.s.checks[id] || 0) >= last.ts ? true : null,
          onchange: (e) => { if (e.target.checked) c.s.checks[id] = Date.now(); else delete c.s.checks[id]; St.save(); } }), '확인했어요')));
    });
    return w;
  });

  App.route('review', (_, c) => {
    const w = h('div', null, h('h1', null, '오늘 복습'));
    if (c.s.quiz && c.s.quiz.mode === 'review') return h('div', { class: 'card' }, '진행 중인 복습이 있어요.', h('a', { class: 'btn', href: '#/run', style: 'margin-top:8px' }, '이어서'));
    if (!c.due.length) {
      return h('div', { class: 'card' }, h('p', { class: 'txt' }, '오늘 복습할 문제가 없어요. 퀴즈에서 틀린 문제가 생기면 여기로 와요.'),
        h('a', { class: 'btn sec', href: '#/' }, '홈으로'));
    }
    const ids = c.due.slice(0, 30);
    w.append(h('div', { class: 'card' }, h('p', { class: 'txt' }, `복습 대상 ${c.due.length}문제 (한 번에 최대 30). 맞히면 박스가 올라가고, 틀리면 내일 다시 나와요. 박스3이 되면 졸업.`),
      h('button', { class: 'btn', onclick: () => App.startSession('review', c.day, ids, 0) }, '복습 시작')));
    return w;
  });
})(window);
