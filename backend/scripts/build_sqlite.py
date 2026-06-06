from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_JSONLINES_DIR = ROOT_DIR / "jsonlines"
DEFAULT_OUTPUT = ROOT_DIR / "data" / "bgmss.sqlite"
POSITION_ID_MAPPING_FILE_PATH = Path(__file__).resolve().parent / "position_id_mapping.json"

REQUIRED_JSONLINES = [
    "subject.jsonlines",
    "person.jsonlines",
    "character.jsonlines",
    "subject-characters.jsonlines",
    "subject-persons.jsonlines",
    "person-characters.jsonlines",
    "subject-relations.jsonlines",
]

NAME_CN_RE = re.compile(r"\|(?:简体中文名|中文名)\s*=\s*([^\r\n|}]+)")


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def iter_jsonlines(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if line.strip():
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"[warn] skip invalid JSON in {path.name}:{line_no}: {e}")


def log_progress(name: str, count: int, step: int = 50_000) -> None:
    if count and count % step == 0:
        print(f"[{name}] {count} rows")


def load_image_map(path: Path) -> dict[int, str]:
    if not path.exists():
        return {}

    images: dict[int, str] = {}
    for item in iter_jsonlines(path):
        if not item:
            continue
        raw_id, url = next(iter(item.items()))
        if url:
            images[int(raw_id)] = url
    return images


def extract_name_cn(item: dict[str, Any]) -> str:
    explicit = item.get("name_cn")
    if explicit:
        return explicit

    infobox = item.get("infobox") or ""
    match = NAME_CN_RE.search(infobox)
    if match:
        name_cn = match.group(1).strip()
        if name_cn:
            return name_cn

    return item.get("name", "")


