"""콘텐츠 검증: 스키마 + 계산·코드 문제 정답을 프롬프트에서 다시 파싱해 독립 계산한 값과 대조한다.
태그 verify:<종류> 가 없는 calc/code 문제는 실패 처리(검증 못 한 계산 문제는 넣지 않는다)."""
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

import sims

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"


def load_questions():
    man = json.loads((CONTENT / "manifest.json").read_text(encoding="utf-8"))
    out = []
    for f in man["questions"] + man.get("extra", []):
        p = CONTENT / f
        if p.exists():
            out += json.loads(p.read_text(encoding="utf-8"))
    return out


def load_lessons():
    man = json.loads((CONTENT / "manifest.json").read_text(encoding="utf-8"))
    out = []
    for f in man["lessons"]:
        p = CONTENT / f
        if p.exists():
            out += json.loads(p.read_text(encoding="utf-8"))
    return out


QUESTIONS = load_questions()
LESSONS = load_lessons()
PLAN = json.loads((ROOT / "plan.json").read_text(encoding="utf-8"))
ALL_TOPICS = {t for d in PLAN["days"] for t in d["topics"]}


# ---------- 스키마·분량 ----------
def test_schema_and_unique_ids():
    ids = set()
    for q in QUESTIONS:
        for k in ("id", "day", "topic", "type", "prompt", "answers", "explanation", "difficulty", "tags"):
            assert k in q, (q.get("id"), k)
        assert q["type"] in ("calc", "code", "term")
        assert q["answers"] and all(isinstance(a, str) and a.strip() for a in q["answers"])
        assert q["topic"] in ALL_TOPICS, (q["id"], q["topic"])
        assert q["id"] not in ids, q["id"]
        ids.add(q["id"])


@pytest.mark.parametrize("day,calc,term", [(1, 5, 12), (2, 5, 12), (3, 5, 12), (4, 5, 12)])
def test_counts_per_day(day, calc, term):
    qs = [q for q in QUESTIONS if q["day"] == day]
    if not qs:
        pytest.skip("아직 작성 전")
    assert sum(q["type"] in ("calc", "code") for q in qs) == calc
    assert sum(q["type"] == "term" for q in qs) == term


def test_day5_count():
    qs = [q for q in QUESTIONS if q["day"] == 5]
    if qs:
        assert 8 <= len(qs) <= 12


def test_every_topic_has_lesson():
    have = {l["topic"] for l in LESSONS}
    for d in PLAN["days"]:
        if any(q["day"] == d["day"] for q in QUESTIONS):
            for t in d["topics"]:
                assert t in have or t == "종합 모의고사", t


def test_lesson_fields():
    for l in LESSONS:
        for k in ("id", "day", "topic", "title", "summary", "mnemonic"):
            assert l.get(k), (l.get("id"), k)
        assert l["analogy"] and l["rule"]


# ---------- 파서 ----------
def procs_of(prompt):
    return [(n, int(a), int(b)) for n, a, b in re.findall(r"(P\d+)\(도착 (\d+), 실행 (\d+)\)", prompt)]


def refs_of(prompt):
    m = re.search(r"참조 문자열: ([\d ]+)", prompt)
    return [int(x) for x in m.group(1).split()]


def frames_of(prompt):
    return int(re.search(r"프레임이 (\d+)개", prompt).group(1))


def fence(prompt, lang):
    m = re.search(r"```%s\n(.*?)```" % lang, prompt, re.S)
    return m.group(1)


def nums(s):
    return [float(x) for x in s.split()]


# ---------- 종류별 검증기: prompt -> 기대 정답(문자열 또는 숫자) ----------
def _fmt(x):
    return f"{x:.10g}"


VERIFIERS = {
    "fcfs_wait": lambda p: sims.avg(sims.fcfs(procs_of(p)), "wait"),
    "sjf_tat": lambda p: sims.avg(sims.sjf(procs_of(p)), "tat"),
    "rr_wait": lambda p: sims.avg(sims.rr(procs_of(p), int(re.search(r"시간 할당량\(타임 퀀텀\)이 (\d+)", p).group(1))), "wait"),
    "hrn_wait": lambda p: sims.avg(sims.hrn(procs_of(p)), "wait"),
    "fifo": lambda p: sims.page_faults(refs_of(p), frames_of(p), "FIFO"),
    "lru": lambda p: sims.page_faults(refs_of(p), frames_of(p), "LRU"),
    "opt": lambda p: sims.page_faults(refs_of(p), frames_of(p), "OPT"),
}
VERIFIERS.update(getattr(__import__("verifiers_extra"), "EXTRA", {}) if (Path(__file__).parent / "verifiers_extra.py").exists() else {})


def run_c(code):
    if not shutil.which("gcc"):
        pytest.skip("gcc 없음")
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "a.c").write_text(code)
        subprocess.run(["gcc", "-w", "-o", str(Path(d) / "a"), str(Path(d) / "a.c")], check=True)
        return subprocess.run([str(Path(d) / "a")], capture_output=True, text=True, check=True).stdout


def run_java(code):
    if not shutil.which("javac"):
        pytest.skip("javac 없음")
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "Main.java").write_text(code)
        subprocess.run(["javac", "-nowarn", "Main.java"], cwd=d, check=True, capture_output=True)
        return subprocess.run(["java", "-cp", d, "Main"], capture_output=True, text=True, check=True).stdout


def norm(s):
    return re.sub(r"[\s,\-_]", "", str(s)).lower()


def matches(expected, answers):
    def isnum(x):
        try:
            float(x); return True
        except (TypeError, ValueError):
            return False
    if isnum(expected):
        return all(abs(float(re.sub(r"[^\d.+-]", "", a)) - float(expected)) < 1e-6 for a in answers if isnum(re.sub(r"[^\d.+-]", "", a))) \
            and any(isnum(re.sub(r"[^\d.+-]", "", a)) and abs(float(re.sub(r"[^\d.+-]", "", a)) - float(expected)) < 1e-6 for a in answers)
    return any(norm(a) == norm(expected) for a in answers)


CALC = [q for q in QUESTIONS if q["type"] in ("calc", "code")]


@pytest.mark.parametrize("q", CALC, ids=[q["id"] for q in CALC])
def test_calc_answer_verified(q):
    kinds = [t.split(":", 1)[1] for t in q["tags"] if t.startswith("verify:")]
    assert kinds, f"{q['id']}: verify 태그 없음 (검증 못 한 계산 문제는 넣지 않는다)"
    kind = kinds[0]
    if kind == "c":
        expected = run_c(fence(q["prompt"], "c")).strip()
    elif kind == "java":
        expected = run_java(fence(q["prompt"], "java")).strip()
    else:
        expected = VERIFIERS[kind](q["prompt"])
    assert matches(expected, q["answers"]), f"{q['id']}: 기대값 {expected!r} ≠ 정답 {q['answers']}"
