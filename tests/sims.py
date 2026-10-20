"""콘텐츠 정답 검증용 독립 시뮬레이터 (앱 코드와 무관하게 다시 계산한다)."""
import ipaddress
from collections import deque
from itertools import combinations


# ---------- 프로세스 스케줄링: procs = [(name, arrival, burst)] ----------
def _stats(procs, finish):
    res = {}
    for n, a, b in procs:
        tat = finish[n] - a
        res[n] = {"finish": finish[n], "tat": tat, "wait": tat - b}
    return res


def fcfs(procs):
    t, fin = 0, {}
    for n, a, b in sorted(procs, key=lambda p: (p[1], p[0])):
        t = max(t, a) + b
        fin[n] = t
    return _stats(procs, fin)


def sjf(procs):
    """비선점 SJF: 실행시간 짧은 순(동률이면 먼저 도착)."""
    left, t, fin = list(procs), 0, {}
    while left:
        ready = [p for p in left if p[1] <= t] or [min(left, key=lambda p: p[1])]
        p = min(ready, key=lambda p: (p[2], p[1], p[0]))
        t = max(t, p[1]) + p[2]
        fin[p[0]] = t
        left.remove(p)
    return _stats(procs, fin)


def hrn(procs):
    """비선점 HRN: (대기+실행)/실행 이 큰 순."""
    left, t, fin = list(procs), 0, {}
    while left:
        ready = [p for p in left if p[1] <= t] or [min(left, key=lambda p: p[1])]
        t = max(t, min(p[1] for p in ready))
        p = max(ready, key=lambda p: ((t - p[1] + p[2]) / p[2], -p[1]))
        t += p[2]
        fin[p[0]] = t
        left.remove(p)
    return _stats(procs, fin)


def rr(procs, q):
    """라운드 로빈. 새로 도착한 프로세스를 시간 만료된 프로세스보다 먼저 큐에 넣는다."""
    procs = sorted(procs, key=lambda p: p[1])
    rem = {n: b for n, a, b in procs}
    arr = deque(procs)
    queue, t, fin = deque(), 0, {}
    while arr or queue:
        if not queue:
            t = max(t, arr[0][1])
        while arr and arr[0][1] <= t:
            queue.append(arr.popleft()[0])
        n = queue.popleft()
        run = min(q, rem[n])
        t += run
        rem[n] -= run
        while arr and arr[0][1] <= t:
            queue.append(arr.popleft()[0])
        if rem[n]:
            queue.append(n)
        else:
            fin[n] = t
    return _stats(procs, fin)


def avg(res, key):
    return sum(v[key] for v in res.values()) / len(res)


# ---------- 페이지 교체 ----------
def page_faults(refs, frames, policy):
    mem, faults, last_use = [], 0, {}
    for i, p in enumerate(refs):
        if p in mem:
            last_use[p] = i
            continue
        faults += 1
        if len(mem) >= frames:
            if policy == "FIFO":
                mem.pop(0)
            elif policy == "LRU":
                v = min(mem, key=lambda x: last_use[x])
                mem.remove(v)
            elif policy == "OPT":
                def nxt(x):
                    rest = refs[i + 1:]
                    return rest.index(x) if x in rest else len(refs) + 1
                v = max(mem, key=nxt)
                mem.remove(v)
            elif policy == "LFU":
                raise NotImplementedError
        mem.append(p)
        last_use[p] = i
    return faults


# ---------- 서브넷 ----------
def subnet(cidr):
    n = ipaddress.ip_network(cidr, strict=False)
    hosts = n.num_addresses - 2
    return {"network": str(n.network_address), "broadcast": str(n.broadcast_address),
            "mask": str(n.netmask), "hosts": hosts,
            "first": str(n.network_address + 1), "last": str(n.broadcast_address - 1)}


# ---------- 후위표기 ----------
_PREC = {"+": 1, "-": 1, "*": 2, "/": 2}


