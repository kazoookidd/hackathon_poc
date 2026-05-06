import json
import os
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, field_validator

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
OLLAMA_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OLLAMA_FALLBACK_MODELS", "llama3.2:1b,phi3:mini,qwen2.5:1.5b,tinyllama").split(",")
    if m.strip()
]
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = None
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)

DB_PATH = Path(os.getenv("DB_PATH", Path(__file__).parent / "app.db"))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                age INTEGER NOT NULL,
                profession TEXT NOT NULL,
                goal TEXT NOT NULL,
                bio TEXT,
                phone TEXT,
                timezone TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


init_db()

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
    microtasks: Optional[List[str]] = None
    explanation: Optional[str] = None
    depends_on: Optional[List[str]] = None


class PlanResponse(BaseModel):
    tasks: List[Task]


class ScoreRequest(BaseModel):
    completed: int
    total: int


class ScoreResponse(BaseModel):
    score: int
    message: str


class ChatRequest(BaseModel):
    messages: List[dict]
    tasks_context: Optional[List[dict]] = None
    current_goal: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


class PlanAssistantRequest(BaseModel):
    tasks_text: str
    conversation: Optional[List[dict]] = None


class PlanAssistantResponse(BaseModel):
    status: str
    summary: str
    questions: Optional[List[str]] = None
    tasks: Optional[List[Task]] = None


# ------------------------
# LOGIQUE IA
# ------------------------

def build_prompt(goal: str):
    raw_items = extract_input_items(goal)
    tasks_block = "\n".join([f"- {item}" for item in raw_items]) if raw_items else f"- {goal}"
    return f"""
Transforme ces taches utilisateur en programme d'action clair, concret et anti-procrastination.
Taches utilisateur:
{tasks_block}

Contraintes:
- Une entree par tache utilisateur
- titre precis et adapte a la tache
- duree realiste
- 3 a 5 microtaches actionnables
- une explication simple du pourquoi de l'ordre

Réponds UNIQUEMENT en JSON:
[
  {{
    "title": "...",
    "duration": 10,
    "explanation": "...",
    "microtasks": ["...", "...", "..."]
  }}
]
"""


def generate_tasks_ollama(goal: str):
    prompt = build_prompt(goal) + "\nNe renvoie aucun texte avant ou apres le JSON."
    installed = set(get_installed_ollama_models())
    models_to_try = [OLLAMA_MODEL]
    for candidate in OLLAMA_FALLBACK_MODELS:
        if candidate in installed and candidate not in models_to_try:
            models_to_try.append(candidate)

    for model_name in models_to_try:
        try:
            response = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"temperature": 0.2},
                    "format": "json",
                },
                timeout=45,
            )
            if response.status_code >= 400:
                if "requires more system memory" in response.text:
                    continue
                response.raise_for_status()
            data = response.json()
            content = ((data.get("message", {}) or {}).get("content") or "").strip()
            if not content:
                continue
            tasks = normalize_generated_tasks(parse_tasks_from_text(content), goal)
            if not tasks:
                continue
            for i, task in enumerate(tasks):
                task["id"] = i + 1
            return tasks
        except Exception as exc:
            print(f"Erreur Ollama ({model_name}):", exc)
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
        tasks = normalize_generated_tasks(parse_tasks_from_text(content), goal)
        for i, task in enumerate(tasks):
            task["id"] = i + 1
        return tasks
    except Exception as e:
        print("Erreur OpenAI:", e)
        return None


def parse_tasks_from_text(text: str):
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def get_installed_ollama_models():
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
        response.raise_for_status()
        data = response.json()
        return [m.get("name", "") for m in data.get("models", []) if m.get("name")]
    except Exception:
        return []


def generate_tasks_simple(goal: str):
    raw_items = extract_input_items(goal)
    if not raw_items:
        raw_items = [goal]

    tasks = []
    for idx, item in enumerate(raw_items, start=1):
        tasks.append(
            {
                "id": idx,
                "title": item,
                "duration": 25 if len(item) > 45 else 18,
                "explanation": f"Plan de secours spécifique pour avancer sur '{item}' même sans IA disponible.",
                "microtasks": [
                    f"Définir en une phrase ce que 'terminé' veut dire pour: {item}",
                    f"Lancer la première action visible liée à: {item}",
                    f"Continuer 10 minutes concentré sur: {item}",
                    f"Valider l'avancement et noter la prochaine action pour: {item}",
                ],
            }
        )
    return tasks


