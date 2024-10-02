from quart import Quart, jsonify, request
from quart_cors import cors
from api import fetch_user_data
import datetime
import time
import math

app = Quart(__name__)

app = cors(app, allow_origin="*")

@app.post('/statistics')
async def get_statistics():
    json_data = await request.json
    user_id = json_data.get('user_id')
    position = json_data.get('position')
    start_time = time.time()
    print(f"\033[1;34m{datetime.datetime.now()} 开始抓取数据: {user_id}, {position}\033[0m")
    user_data = await fetch_user_data(user_id, position)
    if user_data['valid_subjects'] or user_data['invalid_subjects']:
        print(f"\033[1;32m{datetime.datetime.now()} 抓取数据成功: {user_id}, {position}, 得到{len(user_data['valid_subjects'])}个数据, 用时{math.floor(time.time() - start_time)}秒\033[0m")
        return user_data
    else:
        return jsonify({"error": "fail to fetch information"})

if __name__ == '__main__':
    app.run()