from quart import Quart, jsonify, request, make_response
from quart_cors import cors
from api import fetch_user_data, transmit_data
import datetime
import time
import math
import ujson
import gzip
from io import BytesIO

app = Quart(__name__)

app = cors(app, allow_origin="*")

# 预加载数据
async def load_data():
    with open('./data/subject-persons.json', 'r', encoding='utf-8') as f:
        subject_persons = ujson.load(f)
    with open('./data/person.json', 'r', encoding='utf-8') as f:
        person = ujson.load(f)
    with open('./data/person-characters.json', 'r', encoding='utf-8') as f:
        person_characters = ujson.load(f)
    with open('./data/subject-relations.json', 'r', encoding='utf-8') as f:
        subject_relations = ujson.load(f)
    with open('./data/subject.json', 'r', encoding='utf-8') as f:
        subject = ujson.load(f)
    return subject_persons, person, person_characters, subject_relations, subject
    
@app.before_serving
async def start_up():
    data = await load_data()
    transmit_data(data)


@app.post('/statistics')
async def get_statistics():
    json_data = await request.json
    user_id = json_data.get('user_id')
    subject_type = json_data.get('subject_type')
    position = json_data.get('position')
    collection_types = json_data.get('collection_types')
    tags = json_data.get('tags')
    
    start_time = time.time()
    print(f"\033[1;34m{datetime.datetime.now()} 开始抓取数据: {user_id}, 条目类型{subject_type}, {position}, 收藏类型{collection_types}, 标签{tags}\033[0m")
    
    user_data = await fetch_user_data(user_id, position, collection_types, subject_type, tags)
    
    if user_data == 'invalid userid':
        return jsonify({"error": "invalid userid"}), 400
    
    if user_data == 'no information':
        return jsonify({"error": "no information"}), 400
    
    if position == '':
        print(f"\033[1;32m{datetime.datetime.now()} 抓取数据成功: {user_id}, {subject_type}, {collection_types}, {tags}, 得到{len(user_data['all_subjects'])}个数据, 用时{math.floor(time.time() - start_time)}秒\033[0m")
    else:
        print(f"\033[1;32m{datetime.datetime.now()} 抓取数据成功: {user_id}, {subject_type}, {position}, {collection_types}, {tags}, 得到{len(user_data['valid_subjects'])}个数据, 用时{math.floor(time.time() - start_time)}秒\033[0m")
    
    # 压缩数据
    dumped_data = ujson.dumps(user_data)
    compressed_data = BytesIO()
    with gzip.GzipFile(fileobj=compressed_data, mode='w') as f:
        f.write(dumped_data.encode('utf-8'))
    response = await make_response(compressed_data.getvalue())
    response.headers['Content-Encoding'] = 'gzip'
    response.headers['Content-Length'] = compressed_data.tell()
    response.headers['Content-Type'] = 'application/json'
    return response

if __name__ == '__main__':
    app.run()