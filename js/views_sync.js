/* 저장/불러오기: 파일(JSON) 입출력. 다른 PC로는 파일을 옮겨서 불러온다. */
(function (root) {
  'use strict';
  const { h } = root.App, App = root.App, St = root.Store;
  App.route('sync', (_, c) => {
    const msg = h('div', { class: 'txt' });
    const say = (t) => { msg.textContent = t; };
    return h('div', null, h('h1', null, '저장 / 불러오기'),
      h('div', { class: 'card' }, h('h2', null, '파일로 저장 · 불러오기'),
        h('p', { class: 'muted small' }, `현재 풀이 기록 ${c.s.attempts.length}건. 저장 버튼을 누르면 JSON 파일이 내려받아져요. 다른 PC에서는 그 파일을 "파일 불러오기"로 열면 이어서 풀 수 있어요.`),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => {
            const a = h('a', { href: URL.createObjectURL(new Blob([St.exportJSON()], { type: 'application/json' })), download: `ipsa-progress-${c.today}.json` });
            document.body.append(a); a.click(); a.remove(); say('파일을 내려받았어요.');
          } }, '파일로 저장'),
          h('label', { class: 'btn sec' }, '파일 불러오기', h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            try { if (confirm('이 기기의 기록을 파일 내용으로 바꿀까요?')) { St.importJSON(await f.text()); say('불러왔어요.'); } } catch (err) { say('실패: ' + err.message); }
          } })))),
      msg);
  });
})(window);
