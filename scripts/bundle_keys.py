"""Find which catalog messages a bundle reads and which it carries.

Shared by gen_catalogs.py, which gives each shipped bundle the messages its code reads, and
check_bundle.py, which checks the built bundles against the same reading. Both work on esbuild's
output, after tree shaking, so a module the entry never reaches adds nothing.

- A bundle reads a message when a string literal of its code equals the key, or the plural base
  of the key (`notice_hidden` for `notice_hidden_one`). Keys are typed, so code names them as
  literals; a template whose first chunk starts a key (`kind_${id}`) is a computed key, and it is
  reported, since no literal shows which messages it reads.
- A bundle carries a message when an entry line of an inlined catalog,
  `"<key>": { message: ... },` as gen_catalogs.py writes it and esbuild keeps it, names the key.
  Those lines are left out before the literals are read.
"""

import re

from catalogs import Catalog, plural_base, plural_bases
from ts_literals import string_literals

CATALOG_ENTRY = re.compile(r'^[ \t]*"([A-Za-z0-9_@]+)": \{ message: .*\},?[ \t]*$', re.MULTILINE)
KEY_START = "_"


def name_of(key: str, bases: set[str]) -> str:
    """The name code reads `key` by: its plural base when English has one, else the key itself."""
    base = plural_base(key)
    return base if base is not None and base in bases else key


def message_names(english: Catalog) -> set[str]:
    """The names code reads the messages of the English catalog by."""
    bases = plural_bases(english)
    return {name_of(key, bases) for key in english}


def carried_keys(script: str) -> set[str]:
    """The keys of the catalogs inlined in a bundle, every locale together."""
    return set(CATALOG_ENTRY.findall(script))


def read_names(script: str, names: set[str]) -> set[str]:
    """The message names the code of a bundle reads, outside its inlined catalogs."""
    code = CATALOG_ENTRY.sub("", script)
    return {
        literal.parts[0]
        for literal in string_literals(code)
        if len(literal.parts) == 1 and literal.parts[0] in names
    }


def computed_keys(script: str, names: set[str]) -> list[str]:
    """The templates in a bundle's code whose first chunk starts a message name, as written."""
    code = CATALOG_ENTRY.sub("", script)
    return [
        "${}".join(literal.parts)
        for literal in string_literals(code)
        if len(literal.parts) > 1
        and literal.parts[0].endswith(KEY_START)
        and any(name.startswith(literal.parts[0]) for name in names)
    ]