def setup_connection(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA locking_mode = EXCLUSIVE")
    conn.execute("PRAGMA foreign_keys = OFF")
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS casts;
        DROP TABLE IF EXISTS subject_characters;
        DROP TABLE IF EXISTS credits;
        DROP TABLE IF EXISTS sequels;
        DROP TABLE IF EXISTS characters;
        DROP TABLE IF EXISTS people;
        DROP TABLE IF EXISTS subjects;

        CREATE TABLE subjects (
            subject_id INTEGER PRIMARY KEY,
            subject_name TEXT NOT NULL,
            subject_name_cn TEXT NOT NULL,
            subject_rate REAL NOT NULL,
            subject_type INTEGER NOT NULL,
            subject_favorite INTEGER NOT NULL,
            subject_tags TEXT,
            subject_date TEXT,
            subject_image TEXT,
            subject_nsfw INTEGER,
            subject_infobox TEXT,
            subject_platform INTEGER,
            subject_summary TEXT,
            subject_score_details TEXT,
            subject_rank INTEGER,
            subject_meta_tags TEXT,
            subject_favorite_detail TEXT,
            subject_series INTEGER
        );

        CREATE TABLE people (
            person_id INTEGER PRIMARY KEY,
            person_name TEXT NOT NULL,
            person_name_cn TEXT NOT NULL,
            person_type INTEGER,
            person_career TEXT,
            person_infobox TEXT,
            person_summary TEXT,
            person_comments INTEGER,
            person_collects INTEGER
        );

        CREATE TABLE characters (
            character_id INTEGER PRIMARY KEY,
            character_name TEXT NOT NULL,
            character_name_cn TEXT NOT NULL,
            character_image TEXT,
            character_role INTEGER,
            character_infobox TEXT,
            character_summary TEXT,
            character_comments INTEGER,
            character_collects INTEGER
        );

        CREATE TABLE credits (
            subject_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            position_id INTEGER NOT NULL,
            PRIMARY KEY (subject_id, person_id, position_id)
        );

        CREATE TABLE casts (
            subject_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            character_id INTEGER NOT NULL,
            position_id INTEGER NOT NULL,
            PRIMARY KEY (subject_id, person_id, character_id, position_id)
        );

        CREATE TABLE subject_characters (
            subject_id INTEGER NOT NULL,
            character_id INTEGER NOT NULL,
            character_type INTEGER NOT NULL,
            sort_order INTEGER NOT NULL,
            PRIMARY KEY (subject_id, character_id, character_type)
        );

        CREATE TABLE sequels (
            subject_id INTEGER PRIMARY KEY,
            series_id INTEGER NOT NULL,
            sequel_order INTEGER NOT NULL
        );
        """
    )


def chunked(values: list[tuple[Any, ...]], size: int) -> Iterable[list[tuple[Any, ...]]]:
    for i in range(0, len(values), size):
        yield values[i : i + size]


def flush(conn: sqlite3.Connection, sql: str, rows: list[tuple[Any, ...]]) -> None:
    if rows:
        conn.executemany(sql, rows)
        rows.clear()


def load_subjects(
    conn: sqlite3.Connection,
    jsonlines_dir: Path,
    batch_size: int,
) -> tuple[set[int], dict[int, int], dict[int, str]]:
    print("[subjects] loading")
    subject_images = load_image_map(jsonlines_dir / "subject-image.jsonlines")
    subject_ids: set[int] = set()
    subject_types: dict[int, int] = {}
    subject_dates: dict[int, str] = {}

    sql = """
        INSERT INTO subjects (
            subject_id,
            subject_name,
            subject_name_cn,
            subject_rate,
            subject_type,
            subject_favorite,
            subject_tags,
            subject_date,
            subject_image,
            subject_nsfw,
            subject_infobox,
            subject_platform,
            subject_summary,
            subject_score_details,
            subject_rank,
            subject_meta_tags,
            subject_favorite_detail,
            subject_series
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    count = 0
    for item in iter_jsonlines(jsonlines_dir / "subject.jsonlines"):
        subject_id = int(item["id"])
        subject_ids.add(subject_id)
        subject_types[subject_id] = int(item["type"])
        subject_dates[subject_id] = item.get("date") or "9999-99-99"

        favorite = item.get("favorite") or {}
        tags = [tag.get("name", "") for tag in item.get("tags", []) if tag.get("name")]
        image = subject_images.get(subject_id) or (
            f"https://api.bgm.tv/v0/subjects/{subject_id}/image?type=grid"
        )
        rows.append(
            (
                subject_id,
                item.get("name") or "",
                extract_name_cn(item),
                item.get("score") or 0,
                item.get("type") or 0,
                sum(int(v or 0) for v in favorite.values()),
                dump_json(tags),
                item.get("date") or None,
                image,
                1 if item.get("nsfw") else 0,
                item.get("infobox") or "",
                item.get("platform"),
                item.get("summary") or "",
                dump_json(item.get("score_details") or {}),
                item.get("rank"),
                dump_json(item.get("meta_tags") or []),
                dump_json(favorite),
                1 if item.get("series") else 0,
            )
        )
        count += 1
        log_progress("subjects", count)
        if len(rows) >= batch_size:
            flush(conn, sql, rows)
    flush(conn, sql, rows)
    print(f"[subjects] done: {count}")
    return subject_ids, subject_types, subject_dates


def load_people(conn: sqlite3.Connection, jsonlines_dir: Path, batch_size: int) -> None:
    print("[people] loading")
    sql = """
        INSERT INTO people (
            person_id,
            person_name,
            person_name_cn,
            person_type,
            person_career,
            person_infobox,
            person_summary,
            person_comments,
            person_collects
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    count = 0
    for item in iter_jsonlines(jsonlines_dir / "person.jsonlines"):
        rows.append(
            (
                item.get("id"),
                item.get("name") or "",
                extract_name_cn(item),
                item.get("type"),
                dump_json(item.get("career") or []),
                item.get("infobox") or "",
                item.get("summary") or "",
                item.get("comments"),
                item.get("collects"),
            )
        )
        count += 1
        log_progress("people", count)
        if len(rows) >= batch_size:
            flush(conn, sql, rows)
    flush(conn, sql, rows)
    print(f"[people] done: {count}")


def load_characters(conn: sqlite3.Connection, jsonlines_dir: Path, batch_size: int) -> None:
    print("[characters] loading")
    character_images = load_image_map(jsonlines_dir / "character-image.jsonlines")
    sql = """
        INSERT INTO characters (
            character_id,
            character_name,
            character_name_cn,
            character_image,
            character_role,
            character_infobox,
            character_summary,
            character_comments,
            character_collects
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    count = 0
    for item in iter_jsonlines(jsonlines_dir / "character.jsonlines"):
        character_id = int(item["id"])
        image = character_images.get(character_id) or (
            f"https://api.bgm.tv/v0/characters/{character_id}/image?type=grid"
        )
        rows.append(
            (
                character_id,
                item.get("name") or "",
                extract_name_cn(item),
                image,
                item.get("role"),
                item.get("infobox") or "",
                item.get("summary") or "",
                item.get("comments"),
                item.get("collects"),
            )
        )
        count += 1
        log_progress("characters", count)
        if len(rows) >= batch_size:
            flush(conn, sql, rows)
    flush(conn, sql, rows)
    print(f"[characters] done: {count}")


def load_subject_characters(
    conn: sqlite3.Connection,
    jsonlines_dir: Path,
    subject_types: dict[int, int],
    batch_size: int,
) -> dict[tuple[int, int], int]:
    print("[subject_characters] loading")
    sql = """
        INSERT OR IGNORE INTO subject_characters (
            subject_id,
            character_id,
            character_type,
            sort_order
        )
        VALUES (?, ?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    subject_character_to_position: dict[tuple[int, int], int] = {}
    with POSITION_ID_MAPPING_FILE_PATH.open("r", encoding="utf-8") as f:
        id_mapping = json.load(f)

    count = 0
    for item in iter_jsonlines(jsonlines_dir / "subject-characters.jsonlines"):
        subject_id = int(item["subject_id"])
        character_id = int(item["character_id"])
        character_type = int(item.get("type") or 0)
        if subject_id not in subject_types:
            continue

        rows.append(
            (
                subject_id,
                character_id,
                character_type,
                int(item.get("order") or 0),
            )
        )

        if subject_types[subject_id] in (2, 4):
            offset = 100 if subject_types[subject_id] == 2 else 1100
            original_pos_id = character_type + offset
            mapped_ids = id_mapping.get(str(original_pos_id), [original_pos_id])
            subject_character_to_position[(subject_id, character_id)] = (
                original_pos_id if original_pos_id in mapped_ids else mapped_ids[0]
            )

        count += 1
        log_progress("subject_characters", count)
        if len(rows) >= batch_size:
            flush(conn, sql, rows)
    flush(conn, sql, rows)
    print(f"[subject_characters] done: {count}")
    return subject_character_to_position


def load_credits(
    conn: sqlite3.Connection,
    jsonlines_dir: Path,
    subject_ids: set[int],
    subject_types: dict[int, int],
    batch_size: int,
) -> set[int]:
    print("[credits] loading")
    with POSITION_ID_MAPPING_FILE_PATH.open("r", encoding="utf-8") as f:
        id_mapping = json.load(f)

    sql = """
        INSERT OR IGNORE INTO credits (subject_id, person_id, position_id)
        VALUES (?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    valid_cv_person_ids: set[int] = set()
    count = 0

    for item in iter_jsonlines(jsonlines_dir / "subject-persons.jsonlines"):
        subject_id = int(item["subject_id"])
        if subject_id not in subject_ids:
            continue

        person_id = int(item["person_id"])
        valid_cv_person_ids.add(person_id)
        for position_id in id_mapping.get(str(item["position"]), []):
            rows.append((subject_id, person_id, int(position_id)))
            count += 1
            log_progress("credits", count)
            if len(rows) >= batch_size:
                flush(conn, sql, rows)

    character_position_map: dict[int, dict[int, int]] = defaultdict(dict)
    for item in iter_jsonlines(jsonlines_dir / "subject-characters.jsonlines"):
        subject_id = int(item["subject_id"])
        if subject_id not in subject_types or subject_types[subject_id] not in (2, 4):
            continue
        offset = 100 if subject_types[subject_id] == 2 else 1100
        character_position_map[subject_id][int(item["character_id"])] = (
            int(item["type"]) + offset
        )

    for item in iter_jsonlines(jsonlines_dir / "person-characters.jsonlines"):
        subject_id = int(item["subject_id"])
        character_id = int(item["character_id"])
        person_id = int(item["person_id"])
        if person_id not in valid_cv_person_ids:
            continue
        if subject_id not in character_position_map:
            continue
        if character_id not in character_position_map[subject_id]:
            continue

        original_pos_id = character_position_map[subject_id][character_id]
        for position_id in id_mapping.get(str(original_pos_id), []):
            rows.append((subject_id, person_id, int(position_id)))
            count += 1
            log_progress("credits", count)
            if len(rows) >= batch_size:
                flush(conn, sql, rows)

    flush(conn, sql, rows)
    print(f"[credits] done: {count}")
    return valid_cv_person_ids


def load_casts(
    conn: sqlite3.Connection,
    jsonlines_dir: Path,
    subject_ids: set[int],
    subject_character_to_position: dict[tuple[int, int], int],
    batch_size: int,
) -> None:
    print("[casts] loading")
    sql = """
        INSERT OR IGNORE INTO casts (subject_id, person_id, character_id, position_id)
        VALUES (?, ?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    count = 0
    for item in iter_jsonlines(jsonlines_dir / "person-characters.jsonlines"):
        subject_id = int(item["subject_id"])
        character_id = int(item["character_id"])
        key = (subject_id, character_id)
        if subject_id not in subject_ids or key not in subject_character_to_position:
            continue
        rows.append(
            (
                subject_id,
                int(item["person_id"]),
                character_id,
                subject_character_to_position[key],
            )
        )
        count += 1
        log_progress("casts", count)
        if len(rows) >= batch_size:
            flush(conn, sql, rows)
    flush(conn, sql, rows)
    print(f"[casts] done: {count}")


class UnionFind:
    def __init__(self, size: int):
        self.parent = list(range(size))
        self.size = [1] * size

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, x: int, y: int) -> None:
        root_x = self.find(x)
        root_y = self.find(y)
        if root_x == root_y:
            return
        if self.size[root_x] > self.size[root_y]:
            self.parent[root_y] = root_x
            self.size[root_x] += self.size[root_y]
        else:
            self.parent[root_x] = root_y
            self.size[root_y] += self.size[root_x]


def load_sequels(
    conn: sqlite3.Connection,
    jsonlines_dir: Path,
    subject_ids: set[int],
    subject_types: dict[int, int],
    subject_dates: dict[int, str],
    batch_size: int,
) -> None:
    print("[sequels] loading")
    same_series_relations = {
        2,
        3,
        4,
        5,
        6,
        9,
        10,
        11,
        12,
        1002,
        1003,
        1004,
        1005,
        1006,
        1007,
        1008,
        1010,
        1013,
        1015,
        4002,
        4003,
        4006,
        4009,
        4010,
        4012,
        4015,
        4016,
        4017,
        4018,
    }
    main_series_positive_relations = {
        1,
        3,
        4,
        6,
        11,
        1003,
        1006,
        1007,
        4003,
        4006,
        4015,
        4018,
        4019,
    }
    main_series_neutral_relations = {
        7,
        8,
        9,
        10,
        14,
        99,
        1004,
        1010,
        1011,
        1012,
        1013,
        1014,
        1015,
        1099,
        3001,
        3002,
        3003,
        3004,
        3005,
        3006,
        3007,
        3099,
        4007,
        4008,
        4009,
        4010,
        4014,
        4016,
        4099,
    }
    main_series_negative_relations = {
        2,
        5,
        12,
        1002,
        1005,
        1008,
        4002,
        4012,
        4017,
    }

    max_subject_id = max(subject_ids) if subject_ids else 0
    uf = UnionFind(max_subject_id + 1)
    main_score: dict[int, int] = defaultdict(int)

    relation_count = 0
    for item in iter_jsonlines(jsonlines_dir / "subject-relations.jsonlines"):
        subject_id = int(item["subject_id"])
        relation_type = int(item["relation_type"])
        related_subject_id = int(item["related_subject_id"])
        if subject_id not in subject_ids or related_subject_id not in subject_ids:
            continue

        is_same_type = subject_types[subject_id] == subject_types[related_subject_id]
        if relation_type in same_series_relations and is_same_type:
            uf.union(subject_id, related_subject_id)
        if relation_type in main_series_positive_relations and is_same_type:
            main_score[subject_id] += 5
            main_score[related_subject_id] -= 5
        if relation_type in main_series_negative_relations and is_same_type:
            main_score[subject_id] -= 5
            main_score[related_subject_id] += 5
        if relation_type in main_series_neutral_relations:
            main_score[subject_id] += 1
            main_score[related_subject_id] += 1

        relation_count += 1
        log_progress("sequels:relations", relation_count)

    root_to_subjects: dict[int, list[int]] = defaultdict(list)
    for subject_id in subject_ids:
        root_to_subjects[uf.find(subject_id)].append(subject_id)

    sql = """
        INSERT INTO sequels (subject_id, series_id, sequel_order)
        VALUES (?, ?, ?)
    """
    rows: list[tuple[Any, ...]] = []
    series_id = 1
    count = 0
    for root_subject_ids in root_to_subjects.values():
        root_subject_ids.sort(
            key=lambda subject_id: (
                -main_score[subject_id],
                subject_dates[subject_id],
            )
        )
        if len(root_subject_ids) > 1:
            first = root_subject_ids[0]
            second = root_subject_ids[1]
            if (
                main_score[first] - main_score[second] < 15
                and subject_dates[first] > subject_dates[second]
            ):
                root_subject_ids[0], root_subject_ids[1] = second, first

        for order, subject_id in enumerate(root_subject_ids):
            rows.append((subject_id, series_id, order))
            count += 1
            if len(rows) >= batch_size:
                flush(conn, sql, rows)
        series_id += 1

    flush(conn, sql, rows)
    print(f"[sequels] done: {count}")


def create_indexes(conn: sqlite3.Connection) -> None:
    print("[indexes] creating")
    conn.executescript(
        """
        CREATE INDEX idx_subject_type_favorite
            ON subjects (subject_type, subject_favorite);
        CREATE INDEX idx_credits_position_subject_person
            ON credits (position_id, subject_id, person_id);
        CREATE INDEX idx_credits_person_position_subject
            ON credits (person_id, position_id, subject_id);
        CREATE INDEX idx_casts_position_subject_person_character
            ON casts (position_id, subject_id, person_id, character_id);
        CREATE INDEX idx_casts_person_subject_character
            ON casts (person_id, subject_id, character_id);
        CREATE INDEX idx_casts_character_subject_person
            ON casts (character_id, subject_id, person_id);
        CREATE INDEX idx_subject_characters_subject_order
            ON subject_characters (subject_id, sort_order, character_type);
        CREATE INDEX idx_subject_characters_character_subject
            ON subject_characters (character_id, subject_id);
        CREATE INDEX idx_sequels_series_order
            ON sequels (series_id, sequel_order);
        ANALYZE;
        """
    )


def validate_jsonlines_dir(jsonlines_dir: Path) -> None:
    missing = [name for name in REQUIRED_JSONLINES if not (jsonlines_dir / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"missing required jsonlines in {jsonlines_dir}: {', '.join(missing)}"
        )


def build_database(jsonlines_dir: Path, output: Path, batch_size: int) -> None:
    validate_jsonlines_dir(jsonlines_dir)
    tmp_output = output.with_suffix(output.suffix + ".tmp")
    if tmp_output.exists():
        tmp_output.unlink()

    conn = setup_connection(tmp_output)
    try:
        create_schema(conn)
        conn.execute("BEGIN")
        subject_ids, subject_types, subject_dates = load_subjects(
            conn,
            jsonlines_dir,
            batch_size,
        )
        load_people(conn, jsonlines_dir, batch_size)
        load_characters(conn, jsonlines_dir, batch_size)
        subject_character_to_position = load_subject_characters(
            conn,
            jsonlines_dir,
            subject_types,
            batch_size,
        )
        load_credits(conn, jsonlines_dir, subject_ids, subject_types, batch_size)
        load_casts(conn, jsonlines_dir, subject_ids, subject_character_to_position, batch_size)
        load_sequels(conn, jsonlines_dir, subject_ids, subject_types, subject_dates, batch_size)
        conn.commit()
        create_indexes(conn)
        conn.commit()
        conn.execute("VACUUM")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    output.parent.mkdir(parents=True, exist_ok=True)
    os.replace(tmp_output, output)
    print(f"[done] wrote {output}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build bgmss SQLite snapshot from jsonlines.")
    parser.add_argument(
        "--jsonlines-dir",
        type=Path,
        default=DEFAULT_JSONLINES_DIR,
        help=f"jsonlines directory, default: {DEFAULT_JSONLINES_DIR}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"SQLite output path, default: {DEFAULT_OUTPUT}",
    )
    parser.add_argument("--batch-size", type=int, default=5_000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_database(args.jsonlines_dir.resolve(), args.output.resolve(), args.batch_size)


if __name__ == "__main__":
    main()
