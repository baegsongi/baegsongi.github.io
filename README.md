# 정보처리기사 실기 D-5 학습 웹앱

시험일 **2026-10-25(일)** 까지 5일 동안 쓰는 개인용 학습 앱입니다.
흐름: 오늘의 학습 → 30분 퀴즈 → 채점·오답 체크 → 복습 → (마지막) /최종 복습.

- 배포: GitHub Pages (`https://baegsongi.github.io/`) — **정적 사이트**라서 서버 없이 폰·PC 어디서나 열립니다.
- 스택: 빌드 없는 HTML + 바닐라 JS, 진행 기록은 브라우저 localStorage. 파이썬은 콘텐츠 검증(pytest)에만 씁니다.

## 설계 결정 (원래 요구와 달라진 부분)
GitHub Pages는 정적 호스팅이라 Flask/SQLite 서버를 돌릴 수 없습니다. 그래서:

| 원래 | 실제 |
|---|---|
| Flask + Jinja2 서버 렌더링 | 정적 HTML + 바닐라 JS (hash 라우팅) |
| data/study.db (sqlite) | 브라우저 localStorage + **파일 저장/불러오기(JSON)** |
| seed.py (중복 없이 시드) | 불필요: 콘텐츠는 `content/*.json`을 매번 읽고, 풀이 기록은 별도 저장소라 콘텐츠를 고쳐도 지워지지 않음 |
| `flask run` | `python -m http.server` (로컬) 또는 GitHub Pages |

## 사용법
- 온라인: Pages 주소로 접속. 폰 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.
- 로컬: `python -m http.server 8000` → http://localhost:8000
- 같은 와이파이의 폰에서: `python -m http.server 8000 --bind 0.0.0.0` 후 폰에서 `http://<PC의 IP>:8000`
- 오늘 날짜는 KST 기준 자동 인식. 하루 밀렸으면 화면 위 "오늘을 [ ]" 에서 N일차로 지정하세요(이후 날짜는 자동으로 +1).
- **기록 옮기기**: 홈 하단 "저장 / 불러오기"에서 JSON 파일로 저장 → 다른 PC에서 "파일 불러오기".
  기록은 기기·브라우저별로 따로이므로, PC를 바꾸기 전에 꼭 저장하세요.

## 구조
```
index.html, css/, js/        앱 (core.js=채점·라이트너·일차 계산 등 순수 로직)
plan.json                    일차별 계획 (토픽, 시간)
content/manifest.json        읽을 콘텐츠 파일 목록 (extra_*.json 추가 가능)
content/lessons_d{1..5}.json 레슨(비유·규칙·예제 풀이·한 줄 정리·암기 문장)
content/questions_d{1..5}.json 문제 (id, day, topic, type, prompt, answers, explanation, difficulty, tags)
tests/                       pytest: 채점·라이트너·일차 계산(Node로 core.js 실행) + 콘텐츠 검증
scripts/generate_content.py  (선택) ANTHROPIC_API_KEY 가 있을 때만 약점 토픽 용어 문제 추가 생성
```

## 테스트
```
pip install -r requirements.txt
python -m pytest
```
- 계산·코드 문제 정답은 `tests/sims.py`(스케줄링·페이지교체·서브넷·후위표기·트리·후보키)와 sqlite, **gcc/javac 실제 실행**으로 프롬프트를 다시 파싱해 독립 계산한 값과 대조합니다. 검증 태그(`verify:*`)가 없는 계산 문제는 테스트가 실패합니다.
- 채점·라이트너·일차 계산은 Node로 `js/core.js`를 직접 호출해 검사합니다 (Node 필요).

## 가정
- 채점: 대소문자·공백·하이픈·쉼표 무시, 괄호는 "괄호 안 내용 포함/제외" 둘 다 비교, 숫자는 수치 비교(단위 `회/번/개/초/%` 등 무시). 오타(1~2자)나 부분 일치는 "애매"로 표시하고, 최종 판정은 사용자가 고친 값이 우선입니다.
- 라이트너: 퀴즈에서 틀리면 박스1·**오늘** 다시, 복습에서 틀리면 박스1·**내일** 다시. 맞히면 박스+1(박스2는 2일 뒤, 박스3은 졸업). 처음부터 맞힌 문제는 큐에 들어가지 않고, 시험일(10/25) 이후로는 일정을 잡지 않습니다.
- 퀴즈 구성: 계산·코드 5 + 용어 12. 복습 큐 문제를 최대 계산 2 + 용어 3개 섞고, 나머지는 그날 문제 → 모자라면 오답 많은 문제·약한 토픽 순으로 이전 일차에서 보충(5일차는 새 문제 10개 + 자동 구성).
- 체크리스트의 "오답 체크"는 마지막 퀴즈의 오답을 모두 "확인했어요" 했을 때, "복습"은 오늘 복습 큐를 풀었거나 큐가 비었을 때 완료입니다.
- 문제는 2024~2026 복원 기출의 **유형**을 본뜬 직접 만든 연습 문제입니다(기출 원문 아님).
- 개인정보·비밀값은 저장소에 없습니다. 풀이 기록은 저장소에 커밋되지 않습니다.

## GitHub Pages 설정
이 저장소는 사용자 사이트(`baegsongi.github.io`)이므로 **기본 브랜치(main)의 루트**가 배포됩니다.
Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` 로 두고, 작업 브랜치를 main에 병합하세요.
