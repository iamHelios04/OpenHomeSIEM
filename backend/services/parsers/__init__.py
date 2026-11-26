# === filename: backend/services/parsers/__init__.py ===
"""Extensible source-type parser registry."""

from collections.abc import Callable

from services.log_parser import ParsedLog

PARSER_MODULES = {
    "router": "services.parsers.router_parser",
    "dlink": "services.parsers.router_parser",
    "switch": "services.parsers.switch_parser",
    "firewall": "services.parsers.firewall_parser",
    "ids": "services.parsers.ids_parser",
    "windows": "services.parsers.windows_parser",
    "linux": "services.parsers.linux_parser",
}


def parser_for(device_type: str) -> Callable[..., ParsedLog] | None:
    """Return a registered parser callable without loading unused plugins."""
    module_name = PARSER_MODULES.get(device_type.lower())
    if not module_name:
        return None
    from importlib import import_module

    module = import_module(module_name)
    return getattr(module, "parse")
