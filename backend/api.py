import httpx
import asyncio
import re
import math
from collections import defaultdict
from utils import Subject, Person, Character, position_ids, extract_name_cn
import datetime

headers = {
    'User-Agent': 'AcuL/BangumiStaffStatistics/1.0 (Web) (https://github.com/AcuLY/BangumiStaffStats)'
}

# 预加载数据
subject_persons_dict = None
person_dict = None
person_characters_dict = None
subject_relations = None

def transmit_data(data):
    global subject_persons_dict, person_dict, person_characters_dict, subject_relations
    subject_persons_dict, person_dict, person_characters_dict, subject_relations = data


async def fetch_user_collection_number(http_client: httpx.AsyncClient, user_id, collection_types: list, subject_type=2):
    """通过设置一个很大的 offset 时产生的报错来获取用户条目的数量

    参数:
        http_client (httpx.AsyncClient): 异步客户端
        user_id (string): 用户 id
        collection_types (list(int), optional): 收藏类型, 见 https://bangumi.github.io/api 最后
        subject_type(int): 条目类型
    返回值:
        collection_numbers(dict): 类型对应的用户的收藏数量
    """
    collection_numbers = {} # 收藏类型到数量的映射
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
        subject_type(int): 条目类型
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
                    subject_image = collection['subject']['images']['grid']
                    subjects_100.append(Subject(subject_name, subject_id, subject_rate, subject_name_cn, subject_image))
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


def mark_sequels(all_subjects: list):
    """标注每个条目所在系列的主条目

    参数:
        all_subjects (list): 全部条目
    返回值:
        int: 系列的数量
    """
    # 按“最第一季”到最“续作 / 番外”的顺序记录记录一个系列的条目
    series_subjects = defaultdict(list)  # series_id -> [Subject, order]
    for subject in all_subjects:
        series_id = subject_relations[subject.id][0]    # 系列的编号，一个系列的条目共用一个编号
        order = subject_relations[subject.id][1]        # 当前条目在该系列里的顺位，越小越接近第一季
        series_subjects[series_id].append((subject, order))

    for order_list in series_subjects.values():
        order_list.sort(key=lambda tp: tp[1])
        order_list = [tp[0] for tp in order_list]
        main_subject = order_list[0]
        # 计算系列的均分
        valid_rates = [subject.rate for subject in order_list if subject.rate]
        average_rate = math.floor(sum(valid_rates) / len(valid_rates) * 100) / 100 if valid_rates else 0
        for subject in order_list:
            subject.series_subject = main_subject
            subject.series_rate = average_rate
    
    return len(series_subjects)


