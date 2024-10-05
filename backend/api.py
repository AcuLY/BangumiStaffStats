import httpx
import asyncio
import re
import math
import ujson
from collections import defaultdict
from utils import Subject, Person, position_ids, extract_name_cn
import datetime

headers = {
    'User-Agent': 'AcuL/BangumiStaffStatistics/1.0 (Web) (https://github.com/AcuLY/BangumiStaffStats)'
}

# 预加载数据
subject_persons_dict = None
person_dict = None

def transmit_data(data):
    global subject_persons_dict, person_dict
    subject_persons_dict, person_dict = data

async def fetch_user_collection_number(http_client: httpx.AsyncClient, user_id, collection_types: list, subject_type=2):
    """通过设置一个很大的 offset 时产生的报错来获取用户条目的数量

    参数:
        http_client (httpx.AsyncClient): 异步客户端
        user_id (string): 用户 id
        collection_types (list(int), optional): 收藏类型, 见 https://bangumi.github.io/api 最后

    返回值:
        collection_numbers(dict): 类型对应的用户的收藏数量
    """
    collection_numbers = {} # 类型到数量的映射
    async def fetch_type_collection_number(collection_type):
        url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
        params = {
            'subject_type': subject_type,
            'type': collection_type,
            'offset': 99999
        }
        try:
            response = await http_client.get(url, params=params)
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RequestError) as exc:
            print(f"\033[1;31m{datetime.datetime.now()} 请求条目数失败: {exc}\033[0m")
        else:
            error_message = response.json()
            description = error_message.get('description', '')
            if description == "user doesn't exist or has been removed":
                print(datetime.datetime.now(), '用户不存在:', user_id)
                return 0
            match = re.search(r'offset should be less than or equal to (\d+)', description)
            if match:
                collection_number = int(match.group(1))
                if collection_number == 0:
                    print(datetime.datetime.now(), '用户没有收藏')
                return collection_number
        return 0
    
    tasks = [fetch_type_collection_number(collection_type) for collection_type in collection_types]
    results = await asyncio.gather(*tasks)
    for index, collection_type in enumerate(collection_types):
        collection_numbers[collection_type] = results[index]
    return collection_numbers


async def fetch_subjects(http_client: httpx.AsyncClient, user_id, collection_numbers: dict, subject_type=2):
    """获取用户的全部条目

    参数:
        http_client (httpx.AsyncClient): 异步客户端
        user_id (string): 用户 id
        collection_numbers(dict): 收藏类型到用户收藏数量的映射

    返回值:
        all_subjects(list(subject)): 全部条目
    """
    url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
    # 获取 100 个条目
    async def fetch_100_subjects(offset, collection_type):
        params = {  # GET 参数
                    'limit': 100,
                    'subject_type': subject_type,
                    'type': collection_type,
                    'offset': offset
                }
        subjects_100 = []
        try:
            response = await http_client.get(url, params=params)
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RequestError) as exc:
            print(f"\033[1;31m{datetime.datetime.now()} 请求条目失败: {exc}\033[0m")
        except Exception as e:
            print(f"\033[1;31m{datetime.datetime.now()} 未知错误: {e}\033[0m")
        else:
            if response.status_code == 200:
                for collection in response.json()['data']:
                    subject_name = collection['subject']['name']
                    subject_name_cn = collection['subject']['name_cn'] if collection['subject']['name_cn'] else collection['subject']['name']
                    subject_id = collection['subject_id']
                    subject_rate = collection['rate']
                    subjects_100.append(Subject(subject_name, subject_id, subject_rate, subject_name_cn))
                return subjects_100
        return []
    
    tasks = []
    for c_type, c_number in collection_numbers.items():
        offset = 0  # 初始偏移量
        while offset < c_number:
            tasks.append(fetch_100_subjects(offset, c_type))
            offset += 100

    results = await asyncio.gather(*tasks)
    all_subjects = []
    for ls in results:
        all_subjects.extend(ls)
    return all_subjects


