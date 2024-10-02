import httpx
import asyncio
import re
import math
import ujson
from collections import defaultdict
from utils import Subject, Person, position_ids
import datetime

headers = {
    'User-Agent': 'AcuL/BangumiStaffStatistics/1.0 (Web) (https://github.com/AcuLY/BangumiStaffStats)'
}

async def fetch_user_collection_number(http_client: httpx.AsyncClient, user_id, subject_type=2, collection_type=2):
    """通过设置一个很大的 offset 时产生的报错来获取用户条目的数量

    参数:
        http_client (httpx.AsyncClient): 异步客户端
        user_id (string): 用户 id
        subject_type (int, optional): 条目类型, 见 https://bangumi.github.io/api 最后
        collection_type (int, optional): 收藏类型, 见 https://bangumi.github.io/api 最后

    返回值:
        collection_number(int): 用户的收藏数量
    """
    url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
    params = {
        'subject_type': subject_type,
        'type': collection_type,
        'offset': 99999
    }
    response = await http_client.get(url, params=params)
    error_message = response.json()
    description = error_message.get('description', '')
    if description == "user doesn't exist or has been removed":
        print(datetime.datetime(), '用户不存在:', user_id)
        return 0
    match = re.search(r'offset should be less than or equal to (\d+)', description)
    if match:
        collection_number = int(match.group(1))
        return collection_number
    return 0


async def fetch_subjects(http_client: httpx.AsyncClient, user_id, collection_number, subject_type=2, collection_type=2):
    """获取用户的全部条目

    参数:
        http_client (httpx.AsyncClient): 异步客户端
        user_id (string): 用户 id
        collection_number(int): 用户收藏数量
        subject_type (int, optional): 条目类型, 见 https://bangumi.github.io/api 最后
        collection_type (int, optional): 收藏类型, 见 https://bangumi.github.io/api 最后

    返回值:
        all_subjects(list(subject)): 全部条目
    """
    url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
    offset = 0  # 初始偏移量
    # 获取 100 个条目
    async def fetch_100_subjects(offset):
        params = {  # GET 参数
                    'limit': 100,
                    'subject_type': subject_type,
                    'type': collection_type,
                    'offset': offset
                }
        subjects_100 = []
        response = await http_client.get(url, params=params)
        for collection in response.json()['data']:
            subject_name = collection['subject']['name']
            subject_name_cn = collection['subject']['name_cn'] if collection['subject']['name_cn'] else collection['subject']['name']
            subject_id = collection['subject_id']
            subject_rate = collection['rate']
            subjects_100.append(Subject(subject_name, subject_id, subject_rate, subject_name_cn))
        return subjects_100
    
    tasks = []
    while offset <= collection_number:
        tasks.append(fetch_100_subjects(offset))
        offset += 100

    results = await asyncio.gather(*tasks)
    all_subjects = []
    for ls in results:
        all_subjects.extend(ls)
    return all_subjects


async def create_personid_subjects_map(http_client: httpx.AsyncClient, subjects: list, position: str):
    """创建一个 person_id 到 [Subject] 的映射

    参数:
        http_client (httpx.AsyncClient): 见上
        subjects (list(Subjects)): 用户收藏的条目
        position (str): 要查询的职位
    
    返回值:
        personid_subjects_map(dict): person_id 到 [Subject] 的映射
        unlinked_subjects(list): 找不到人的 subjects
    """
    personid_subjects_map = defaultdict(list)  # person_id 到 [Subject] 的映射
    subject_ids_in_map = set()  # 记录已经被关联的 subject
    subject_ids_set = set(subject.id for subject in subjects)   # 待关联的 subject_id
    subject_dict = {subject.id: subject for subject in subjects}    # 转为字典加快查找
    with open('./jsonlines/subject-persons.jsonlines', 'r', encoding='utf-8') as f:
        lines = [ujson.loads(line) for line in f]
    for data in lines:
        person_id = data['person_id']
        subject_id = data['subject_id']
        position_id = data['position']
        # 如果该条目是用户的收藏且人物职位对应
        if subject_id in subject_ids_set and position_id == position_ids[position]:
            personid_subjects_map[person_id].append(subject_dict[subject_id])
            subject_ids_in_map.add(subject_id)
    
    # 没被关联到的 subjects
    unlinked_subjects = [subject for subject in subjects if subject.id not in subject_ids_in_map]
    async def fetch_subject_persons(subject):
        url = f'https://api.bgm.tv/v0/subjects/{subject.id}/persons'
        persons_response = await http_client.get(url)
        if persons_response.status_code == 200:
            persons = persons_response.json()
            for person in persons:
                if person['relation'] == position:
                    personid_subjects_map[person['id']].append(subject)
            return subject  # 找到了就返回
        return None
    
    succeeded_subjects = await asyncio.gather(*(fetch_subject_persons(subject) for subject in unlinked_subjects))
    unlinked_subjects = [subject for subject in unlinked_subjects if subject not in succeeded_subjects]
    return personid_subjects_map, unlinked_subjects


