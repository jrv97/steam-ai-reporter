"""Fit release notes into a store's length limit."""

AMO_LIMIT = 3000
ELLIPSIS = "..."


def fit(notes: str, limit: int, footer: str) -> str:
    """Return `notes` unchanged if it fits, else whole lines that fit with `footer` after them.

    A single line longer than the room left is cut and ends with an ellipsis.
    """
    if len(notes) <= limit:
        return notes
    room = limit - len(footer) - 2
    kept: list[str] = []
    used = 0
    for line in notes.splitlines():
        gap = 1 if kept else 0
        cost = len(line) + gap
        if used + cost > room:
            if all(item.startswith("#") for item in kept):
                cut = max(room - used - gap - len(ELLIPSIS), 0)
                kept.append(line[:cut].rstrip() + ELLIPSIS)
            break
        kept.append(line)
        used += cost
    while kept and kept[-1].startswith("#"):
        kept.pop()
    return "\n".join(kept) + "\n\n" + footer
