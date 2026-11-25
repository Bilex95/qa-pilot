# ruff: noqa: SIM905  (the stop words read better as one string than as a list literal)
"""The duplicate detector's method (AI_SPEC 3.4, D-013): TF-IDF over unigrams and bigrams, cosine similarity. No model is involved, no
library beyond the standard one, no I/O. Pure and deterministic."""

import math
import re
import uuid
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

TOP = 5
MIN_SCORE = 0.25
MAX_CANDIDATES = 2000
STOP_WORDS = frozenset(
    "a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its may might "
    "no not of on or our she should so than that the their them then there these they this to too was we were what when where which who "
    "why will with would you your".split())
WORD = re.compile(r"[a-z0-9]+")


def terms(text: str) -> list[str]:
    """Lower case words without punctuation and stop words, then their unigrams and the bigrams of neighbours."""
    words = [w for w in WORD.findall(text.lower()) if w not in STOP_WORDS]
    return words + [f"{a} {b}" for a, b in pairwise(words)]


def document(title: str, actual_result: str = "", steps: Sequence[str] = ()) -> str:
    """The text of a bug as the detector reads it: the title counts twice."""
    return f"{title} {title} {actual_result} {' '.join(steps)}"


@dataclass(frozen=True)
class Candidate:
    bug_id: uuid.UUID
    score: float  # 0 to 1, two decimals


def _weights(counts: Counter[str], idf: dict[str, float]) -> dict[str, float]:
    return {t: (1 + math.log(n)) * idf[t] for t, n in counts.items() if t in idf}


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(w * b.get(t, 0.0) for t, w in a.items())
    norm = math.sqrt(sum(w * w for w in a.values())) * math.sqrt(sum(w * w for w in b.values()))
    return dot / norm if norm else 0.0


def find_duplicates(query: str, bugs: Sequence[tuple[uuid.UUID, str]], *, top: int = TOP, min_score: float = MIN_SCORE) -> list[Candidate]:
    """The `top` bugs most like `query` with a score of at least `min_score`, best first (ties: the order given, which is newest first).
    `bugs` is (id, text) of each open bug. The idf is smoothed and taken over the bugs plus the query."""
    query_terms = Counter(terms(query))
    if not query_terms or not bugs:
        return []
    docs = [(bug_id, Counter(terms(text))) for bug_id, text in bugs[:MAX_CANDIDATES]]
    n = len(docs) + 1
    df: Counter[str] = Counter()
    for counts in [query_terms, *(c for _, c in docs)]:
        df.update(counts.keys())
    idf = {t: math.log((1 + n) / (1 + d)) + 1 for t, d in df.items()}
    q = _weights(query_terms, idf)
    scored = [(bug_id, round(_cosine(q, _weights(counts, idf)), 2)) for bug_id, counts in docs]
    best = sorted((s for s in scored if s[1] >= min_score), key=lambda s: -s[1])  # sorted is stable: equal scores keep their order
    return [Candidate(bug_id, score) for bug_id, score in best[:top]]
