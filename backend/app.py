from flask import Flask, jsonify, request
from flask_cors import CORS
from api import generate_ranked_lists
import asyncio

app = Flask(__name__)

CORS(app)

@app.post('/statistics')
def get_statistics():
    user_id = request.json.get('user_id')
    position = request.json.get('position')
    ranked_lists = asyncio.run(generate_ranked_lists(user_id, position))
    if ranked_lists:
        return ranked_lists
    else:
        return jsonify({"error": "fail to fetch information"})

if __name__ == '__main__':
    app.run(debug=True)