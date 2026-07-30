"""Fatal-UTF-8, duplicate-key-safe YAML input."""

from __future__ import annotations

from collections.abc import Hashable
from typing import cast

import yaml

from .errors import CatalogError


class _UniqueKeyLoader(yaml.SafeLoader):  # type: ignore[misc]
    """SafeLoader variant that rejects every duplicate mapping key."""


def _construct_unique_mapping(
    loader: _UniqueKeyLoader,
    node: yaml.nodes.MappingNode,
    deep: bool = False,
) -> dict[object, object]:
    loader.flatten_mapping(node)
    result: dict[object, object] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, Hashable) or key in result:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                "found duplicate or unhashable key",
                key_node.start_mark,
            )
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


_UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def load_yaml(data: bytes, code: str) -> object:
    """Decode and safely load one bounded YAML document."""
    loader: _UniqueKeyLoader | None = None
    try:
        text = data.decode("utf-8", errors="strict")
        loader = _UniqueKeyLoader(text)
        loaded = loader.get_single_data()
    except (UnicodeDecodeError, yaml.YAMLError) as error:
        raise CatalogError(code) from error
    finally:
        if loader is not None:
            loader.dispose()
    if loaded is None:
        raise CatalogError(code)
    return cast(object, loaded)
