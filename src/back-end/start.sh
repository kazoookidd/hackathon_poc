#!/bin/bash

echo "▶️  Démarrage de Procast..."

# Vérifier que le venv existe
if [ ! -d "procast" ]; then
    echo "❌ Venv procast introuvable — lance d'abord : ./install.sh"
    exit 1
fi

# Activer le venv
source procast/bin/activate

# Vérifier que le .env existe
if [ ! -f ".env" ]; then
    echo "❌ Fichier .env manquant — lance d'abord : ./install.sh"
    exit 1
fi

# Vérifier qu'Ollama tourne si USE_OLLAMA=true
USE_OLLAMA=$(grep -E "^USE_OLLAMA=" .env | cut -d '=' -f2 | tr '[:upper:]' '[:lower:]')
if [ "$USE_OLLAMA" = "true" ]; then
    echo "🧠 Vérification d'Ollama..."
    if ! curl -s http://localhost:11434 > /dev/null 2>&1; then
        echo "⚠️  Ollama ne répond pas sur localhost:11434"
        echo "   Lance-le dans un autre terminal avec : ollama serve"
    else
        echo "✅ Ollama actif"
    fi
fi

# Supprimer le cache Python (évite les bugs de module)
echo "🧹 Nettoyage du cache Python..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

# Lancer le serveur
echo ""
echo "🌐 API disponible sur : http://localhost:8000"
echo "📖 Docs Swagger      : http://localhost:8000/docs"
echo ""
uvicorn app:app --reload