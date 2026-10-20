"""앱의 핵심 로직(js/core.js)을 Node로 실행해 검증: 채점 정규화, 라이트너, 일차 계산, 퀴즈 구성."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node 필요")


def call(*calls):
    r = subprocess.run(["node", str(ROOT / "tests/core_harness.js")], input=json.dumps(
        [{"fn": f, "args": a} for f, a in calls]), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def judge(inp, answers):
    return call(("judge", [inp, answers]))[0]["verdict"]


# ---------- 채점 정규화 ----------
@pytest.mark.parametrize("inp,answers,expect", [
    ("SQL Injection", ["SQL 인젝션", "SQL Injection"], "correct"),
    ("sql  injection", ["SQL Injection"], "correct"),          # 대소문자·공백
    ("Cross-Site Scripting", ["Cross Site Scripting"], "correct"),  # 하이픈
    ("스래싱(Thrashing)", ["스래싱"], "correct"),                # 괄호 안 내용 무시
    ("스래싱", ["스래싱(Thrashing)"], "correct"),
    ("5.50", ["5.5"], "correct"),                               # 숫자는 수치 비교
    ("10번", ["10"], "correct"),
    ("1,000", ["1000"], "correct"),
    ("-3", ["3"], "wrong"),
    ("5.4", ["5.5"], "wrong"),
    ("", ["x"], "wrong"),
    ("   ", ["x"], "wrong"),
    ("자료 결합도", ["자료 결합도"], "correct"),
    ("192.168.1.1", ["192.168.1.1"], "correct"),
    ("192.168.1.2", ["192.168.1.1"], "wrong"),
    ("스택프 결합도", ["스탬프 결합도"], "unsure"),             # 오타 → 애매
    ("완전히다름", ["스탬프 결합도"], "wrong"),
])
def test_judge(inp, answers, expect):
    assert judge(inp, answers) == expect


# ---------- 라이트너 ----------
def lt(state, correct, today, mode="quiz"):
    return call(("leitnerUpdate", [state, correct, today, mode]))[0]


def test_leitner_wrong_goes_box1():
    assert lt(None, False, "2026-10-20", "quiz") == {"box": 1, "due": "2026-10-20", "graduated": False}
    assert lt({"box": 2, "due": "x", "graduated": False}, False, "2026-10-20", "review") == \
        {"box": 1, "due": "2026-10-21", "graduated": False}


def test_leitner_correct_progression():
    s = lt({"box": 1, "due": "2026-10-20", "graduated": False}, True, "2026-10-21")
    assert s == {"box": 2, "due": "2026-10-23", "graduated": False}        # 박스2 → 2일 뒤
    s = lt(s, True, "2026-10-23")
    assert s["graduated"] is True and s["due"] is None                     # 박스3 → 졸업


def test_leitner_first_correct_not_queued():
    assert lt(None, True, "2026-10-20") is None


def test_leitner_no_schedule_after_exam():
    s = lt(None, False, "2026-10-25", "review")                            # 내일=시험 다음날
    assert s["due"] is None and s["box"] == 1
    s = lt({"box": 1, "due": "2026-10-24", "graduated": False}, True, "2026-10-24")  # +2일=10/26
    assert s["due"] is None


def test_due_ids():
    leit = {"a": {"box": 1, "due": "2026-10-20", "graduated": False},
            "b": {"box": 1, "due": "2026-10-22", "graduated": False},
            "c": {"box": 3, "due": None, "graduated": True}}
    assert call(("dueIds", [leit, "2026-10-21"]))[0] == ["a"]


# ---------- 일차 계산 ----------
@pytest.mark.parametrize("today,override,expect", [
    ("2026-10-20", None, 1), ("2026-10-21", None, 2), ("2026-10-24", None, 5), ("2026-10-25", None, 6),
    ("2026-10-19", None, 1), ("2026-10-30", None, 6),
    ("2026-10-22", {"day": 2, "set": "2026-10-22"}, 2),                    # 하루 밀림: 오늘을 2일차로
    ("2026-10-23", {"day": 2, "set": "2026-10-22"}, 3),                    # 다음 날엔 자동 +1
])
def test_current_day(today, override, expect):
    assert call(("currentDay", [today, override, 5]))[0] == expect


def test_dday_and_kst():
    assert call(("dday", ["2026-10-20"]))[0] == 5
    assert call(("dday", ["2026-10-25"]))[0] == 0
    # UTC 10/20 16:00 == KST 10/21 01:00
    assert call(("kstToday", ["2026-10-20T16:00:00Z"]))[0] if False else True
    r = subprocess.run(["node", "-e", "const C=require('./js/core.js');console.log(C.kstToday(new Date('2026-10-20T16:00:00Z')),C.kstToday(new Date('2026-10-20T14:59:00Z')))"],
                       cwd=ROOT, capture_output=True, text=True, check=True)
    assert r.stdout.split() == ["2026-10-21", "2026-10-20"]


# ---------- 퀴즈 구성 ----------
def make_qs():
    qs = []
    for d in range(1, 6):
        for i in range(5):
            qs.append({"id": f"d{d}c{i}", "day": d, "topic": f"T{d}", "type": "calc"})
        for i in range(12):
            qs.append({"id": f"d{d}t{i}", "day": d, "topic": f"T{d}", "type": "term"})
    return qs


def test_pick_quiz_counts_and_review_mix():
    qs = make_qs()
    leit = {"d1c0": {"box": 1, "due": "2026-10-21", "graduated": False},
            "d1t0": {"box": 1, "due": "2026-10-21", "graduated": False}}
    ids = call(("pickQuiz", [{"questions": qs, "day": 2, "today": "2026-10-21", "leitner": leit, "attempts": []}]))[0]
    assert len(ids) == 17 and len(set(ids)) == 17
    assert "d1c0" in ids and "d1t0" in ids                                  # 복습 큐가 섞임
    assert sum(1 for i in ids if i.startswith("d2")) >= 12                  # 그날 문제 위주
    assert not any(i.startswith(("d3", "d4", "d5")) for i in ids)           # 미래 일차 제외


def test_pick_quiz_day5_fills_from_weak_topics():
    qs = [q for q in make_qs() if q["day"] != 5][:0] + [q for q in make_qs() if q["day"] < 5]
    qs += [{"id": f"d5c{i}", "day": 5, "topic": "T1", "type": "calc"} for i in range(4)]
    qs += [{"id": f"d5t{i}", "day": 5, "topic": "T1", "type": "term"} for i in range(6)]
    attempts = [{"qid": "d3c1", "topic": "T3", "auto": "wrong", "override": None},
                {"qid": "d3c1", "topic": "T3", "auto": "wrong", "override": None}]
    ids = call(("pickQuiz", [{"questions": qs, "day": 5, "today": "2026-10-24", "leitner": {}, "attempts": attempts}]))[0]
    assert len(ids) == 17
    assert "d3c1" in ids                                                    # 자주 틀린 문제가 자동 포함
    assert sum(1 for i in ids if i.startswith("d5")) == 10                  # 새 문제 10개 전부


def test_topic_stats_override_wins():
    at = [{"topic": "A", "auto": "wrong", "override": True}, {"topic": "A", "auto": "correct", "override": False},
          {"topic": "A", "auto": "unsure", "override": None}]
    st = call(("topicStats", [at]))[0]
    assert st["A"]["total"] == 3 and st["A"]["correct"] == 1
