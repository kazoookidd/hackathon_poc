import os
import json
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

# Si tu utilises OpenAI (optionnel)
try:
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except:
    client = None

load_dotenv()

app = FastAPI()

# ------------------------
# MODELS
# ------------------------

class GoalRequest(BaseModel):
    goal: str

class Task(BaseModel):
    id: int
    title: str
    duration: int

class PlanResponse(BaseModel):
    tasks: List[Task]

class ScoreRequest(BaseModel):
    completed: int
    total: int

class ScoreResponse(BaseModel):
    score: int
    message: str


# ------------------------
# LOGIQUE PRINCIPALE
# ------------------------

def generate_tasks_simple(goal: str):
    """
    Version fallback (sans IA)
    """
    return [
        {"id": 1, "title": "Commencer pendant 5 minutes", "duration": 5},
        {"id": 2, "title": "Continuer pendant 15 minutes", "duration": 15},
        {"id": 3, "title": f"Avancer sur : {goal}", "duration": 20},
    ]


def generate_tasks_ai(goal: str):
    """
    Version avec IA (si clé API dispo)
    """
    try:
        prompt = f"""
Transforme cet objectif en 3 tâches simples et concrètes.
Chaque tâche doit être faisable rapidement et aider à éviter la procrastination.

Objectif: {goal}

Réponds uniquement en JSON format:
[
  {{ "title": "...", "duration": 10 }}
]
        """

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )

        content = response.choices[0].message.content
        tasks = json.loads(content)

        # Ajouter IDs
        for i, task in enumerate(tasks):
            task["id"] = i + 1

        return tasks

    except Exception as e:
        print("Erreur IA:", e)
        return generate_tasks_simple(goal)


def generate_tasks(goal: str):
    """
    Choisit IA ou fallback
    """
    if client:
        return generate_tasks_ai(goal)
    return generate_tasks_simple(goal)


# ------------------------
# ROUTES
# ------------------------

@app.get("/")
def root():
    return {"message": "API Anti-Procrastination 🚀"}


@app.post("/generate-plan", response_model=PlanResponse)
def generate_plan(data: GoalRequest):
    tasks = generate_tasks(data.goal)
    return {"tasks": tasks}


@app.post("/score", response_model=ScoreResponse)
def calculate_score(data: ScoreRequest):
    if data.total == 0:
        return {"score": 0, "message": "Aucune tâche aujourd’hui 👀"}

    score = int((data.completed / data.total) * 100)

    if score == 100:
        message = "Parfait ! Journée ultra productive 🔥"
    elif score >= 70:
        message = "Très bon travail 💪"
    elif score >= 40:
        message = "Pas mal, tu avances 👍"
    else:
        message = "Demain sera meilleur, ne lâche rien 💥"

    return {
        "score": score,
        "message": message
    }