def extract_input_items(goal: str):
    return [item.strip("- ").strip() for item in goal.replace(";", "\n").split("\n") if item.strip()]


def default_microtasks_for(title: str):
    low = title.lower()
    if any(k in low for k in ["manger", "repas", "déjeuner", "dîner", "diner"]):
        return [
            f"Préparer l'espace repas pour: {title}",
            f"Lancer le repas sans écran pour: {title}",
            f"Prendre 10 minutes pour manger calmement: {title}",
            f"Noter ton niveau d'énergie après: {title}",
        ]
    if any(k in low for k in ["cuisiner", "faire à manger", "faire a manger", "préparer à manger", "preparer a manger"]):
        return [
            f"Choisir la recette ou le menu pour: {title}",
            f"Rassembler les ingrédients nécessaires pour: {title}",
            f"Lancer la cuisson de la première étape pour: {title}",
            f"Finaliser et dresser le plat pour: {title}",
        ]
    if any(k in low for k in ["sport", "entrainement", "course", "musculation"]):
        return [
            f"Choisir une séance précise pour: {title}",
            f"Faire un échauffement de 5 minutes pour: {title}",
            f"Exécuter le bloc principal d'entraînement pour: {title}",
            f"Terminer avec récupération et hydratation pour: {title}",
        ]
    return [
        f"Définir le livrable concret pour: {title}",
        f"Démarrer immédiatement une première action sur: {title}",
        f"Faire un bloc focus de 10 minutes sur: {title}",
        f"Valider l'avancement et noter la prochaine étape pour: {title}",
    ]


def normalize_generated_tasks(tasks: list, goal: str):
    user_items = extract_input_items(goal)
    if not user_items:
        user_items = [goal.strip() or "Tâche principale"]

    normalized = []
    for idx, item in enumerate(user_items):
        source = tasks[idx] if idx < len(tasks) and isinstance(tasks[idx], dict) else {}
        title = str(source.get("title") or item).strip() or item
        duration = int(source.get("duration") or (25 if len(title) > 45 else 18))
        explanation = str(source.get("explanation") or f"Plan ciblé pour avancer concrètement sur: {title}").strip()
        raw_micro = source.get("microtasks")
        microtasks = [str(m).strip() for m in raw_micro] if isinstance(raw_micro, list) else []
        microtasks = [m for m in microtasks if m and m != "..." and "..." not in m]
        if len(microtasks) < 3:
            microtasks = default_microtasks_for(title)
        normalized.append(
            {
                "id": idx + 1,
                "title": title,
                "duration": max(5, min(duration, 120)),
                "explanation": explanation,
                "microtasks": microtasks[:5],
                "depends_on": source.get("depends_on") if isinstance(source.get("depends_on"), list) else [],
            }
        )
    return normalized


def enrich_dependencies(tasks: List[dict]):
    def has_any(text: str, words: List[str]) -> bool:
        low = text.lower()
        return any(w in low for w in words)

    prep_keywords = ["préparer à manger", "preparer a manger", "faire à manger", "faire a manger", "cuisiner"]
    eat_keywords = ["manger", "prendre le repas", "dejeuner", "déjeuner", "diner", "dîner"]

    prep_title = None
    for t in tasks:
        title = str(t.get("title", ""))
        if has_any(title, prep_keywords):
            prep_title = title
            break
    if prep_title:
        for t in tasks:
            title = str(t.get("title", ""))
            if has_any(title, eat_keywords) and not has_any(title, prep_keywords):
                deps = t.get("depends_on") if isinstance(t.get("depends_on"), list) else []
                if prep_title not in deps:
                    deps.append(prep_title)
                t["depends_on"] = deps

    return tasks


