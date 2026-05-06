# hackathon_poc
Hackathon avec Abdoulatif et Marc-Antoine SADIO

# 🚀 Hackathon POC — Backend IA

Backend FastAPI avec support **Ollama (local)** et **OpenAI (fallback)** pour générer des plans et scorer des idées.

---

## 📦 Prérequis

- Python 3.10+
- [Ollama](https://ollama.com) installé localement

---

## 🧠 Installation Ollama

### 1. Télécharger le modèle

```bash
ollama pull llama3
```

### 2. Lancer Ollama

```bash
ollama serve
```

> 👉 API disponible sur : `http://localhost:11434`

---

## ⚙️ Configuration

Créer un fichier `.env` à la racine du projet :

```env
USE_OLLAMA=true
OLLAMA_MODEL=llama3
OPENAI_API_KEY=
```

---

## 🐍 Installation des dépendances Python

```bash
pip install -r requirements.txt
```

---

## ▶️ Lancer le backend

```bash
uvicorn app:app --reload
```

> Le serveur démarre sur `http://localhost:8000`

---

## 📡 Endpoints

### Générer un plan

```
POST /generate-plan
```

**Body (JSON) :**
```json
{
  "idea": "Une app de covoiturage pour les randonneurs"
}
```

**Réponse :**
```json
{
  "plan": "..."
}
```

---

### Score

```
POST /score
```

**Body (JSON) :**
```json
{
  "idea": "Une app de covoiturage pour les randonneurs"
}
```

**Réponse :**
```json
{
  "score": 8,
  "feedback": "..."
}
```

---

## 🤖 OpenAI (optionnel)

Si tu veux utiliser OpenAI à la place d'Ollama :

1. Crée une clé API : 👉 https://platform.openai.com/api-keys
2. Mets à jour ton `.env` :

```env
OPENAI_API_KEY=ta_cle_ici
USE_OLLAMA=false
```

---

## 🗂️ Structure du projet

```
back-end/
├── app.py              # Point d'entrée FastAPI
├── main.py             # (dev / tests)
├── requirements.txt
├── .env                # Variables d'environnement (ne pas commiter !)
└── __pycache__/
```

---

## 🧠 Conseils hackathon

| Mode | Avantage |
|------|----------|
| 🦙 **Ollama (local)** | 100% offline, zéro coût, effet waouh en démo |
| 🌐 **OpenAI** | Qualité maximale, sécurité si Ollama plante |

> 💡 **Stratégie recommandée :** démo principale avec Ollama, OpenAI en fallback si besoin.

---

## ⚠️ Troubleshooting

**`Attribute "app" not found in module "main"`**
```bash
rm -rf __pycache__
python -m uvicorn app:app --reload
```

**Ollama ne répond pas**
```bash
ollama serve  # relancer le serveur
ollama list   # vérifier que llama3 est bien installé
```

---

## 📄 Licence

Projet hackathon — libre d'utilisation.
