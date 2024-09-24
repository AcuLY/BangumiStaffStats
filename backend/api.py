import requests
import asyncio
import httpx
import re

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
semaphore = asyncio.Semaphore(100)  # 设置并发限制为 10

async def fetch_subject(http_client, subject_id):
    async with semaphore:
        subject_url = f'https://api.bgm.tv/v0/subjects/{subject_id}'
        response = await http_client.get(subject_url)
        
        if response.status_code == 200:
            return response.json()
        else:
            return {
                'subject_id': subject_id,
                'invalid_subject': True
            }

# 获取用户的全部条目
async def fetch_user_collections(http_client: httpx.AsyncClient, user_id, subject_type=2, collection_type=2):
    url = f'https://api.bgm.tv/v0/users/{user_id}/collections'
    offset = 0
    max_offset = await fetch_user_collection_number(http_client, user_id, subject_type, collection_type)
    all_subjects = []
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
            tasks = [fetch_subject(http_client, subject_id) for subject_id in subject_ids]
            subjects = await asyncio.gather(*tasks)
            all_subjects.extend(subjects)
        else:
            print(f'获取用户收藏失败: {response.status_code} - {response.text}')
        
        # 分页值加 100
        offset += 100
        
    return all_subjects

    
async def main():
    user_id = 'lucay126'
    async with httpx.AsyncClient(headers=headers) as http_client:
        all_subjects = await fetch_user_collections(http_client, user_id)
        invalid_subjects = []
        directors = []
        no_director_subjects = []
        for subject in all_subjects:
            if subject:
                # 判断是否失败
                if 'invalid_subject' in subject:
                    invalid_subjects.append(subject['subject_id'])
                else:
                    # 判断是否有'导演'
                    if any(dict.get('key') == '导演' for dict in subject['infobox']):
                        directors.append(next(d['value'] for d in subject['infobox'] if d.get('key') == '导演'))
                    else:
                        no_director_subjects.append(subject['name'])
        
        final_directors = []
        for director in directors:
            # 删除名字后面的括号
            director = re.sub(r'\s*\(.*?\)', '', director)
            director = re.sub(r'\s*（.*?）', '', director)
            final_directors.extend(director.split('、')) # 分隔顿号
            final_directors.extend(director.split('→')) # 分隔箭头

        print(final_directors)
        print('失败的条目', invalid_subjects)
        print('无导演的条目', no_director_subjects)
asyncio.run(main())


