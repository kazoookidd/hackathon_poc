import os
import json
import uuid
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, field_validator
from typing import List, Optional
from dotenv import load_dotenv
from datetime import datetime

# OpenAI (optionnel)
from openai import OpenAI

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------
# ENV
# ------------------------
USE_OLLAMA = os.getenv("USE_OLLAMA", "true").lower() == "true"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = None
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)

# Stockage en mémoire (remplacer par une vraie DB en prod)
users_db: dict = {}

# ------------------------
# MODELS — INSCRIPTION
# ------------------------

class RegisterRequest(BaseModel):
    # Infos de base
    email: str
    password: str
    first_name: str
    last_name: str
    age: int

    # Profil
    profession: str
    goal: str  # Objectif principal anti-procrastination

    # Optionnel
    bio: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = "Europe/Paris"

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, v):
        if "@" not in v or "." not in v:
            raise ValueError("Email invalide")
        return v.lower().strip()

    @field_validator("age")
    @classmethod
    def age_must_be_realistic(cls, v):
        if v < 13 or v > 120:
            raise ValueError("L'âge doit être entre 13 et 120 ans")
        return v

    @field_validator("password")
    @classmethod
    def password_must_be_strong(cls, v):
        if len(v) < 6:
            raise ValueError("Le mot de passe doit faire au moins 6 caractères")
        return v

    @field_validator("first_name", "last_name", "profession", "goal")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Ce champ ne peut pas être vide")
        return v.strip()


class RegisterResponse(BaseModel):
    user_id: str
    email: str
    first_name: str
    last_name: str
    message: str
    created_at: str


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    user_id: str
    email: str
    first_name: str
    message: str


class UserProfile(BaseModel):
    user_id: str
    email: str
    first_name: str
    last_name: str
    age: int
    profession: str
    goal: str
    bio: Optional[str]
    phone: Optional[str]
    timezone: str
    created_at: str


class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    age: Optional[int] = None
    profession: Optional[str] = None
    goal: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None


# ------------------------
# MODELS — TASKS
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
# LOGIQUE IA
# ------------------------

def build_prompt(goal: str):
    return f"""
Transforme cet objectif en 3 tâches simples, concrètes et anti-procrastination.
Objectif: {goal}

Contraintes:
- tâches courtes
- action immédiate
- durée réaliste

Réponds UNIQUEMENT en JSON:
[
  {{ "title": "...", "duration": 10 }}
]
"""


def generate_tasks_ollama(goal: str):
    try:
        prompt = build_prompt(goal)
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False
            }
        )
        data = response.json()
        content = data.get("response", "[]")
        tasks = json.loads(content)
        for i, task in enumerate(tasks):
            task["id"] = i + 1
        return tasks
    except Exception as e:
        print("Erreur Ollama:", e)
        return None


def generate_tasks_openai(goal: str):
    try:
        prompt = build_prompt(goal)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        content = response.choices[0].message.content
        tasks = json.loads(content)
        for i, task in enumerate(tasks):
            task["id"] = i + 1
        return tasks
    except Exception as e:
        print("Erreur OpenAI:", e)
        return None


def generate_tasks_simple(goal: str):
    return [
        {"id": 1, "title": "Commencer pendant 5 minutes", "duration": 5},
        {"id": 2, "title": "Continuer 15 minutes", "duration": 15},
        {"id": 3, "title": f"Avancer sur : {goal}", "duration": 20},
    ]


def generate_tasks(goal: str):
    if USE_OLLAMA:
        tasks = generate_tasks_ollama(goal)
        if tasks:
            return tasks
    if client:
        tasks = generate_tasks_openai(goal)
        if tasks:
            return tasks
    return generate_tasks_simple(goal)


# ------------------------
# ROUTES — AUTH & PROFIL
# ------------------------

@app.post("/register", response_model=RegisterResponse, tags=["Auth"])
def register(data: RegisterRequest):
    """Inscription d'un nouvel utilisateur."""

    # Vérifier si l'email est déjà pris
    for user in users_db.values():
        if user["email"] == data.email:
            raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")

    user_id = str(uuid.uuid4())
    created_at = datetime.now().isoformat()

    users_db[user_id] = {
        "user_id": user_id,
        "email": data.email,
        "password": data.password,  # ⚠️ En prod : hasher avec bcrypt
        "first_name": data.first_name,
        "last_name": data.last_name,
        "age": data.age,
        "profession": data.profession,
        "goal": data.goal,
        "bio": data.bio,
        "phone": data.phone,
        "timezone": data.timezone,
        "created_at": created_at,
    }

    return {
        "user_id": user_id,
        "email": data.email,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "message": f"Bienvenue {data.first_name} 🎉",
        "created_at": created_at,
    }


@app.post("/login", response_model=LoginResponse, tags=["Auth"])
def login(data: LoginRequest):
    """Connexion d'un utilisateur existant."""

    for user in users_db.values():
        if user["email"] == data.email.lower().strip():
            if user["password"] == data.password:
                return {
                    "user_id": user["user_id"],
                    "email": user["email"],
                    "first_name": user["first_name"],
                    "message": f"Bon retour {user['first_name']} 👋",
                }
            else:
                raise HTTPException(status_code=401, detail="Mot de passe incorrect")

    raise HTTPException(status_code=404, detail="Utilisateur introuvable")


@app.get("/users/{user_id}", response_model=UserProfile, tags=["Profil"])
def get_profile(user_id: str):
    """Récupérer le profil d'un utilisateur."""

    user = users_db.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    return user


@app.patch("/users/{user_id}", response_model=UserProfile, tags=["Profil"])
def update_profile(user_id: str, data: UpdateProfileRequest):
    """Mettre à jour le profil d'un utilisateur."""

    user = users_db.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    updates = data.model_dump(exclude_none=True)
    user.update(updates)

    return user


@app.delete("/users/{user_id}", tags=["Profil"])
def delete_account(user_id: str):
    """Supprimer un compte utilisateur."""

    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    del users_db[user_id]
    return {"message": "Compte supprimé avec succès"}


@app.get("/users", tags=["Admin"])
def list_users():
    """Lister tous les utilisateurs (admin / debug hackathon)."""

    return [
        {
            "user_id": u["user_id"],
            "email": u["email"],
            "first_name": u["first_name"],
            "last_name": u["last_name"],
            "profession": u["profession"],
        }
        for u in users_db.values()
    ]


# ------------------------
# ROUTES — TASKS
# ------------------------

@app.get("/", tags=["General"])
def root():
    return {"message": "API Anti-Procrastination 🚀"}


@app.post("/generate-plan", response_model=PlanResponse, tags=["Tasks"])
def generate_plan(data: GoalRequest):
    tasks = generate_tasks(data.goal)
    return {"tasks": tasks}


@app.post("/score", response_model=ScoreResponse, tags=["Tasks"])
def calculate_score(data: ScoreRequest):
    if data.total == 0:
        return {"score": 0, "message": "Aucune tâche aujourd'hui 👀"}

    score = int((data.completed / data.total) * 100)

    if score == 100:
        message = "Parfait 🔥"
    elif score >= 70:
        message = "Très bon travail 💪"
    elif score >= 40:
        message = "Tu avances 👍"
    else:
        message = "On fait mieux demain 💥"

    return {"score": score, "message": message}