def sort_tasks_by_dependencies(tasks: List[dict]) -> List[dict]:
    by_title = {str(t.get("title", "")).strip(): t for t in tasks}
    visited = set()
    ordered: List[dict] = []

    def visit(title: str):
        if title in visited or title not in by_title:
            return
        visited.add(title)
        node = by_title[title]
        for dep in node.get("depends_on") or []:
            visit(dep)
        ordered.append(node)

    for t in tasks:
        visit(str(t.get("title", "")).strip())

    for i, task in enumerate(ordered, start=1):
        task["id"] = i
    return ordered


def analyze_tasks_needs(tasks_text: str, conversation: Optional[List[dict]] = None) -> dict:
    convo = conversation or []
    convo_txt = "\n".join([f"- {m.get('role','user')}: {m.get('content','')}" for m in convo[-8:]])
    system_prompt = (
        "Tu analyses une liste de tâches anti-procrastination. "
        "Réponds strictement en JSON objet avec: needs_clarification (bool), summary (string), "
        "questions (liste de strings), dependencies (liste objets {before, after}). "
        "Pose des questions seulement si c'est vraiment nécessaire (priorités, deadlines, ambiguïté). "
        "Détecte les dépendances logiques entre tâches."
    )
    user_prompt = f"Tâches:\n{tasks_text}\n\nContexte:\n{convo_txt or '- aucun'}"
    ai = ai_json_request(system_prompt, user_prompt)
    if not ai:
        return {"needs_clarification": False, "summary": "Analyse locale.", "questions": [], "dependencies": []}
    deps = ai.get("dependencies") if isinstance(ai.get("dependencies"), list) else []
    questions = ai.get("questions") if isinstance(ai.get("questions"), list) else []
    clean_questions: List[str] = []
    for q in questions:
        if isinstance(q, str):
            clean_questions.append(q.strip())
        elif isinstance(q, dict):
            clean_questions.append(str(q.get("message") or q.get("question") or "").strip())
    return {
        "needs_clarification": bool(ai.get("needs_clarification")),
        "summary": str(ai.get("summary") or "Analyse faite."),
        "questions": [q for q in clean_questions if q][:3],
        "dependencies": [d for d in deps if isinstance(d, dict)],
    }


def apply_ai_dependencies(tasks: List[dict], dependencies: List[dict]) -> List[dict]:
    if not dependencies:
        return tasks
    title_map = {str(t.get("title", "")).strip().lower(): t for t in tasks}
    for dep in dependencies:
        before = str(dep.get("before", "")).strip().lower()
        after = str(dep.get("after", "")).strip().lower()
        if not before or not after:
            continue
        before_task = next((t for key, t in title_map.items() if before in key), None)
        after_task = next((t for key, t in title_map.items() if after in key), None)
        if not before_task or not after_task:
            continue
        deps = after_task.get("depends_on") if isinstance(after_task.get("depends_on"), list) else []
        if before_task["title"] not in deps:
            deps.append(before_task["title"])
        after_task["depends_on"] = deps
    return tasks


def ai_json_request(system_prompt: str, user_prompt: str) -> Optional[dict]:
    if client:
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or "{}"
            return json.loads(content)
        except Exception:
            pass

    if USE_OLLAMA:
        installed = set(get_installed_ollama_models())
        models_to_try = [OLLAMA_MODEL] + [m for m in OLLAMA_FALLBACK_MODELS if m in installed and m != OLLAMA_MODEL]
        for model_name in models_to_try:
            try:
                response = requests.post(
                    f"{OLLAMA_URL}/api/chat",
                    json={
                        "model": model_name,
                        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                        "stream": False,
                        "format": "json",
                        "options": {"temperature": 0.3},
                    },
                    timeout=45,
                )
                if response.status_code >= 400:
                    if "requires more system memory" in response.text:
                        continue
                    response.raise_for_status()
                content = ((response.json().get("message", {}) or {}).get("content") or "{}").strip()
                return json.loads(content)
            except Exception:
                continue
    return None