async def create_person_subjects_map(http_client: httpx.AsyncClient, subjects: list, position: str):
    """创建一个 Person 到 [Subject] 的映射

    参数:
        http_client (httpx.AsyncClient): 见上
        subjects (list(Subjects)): 用户收藏的条目
        position (str): 要查询的职位
    
    返回值:
        person_subjects_map(dict): Person 到 [Subject] 的映射
        unlinked_subjects(list): 找不到人的 subjects
    """
    person_subjects_map = defaultdict(list)  # person_id 到 [Subject] 的映射
    subjects_appeared = set()    # 本地数据有的 subject_id
    subjects_linked = set()  # 本地数据能找到人员的 subject
    
    for subject in subjects:
        # 在字典中查找 subject 的 id
        if subject_persons_dict.get(str(subject.id)):
            subjects_appeared.add(subject)
            for relation in subject_persons_dict[str(subject.id)]:
                person_id = relation[0]
                position_id = relation[1]
                # 匹配职位
                if position_id in position_ids[position]:
                    person = await fetch_person_infos(http_client, person_id)
                    person_subjects_map[person].append(subject)
                    subjects_linked.add(subject)
    # 本地数据中没有的 subject_id
    async def fetch_subject_persons(subject):
        nonlocal person_subjects_map
        url = f'https://api.bgm.tv/v0/subjects/{subject.id}/persons'
        try:
            persons_response = await http_client.get(url)
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RequestError) as exc:
            print(f"\033[1;31m{datetime.datetime.now()} 请求条目-人物信息失败: {exc}\033[0m")
        except Exception as e:
            print(f"\033[1;31m{datetime.datetime.now()} 未知错误: {e}\033[0m")
        else:
            if persons_response.status_code == 200:
                persons = persons_response.json()
                found = False
                for person in persons:
                    if person['relation'] == position:
                        found = True
                        person = await fetch_person_infos(http_client, person['id'])
                        person_subjects_map[person].append(subject)
                if found:
                    return subject  # 找到了就返回
        return None
    
    not_found_subjects = [subject for subject in subjects if subject not in subjects_appeared]
    succeeded_subjects = await asyncio.gather(*(fetch_subject_persons(subject) for subject in not_found_subjects))
    unlinked_subjects = set(subjects) - subjects_linked - set(succeeded_subjects)
    return person_subjects_map, list(unlinked_subjects)


async def fetch_person_infos(http_client: httpx.AsyncClient, person_id):
    """获取人物信息

    参数:
        http_client (httpx.AsyncClient): 略
        person_id (int): id

    返回值:
        Person
    """
    # 如果本地数据中已有
    if person_dict.get(str(person_id)):
        person_name = person_dict[str(person_id)][0]
        person_name_cn = person_dict[str(person_id)][1]
        return Person(person_name, person_id, person_name_cn)
    # 没有则调用 api
    url = f'https://api.bgm.tv/v0/persons/{person_id}'
    try:
        response = await http_client.get(url)
    except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RequestError) as exc:
        print(f"\033[1;31m{datetime.datetime.now()} 请求人物失败: {exc}\033[0m")
    except Exception as e:
        print(f"\033[1;31m{datetime.datetime.now()} 未知错误: {e}\033[0m")
    else:
        if response.status_code == 200:
            data = response.json()
            person_name = data['name']
            infobox = data['infobox']
            if '简体中文名' in infobox:
                person_name_cn = extract_name_cn(infobox)
            else:
                person_name_cn = person_name
            return Person(person_name, person_id, person_name_cn)
    return Person('', 0, '')


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
        if isinstance(person, int):
            print(person)
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

async def fetch_user_data(user_id, position, collection_types):
    async with httpx.AsyncClient(headers=headers, limits=httpx.Limits(max_connections=30)) as http_client:
        collection_numbers = await fetch_user_collection_number(http_client, user_id, collection_types)
        all_subjects = await fetch_subjects(http_client, user_id, collection_numbers)
        person_subjects_map, unlinked_subjects = await create_person_subjects_map(http_client, all_subjects, position)
        valid_subjects = analyse_data(person_subjects_map)
        invalid_subjects = [{'subject_name': subject.name, 'subject_id': subject.id, 'subject_name_cn': subject.name_cn} for subject in unlinked_subjects]
        return {
            'valid_subjects': valid_subjects,
            'invalid_subjects': invalid_subjects,
            'collection_number': sum(collection_numbers.values())
        }