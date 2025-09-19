from collections import defaultdict
import json
import pymysql
from tqdm_loggable.auto import tqdm 
import argparse
import toml
import time
from more_itertools import chunked

POSITION_ID_MAPPING_FILE_PATH = "./position_id_mapping.json"
JSONLINES_FILE_PATH = "../static/"
CONFIG_PATH = "../config/config.toml"
check_need_update = True    # 是否比较 jsonlines 和数据库表的记录数量来判断需不需要更新数据库


def load_subjects(cursor, batch_size=1000):
    print("开始加载 subjects")

    def generate_lines():
        with open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)

    total = sum(1 for _ in open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8"))
    print(f"共需导入 {total} 条记录，批大小：{batch_size}")
    
    cursor.execute("SELECT COUNT(*) FROM subjects")
    existing_count = cursor.fetchone()[0]
    print(f"subjects 表中已有 {existing_count} 条记录")

    if existing_count == total and check_need_update:
        print("subjects 数据已是最新，无需更新")
        return

    # 分批写入
    for batch in tqdm(
        chunked(generate_lines(), batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 subjects",
        ncols=80,
    ):
        values = []
        for item in batch:
            subject_id = str(item["id"])
            tags_json = json.dumps(
                [tag["name"] for tag in item["tags"]],
                ensure_ascii=False,
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
                    item["date"] if item["date"] else None,
                    image,
                    item["nsfw"]
                )
            )

        cursor.executemany(
            "INSERT INTO subjects "
            "(subject_id, subject_name, subject_name_cn, subject_rate, subject_type, subject_favorite, subject_tags, subject_date, subject_image, subject_nsfw) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "subject_name=VALUES(subject_name), "
            "subject_name_cn=VALUES(subject_name_cn), "
            "subject_rate=VALUES(subject_rate), "
            "subject_type=VALUES(subject_type), "
            "subject_favorite=VALUES(subject_favorite), "
            "subject_tags=VALUES(subject_tags), "
            "subject_date=VALUES(subject_date), "
            "subject_image=VALUES(subject_image), "
            "subject_nsfw=VALUES(subject_nsfw)",
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

    total = len(lines)
    print(f"共需导入 {total} 条 people，批大小：{batch_size}")
    
    cursor.execute("SELECT COUNT(*) FROM people")
    existing_count = cursor.fetchone()[0]
    print(f'people 表中已有 {existing_count} 条记录')
    
    if existing_count == total and check_need_update:
        print("people 数据已是最新，无需更新")
        return
    
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

    total = len(lines)
    print(f"共需导入 {total} 条 characters，批大小：{batch_size}")
    
    cursor.execute("SELECT COUNT(*) FROM characters")
    existing_count = cursor.fetchone()[0]
    print(f'characters 表中已有 {existing_count} 条记录')
    
    if existing_count == total and check_need_update:
        print("characters 数据已是最新，无需更新")
        return

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


def load_credits(cursor, batch_size=1000):
    print("开始加载 credits")

    # 加载 subject ids
    subject_ids = set()
    subject_types = {}
    print("开始加载所有 subjects")
    with open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8") as f:
        for line in f:
            item = json.loads(line)
            subject_ids.add(item["id"])
            if item["type"] in (2, 4):  # 2: 动画, 4: 游戏
                subject_types[item["id"]] = item["type"]

    with open(POSITION_ID_MAPPING_FILE_PATH, "r", encoding="utf-8") as f:
        id_mapping = json.load(f)

    # 加载非声优职位 subject-person
    print("开始加载非声优职位")
    subject_person_map = defaultdict(list)
    with open(
        JSONLINES_FILE_PATH + "subject-persons.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            if item["subject_id"] in subject_ids:   # 检查 subject 有效性
                # 原本的职位映射有重复部分，这里做一遍映射处理
                # 让每个职位名都对应唯一的 id
                original_pos_id = item["position"]
                real_pos_ids = id_mapping[str(original_pos_id)]
                
                for pos_id in real_pos_ids:
                    subject_person_map[item["subject_id"]].append(
                        (item["person_id"], pos_id)
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
            # 动画声优是 101 - 106，游戏声优是 1101 - 1103
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
                original_pos_id = character_position_map[sid][cid]
                real_pos_ids = id_mapping[str(original_pos_id)]
                for pos_id in real_pos_ids:
                    subject_person_map[sid].append((pid, pos_id))

    # 展平为列表
    data = [
        (sid, pid, pos_id)
        for sid, person_list in subject_person_map.items()
        for pid, pos_id in person_list
    ]

    total = len(data)
    print(f"共需导入 {total} 条 subject-person 关系，批大小：{batch_size}")
    
    cursor.execute("SELECT COUNT(*) FROM credits")
    existing_count = cursor.fetchone()[0]
    print(f'credits 表中已有 {existing_count} 条记录')
    
    if existing_count == total and check_need_update:
        print("credits 数据已是最新，无需更新")
        return

    for batch in tqdm(
        chunked(data, batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 credits",
        ncols=80,
    ):
        cursor.executemany(
            "INSERT INTO credits (subject_id, person_id, position_id) "
            "VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE position_id = VALUES(position_id)",
            batch,
        )

    print("加载 credits 完毕")


def load_casts(cursor, batch_size=1000):
    print("开始加载 casts")

    print("加载所有条目 id 中")
    subject_ids = set()
    subject_types = {}
    with open(JSONLINES_FILE_PATH + "subject.jsonlines", "r", encoding="utf-8") as f:
        for line in f:
            item = json.loads(line)
            subject_ids.add(item["id"])
            if item["type"] in (2, 4):  # 2: 动画, 4: 游戏
                subject_types[item["id"]] = item["type"]
    print("加载所有条目 id 完毕")

    print("加载 subject-character 中")
    with open(POSITION_ID_MAPPING_FILE_PATH, "r", encoding="utf-8") as f:
        id_mapping = json.load(f)

    subject_character_to_position = {}
    with open(
        JSONLINES_FILE_PATH + "subject-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            sid = item["subject_id"]
            cid = item["character_id"]
            if sid not in subject_types:
                continue
            # 动画声优是 101 - 106，游戏声优是 1101 - 1103
            offset = 100 if subject_types[sid] == 2 else 1100
            original_pos_id = item["type"] + offset
            
            mapped_ids = id_mapping[str(original_pos_id)]
            real_pos_id = original_pos_id if original_pos_id in mapped_ids else mapped_ids[0]
            subject_character_to_position[(sid, cid)] = real_pos_id

    with open(
        JSONLINES_FILE_PATH + "person-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        lines = [json.loads(line) for line in f if line.strip()]

    data = []
    for item in lines:
        key = (item["subject_id"], item["character_id"])
        if (
            item["subject_id"] not in subject_ids
            or key not in subject_character_to_position
        ):
            continue

        position_id = subject_character_to_position[key]
        data.append((item["person_id"], item["subject_id"], item["character_id"], position_id))

    total = len(data)
    print(f"共需导入 {total} 条 casts 数据，批大小：{batch_size}")
    
    cursor.execute("SELECT COUNT(*) FROM casts")
    existing_count = cursor.fetchone()[0]
    print(f'casts 表中已有 {existing_count} 条记录')
    
    if existing_count == total and check_need_update:
        print("casts 数据已是最新，无需更新")
        return
    

    for batch in tqdm(
        chunked(data, batch_size),
        total=(total + batch_size - 1) // batch_size,
        desc="写入 casts",
        ncols=80,
    ):
        cursor.executemany(
            "INSERT INTO casts (person_id, subject_id, character_id, position_id) "
            "VALUES (%s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE position_id = VALUES(position_id)",
            batch,
        )

    print("加载 casts 完毕")


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


def load_series(cursor, batch_size=1000):
    print("开始加载 sequels")

    print("加载所有条目的类型和日期中")
    valid_subject_ids = set()
    subject_dates = {}
    subject_types = {}
    with open(
        JSONLINES_FILE_PATH + "subject.jsonlines", mode="r", encoding="utf-8"
    ) as f:
        for line in f:
            final_data = json.loads(line)
            valid_subject_ids.add(final_data["id"])
            subject_dates[final_data["id"]] = final_data["date"] if final_data["date"] else "9999-99-99"
            subject_types[final_data["id"]] = final_data["type"]

    # 条目关系详见 github.com/bangumi/server/pkg/vars/relations.go.json

    # 1 改编   2 前传   3 续集   4 总集篇   5 全集   6 番外篇   7 角色出演
    # 8 相同世界观   9 不同世界观   10 不同演绎   11 衍生   12 主线故事
    # 14 联动   99 其他

    # 1002 系列   1003 单行本   1004 画集   1005 前传   1006 续集   1007 番外篇
    # 1008 主线故事   1010 不同版本   1011 角色出演   1012 相同世界观
    # 1013 不同世界观   1014 联动   1015 不同演绎   1099 其他

    # 3001 原声集   3002 角色歌   3003 片头曲   3004 片尾曲
    # 3005 插入歌   3006 印象曲   3007 广播剧   3099 其他

    # 4002 前传   4003 续集   4006 外传   4007 角色出演
    # 4008 相同世界观   4009 不同世界观   4010 不同演绎
    # 4012 主线故事   4014 联动   4015 扩展包   4016 不同版本
    # 4017 主版本   4018 合集   4019 收录作品   4099 其他

    # 属于一个系列的关系
    same_series_relations = set([
        2, 3, 4, 5, 6, 9, 10, 11, 12, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1010, 1013,
        1015, 4002, 4003, 4006, 4009, 4010, 4012, 4015, 4016, 4017, 4018
    ])
    # 此集合内的关系越多，subject 越可能是主条目，related_subject 越不可能是主条目
    main_series_positive_relations = set([
        1, 3, 4, 6, 11, 1003, 1006, 1007, 4003, 4006, 4015, 4018, 4019
    ])
    # 中性关联，双方都可能是主条目
    main_series_neutral_relations = set([
        7, 8, 9, 10, 14, 99, 1004, 1010, 1011, 1012, 1013, 1014, 1015, 1099, 3001, 3002, 3003,
        3004, 3005, 3006, 3007, 3099, 4007, 4008, 4009, 4010, 4014, 4016, 4099
    ])
    # 此集合内的关系越多，subject 越不可能是主条目，related_subject 越可能是主条目
    main_series_negative_relations = set([
        2, 5, 12, 1002, 1005, 1008, 4002, 4012, 4017
    ])

    MAX_SUBJECT_ID = max(valid_subject_ids)
    uf = UnionFind(1000000)

    main_series_possibility_score = defaultdict(int)    # 是主条目的可能性得分

    print("构建所有条目之间的关系中")
    with open(JSONLINES_FILE_PATH + "subject-relations.jsonlines", mode="r") as f:
        for line in f:
            final_data = json.loads(line)
            subject_id = final_data["subject_id"]
            relation_type = final_data["relation_type"]
            related_subject_id = final_data["related_subject_id"]
            
            if subject_id not in valid_subject_ids or related_subject_id not in valid_subject_ids:
                continue

            is_same_type = subject_types[subject_id] == subject_types[related_subject_id]

            # 仅合并同类的条目
            if relation_type in same_series_relations and is_same_type:
                uf.union(subject_id, related_subject_id)

            # 正向关系仅作用于同类的条目
            if relation_type in main_series_positive_relations and is_same_type:
                main_series_possibility_score[subject_id] += 5
                main_series_possibility_score[related_subject_id] -= 5
            
            # 负向关系仅作用于同类的条目
            if relation_type in main_series_negative_relations and is_same_type:
                main_series_possibility_score[subject_id] -= 5
                main_series_possibility_score[related_subject_id] += 5
            
            # 中性关系不受类型影响
            if relation_type in main_series_neutral_relations:
                main_series_possibility_score[subject_id] += 1
                main_series_possibility_score[related_subject_id] += 1

    # 将并查集转为 root_id -> list[id] 的字典，便于按 score 排序
    uf_list = defaultdict(list)

    for subject_id in range(MAX_SUBJECT_ID):
        if subject_id not in valid_subject_ids:
            continue
        root_id = uf.find(subject_id)
        uf_list[root_id].append(subject_id)

    series = {}  # subject_id -> series_id, order
    series_id = 1  # 用来给每个集合分配唯一编号

    for root_id, subject_ids in uf_list.items():
        # 按关联条目数降序排序，日期升序排序
        subject_ids.sort(
            key=lambda subject_id: (
                -main_series_possibility_score[subject_id],
                subject_dates[subject_id],
            )
        )

        # 第一季、第二季可能都有较多的衍生作，若一个系列内前二的条目得分差距较小则以日期为准
        if len(subject_ids) > 1:
            first = subject_ids[0]
            second = subject_ids[1]
            if (
                main_series_possibility_score[first] - main_series_possibility_score[second] < 15 and
                subject_dates[first] > subject_dates[second]
            ):
                subject_ids[0], subject_ids[1] = subject_ids[1], subject_ids[0]

        for order, subject_id in enumerate(subject_ids):
            series[subject_id] = (series_id, order)

        series_id += 1

    final_data = [
        (subject_id, series_id, order)
        for subject_id, (series_id, order) in series.items()
    ]

    total = len(final_data)
    print(f"共需导入 {total} 条 sequels 数据，批大小：{batch_size}")
    
    cursor.execute("SELECT COUNT(*) FROM series")
    existing_count = cursor.fetchone()[0]
    print(f'sequels 表中已有 {existing_count} 条记录')
    
    if existing_count == total and check_need_update:
        print("sequels 数据已是最新，无需更新")
        return

    for batch in tqdm(chunked(final_data, batch_size), total=(total + batch_size - 1) // batch_size, desc="写入 sequels", ncols=80):
        cursor.executemany(
            "INSERT INTO sequels (subject_id, series_id, sequel_order) "
            "VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "series_id = VALUES(series_id), sequel_order = VALUES(sequel_order)",
            batch
        )

    print("加载 sequels 完毕")


def need_update(cursor):
    """ 用 person.jsonlines （体积较小且逻辑简单）中的条目数来判断是否需要更新数据库 """
    cursor.execute("SELECT COUNT(*) FROM people")
    existing_count = cursor.fetchone()[0]
    with open(JSONLINES_FILE_PATH + "person.jsonlines", "r", encoding="utf-8") as f:
        total_count = sum(1 for _ in f if _.strip())
    print(f"数据库中 people 条目数：{existing_count}, jsonlines 中 people 条目数：{total_count}")
    return existing_count != total_count


def main():
    print("开始更新数据库")
    
    parser = argparse.ArgumentParser(description="Bangumi 数据导入脚本")
    parser.add_argument("--subjects", action="store_true")
    parser.add_argument("--people", action="store_true")
    parser.add_argument("--characters", action="store_true")
    parser.add_argument("--credits", action="store_true")
    parser.add_argument("--casts", action="store_true")
    parser.add_argument("--sequels", action="store_true")
    parser.add_argument("--all", action="store_true", help="执行所有操作")
    parser.add_argument("--no-check", action="store_true", help="不检查是否需要更新")
    args = parser.parse_args()

    if not any(vars(args).values()):
        print("未指定需要更新的表，如需更新全部请使用 --all")
        return
    
    if args.no_check:
        global check_need_update
        check_need_update = False

    raw_db_cfg = toml.load(CONFIG_PATH)["mysql"]
    db_config = {
        "host": raw_db_cfg.get("host", "localhost"),
        "port": raw_db_cfg.get("port", 3306),
        "user": raw_db_cfg["user"],
        "password": raw_db_cfg["password"],
        "db": raw_db_cfg["databaseName"],
        "charset": "utf8mb4",
    }
    
    for i in range(10):
        try:
            conn = pymysql.connect(**db_config)
            break
        except pymysql.OperationalError as e:
            if i < 9:
                print(f"连接数据库失败: {str(e)}，重试 {i + 1}/10")
                time.sleep(3)
            else:
                print("连接数据库失败，请检查配置")
                raise e

    print("连接数据库成功")
    cursor = conn.cursor()

    raw_http_config = toml.load(CONFIG_PATH)["http"]
    global HEADERS
    HEADERS = {
        "User-Agent": raw_http_config["userAgent"],
        "Authorization": f"Bearer {raw_http_config['accessToken']}",
    }
    
    if check_need_update and not need_update(cursor):
        print("数据库已是最新，无需更新")
        cursor.close()
        conn.close()
        return
    else:
        print("数据库需要更新")

    try:
        if args.all or args.subjects:
            load_subjects(cursor)
        if args.all or args.people:
            load_people(cursor)
        if args.all or args.characters:
            load_characters(cursor)
        if args.all or args.credits:
            load_credits(cursor)
        if args.all or args.casts:
            load_casts(cursor)
        if args.all or args.sequels:
            load_series(cursor)

        conn.commit()
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
