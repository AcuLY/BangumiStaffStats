from collections import defaultdict
import json
from dataclasses import dataclass
import time

import pymysql
import toml
from tqdm_loggable.auto import tqdm 
from more_itertools import chunked


JSONLINES_FILE_PATH = "../static/"
CONFIG_PATH = "../config.toml"

position_id_to_names = {
    1: ["原作"],
    2: ["导演"],
    3: ["脚本"],
    4: ["分镜"],
    5: ["演出"],
    6: ["音乐"],
    7: ["人物原案"],
    8: ["人物设定"],
    9: ["构图"],
    10: ["系列构成"],
    11: ["美术监督"],
    13: ["色彩设计"],
    14: ["总作画监督"],
    15: ["作画监督"],
    16: ["机械设定"],
    17: ["摄影监督"],
    18: ["监修"],
    19: ["道具设计"],
    20: ["原画"],
    21: ["第二原画"],
    22: ["动画检查"],
    23: ["助理制片人"],
    24: ["制作助理"],
    25: ["背景美术"],
    26: ["色彩指定"],
    27: ["数码绘图"],
    28: ["剪辑"],
    29: ["原案"],
    30: ["主题歌编曲"],
    31: ["主题歌作曲"],
    32: ["主题歌作词"],
    33: ["主题歌演出"],
    34: ["插入歌演出"],
    35: ["企划"],
    36: ["企划制作人"],
    37: ["制作管理"],
    38: ["宣传"],
    39: ["录音"],
    40: ["录音助理"],
    41: ["系列监督"],
    42: ["制作"],
    43: ["设定"],
    44: ["音响监督"],
    45: ["音响"],
    46: ["音效"],
    47: ["特效"],
    48: ["配音监督"],
    49: ["联合导演"],
    50: ["背景设定"],
    51: ["补间动画"],
    52: ["执行制片人"],
    53: ["助理制片人"],
    54: ["制片人"],
    56: ["制作管理"],
    58: ["制片人"],
    59: ["联合制片人"],
    62: ["制作助理"],
    63: ["制作"],
    64: ["制作协调"],
    65: ["厂牌"],
    67: ["动画制作"],
    69: ["CG 导演"],
    70: ["机械作画监督"],
    71: ["美术设计"],
    72: ["副导演"],
    73: ["OP·ED 分镜"],
    74: ["导演", "总导演"],
    75: ["3DCG"],
    76: ["制作协力"],
    77: ["动作作画监督"],
    80: ["监制"],
    81: ["制作协力"],
    82: ["摄影"],
    83: ["制作进行协力"],
    84: ["设定制作"],
    85: ["音乐制作人"],
    86: ["3DCG"],
    87: ["动画制片人"],
    88: ["特效作画监督"],
    89: ["演出", "主演出"],
    90: ["作画监督助理"],
    91: ["演出助理"],
    92: ["原画", "主动画师"],
    101: ["声优（仅主役）", "声优"],
    102: ["声优"],
    103: ["声优"],
    1001: ["开发"],
    1002: ["发行"],
    1003: ["游戏设计师"],
    1004: ["剧本"],
    1005: ["美工"],
    1006: ["音乐"],
    1007: ["关卡设计"],
    1008: ["人物设定"],
    1013: ["原画"],
    1014: ["动画制作"],
    1015: ["原作"],
    1016: ["导演"],
    1017: ["动画监督"],
    1018: ["制作总指挥"],
    1021: ["程序"],
    1024: ["SD原画"],
    1025: ["背景"],
    1026: ["监修"],
    1028: ["企画"],
    1032: ["制作人"],
    1101: ["声优（仅主役）", "声优"],
    1102: ["声优"],
    1103: ["声优"],
    2001: ["作者"],
    2002: ["作者"],
    2003: ["插图"],
    2004: ["出版社"],
    2005: ["连载杂志"],
    2007: ["原作"],
    2009: ["人物原案"],
    2010: ["脚本"],
    2011: ["文库"],
    3001: ["艺术家"],
    3002: ["制作人"],
    3003: ["作曲"],
    3004: ["厂牌"],
    3005: ["原作"],
    3006: ["作词"],
    3007: ["录音"],
    3008: ["编曲"],
    3009: ["插图"],
    3010: ["脚本"],
    3011: ["出版方"],
    3012: ["母带制作"],
    3013: ["混音"],
    3014: ["乐器"],
    3015: ["声乐"],
    4001: ["原作"],
    4002: ["导演"],
    4003: ["编剧"],
    4004: ["音乐"],
    4005: ["执行制片人"],
    4007: ["制片人/制作人"],
    4008: ["监制"],
    4012: ["剪辑"],
    4014: ["摄影"],
    4016: ["主演"],
    4017: ["配角"],
    4018: ["制作"],
    4019: ["出品"],
}


