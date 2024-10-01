from quart import Quart, jsonify, request
from quart_cors import cors
from api import generate_ranked_lists
import asyncio

app = Quart(__name__)

app = cors(app, allow_origin="*")

@app.post('/statistics')
async def get_statistics():
    print('start fetching data')
    json_data = await request.json
    user_id = json_data.get('user_id')
    position = json_data.get('position')
    print(user_id, position)
    ranked_lists = await generate_ranked_lists(user_id, position)
    if ranked_lists['valid_subjects'] or ranked_lists['invalid_subjects']:
        print('fetch data success!')
        return ranked_lists
    else:
        return jsonify({"error": "fail to fetch information"})

if __name__ == '__main__':
    app.run()