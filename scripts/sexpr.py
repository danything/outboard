"""KiCad の S 式を読み書きする小さな道具 (外部の依存なし)。

parse(text) -> 入れ子のリスト。文字列は Str (引用符つき) か Sym (引用符なし) で区別する。
dump(tree)  -> 文字列。
"""
from __future__ import annotations


class Sym(str):
    """引用符なしのトークン。"""


class Str(str):
    """引用符つきの文字列。"""


def parse(text: str):
    pos = 0
    n = len(text)
    stack = [[]]
    while pos < n:
        c = text[pos]
        if c in " \t\r\n":
            pos += 1
        elif c == "(":
            new = []
            stack[-1].append(new)
            stack.append(new)
            pos += 1
        elif c == ")":
            stack.pop()
            pos += 1
        elif c == '"':
            pos += 1
            buf = []
            while text[pos] != '"':
                if text[pos] == "\\":
                    pos += 1
                    ch = text[pos]
                    buf.append({"n": "\n", "t": "\t", "r": "\r"}.get(ch, ch))
                else:
                    buf.append(text[pos])
                pos += 1
            pos += 1
            stack[-1].append(Str("".join(buf)))
        else:
            start = pos
            while pos < n and text[pos] not in " \t\r\n()":
                pos += 1
            stack[-1].append(Sym(text[start:pos]))
    return stack[0][0]


def _q(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def dump(node, indent: int = 0) -> str:
    if isinstance(node, Str):
        return _q(node)
    if isinstance(node, Sym):
        return str(node)
    if isinstance(node, str):
        return _q(node)
    if isinstance(node, bool):
        return "yes" if node else "no"
    if isinstance(node, int):
        return str(node)
    if isinstance(node, float):
        s = f"{node:.6f}".rstrip("0").rstrip(".")
        return s if s not in ("-0", "") else "0"
    # list
    simple = all(not isinstance(x, list) for x in node)
    if simple:
        return "(" + " ".join(dump(x) for x in node) + ")"
    pad = "\t" * (indent + 1)
    out = ["("]
    first = True
    for x in node:
        if isinstance(x, list):
            out.append("\n" + pad + dump(x, indent + 1))
        else:
            out.append(("" if first else " ") + dump(x))
        first = False
    out.append("\n" + "\t" * indent + ")")
    return "".join(out)


def find_all(node, name: str):
    return [x for x in node if isinstance(x, list) and x and x[0] == name]


def find(node, name: str):
    r = find_all(node, name)
    return r[0] if r else None
