#!/bin/bash

echo "🚀 Installation du projet Procast..."

# Créer le venv s'il n'existe pas
if [ ! -d "procast" ]; then
    echo "📦 Création du venv procast..."
    python3 -m venv procast
else
    echo "✅ Venv procast déjà existant"
fi

# Activer le venv
source procast/bin/activate

# Upgrade pip
echo "⬆️  Mise à jour de pip..."
pip install --upgrade pip --quiet

# Installer les dépendances
echo "📥 Installation des dépendances..."
pip install -r requirements.txt

# Créer le .env s'il n'existe pas
if [ ! -f ".env" ]; then
    echo "⚙️  Création du fichier .env..."
    cat > .env << 'EOF'
USE_OLLAMA=true
OLLAMA_MODEL=llama3
OPENAI_API_KEY=
EOF
    echo "✅ .env créé — pense à le remplir si besoin"
else
    echo "✅ .env déjà existant"
fi

echo ""
echo "✅ Installation terminée !"
echo "👉 Lance le projet avec : ./start.sh"