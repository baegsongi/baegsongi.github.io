/* 퀴즈용 계산기: 안전한 수식 계산기(eval 미사용) + 플로팅 UI */
(function (root) {
  'use strict';
  // 지원: + − × ÷ ^ (거듭제곱) mod(%) 괄호 소수점, 단항 마이너스
  function evaluate(src) {
    const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '').replace(/mod/gi, '%');
    let i = 0;
    const err = () => { throw new Error('식 오류'); };
    function num() {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i)); if (!m) err();
      i += m[0].length; return Number(m[0]);
    }
    function atom() {
      if (s[i] === '(') { i++; const v = add(); if (s[i] !== ')') err(); i++; return v; }
      if (s[i] === '-') { i++; return -pow(); }
      if (s[i] === '+') { i++; return pow(); }
      return num();
    }
    function pow() { const b = atom(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; }
    function mul() {
      let v = pow();
      while (s[i] === '*' || s[i] === '/' || s[i] === '%') {
        const o = s[i++], r = pow();
        v = o === '*' ? v * r : o === '/' ? v / r : v % r;
      }
      return v;
    }
    function add() {
      let v = mul();
      while (s[i] === '+' || s[i] === '-') { const o = s[i++], r = mul(); v = o === '+' ? v + r : v - r; }
      return v;
    }
    if (!s) err();
    const v = add(); if (i !== s.length || !isFinite(v)) err();
    return v;
  }
  const fmt = (v) => String(Number(v.toPrecision(12)));

  function mount() {
    const h = root.App.h;
    const disp = h('input', { type: 'text', class: 'cdisp', inputmode: 'none', autocomplete: 'off', placeholder: '0', 'aria-label': '계산식' });
    const sub = h('div', { class: 'csub small muted' }, ' ');
    const press = (k) => {
      if (k === 'C') { disp.value = ''; sub.textContent = ' '; }
      else if (k === '⌫') disp.value = disp.value.slice(0, -1);
      else if (k === '=') {
        try { const r = fmt(evaluate(disp.value)); sub.textContent = disp.value + ' ='; disp.value = r; }
        catch (e) { sub.textContent = '식을 확인하세요'; }
      } else disp.value += k;
    };
    disp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); press('='); } });
    const keys = ['C', '(', ')', '⌫', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '^', '+', 'mod', '=' ];
    const grid = h('div', { class: 'cgrid' }, keys.map((k) => h('button', { type: 'button', class: 'ckey' + (k === '=' ? ' eq' : '/÷×−+^'.includes(k) || k === 'mod' ? ' op' : ''), onclick: () => press(k) }, k)));
    const panel = h('div', { class: 'calc-ui cpanel', hidden: true },
      h('div', { class: 'chead' }, h('b', null, '계산기'), h('button', { type: 'button', class: 'cx', onclick: () => { panel.hidden = true; } }, '✕')), sub, disp, grid);
    const fab = h('button', { type: 'button', class: 'calc-ui cfab', 'aria-label': '계산기 열기', onclick: () => { panel.hidden = !panel.hidden; if (!panel.hidden) disp.focus({ preventScroll: true }); } }, '🧮');
    document.body.append(panel, fab);
  }
  const api = { evaluate, fmt, mount, unmount() { document.querySelectorAll('.calc-ui').forEach((e) => e.remove()); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