def to_postfix(expr):
    out, st = [], []
    for ch in expr.replace(" ", ""):
        if ch.isalnum():
            out.append(ch)
        elif ch == "(":
            st.append(ch)
        elif ch == ")":
            while st[-1] != "(":
                out.append(st.pop())
            st.pop()
        else:
            while st and st[-1] != "(" and _PREC[st[-1]] >= _PREC[ch]:
                out.append(st.pop())
            st.append(ch)
    while st:
        out.append(st.pop())
    return "".join(out)


def to_prefix(expr):
    # 괄호를 뒤집어 후위로 바꾼 뒤 다시 뒤집는 대신, 재귀 파서로 독립 계산
    toks = [c for c in expr.replace(" ", "")]
    pos = 0

    def parse_expr():
        nonlocal pos
        node = parse_term()
        while pos < len(toks) and toks[pos] in "+-":
            op = toks[pos]; pos += 1
            node = (op, node, parse_term())
        return node

    def parse_term():
        nonlocal pos
        node = parse_atom()
        while pos < len(toks) and toks[pos] in "*/":
            op = toks[pos]; pos += 1
            node = (op, node, parse_atom())
        return node

    def parse_atom():
        nonlocal pos
        c = toks[pos]; pos += 1
        if c == "(":
            node = parse_expr(); pos += 1
            return node
        return c

    def pre(n):
        return n if isinstance(n, str) else n[0] + pre(n[1]) + pre(n[2])
    return pre(parse_expr())


def eval_postfix(s):
    st = []
    for t in s.split():
        if t in _PREC:
            b, a = st.pop(), st.pop()
            st.append({"+": a + b, "-": a - b, "*": a * b, "/": a / b}[t])
        else:
            st.append(float(t))
    return st[0]


# ---------- 이진 트리 (레벨 순서 배열, None=빈 자리) ----------
def traversals(level):
    def kids(i):
        return [j for j in (2 * i + 1, 2 * i + 2) if j < len(level) and level[j] is not None]

    def pre(i):
        l = kids(i)
        return [level[i]] + sum((pre(j) for j in l if j == 2 * i + 1), []) + sum((pre(j) for j in l if j == 2 * i + 2), [])

    def ino(i):
        out = []
        if 2 * i + 1 < len(level) and level[2 * i + 1] is not None:
            out += ino(2 * i + 1)
        out.append(level[i])
        if 2 * i + 2 < len(level) and level[2 * i + 2] is not None:
            out += ino(2 * i + 2)
        return out

    def post(i):
        out = []
        if 2 * i + 1 < len(level) and level[2 * i + 1] is not None:
            out += post(2 * i + 1)
        if 2 * i + 2 < len(level) and level[2 * i + 2] is not None:
            out += post(2 * i + 2)
        return out + [level[i]]
    return {"pre": "".join(map(str, pre(0))), "in": "".join(map(str, ino(0))), "post": "".join(map(str, post(0)))}


def bst_from_inserts(vals):
    root = None

    def ins(n, v):
        if n is None:
            return [v, None, None]
        if v < n[0]:
            n[1] = ins(n[1], v)
        else:
            n[2] = ins(n[2], v)
        return n
    for v in vals:
        root = ins(root, v)

    def pre(n): return [] if n is None else [n[0]] + pre(n[1]) + pre(n[2])
    def ino(n): return [] if n is None else ino(n[1]) + [n[0]] + ino(n[2])
    def post(n): return [] if n is None else post(n[1]) + post(n[2]) + [n[0]]
    def height(n): return 0 if n is None else 1 + max(height(n[1]), height(n[2]))
    return {"pre": " ".join(map(str, pre(root))), "in": " ".join(map(str, ino(root))),
            "post": " ".join(map(str, post(root))), "height": height(root)}


# ---------- 함수 종속 → 후보키 ----------
def closure(attrs, fds):
    c = set(attrs)
    changed = True
    while changed:
        changed = False
        for l, r in fds:
            if set(l) <= c and not set(r) <= c:
                c |= set(r)
                changed = True
    return c


def candidate_keys(attrs, fds):
    attrs = list(attrs)
    keys = []
    for k in range(1, len(attrs) + 1):
        for comb in combinations(attrs, k):
            if closure(comb, fds) >= set(attrs) and not any(set(x) <= set(comb) for x in keys):
                keys.append(comb)
    return ["".join(k) for k in keys]