def heuristic_plan_assistant(tasks_text: str):
    items = extract_input_items(tasks_text)
    if len(items) > 4:
        return {
            "status": "needs_clarification",
            "summary": "Tu as beaucoup de tâches. Il faut clarifier les priorités.",
            "questions": ["Quelles sont les 3 tâches les plus urgentes pour aujourd'hui ?"],
            "tasks": None,
        }

    tasks = enrich_dependencies(generate_tasks_simple(tasks_text))
    return {"status": "ready", "summary": "Plan généré.", "questions": [], "tasks": tasks}


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
    user_id = str(uuid.uuid4())
    created_at = datetime.now().isoformat()
    with get_conn() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE email = ?", (data.email,)).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")
        conn.execute(
            """
            INSERT INTO users (
                user_id, email, password, first_name, last_name, age, profession,
                goal, bio, phone, timezone, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                data.email,
                data.password,
                data.first_name,
                data.last_name,
                data.age,
                data.profession,
                data.goal,
                data.bio,
                data.phone,
                data.timezone,
                created_at,
            ),
        )
        conn.commit()

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
    with get_conn() as conn:
        user = conn.execute(
            "SELECT user_id, email, first_name, password FROM users WHERE email = ?",
            (data.email.lower().strip(),),
        ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["password"] != data.password:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "first_name": user["first_name"],
        "message": f"Bon retour {user['first_name']} 👋",
    }


@app.get("/users/{user_id}", response_model=UserProfile, tags=["Profil"])
def get_profile(user_id: str):
    """Récupérer le profil d'un utilisateur."""
    with get_conn() as conn:
        user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return dict(user)


@app.patch("/users/{user_id}", response_model=UserProfile, tags=["Profil"])
def update_profile(user_id: str, data: UpdateProfileRequest):
    """Mettre à jour le profil d'un utilisateur."""
    with get_conn() as conn:
        user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        current = dict(user) if user else None
    user = current
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    updates = data.model_dump(exclude_none=True)
    allowed = {"first_name", "last_name", "age", "profession", "goal", "bio", "phone", "timezone"}
    safe_updates = {k: v for k, v in updates.items() if k in allowed}
    if safe_updates:
        set_clause = ", ".join([f"{k} = ?" for k in safe_updates.keys()])
        with get_conn() as conn:
            conn.execute(
                f"UPDATE users SET {set_clause} WHERE user_id = ?",
                tuple(safe_updates.values()) + (user_id,),
            )
            conn.commit()
            updated = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return dict(updated)
    return user


@app.delete("/users/{user_id}", tags=["Profil"])
def delete_account(user_id: str):
    """Supprimer un compte utilisateur."""
    with get_conn() as conn:
        deleted = conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        conn.commit()
    if deleted.rowcount == 0:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"message": "Compte supprimé avec succès"}


