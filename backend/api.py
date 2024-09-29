import asyncio
import httpx
import re
import math
from collections import defaultdict

headers = {
    'User-Agent': 'your-name/your-project/1.0 (platform) (http://your-project-url)'
}

# 通过设置一个很大的 offset 时产生的报错来获取用户条目数
async def fetch_user_collection_number(http_client: httpx.AsyncClient, user_id, subject_type=2, collection_type=2):
    url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
    params = {
        'subject_type': subject_type,
        'type': collection_type,
        'offset': 99999
    }
    response = await http_client.get(url, params=params)
    error_message = response.json()
    description = error_message.get('description', '')
    match = re.search(r'offset should be less than or equal to (\d+)', description)
    if match:
        max_offset = int(match.group(1))
        return max_offset
    else:
        print('获取条目数量失败')
        return 0


# 获取单个条目
semaphore = asyncio.Semaphore(50)  # 设置并发限制为 50

async def fetch_subject(http_client, user_id, subject_id):
    async with semaphore:
        data_dict = {    # 返回字典
            'subject_id': subject_id,
            'subject': None,
            'persons': None,
            'invalid_subject': True
        }
        subject_url = f'https://api.bgm.tv/v0/users/{user_id}/collections/{subject_id}'
        persons_url = f'https://api.bgm.tv/v0/subjects/{subject_id}/persons'
        subject_response = await http_client.get(subject_url)
        # 检查是否是被隐藏的条目
        if subject_response.status_code == 200:
            person_response = await http_client.get(persons_url)
            data_dict['subject'] = subject_response.json()
            data_dict['persons'] = person_response.json()
            data_dict['invalid_subject'] = False
        return data_dict

# 获取用户的全部条目
async def fetch_user_collections(http_client: httpx.AsyncClient, user_id, subject_type=2, collection_type=2):
    url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
    offset = 0  # 初始偏移量
    max_offset = await fetch_user_collection_number(http_client, user_id, subject_type, collection_type)    # 总条目数
    all_datas = []    # 所有的 persons 字典列表
    while offset <= max_offset:
        params = {
            'limit': 100,
            'subject_type': subject_type,
            'type': collection_type,
            'offset': offset
        }
        # 获取 100 个用户条目
        response = await http_client.get(url, params=params)
        if response.status_code == 200:
            json_data = response.json()
            subject_ids = [subject['subject_id'] for subject in json_data['data']]
            tasks = [fetch_subject(http_client, user_id, subject_id) for subject_id in subject_ids]
            datas = await asyncio.gather(*tasks)
            all_datas.extend(datas)
        else:
            print(f'获取用户收藏失败: {response.status_code} - {response.text}')
        # 分页值加 100
        offset += 100
        
    return all_datas, max_offset

# 找出对应的职位
def extract_position(data_dict: dict, position: str):
    valid_subjects = []   # 包含字典: {'人名': ('人物编号', '条目编号','条目名', '用户评分')}, 用于临时存放数据传递给 sort_data
    invalid_subjects = []    # 包含条目编号
    no_info_subjects = []   # 包含元组: '条目编号', '条目名'
    for data in data_dict:
        if not data:
            continue
        if data['invalid_subject']:
            invalid_subjects.append({'subject_id': data['subject_id']})
        else:
            founded = False # 是否找到至少一个满足条件的人物
            for person in data['persons']:
                if person.get('relation') == position:
                    # 对条目名的索引方法详见 https://bangumi.github.io/api/#/%E6%94%B6%E8%97%8F/getUserCollection
                    valid_subjects.append({person['name']: (
                        person['id'],
                        data['subject_id'], 
                        data['subject']['subject']['name'],
                        data['subject']['rate']
                    )})
                    founded = True
            if not founded:
                no_info_subjects.append({'subject_id': data['subject_id'], 'subject_name': data['subject']['subject']['name']})
            
    return {
        'valid_subjects': sort_data(valid_subjects),    # 对有人物的字典进行排序
        'invalid_subjects': no_info_subjects + invalid_subjects
    }

# 整理有效数据
def sort_data(valid_subjects: list):
    # 最终返回一个列表, 包含的元素为字典, 形式为 {
    #     'person_name': 人名,
    #     'person_id': 人物编号 
    #     'number': 作品数量,
    #     'subject_names': 条目名
    #     'subject_ids': 条目编号
    #     'rate': 条目的用户评分
    #     ‘average_rate': 该人物所有条目的用户评分的平均值
    # }
    
    # merge_dict 合并同一个人的所有作品到一个列表里
    merge_dict = defaultdict(list)
    for person_subject_dict in valid_subjects:
        for person, subject in person_subject_dict.items():
            merge_dict[person].append(subject)
    # 把字典变成列表
    result = [
        {
            'person_name': person,
            'person_id': subject[0],
            'number': len(subjects),
            'subject_ids': [subject[1] for subject in subjects],
            'subject_names': [subject[2] for subject in subjects],
            'rates': [subject[3] for subject in subjects],
            # 计算均分并保留两位小数
            'average_rate': math.floor((sum(s[3] for s in subjects if s[3]) / len([s[3] for s in subjects if s[3]])) * 100) / 100 if len([s[3] for s in subjects if s[3]]) else 0
        }
        for person, subjects in merge_dict.items()
    ]
    # 根据参与作品数量进行排序（从大到小）
    sorted_result = sorted(result, key=lambda item: item['number'], reverse=True)
    return sorted_result

async def generate_ranked_lists(user_id, position):
    async with httpx.AsyncClient(headers=headers, limits=httpx.Limits(max_connections=30)) as http_client:
        extracted_sorted_data = None
        all_datas, total_number = await fetch_user_collections(http_client, user_id)
        extracted_sorted_data = extract_position(all_datas, position)
        extracted_sorted_data['total_number'] = total_number  # 总条目数
        print(extracted_sorted_data)
        return extracted_sorted_data

