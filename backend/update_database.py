from collections import defaultdict
import json
import pymysql
from tqdm import tqdm
import argparse
import toml


JSONLINES_FILE_PATH = "../backend/jsonlines/"


def load_subjects(cursor, batch_size=1000):
    print("开始加载 subjects")

    # 加载并解析全部 JSON 数据
    with open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8") as f:
        lines = [json.loads(line) for line in f if line.strip()]

    def chunked(iterable, size):
        """生成器：将列表按 batch_size 分批"""
        for i in range(0, len(iterable), size):
            yield iterable[i : i + size]

    total = len(lines)
    print(f"共需导入 {total} 条记录，批大小：{batch_size}")

    for _, batch in enumerate(
        tqdm(
            chunked(lines, batch_size),
            total=(total + batch_size - 1) // batch_size,
            desc="写入 subjects",
            ncols=80,
        )
    ):
        values = []
        for item in batch:
            subject_id = str(item["id"])
            tags_json = json.dumps(
                [tag["name"] for tag in item["tags"]], ensure_ascii=False
            )
            image = f"https://api.bgm.tv/v0/subjects/{subject_id}/image?type=grid"

            values.append(
                (
                    subject_id,
                    item["name"],
                    item["name_cn"] if item["name_cn"] else item["name"],
                    item["score"],
                    item["type"],
                    sum(item["favorite"].values()),
                    tags_json,
                    image,
                )
            )

        cursor.executemany(
            "INSERT INTO subjects "
            "(subject_id, subject_name, subject_name_cn, subject_rate, subject_type, subject_favorite, subject_tags, subject_image) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "subject_name=VALUES(subject_name), "
            "subject_name_cn=VALUES(subject_name_cn), "
            "subject_rate=VALUES(subject_rate), "
            "subject_type=VALUES(subject_type), "
            "subject_favorite=VALUES(subject_favorite), "
            "subject_tags=VALUES(subject_tags), "
            "subject_image=VALUES(subject_image)",
            values,
        )

    print("加载 subjects 完毕")


def extract_name_cn(item):
    """
    从 infobox 提取中文名，没有则返回 None
    """
    infobox = item["infobox"]
    if "简体中文名" not in infobox:
        return item["name"]

    start = infobox.find("简体中文名=") + len("简体中文名=")
    # 查找可能的结束标记：\r\n、| 或 }
    end_rn = infobox.find("\r\n", start)
    end_pipe = infobox.find("|", start)
    end_brace = infobox.find("}", start)
    # 选择最小的正数作为结束位置
    possible_ends = [end_rn, end_pipe, end_brace]
    end_positions = [
        pos for pos in possible_ends if pos != -1
    ]  # 过滤掉没有找到的情况 (-1)
    if end_positions:
        end = min(end_positions)  # 选择最早的结束位置
    else:
        end = len(infobox)  # 如果找不到任何结束标记，取到字符串末尾

    name_cn = infobox[start:end].strip()
    if name_cn == "":
        return item["name"]
    return name_cn


