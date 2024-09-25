import asyncio
import httpx
import re
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
semaphore = asyncio.Semaphore(50)  # 设置并发限制为 10

async def fetch_subject_persons(http_client, subject_id):
    async with semaphore:
        data_dict = {    # 返回字典
            'subject_id': subject_id,
            'subject': None,
            'persons': None,
            'invalid_subject': True
        }
        subject_url = f'https://api.bgm.tv/v0/subjects/{subject_id}'
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
            tasks = [fetch_subject_persons(http_client, subject_id) for subject_id in subject_ids]
            datas = await asyncio.gather(*tasks)
            all_datas.extend(datas)
        else:
            print(f'获取用户收藏失败: {response.status_code} - {response.text}')
        # 分页值加 100
        offset += 100
        
    return all_datas

# 根据参与条目数进行排序
def sort_data(valid_subjects: list):
    # 合并人名相同的字典为一个 '人名': [(条目编号, 条目名), (条目编号, 条目名), ...] 的新字典
    merge_dict = defaultdict(list)
    for pws in valid_subjects:
        for person, subject in pws.items():
            merge_dict[person].append(subject)
    # 根据出现次数排序
    sorted_dict = list(sorted(merge_dict.items(), key=lambda item: len(item[1]), reverse=True))
    return sorted_dict

# 找出对应的职位
def extract_position(data_dict: dict, position: str):
    valid_subjects = []   # 包含字典: '人名': ('条目编号','条目名')
    invalid_subjects = []    # 包含条目编号
    no_info_subjects = []   # 包含元组: '条目编号', '条目名'
    for data in data_dict:
        if not data:
            continue
        if data['invalid_subject']:
            invalid_subjects.append(data['subject_id'])
        else:
            founded = False # 是否找到至少一个满足条件的
            for person in data['persons']:
                if person.get('relation') == position:
                    valid_subjects.append({person['name']: (data['subject_id'], data['subject']['name'])})
                    founded = True
            if not founded:
                no_info_subjects.append((data['subject_id'], data['subject']['name']))
                
    return {
        'valid_subjects': sort_data(valid_subjects),    # 对有人物的字典进行排序
        'invalid_subjects': invalid_subjects,
        'no_info_subjects': no_info_subjects
    }

async def generate_ranked_lists(user_id, position):
    async with httpx.AsyncClient(headers=headers, limits=httpx.Limits(max_connections=30)) as http_client:
        extracted_sorted_data = None
        all_datas = await fetch_user_collections(http_client, user_id)
        extracted_sorted_data = extract_position(all_datas, position)
        print(extracted_sorted_data['valid_subjects'])
        return extracted_sorted_data

