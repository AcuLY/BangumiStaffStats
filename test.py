import requests

user_id = "lucay126"

url = f'https://api.bgm.tv/v0/users/{user_id}/collections?limit=30&subject_type=2&collection_type=2'

headers = {
    'User-Agent': 'your-name/your-project/1.0 (platform) (http://your-project-url)'
}


response = requests.get(url, headers=headers)

print(response.status_code)

if response.status_code == 200:
    json = response.json()
    data = json['data']
    subject_ids = [subject['subject_id'] for subject in data]
    responses = [requests.get(f'https://api.bgm.tv/v0/subjects/{subject_id}', headers=headers) for subject_id in subject_ids]
    for response in responses:
        data = response.json()
        directors = [info['value'] for info in data['infobox'] if info['key'] == '导演']
        print(data['infobox'])

