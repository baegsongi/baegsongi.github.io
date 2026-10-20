/* 마지막 복습: 약점 순위, 자주 틀린 문제, 플래시카드, A4 요약, 시험 당일 15분 코스 */
(function (root) {
  'use strict';
  const { h, rich, pct } = root.App, App = root.App, C = root.Core, St = root.Store;

  function weakTopics(c) {
    const st = C.topicStats(c.s.attempts);
    const all = [];
    c.plan.days.forEach((d) => d.topics.forEach((t) => { if (t !== '약점 보강' && t !== '종합 모의고사' && !all.includes(t)) all.push(t); }));
    return all.map((t) => ({ topic: t, rate: st[t] ? st[t].rate : null, total: st[t] ? st[t].total : 0 }))
      .filter((x) => x.total > 0).sort((a, b) => a.rate - b.rate);
  }
  const lessonsOf = (topic) => App.data.lessons.filter((l) => l.topic === topic);

  App.route('final', (_, c) => {
    const w = h('div', null, h('h1', null, '마지막 복습'));
    w.append(h('div', { class: 'row', style: 'margin-bottom:12px' },
      h('a', { class: 'btn', href: '#/final/cards' }, '용어 플래시카드'),
      h('a', { class: 'btn', href: '#/final/summary' }, '핵심 요약 (A4 인쇄)'),
      h('a', { class: 'btn', href: '#/final/morning' }, '시험일 15분 코스')));
    const wk = weakTopics(c);
    w.append(h('div', { class: 'card' }, h('h2', null, '약점 토픽 순위 (정답률 낮은 순)'),
      wk.length ? wk.map((x, i) => h('div', { class: 'trow' }, h('span', null, `${i + 1}. ${x.topic}`),
        h('div', { class: 'prog' }, h('i', { class: x.rate < 0.5 ? 'low' : x.rate < 0.8 ? 'mid' : 'hi', style: `width:${Math.round(x.rate * 100)}%` })),
        h('span', { class: 'muted' }, pct(x.rate)))) : h('p', { class: 'muted' }, '퀴즈를 풀면 순위가 나와요.')));
    const wc = C.wrongCounts(c.s.attempts);
    const top = Object.keys(wc).filter((id) => App.data.qmap[id]).sort((a, b) => wc[b] - wc[a]).slice(0, 10);
    w.append(h('div', { class: 'card' }, h('h2', null, '자주 틀린 문제 TOP 10'),
      top.length ? top.map((id) => { const q = App.data.qmap[id];
        return h('details', null, h('summary', null, h('span', { class: 'pill bad' }, wc[id] + '회'), q.topic, ' · ', q.prompt.split('\n')[0].slice(0, 40)),
          rich(q.prompt), h('div', { class: 'txt' }, h('b', null, '정답: '), q.answers.slice(0, 3).join(' / ')), rich(q.explanation)); })
        : h('p', { class: 'muted' }, '아직 오답이 없어요.')));
    return w;
  });

  // ----- 플래시카드 -----
  const deck = { filter: 'dunno', idx: 0, flip: false };
  App.route('final/cards', (_, c) => {
    const terms = App.data.questions.filter((q) => q.type === 'term');
    const box = h('div');
    const draw = () => {
      const marks = c.s.cards;
      let list = terms.filter((q) => deck.filter === 'all' ? true : deck.filter === 'dunno' ? marks[q.id] === 'dunno' : !marks[q.id]);
      if (deck.idx >= list.length) deck.idx = 0;
      const q = list[deck.idx];
      const seg = (k, t) => h('button', { class: 'btn ' + (deck.filter === k ? '' : 'sec'), style: 'min-height:44px', onclick: () => { deck.filter = k; deck.idx = 0; deck.flip = false; draw(); } }, t);
      box.replaceChildren(
        h('div', { class: 'row' }, seg('dunno', `몰라요만 (${terms.filter((x) => marks[x.id] === 'dunno').length})`), seg('new', `안 본 것 (${terms.filter((x) => !marks[x.id]).length})`), seg('all', `전체 (${terms.length})`)),
        !q ? h('div', { class: 'card', style: 'margin-top:12px' }, deck.filter === 'dunno' ? '몰라요로 표시한 카드가 없어요. 🎉' : '카드가 없어요.') : h('div', null,
          h('p', { class: 'muted small' }, `${deck.idx + 1} / ${list.length} · 탭하면 뒤집혀요`),
          h('div', { class: 'card flash', onclick: () => { deck.flip = !deck.flip; draw(); } },
            deck.flip ? h('div', null, h('b', null, q.answers[0]), q.answers.length > 1 ? h('div', { class: 'muted small' }, '허용: ' + q.answers.slice(1, 4).join(' / ')) : null,
              h('div', { class: 'small txt', style: 'text-align:left;margin-top:8px' }, q.explanation))
              : h('div', { class: 'txt' }, q.prompt)),
          h('div', { class: 'row' },
            h('button', { class: 'btn ok', onclick: () => { marks[q.id] = 'know'; St.save(); deck.flip = false; draw(); } }, '알아요'),
            h('button', { class: 'btn bad', onclick: () => { marks[q.id] = 'dunno'; St.save(); deck.flip = false; deck.idx = deck.filter === 'dunno' ? deck.idx + 1 : deck.idx; draw(); } }, '몰라요'))));
    };
    draw();
    return h('div', null, h('h1', null, '용어 플래시카드'), box, h('p', { class: 'muted small' }, '"몰라요만"을 고르면 몰라요 카드만 반복돼요. "알아요"를 누르면 거기서 빠져요.'));
  });

  // ----- A4 요약 -----
  App.route('final/summary', (_, c) => {
    const w = h('div', null, h('div', { class: 'hide-print' }, h('h1', null, '핵심 요약 한 장'),
      h('button', { class: 'btn', onclick: () => window.print() }, '인쇄 / PDF 저장 (A4)'), h('p', { class: 'muted small' }, '인쇄 화면에서 "PDF로 저장"을 고르면 파일로도 받을 수 있어요.')));
    const a4 = h('div', { class: 'a4' });
    const seen = new Set();
    App.data.lessons.filter((l) => l.summary).forEach((l) => {
      if (seen.has(l.id)) return; seen.add(l.id);
      a4.append(h('div', { class: 'card' }, h('h3', null, l.topic + ' · ' + l.title), h('div', { class: 'sum' }, l.summary), l.mnemonic ? h('div', { class: 'mn' }, l.mnemonic) : null));
    });
    w.append(a4); return w;
  });

  // ----- 시험일 15분 코스 -----
  App.route('final/morning', (_, c) => {
    const wk = weakTopics(c).slice(0, 3);
    const w = h('div', null, h('h1', null, '시험일 아침 15분 코스'),
      h('p', { class: 'muted small' }, '새 공부는 하지 않아요. 순서대로 5분씩.'));
    const sec = wk.length ? wk : [];
    w.append(h('div', { class: 'card' }, h('h2', null, '① 약점 요약 (5분)'),
      sec.length ? sec.map((x) => h('div', null, h('b', null, `${x.topic} (${pct(x.rate)})`),
        lessonsOf(x.topic).map((l) => h('div', null, h('div', { class: 'sum' }, l.summary), l.mnemonic ? h('div', { class: 'mn' }, l.mnemonic) : null))))
        : h('p', { class: 'txt' }, '아직 기록이 없어서 전체 요약을 보세요.'), h('a', { href: '#/final/summary' }, '전체 요약 보기')));
    const nd = App.data.questions.filter((q) => c.s.cards[q.id] === 'dunno').length;
    w.append(h('div', { class: 'card' }, h('h2', null, '② 몰라요 카드 (5분)'), h('p', { class: 'txt' }, `몰라요 카드 ${nd}장`),
      h('a', { class: 'btn', href: '#/final/cards', onclick: () => { deck.filter = 'dunno'; deck.idx = 0; deck.flip = false; } }, '카드 시작')));
    const wc = C.wrongCounts(c.s.attempts), st = C.topicStats(c.s.attempts);
    const calc = App.data.questions.filter((q) => C.isCalc(q)).sort((a, b) =>
      ((wc[b.id] || 0) - (wc[a.id] || 0)) || (((st[a.topic] || { rate: 1 }).rate) - ((st[b.topic] || { rate: 1 }).rate)));
    const picks = [], tp = new Set();
    calc.forEach((q) => { if (picks.length < 3 && !tp.has(q.topic)) { picks.push(q); tp.add(q.topic); } });
    calc.forEach((q) => { if (picks.length < 3 && !picks.includes(q)) picks.push(q); });
    w.append(h('div', { class: 'card' }, h('h2', null, '③ 틀렸던 계산 문제 3개 (5분)'),
      h('p', { class: 'txt' }, picks.map((q) => `· ${q.topic}${wc[q.id] ? ` (${wc[q.id]}회 오답)` : ''}`).join('\n')),
      h('button', { class: 'btn', disabled: picks.length ? null : true, onclick: () => App.startSession('morning', c.day, picks.map((q) => q.id), 0) }, '풀기')));
    return w;
  });
})(window);