@dataclass(frozen=True)
class Key:
    person_id: int
    position_name: str


@dataclass(frozen=True)
class Value:
    count: int
    average_rate: float
    overall_rate: float


@dataclass(frozen=True)
class SubjectInfo:
    type: int
    rate: float


def calc_subject_rate(score_details):
    vote_count = 0
    total_score = 0.0
    for score, count in score_details.items():
        vote_count += count
        total_score += float(score) * count

    if total_score == 0:
        return 0.0

    rate = total_score / vote_count
    return round(rate, 2)


def calc_average_rate(subjects_with_rate):
    total_rate = sum([subject.rate for subject in subjects_with_rate])
    if total_rate == 0:
        return 0.0

    return round(total_rate / len(subjects_with_rate), 2)


def calc_overall_rate(average_rate, count):
    if average_rate == 0:
        return 0.0

    constant = 5.0
    middle_rate = 5.0

    overall_rate = (count / (count + constant)) * average_rate + (
        constant / (count + constant)
    ) * middle_rate
    return round(overall_rate, 2)


def create_person_position_subject_map():
    available_subjects = (
        {}
    )  # subject-person 存在一些过期条目，以 subject 中出现了的条目为准
    with open(
        JSONLINES_FILE_PATH + "subject.jsonlines", mode="r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            rate = calc_subject_rate(item["score_details"])
            subject_info = SubjectInfo(item["type"], rate)
            available_subjects[item["id"]] = subject_info

    person_position_to_subject_ids = defaultdict(list)
    with open(
        JSONLINES_FILE_PATH + "subject-persons.jsonlines", mode="r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            position_id = item["position"]
            subject_id = item["subject_id"]
            if (
                position_id not in position_id_to_names.keys()
                or subject_id not in available_subjects.keys()
            ):
                continue

            person_id = item["person_id"]
            position_names = position_id_to_names[position_id]
            for position_name in position_names:
                key = Key(person_id, position_name)
                person_position_to_subject_ids[key].append(subject_id)

    subject_character_to_position_name = {}
    with open(
        JSONLINES_FILE_PATH + "subject-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            subject_id = item["subject_id"]
            if subject_id not in available_subjects.keys():
                continue

            # 动画声优是 101 - 103，游戏声优是 1101 - 1103
            offset = 100 if available_subjects[subject_id].type == 2 else 1100
            position_id = offset + item["type"]
            if position_id not in position_id_to_names.keys():
                continue

            position_names = position_id_to_names[position_id]
            character_id = item["character_id"]

            for position_name in position_names:
                subject_character_to_position_name[(subject_id, character_id)] = (
                    position_name
                )

    with open(
        JSONLINES_FILE_PATH + "person-characters.jsonlines", "r", encoding="utf-8"
    ) as f:
        for line in f:
            item = json.loads(line)
            subject_id = item["subject_id"]
            character_id = item["character_id"]
            if (
                subject_id,
                character_id,
            ) not in subject_character_to_position_name.keys():
                continue

            position_name = subject_character_to_position_name[
                (subject_id, character_id)
            ]
            person_id = item["person_id"]
            key = Key(person_id, position_name)
            person_position_to_subject_ids[key].append(subject_id)

    key_to_value = {}
    for key, subject_ids in person_position_to_subject_ids.items():
        count = len(subject_ids)
        subjects_with_rate = [
            available_subjects[subject_id]
            for subject_id in subject_ids
            if available_subjects[subject_id].rate > 0
        ]

        average_rate = calc_average_rate(subjects_with_rate)
        overall_rate = calc_overall_rate(average_rate, len(subjects_with_rate))
        value = Value(count, average_rate, overall_rate)
        key_to_value[key] = value
    
    return key_to_value


def write_db(data, batch_size=1000):
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
                print(f"连接数据库失败，重试 {i + 1}/10")
                time.sleep(3)
            else:
                print("连接数据库失败，请检查配置")
                raise e

    print("连接数据库成功")
    cursor = conn.cursor()
    
    total = len(data)
    for batch in tqdm(chunked(data, batch_size), total=(total + batch_size - 1) // batch_size, desc="写入 person_subject", ncols=80):
        cursor.executemany(
            "INSERT INTO person_subject (person_id, position_name, subject_count, average_rate, overall_rate) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "subject_count = VALUES(subject_count), average_rate = VALUES(average_rate), overall_rate = VALUES(overall_rate)",
            batch
        )
    
    conn.commit()
    cursor.close()
    conn.close()


if __name__ == "__main__":
    key_to_value = create_person_position_subject_map()
    data = [(k.person_id, k.position_name, v.count, v.average_rate, v.overall_rate) for k, v in key_to_value.items()]
    write_db(data)