#!/usr/bin/env python3
"""(선택) 약점 토픽의 추가 '용어' 문제를 content/extra_*.json 으로 생성한다.
ANTHROPIC_API_KEY 환경변수가 있을 때만 동작. 앱 본체는 이 스크립트 없이도 완전히 동작한다.
계산·코드 문제는 독립 검증이 불가능해서 만들지 않는다(용어 문제만).

사용: python scripts/generate_content.py [백업.json] [--topics "보안 공격,암호"] [--n 6]
백업.json 은 앱의 '파일로 저장' 파일이며, 있으면 정답률 낮은 토픽 3개를 고른다.
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")


def weak_topics(backup):
    data = json.loads(Path(backup).read_text(encoding="utf-8"))
    st = {}
    for a in data.get("attempts", []):
        ok = a["override"] if a.get("override") is not None else a["auto"] == "correct"
        t = st.setdefault(a["topic"], [0, 0])
        t[0] += ok
        t[1] += 1
    return [k for k, _ in sorted(st.items(), key=lambda kv: kv[1][0] / kv[1][1])][:3]


def ask(topic, n, key):
    prompt = (f"정보처리기사 실기 '{topic}' 토픽의 용어(단답) 연습 문제 {n}개를 JSON 배열로만 출력하세요. "
              "기출 원문은 베끼지 말고 유형만 본떠 새로 만드세요. 각 원소: "
              '{"prompt": 설명을 보고 용어를 쓰는 질문, "answers": [표준 명칭, 허용 표기...], '
              '"explanation": 중학생도 이해하는 대본체 해설(비유→한 줄 정리)}. 영문 약어는 철자 정확히.')
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", method="POST", data=json.dumps({
        "model": MODEL, "max_tokens": 4000, "messages": [{"role": "user", "content": prompt}]}).encode(),
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    text = json.load(urllib.request.urlopen(req, timeout=120))["content"][0]["text"]
    return json.loads(text[text.index("["): text.rindex("]") + 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("backup", nargs="?")
    ap.add_argument("--topics")
    ap.add_argument("--n", type=int, default=6)
    args = ap.parse_args()
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        print("ANTHROPIC_API_KEY 가 없어서 건너뜁니다. (앱은 이 스크립트 없이 정상 동작합니다)")
        return 0
    topics = args.topics.split(",") if args.topics else (weak_topics(args.backup) if args.backup else [])
    if not topics:
        print("토픽을 정하지 못했어요. --topics 또는 백업 파일을 주세요.")
        return 1
    plan = json.loads((ROOT / "plan.json").read_text(encoding="utf-8"))
    day_of = {t: d["day"] for d in plan["days"] for t in d["topics"]}
    man_path = ROOT / "content/manifest.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    for t in topics:
        items = ask(t, args.n, key)
        out = [{"id": f"x-{day_of.get(t, 5)}-{abs(hash(t)) % 9999}-{i}", "day": day_of.get(t, 5), "topic": t, "type": "term",
                "prompt": it["prompt"], "answers": it["answers"], "explanation": it["explanation"],
                "difficulty": 2, "tags": ["term", "generated"]} for i, it in enumerate(items)]
        name = f"extra_{t.replace(' ', '_')}.json"
        (ROOT / "content" / name).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        if name not in man["extra"]:
            man["extra"].append(name)
        print(f"{t}: {len(out)}문제 → content/{name}")
    man_path.write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