@app.get("/users", tags=["Admin"])
def list_users():
    """Lister tous les utilisateurs (admin / debug hackathon)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT user_id, email, first_name, last_name, profession FROM users ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


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


@app.post("/plan-assistant", response_model=PlanAssistantResponse, tags=["Tasks"])
def plan_assistant(data: PlanAssistantRequest):
    tasks_text = data.tasks_text.strip()
    if not tasks_text:
        raise HTTPException(status_code=400, detail="Aucune tâche fournie")

    convo = data.conversation or []
    convo_txt = "\n".join([f"- {m.get('role','user')}: {m.get('content','')}" for m in convo[-8:]])
    system_prompt = (
        "Tu es un assistant de planification anti-procrastination. "
        "Tu réponds strictement en JSON objet avec les clés: status, summary, questions, tasks. "
        "status est 'needs_clarification' ou 'ready'. "
        "Si l'input est ambigu, trop volumineux ou nécessite priorités/deadlines, pose 1 à 3 questions concrètes. "
        "Si c'est prêt, renvoie tasks (liste) avec title, duration, explanation, microtasks (3-5), depends_on (titres de tâches requises). "
        "Détecte les dépendances logiques (ex: préparer à manger avant manger)."
    )
    user_prompt = (
        f"Taches utilisateur:\n{tasks_text}\n\nContexte conversation:\n{convo_txt or '- aucun'}\n\n"
        "Renvoie l'objet JSON final."
    )
    analysis = analyze_tasks_needs(tasks_text, convo)
    generated = generate_tasks(tasks_text) or generate_tasks_simple(tasks_text)
    generated = normalize_generated_tasks(generated, tasks_text)
    generated = apply_ai_dependencies(generated, analysis.get("dependencies") or [])
    generated = enrich_dependencies(generated)
    generated = sort_tasks_by_dependencies(generated)

    # Flux principal: toujours livrer un plan. Questions seulement pour affiner.
    if analysis.get("needs_clarification"):
        return {
            "status": "needs_clarification",
            "summary": analysis.get("summary", "Plan généré, quelques précisions peuvent l'améliorer."),
            "questions": analysis.get("questions") or ["Quelle tâche est prioritaire aujourd'hui ?"],
            "tasks": generated,
        }
    return {"status": "ready", "summary": analysis.get("summary", "Plan généré."), "questions": [], "tasks": generated}


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


@app.post("/chat", response_model=ChatResponse, tags=["Tasks"])
def chat_with_coach(data: ChatRequest):
    tasks_context = data.tasks_context or []
    tasks_summary = ""
    if tasks_context:
        lines = []
        for t in tasks_context[:20]:
            title = str(t.get("title", ""))
            duration = str(t.get("duration", ""))
            deps = t.get("depends_on") or []
            deps_txt = f" (depend de: {', '.join(deps)})" if deps else ""
            lines.append(f"- {title} [{duration} min]{deps_txt}")
        tasks_summary = "\nTaches en cours:\n" + "\n".join(lines)

    system_prompt = (
        "Tu es FOCA, coach anti-procrastination. Reponses tres courtes, bienveillantes, "
        "pratiques, en francais. Termine souvent avec une action simple en moins de 5 minutes. "
        "Si des taches en cours sont fournies, base tes conseils dessus et cite la tache concernee."
    )
    if data.current_goal:
        system_prompt += f"\nObjectif courant: {data.current_goal}"
    if tasks_summary:
        system_prompt += tasks_summary
    messages = [{"role": "system", "content": system_prompt}]
    for msg in data.messages[-12:]:
        role = "assistant" if msg.get("role") == "coach" else "user"
        messages.append({"role": role, "content": msg.get("content", "")})

    if client:
        try:
            response = client.chat.completions.create(model="gpt-4o-mini", messages=messages, temperature=0.6)
            reply = response.choices[0].message.content or "On commence petit: 5 minutes d'action maintenant."
            return {"reply": reply}
        except Exception:
            pass
    if USE_OLLAMA:
        try:
            models_to_try = [OLLAMA_MODEL]
            installed = set(get_installed_ollama_models())
            for candidate in OLLAMA_FALLBACK_MODELS:
                if candidate in installed and candidate not in models_to_try:
                    models_to_try.append(candidate)

            memory_error = None
            for model_name in models_to_try:
                response = requests.post(
                    f"{OLLAMA_URL}/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": False,
                        "options": {"temperature": 0.5},
                    },
                    timeout=30,
                )
                if response.status_code >= 400:
                    error_text = response.text
                    if "requires more system memory" in error_text:
                        memory_error = error_text
                        continue
                    response.raise_for_status()
                data = response.json()
                reply = (data.get("message", {}) or {}).get("content", "").strip()
                if reply:
                    return {"reply": reply}
            if memory_error:
                return {
                    "reply": (
                        "Ollama manque de RAM pour ce modele. "
                        "Installe un modele plus petit puis configure OLLAMA_MODEL. "
                        "Exemple: `ollama pull llama3.2:1b` puis `export OLLAMA_MODEL=llama3.2:1b`."
                    )
                }
        except Exception as exc:
            return {"reply": f"Ollama indisponible. Verifie que le serveur tourne et que le modele `{OLLAMA_MODEL}` est installe. Detail: {exc}"}
    return {"reply": "Tu peux commencer tout de suite par 5 minutes sur la tache la plus simple. Je te guide ensuite."}


@app.post("/admin/reset-site", tags=["Admin"])
def reset_site():
    with get_conn() as conn:
        conn.execute("DELETE FROM users")
        conn.commit()
    return {"message": "Toutes les donnees ont ete reinitialisees"}