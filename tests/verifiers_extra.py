"""서브넷·정규화·SQL·트리·후위표기 검증기 (프롬프트를 다시 파싱해서 독립 계산)."""
import ipaddress
import re
import sqlite3

import sims


def _cidr(p):
    return re.search(r"IP\s+(\d+\.\d+\.\d+\.\d+/\d+)", p).group(1)


def _mask_prefix(p):
    m = re.search(r"(255\.\d+\.\d+\.\d+)", p).group(1)
    return ipaddress.ip_network(f"0.0.0.0/{m}").prefixlen


def _fds(p):
    attrs = re.search(r"R\(([A-Z, ]+)\)", p).group(1).replace(",", "").replace(" ", "")
    line = re.search(r"함수 종속: (.+)", p).group(1)
    fds = [tuple(x.strip().split("→")) for x in line.split(",")]
    return attrs, fds


def _sql(p):
    db = sqlite3.connect(":memory:")
    for name, cols, data in re.findall(r"^(\w+)\(([\w, ]+)\):\s*(.*)$", p, re.M):
        db.execute(f"CREATE TABLE {name} ({cols})")
        for t in re.findall(r"\(([^()]*)\)", data):
            db.execute(f"INSERT INTO {name} VALUES ({t})")
    q = re.search(r"```sql\n(.*?)```", p, re.S).group(1)
    rows = db.execute(q).fetchall()
    return " ".join(str(x) for r in rows for x in r)


def _tree_level(p):
    m = re.search(r"레벨 순서 배열: ([\w ,\-]+)", p).group(1)
    return [None if x.strip() == "-" else x.strip() for x in m.split(",")]


def _post_eval(p):
    return sims.eval_postfix(re.search(r"후위 표기식: ([\d +\-*/]+)", p).group(1).strip())


EXTRA = {
    "subnet_broadcast": lambda p: sims.subnet(_cidr(p))["broadcast"],
    "subnet_network": lambda p: sims.subnet(_cidr(p))["network"],
    "subnet_hosts": lambda p: sims.subnet(_cidr(p))["hosts"],
    "mask_hosts": lambda p: 2 ** (32 - _mask_prefix(p)) - 2,
    "cand_keys_count": lambda p: len(sims.candidate_keys(*_fds(p))),
    "cand_keys": lambda p: " ".join(sims.candidate_keys(*_fds(p))),
    "sql": _sql,
    "tree_pre": lambda p: sims.traversals(_tree_level(p))["pre"],
    "tree_in": lambda p: sims.traversals(_tree_level(p))["in"],
    "tree_post": lambda p: sims.traversals(_tree_level(p))["post"],
    "infix_to_postfix": lambda p: sims.to_postfix(re.search(r"중위 표기식: ([\w+\-*/() ]+)", p).group(1).strip()),
    "infix_to_prefix": lambda p: sims.to_prefix(re.search(r"중위 표기식: ([\w+\-*/() ]+)", p).group(1).strip()),
    "postfix_eval": _post_eval,
}
