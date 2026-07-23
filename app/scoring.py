"""
Pure leaderboard computation. NO database access in here on purpose — that is
what makes the tie-break cascade unit-testable against fabricated ties.

Point allocation: within one ballot of L ranked members, the member in position
i (0-based, best first) earns (L - i) points. So rank 1 earns L, last earns 1.

Ordering is a single deterministic sort key (never a pairwise comparator, which
could be non-transitive and thus produce undefined order on a Condorcet cycle):

    key(member) = ( -points,                      # 1. more points wins
                    (-#1st, -#2nd, -#3rd, ...),    # 2. more high placements wins
                    -copeland,                     # 3. head-to-head record
                    join_order )                   # 4. deterministic fallback

  * Tiers 1–2 are marginal counts; they alone resolve almost every case.
  * `copeland` is the head-to-head record: for each other member, +1 if this
    member was ranked above them on more shared ballots, -1 if below, 0 if even.
    It only matters among members already tied on points AND every placement
    count, and — crucially — it stays a *total* key, so a rock-paper-scissors
    cycle (A>B>C>A) collapses to copeland 0 for all three and falls through to
    join order rather than producing an arbitrary order.
  * `join_order` (the member's index in `member_ids`) guarantees a fully
    deterministic, reproducible result, disclosed in advance.

Point totals are independent of ordering, so the numbers on the leaderboard are
always exact regardless of how ties are broken.
"""
from typing import Iterable


def compute_ranking(
    ballots: Iterable[list[int]],
    member_ids: list[int],
    display_names: dict[int, str] | None = None,
) -> list[dict]:
    """
    ballots: iterable of ordered member-id lists (best first).
    member_ids: every ballot-eligible member, in join order (used for fallback).
    Returns an ordered list of {member_id, display_name, points, rank}, no ties.
    """
    ballots = [list(b) for b in ballots]
    display_names = display_names or {}

    points: dict[int, int] = {m: 0 for m in member_ids}
    # place_counts[member][place] = how many ballots put member at that 0-based place.
    place_counts: dict[int, dict[int, int]] = {m: {} for m in member_ids}

    for ballot in ballots:
        length = len(ballot)
        for place, member in enumerate(ballot):
            if member not in points:
                continue  # ignore ids not on the roster (defensive)
            # +1 base: the last ranked member on a ballot scores 2, not 1, so the
            # spread starts higher (fewer collisions before the uniqueness pass).
            points[member] += (length - place) + 1
            place_counts[member][place] = place_counts[member].get(place, 0) + 1

    max_place = max((len(b) for b in ballots), default=0)
    join_order = {m: i for i, m in enumerate(member_ids)}

    def head_to_head(a: int, b: int) -> int:
        """>0 if a is ranked above b on more ballots that contain both."""
        score = 0
        for ballot in ballots:
            if a in ballot and b in ballot:
                score += 1 if ballot.index(a) < ballot.index(b) else -1
        return score

    # Copeland score: net count of head-to-head wins vs every other member.
    copeland: dict[int, int] = {}
    for m in member_ids:
        total = 0
        for other in member_ids:
            if other == m:
                continue
            h = head_to_head(m, other)
            total += (h > 0) - (h < 0)  # +1 win, -1 loss, 0 tie
        copeland[m] = total

    def sort_key(m: int):
        placements = tuple(-place_counts[m].get(p, 0) for p in range(max_place))
        return (-points[m], placements, -copeland[m], join_order[m])

    ordered = sorted(member_ids, key=sort_key)

    # Strictly-unique display points: no two members ever show the same number.
    # The order above is already a strict total order (tie-break cascade), so we
    # walk it top-down and, whenever the raw tally ties or inverts, nudge the
    # lower-ranked member down by 1. A final shift keeps every score >= 1.
    display: dict[int, int] = {}
    prev: int | None = None
    for m in ordered:
        p = points[m]
        if prev is not None and p >= prev:
            p = prev - 1
        display[m] = p
        prev = p
    if ordered:
        lowest = display[ordered[-1]]
        shift = (1 - lowest) if lowest < 1 else 0
    else:
        shift = 0

    return [
        {
            "member_id": m,
            "display_name": display_names.get(m, str(m)),
            "points": display[m] + shift,
            "rank": i + 1,
        }
        for i, m in enumerate(ordered)
    ]
