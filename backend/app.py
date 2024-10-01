from quart import Quart, jsonify, request
from quart_cors import cors
from api import generate_ranked_lists
import datetime

app = Quart(__name__)

app = cors(app, allow_origin="*")

@app.post('/statistics')
async def get_statistics():
    json_data = await request.json
    user_id = json_data.get('user_id')
    position = json_data.get('position')
    print('start fetching data', user_id, position, datetime.datetime.now())
    ranked_lists = await generate_ranked_lists(user_id, position)
    if ranked_lists['valid_subjects'] or ranked_lists['invalid_subjects']:
        print('fetch data success!', user_id, position, datetime.datetime.now())
        return ranked_lists
    else:
        return jsonify({"error": "fail to fetch information"})

if __name__ == '__main__':
    app.run()