async def create_person_subjects_map(http_client: httpx.AsyncClient, subjects: list, position: str, subject_type):
    """创建一个 Person 到 [Subject] 的映射

    参数:
        http_client (httpx.AsyncClient): 见上
        subjects (list(Subjects)): 用户收藏的条目
        position (str): 要查询的职位
        subject_type(int): 条目类型
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
                if position_id in position_ids[subject_type][position]:
                    person = await fetch_person_infos(http_client, person_id)
                    person_subjects_map[person].append(subject)
                    subjects_linked.add(subject)
    # 如果一个声优在一部作品配了多个角色, 需要去除重复的 subject
    if '声优' in position:
        for person, subjects in person_subjects_map.items():
            person_subjects_map[person] = list(set(subjects))
    # 本地数据中没有的 subject_id
    async def fetch_subject_persons(subject):
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
            # 简体中文名可能为空
            if len(person_name_cn.strip()) == 0:
                person_name_cn = person_name
            return Person(person_name, person_id, person_name_cn)
    return Person('', 0, '')


def create_person_characters_map(person_subjects_map: dict, position: str, subject_type: int):
    """创建 Person 到 Characters 的映射

    参数:
        person_subjects_map (dict): Person -> [Subject]
        position (str)
        subject_type (int)
        subject_id -> [subject_id], 按 “最第一季” 的顺序排序

    返回:
        person_characters_map (dict): Person -> [Character]
    """
    person_characters_map = defaultdict(list)
    for person, subjects in person_subjects_map.items():
        id_to_subject = {subject.id: subject for subject in subjects}
        for relation in person_characters_dict[person.id]:
            if relation['subject_id'] in id_to_subject.keys() and relation['role'] in position_ids[subject_type][position]:
                subject = id_to_subject[relation['subject_id']].series_subject  # 找到对应的作品系列
                character = Character(relation['character_id'], relation['character_name'], relation['character_name_cn'], relation['character_image'], subject)
                if character not in person_characters_map[person]:
                    person_characters_map[person].append(character)
    return person_characters_map


def analyse_data(person_subjects_map: dict, person_characters_map: dict):
    """计算均分, 并将最终转换数据

    参数:
        person_subjects_map (dict): Person 到 [Subject] 的映射
        person_characters_map (dict): Person -> [Character]

    返回值:
        final_list(list): 如下
    """
    final_list = []
    for person, subjects in person_subjects_map.items():
        # 如果是声优提取角色
        characters = []
        if person_characters_map:
            characters = person_characters_map[person]
        # 计算均分
        valid_rates = [subject.rate for subject in subjects if subject.rate]
        average_rate = math.floor(sum(valid_rates) / len(valid_rates) * 100) / 100 if valid_rates else 0
        # 计算人物的系列均分的均分
        series = set()
        series_subjects = [subject.series_subject for subject in subjects if subject.series_subject not in series and not series.add(subject.series_subject)]
        series_valid_rates = []
        for series_subject in series_subjects:
            acc, cnt = 0, 0
            for subject in subjects:
                if subject.rate and subject.series_subject == series_subject:
                    acc += subject.rate
                    cnt += 1
            series_valid_rates.append(math.floor(acc / cnt * 100) / 100 if cnt else 0)
        series_average_rate = math.floor(sum(series_valid_rates) / len(series_valid_rates) * 100) / 100 if series_valid_rates else 0

        final_list.append({
            'person_name': person.name,
            'person_id': person.id,
            'person_name_cn': person.name_cn,
            'subject_names': [subject.name for subject in subjects],
            'subject_ids': [subject.id for subject in subjects],
            'subject_names_cn': [subject.name_cn for subject in subjects],
            'rates': [subject.rate for subject in subjects],
            'subject_images': [subject.image for subject in subjects],
            'average_rate': average_rate,
            'subjects_number': len(subjects),
            # 角色
            'character_ids': [character.id for character in characters],
            'character_names':[character.name for character in characters],
            'character_names_cn': [character.name_cn for character in characters],
            'character_images': [character.image for character in characters],
            'character_subject_names': [character.subject.name for character in characters],
            'character_subject_names_cn': [character.subject.name_cn for character in characters],
            'characters_number': len(characters),
            # 非续作条目
            'series_subject_names': [subject.name for subject in series_subjects],
            'series_subject_ids': [subject.id for subject in series_subjects],
            'series_subject_names_cn': [subject.name_cn for subject in series_subjects],
            'series_rates': series_valid_rates,
            'series_subject_images': [subject.image for subject in series_subjects],
            'series_average_rate': series_average_rate,
            'series_subjects_number': len(series_subjects),
        })
    final_list = sorted(final_list, key=lambda item: item['subjects_number'], reverse=True)
    return final_list


async def fetch_user_data(user_id, position, collection_types, subject_type):
    async with httpx.AsyncClient(headers=headers, limits=httpx.Limits(max_connections=30)) as http_client:
        
        collection_numbers = await fetch_user_collection_number(http_client, user_id, collection_types, subject_type)
        
        all_subjects = await fetch_subjects(http_client, user_id, collection_numbers, subject_type)
        
        series_number = mark_sequels(all_subjects)
        
        person_subjects_map, unlinked_subjects = await create_person_subjects_map(http_client, all_subjects, position, subject_type)
        
        if '声优' in position:
            person_characters_map = create_person_characters_map(person_subjects_map, position, subject_type)
            valid_subjects = analyse_data(person_subjects_map, person_characters_map)
        else:
            valid_subjects = analyse_data(person_subjects_map, None)
        
        invalid_subjects = [{'subject_name': subject.name, 'subject_id': subject.id, 'subject_name_cn': subject.name_cn} for subject in unlinked_subjects]
        
        return {
            'valid_subjects': valid_subjects,
            'invalid_subjects': invalid_subjects,
            'collection_number': len(all_subjects),
            'series_number': series_number
        }