async def fetch_person_infos(http_client: httpx.AsyncClient, personid_subjects_map: dict):
    """将 personid_subjects_map 中的 key 从 person_id 换成 Person

    参数:
        http_client (httpx.AsyncClient): 见上
        personid_subjects_map (dict): person_id 到 [Subject] 的映射

    Returns:
        person_subjects_map(dict): Person 到 [Subject] 的映射
    """
    person_subjects_map = {}
    person_ids_in_map = set()
    with open('./jsonlines/person.jsonlines', 'r', encoding='utf-8') as f:
        for line in f:
            data = ujson.loads(line)
            if data['id'] in personid_subjects_map.keys():
                # 提取简体中文名
                if '简体中文名' in data['infobox']:
                    match = re.search(r'\|简体中文名\s*=\s*(.*)', data['infobox'])
                    name_cn = match.group(1).strip()
                    clear_name_cn = re.sub(r'（.*?）', '', name_cn).strip() # 去括号
                else:
                    name_cn = data['name']
                person = Person(data['name'], data['id'], clear_name_cn)
                person_subjects_map[person] = personid_subjects_map[person.id]
                person_ids_in_map.add(person.id)
    # 没被关联到的 person_ids
    unlinked_personids = [id for id in personid_subjects_map.keys() if id not in person_ids_in_map]
    async def fetch_person_info(person_id):
        url = f'https://api.bgm.tv/v0/{person_id}'
        person_response = await http_client.get(url)
        if person_response.status_code == 200:
            person_name = person_response.json()['name']
            person_name_cn = person_response.json()['infobox']['简体中文名']
            return Person(person_name, person_id, person_name_cn)
        return None
    
    succeeded_persons = await asyncio.gather(*(fetch_person_info(person_id) for person_id in unlinked_personids))
    for person in succeeded_persons:
        if person:
            person_subjects_map[person] = personid_subjects_map[person.id]
        
    return person_subjects_map


def analyse_data(person_subjects_map: dict):
    """计算均分, 并将最终转换数据

    参数:
        person_subjects_map (dict): Person 到 [Subject] 的映射

    返回值:
        final_list(list): 如下
    """
    final_list = []
    for person, subjects in person_subjects_map.items():
        valid_rates = [subject.rate for subject in subjects if subject.rate]
        average_rate = math.floor(sum(valid_rates) / len(valid_rates) * 100) / 100 if valid_rates else 0
        final_list.append({
            'person_name': person.name,
            'person_id': person.id,
            'person_name_cn': person.name_cn,
            'subject_names': [subject.name for subject in subjects],
            'subject_ids': [subject.id for subject in subjects],
            'subject_names_cn': [subject.name_cn for subject in subjects],
            'rates': [subject.rate for subject in subjects],
            'average_rate': average_rate,
            'number': len(subjects)
        })
    final_list = sorted(final_list, key=lambda item: item['number'], reverse=True)
    return final_list

async def fetch_user_data(user_id, position):
    async with httpx.AsyncClient(headers=headers, limits=httpx.Limits(max_connections=30)) as http_client:
        collection_number = await fetch_user_collection_number(http_client, user_id)
        all_subjects = await fetch_subjects(http_client, user_id, collection_number)
        personid_subjects_map, unlinked_subjects = await create_personid_subjects_map(http_client, all_subjects, position)
        person_subjects_map = await fetch_person_infos(http_client, personid_subjects_map)
        valid_subjects = analyse_data(person_subjects_map)
        invalid_subjects = [{'subject_name': subject.name, 'subject_id': subject.id, 'subject_name_cn': subject.name_cn} for subject in unlinked_subjects]
        return {
            'valid_subjects': valid_subjects,
            'invalid_subjects': invalid_subjects,
            'collection_number': collection_number
        }