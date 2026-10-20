/* 동기화: 저장소(data/progress.json)에 자동 커밋/불러오기 + (보조) 파일 저장.
   GitHub 토큰은 이 브라우저 localStorage에만 보관되며 저장소에는 커밋되지 않는다. */
(function (root) {
  'use strict';
  const { h } = root.App, App = root.App, St = root.Store;
  const REPO = 'baegsongi/baegsongi.github.io', BRANCH = 'main', PATH = 'data/progress.json';
  const TK = 'ipsa-gh-token';
  const tok = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
  const url = (q) => `https://api.github.com/repos/${REPO}/contents/${PATH}` + (q || '');
  const hdr = () => Object.assign({ Accept: 'application/vnd.github+json' }, tok() ? { Authorization: 'Bearer ' + tok() } : {});

  const Sync = { status: '', timer: null, busy: false };
  function setStatus(t) {
    Sync.status = t;
    const el = document.getElementById('syncchip'); if (el) el.textContent = t;
  }
  async function remote() {
    const r = await fetch(url('?ref=' + BRANCH + '&t=' + Date.now()), { headers: hdr(), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub 응답 ' + r.status);
    const j = await r.json();
    return { sha: j.sha, data: JSON.parse(unb64(j.content)) };
  }
  Sync.pull = async function () {
    const r = await remote();
    if (r) St.merge(r.data);
    return !!r;
  };
  Sync.push = async function (retry) {
    if (!tok()) throw new Error('토큰이 없어요');
    const cur = await remote();
    if (cur) St.merge(cur.data);
    const body = JSON.stringify(Object.assign({}, St.get(), { quiz: null, savedAt: new Date().toISOString() }));
    const res = await fetch(url(), { method: 'PUT', headers: hdr(), body: JSON.stringify({
      message: '학습 기록 자동 저장', content: b64(body), branch: BRANCH, sha: cur ? cur.sha : undefined }) });
    if (res.status === 409 && !retry) return Sync.push(true);          // 다른 기기가 먼저 저장 → 병합 후 재시도
    if (!res.ok) throw new Error('저장 실패 ' + res.status + (res.status === 401 || res.status === 403 || res.status === 404 ? ' (토큰/권한 확인)' : ''));
    setStatus('☁ 저장됨 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  };
  // 변경 후 3초 뒤 자동 커밋
  Sync.schedule = function () {
    if (!tok()) return;
    clearTimeout(Sync.timer); setStatus('☁ 저장 대기…');
    Sync.timer = setTimeout(async () => {
      try { await Sync.push(); } catch (e) { setStatus('☁ 저장 실패: ' + e.message); }
    }, 3000);
  };
  St.onSave(Sync.schedule);
  // 앱 시작 시 자동 불러오기 (boot에서 호출)
  Sync.init = async function () {
    try { setStatus('☁ 불러오는 중…'); await Sync.pull(); setStatus(tok() ? '☁ 동기화됨' : '☁ 읽기 전용'); }
    catch (e) { setStatus('☁ 오프라인'); }
  };
  App.Sync = Sync;

  App.route('sync', (_, c) => {
    const msg = h('div', { class: 'txt' });
    const say = (t) => { msg.textContent = t; };
    const tin = h('input', { type: 'password', placeholder: 'github_pat_… (Contents 읽기/쓰기)', value: tok(), style: 'width:100%', autocomplete: 'off' });
    const run = (label, fn) => async () => { say(label + ' 중…'); try { say(await fn()); App.render(); } catch (e) { say('실패: ' + e.message); } };
    return h('div', null, h('h1', null, '저장 / 불러오기'),
      h('div', { class: 'card' }, h('h2', null, '저장소 자동 동기화'),
        h('p', { class: 'muted small' }, `토큰을 한 번 넣으면, 풀이할 때마다 ${REPO}의 ${PATH}에 자동 커밋되고 다른 PC에서 열면 자동으로 불러와요. 저장소가 공개라 학습 기록(개인정보 없음)도 공개됩니다.`),
        h('p', { class: 'small' }, '토큰 만들기: GitHub → Settings → Developer settings → Fine-grained tokens → 이 저장소만 선택 → Permissions: Contents = Read and write. 토큰은 이 브라우저에만 저장돼요.'),
        tin,
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn', onclick: run('토큰 확인·저장', async () => {
            try { localStorage.setItem(TK, tin.value.trim()); } catch (e) { throw new Error('이 브라우저는 저장이 막혀 있어요'); }
            await Sync.pull(); await Sync.push(); return '연결됨. 이제 자동으로 저장돼요.';
          }) }, '토큰 저장·연결'),
          h('button', { class: 'btn sec', onclick: run('지금 저장', async () => { await Sync.push(); return '저장했어요.'; }) }, '지금 저장'),
          h('button', { class: 'btn sec', onclick: run('불러오기', async () => (await Sync.pull()) ? '불러와 병합했어요.' : '저장된 기록이 아직 없어요.') }, '지금 불러오기')),
        h('button', { class: 'btn sec', style: 'margin-top:8px', onclick: () => { try { localStorage.removeItem(TK); } catch (e) {} tin.value = ''; setStatus('☁ 읽기 전용'); say('이 브라우저의 토큰을 지웠어요.'); } }, '토큰 지우기')),
      h('div', { class: 'card' }, h('h2', null, '(보조) 파일로 백업'),
        h('div', { class: 'row' },
          h('button', { class: 'btn sec', onclick: () => {
            const a = h('a', { href: URL.createObjectURL(new Blob([St.exportJSON()], { type: 'application/json' })), download: `ipsa-progress-${c.today}.json` });
            document.body.append(a); a.click(); a.remove();
          } }, '파일로 저장'),
          h('label', { class: 'btn sec' }, '파일 불러오기', h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            try { if (confirm('이 기기의 기록을 파일 내용으로 바꿀까요?')) { St.importJSON(await f.text()); say('불러왔어요.'); } } catch (err) { say('실패: ' + err.message); }
          } })))),
      msg);
  });
})(window);
