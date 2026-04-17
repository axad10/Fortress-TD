from flask import Flask, render_template, request, jsonify
import json, os

app = Flask(__name__)
SCORES_FILE = "scores.json"

def load_scores():
    if os.path.exists(SCORES_FILE):
        with open(SCORES_FILE, "r") as f:
            return json.load(f)
    return []

def save_scores(scores):
    with open(SCORES_FILE, "w") as f:
        json.dump(scores, f)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/scores", methods=["GET"])
def get_scores():
    scores = load_scores()
    scores.sort(key=lambda x: x["score"], reverse=True)
    return jsonify(scores[:10])

@app.route("/scores", methods=["POST"])
def post_score():
    data = request.get_json()
    name = data.get("name", "Player")[:12]
    score = int(data.get("score", 0))
    wave = int(data.get("wave", 1))
    scores = load_scores()
    scores.append({"name": name, "score": score, "wave": wave})
    scores.sort(key=lambda x: x["score"], reverse=True)
    save_scores(scores[:20])
    return jsonify({"status": "saved"})

if __name__ == "__main__":
    app.run(debug=True)