def load_people(cursor, batch_size=1000):
    print("开始加载 people")

    with open(JSONLINES_FILE_PATH + "person.jsonlines", "r", encoding="utf-8") as f:
        lines = [json.loads(line) for line in f if line.strip()]

    def chunked(iterable, size):
        for i in range(0, len(iterable), size):
            yield iterable[i : i + size]

    total = len(lines)
    print(f"共需导入 {total} 条 people，批大小：{batch_size}")

    for batch in tqdm(
        chunked(lines, batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 people",
        ncols=80,
    ):
        values = [(item["id"], item["name"], extract_name_cn(item)) for item in batch]

        cursor.executemany(
            "INSERT INTO people (person_id, person_name, person_name_cn) "
            "VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "person_name = VALUES(person_name), person_name_cn = VALUES(person_name_cn)",
            values,
        )

    print("加载 people 完毕")


def load_characters(cursor, batch_size=1000):
    print("开始加载 characters")

    with open(JSONLINES_FILE_PATH + "character.jsonlines", "r", encoding="utf-8") as f:
        lines = [json.loads(line) for line in f if line.strip()]

    def chunked(iterable, size):
        for i in range(0, len(iterable), size):
            yield iterable[i : i + size]

    total = len(lines)
    print(f"共需导入 {total} 条 characters，批大小：{batch_size}")

    for batch in tqdm(
        chunked(lines, batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 characters",
        ncols=80,
    ):
        values = []
        for item in batch:
            character_id = str(item["id"])
            image = f"https://api.bgm.tv/v0/characters/{character_id}/image?type=grid"
            values.append((item["id"], item["name"], extract_name_cn(item), image))

        cursor.executemany(
            "INSERT INTO characters (character_id, character_name, character_name_cn, character_image) "
            "VALUES (%s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "character_name = VALUES(character_name), "
            "character_name_cn = VALUES(character_name_cn), "
            "character_image = VALUES(character_image)",
            values,
        )

    print("加载 characters 完毕")


def load_subject_person(cursor, batch_size=1000):
    print("开始加载 subject-person")

    # 加载 subject ids
    subject_ids = set()
    print("开始加载所有 subjects")
    with open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8") as f:
        subject_types = {}
        for line in f:
            item = json.loads(line)
            subject_ids.add(item["id"])
            if item["type"] in (2, 4):  # 2: 动画, 4: 游戏
                subject_types[item["id"]] = item["type"]

    # 加载非声优职位 subject-person
    print("开始加载非声优职位")
    subject_person_map = defaultdict(list)
    with open(
        JSONLINES_FILE_PATH + "subject-persons.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            if item["subject_id"] in subject_ids:
                subject_person_map[item["subject_id"]].append(
                    (item["person_id"], item["position"])
                )

    # 加载角色和人物之间的配音关系
    print("开始加载所有配音关系")
    character_position_map = defaultdict(dict)  # subject_id -> character_id -> position
    with open(
        JSONLINES_FILE_PATH + "subject-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            sid = item["subject_id"]
            if sid not in subject_types:
                continue
            # 动画声优是 101 - 103，游戏声优是 1101 - 1103
            offset = 100 if subject_types[sid] == 2 else 1100
            character_position_map[sid][item["character_id"]] = offset + item["type"]

    with open(
        JSONLINES_FILE_PATH + "person-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            sid = item["subject_id"]
            cid = item["character_id"]
            pid = item["person_id"]
            if sid in character_position_map and cid in character_position_map[sid]:
                position = character_position_map[sid][cid]
                subject_person_map[sid].append((pid, position))

    # 展平为列表
    data = [
        (sid, pid, position)
        for sid, person_list in subject_person_map.items()
        for pid, position in person_list
    ]

    def chunked(iterable, size):
        for i in range(0, len(iterable), size):
            yield iterable[i : i + size]

    total = len(data)
    print(f"共需导入 {total} 条 subject-person 关系，批大小：{batch_size}")

    for batch in tqdm(
        chunked(data, batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 subject_person",
        ncols=80,
    ):
        cursor.executemany(
            "INSERT INTO subject_person (subject_id, person_id, position) "
            "VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE position = VALUES(position)",
            batch,
        )

    print("加载 subject_person 完毕")


def load_person_character(cursor, batch_size=1000):
    print("开始加载 person-character")

    print("加载所有条目 id 中")
    subject_ids = set()
    with open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8") as f:
        for line in f:
            item = json.loads(line)
            subject_ids.add(item["id"])
    print("加载所有条目 id 完毕")

    print("加载 subject-character-role 中")
    subject_character_to_role = {}
    with open(
        JSONLINES_FILE_PATH + "subject-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            subject_character_to_role[(item["subject_id"], item["character_id"])] = (
                item["type"]
            )

    with open(
        JSONLINES_FILE_PATH + "person-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        lines = [json.loads(line) for line in f if line.strip()]

    data = []
    for item in lines:
        key = (item["subject_id"], item["character_id"])
        if (
            item["subject_id"] not in subject_ids
            or key not in subject_character_to_role
        ):
            continue

        role = subject_character_to_role[key]
        data.append((item["person_id"], item["subject_id"], item["character_id"], role))

    def chunked(iterable, size):
        for i in range(0, len(iterable), size):
            yield iterable[i : i + size]

    total = len(data)
    print(f"共需导入 {total} 条 person-character 数据，批大小：{batch_size}")

    for batch in tqdm(
        chunked(data, batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 person-character",
        ncols=80,
    ):
        cursor.executemany(
            "INSERT INTO person_character (person_id, subject_id, character_id, role) "
            "VALUES (%s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE role = VALUES(role)",
            batch,
        )

    print("加载 person-character 完毕")


# 并查集函数
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n

    def find(self, x):
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x, y):
        rootX = self.find(x)
        rootY = self.find(y)
        if rootX != rootY:
            if self.size[rootX] > self.size[rootY]:
                self.parent[rootY] = rootX
                self.size[rootX] += self.size[rootY]
            else:
                self.parent[rootX] = rootY
                self.size[rootY] += self.size[rootX]


def load_sequel_orders(cursor, batch_size=1000):
    print("开始加载 sequel_orders")

    # 定义relation_type范围
    relevant_relations = set([2, 3, 4, 5, 6, 9, 10, 11, 12])  # 属于一个系列的关系
    related_relations = set(
        [1, 3, 4, 6, 7, 8, 9, 10, 11, 14, 1099]
    )  # 此集合内的关系越多，越可能是第一季
    minus_relations = set([2, 12])  # 此集合内的关系越多，越不可能是第一季

    print("加载所有条目的类型和日期中")
    subject_types_and_dates = defaultdict()
    with open(
        JSONLINES_FILE_PATH + "subject.jsonlines", mode="r", encoding="utf-8"
    ) as f:
        for line in f:
            data = json.loads(line)
            subject_types_and_dates[data["id"]] = (data["type"], data["date"])

    # 初始化并查集
    SUBJECT_NUM = max([int(key) for key in subject_types_and_dates.keys()])
    uf = UnionFind(600000)

    # 存储每个条目与其关联的条目数
    subject_relation_count = defaultdict(int)

    # 遍历所有条目，构建有关条目之间的关系
    print("构建所有条目之间的关系中")
    with open(JSONLINES_FILE_PATH + "subject-relations.jsonlines", mode="r") as f:
        for line in f:
            data = json.loads(line)
            subject_id = data["subject_id"]
            relation_type = data["relation_type"]
            related_subject_id = data["related_subject_id"]

            # 如果条目与给定范围的条目有关，则合并它们
            if (
                relation_type in relevant_relations
                and subject_id in subject_types_and_dates
                and related_subject_id in subject_types_and_dates
                and subject_types_and_dates[subject_id][0]
                == subject_types_and_dates[related_subject_id][0]
            ):
                uf.union(subject_id, related_subject_id)

            # 统计关联条目数
            if relation_type in related_relations:
                subject_relation_count[subject_id] += 1

            if (
                relation_type in minus_relations
                and subject_id in subject_types_and_dates
                and related_subject_id in subject_types_and_dates
                and subject_types_and_dates[subject_id][1]
                > subject_types_and_dates[related_subject_id][1]
            ):
                subject_relation_count[subject_id] -= 2

    # 找到每个集合中的最大条目，并进行额外判断
    series_max = defaultdict(list)  # {series_id: [(subject_id, relation_count)]}

    for subject_id in range(SUBJECT_NUM):
        root = uf.find(subject_id)
        series_max[root].append((subject_id, subject_relation_count[subject_id]))

    # 对每个集合进行处理
    subject_to_series_info = {}  # 用来存储最终每个subject的集合编号和内部序号

    series_index = 1  # 用来给每个集合分配唯一编号

    for root, subjects in series_max.items():
        # 过滤掉不存在于subject_types中的条目
        subjects = [
            s
            for s in subjects
            if s[0] in subject_types_and_dates and subject_types_and_dates[s[0]][1]
        ]  # 确保日期存在

        if len(subjects) == 0:
            continue  # 如果所有条目都被过滤掉了，跳过该集合

        # 如果集合中的条目数大于5
        if len(subjects) > 5:
            # 按关联条目数降序排序，日期升序排序
            subjects.sort(
                key=lambda x: (
                    -x[1],
                    subject_types_and_dates.get(x[0], (None, "9999-99-99"))[1],
                )
            )  # 先按关联条目数排，再按日期排

            # 遍历排序后的条目，检查关联数差距
            top_subject = subjects[0]
            second_subject = subjects[1]

            # 如果关联条目数相差小于5，比较日期，选date早的
            if abs(top_subject[1] - second_subject[1]) < 5:
                if (
                    subject_types_and_dates.get(top_subject[0], (None, "9999-99-99"))[1]
                    > subject_types_and_dates.get(
                        second_subject[0], (None, "9999-99-99")
                    )[1]
                ):
                    # 如果 top_subject 日期较晚，交换顺序
                    subjects[0], subjects[1] = subjects[1], subjects[0]

        # 为当前集合中的每个条目按排序编号，并记录到subject_to_group_info
        for index, (subject_id, _) in enumerate(subjects):
            subject_to_series_info[subject_id] = (series_index, index)

        series_index += 1

    sequel_orders = [None] * SUBJECT_NUM
    for i in range(SUBJECT_NUM):
        if i in subject_to_series_info.keys():
            sequel_orders[i] = subject_to_series_info[i]
        else:
            sequel_orders[i] = (series_index, 0)
            series_index += 1

    data = [
        (subject_id, series_id, order)
        for subject_id, (series_id, order) in enumerate(sequel_orders)
        if subject_id in subject_types_and_dates
    ]

    def chunked(iterable, size):
        for i in range(0, len(iterable), size):
            yield iterable[i:i + size]

    total = len(data)
    print(f"共需导入 {total} 条 sequel_orders 数据，批大小：{batch_size}")

    for batch in tqdm(chunked(data, batch_size), total=(total + batch_size - 1) // batch_size, desc="写入 sequel_orders", ncols=80):
        cursor.executemany(
            "INSERT INTO sequel_orders (subject_id, series_id, sequel_order) "
            "VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "series_id = VALUES(series_id), sequel_order = VALUES(sequel_order)",
            batch
        )

    print("加载 sequel_orders 完毕")


def main():
    parser = argparse.ArgumentParser(description="Bangumi 数据导入脚本")
    parser.add_argument("--subject", action="store_true")
    parser.add_argument("--person", action="store_true")
    parser.add_argument("--character", action="store_true")
    parser.add_argument("--subject-person", action="store_true")
    parser.add_argument("--person-character", action="store_true")
    parser.add_argument("--sequel-order", action="store_true")
    parser.add_argument("--all", action="store_true", help="执行所有操作")
    args = parser.parse_args()

    raw_db_cfg = toml.load("./config.toml")["mysql"]
    db_config = {
        "host": raw_db_cfg.get("host", "localhost"),
        "port": raw_db_cfg.get("port", 3306),
        "user": raw_db_cfg["user"],
        "password": raw_db_cfg["password"],
        "db": raw_db_cfg["databaseName"],
        "charset": "utf8mb4",
    }
    conn = pymysql.connect(**db_config)
    cursor = conn.cursor()

    raw_http_config = toml.load("./config.toml")["http"]
    global HEADERS
    HEADERS = {
        "User-Agent": raw_http_config["userAgent"],
        "Authorization": f"Bearer {raw_http_config['accessToken']}",
    }

    try:
        if args.all or args.subject:
            load_subjects(cursor)
        if args.all or args.person:
            load_people(cursor)
        if args.all or args.character:
            load_characters(cursor)
        if args.all or args.subject_person:
            load_subject_person(cursor)
        if args.all or args.person_character:
            load_person_character(cursor)
        if args.all or args.sequel_order:
            load_sequel_orders(cursor)

        conn.commit()
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
