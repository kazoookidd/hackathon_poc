#!/bin/bash

echo "🚀 Vérification et installation d'Ollama..."

# 1. Installation d'Ollama via le script officiel
if ! command -v ollama &> /dev/null; then
    echo "📦 Ollama n'est pas trouvé. Installation en cours..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "✅ Ollama est déjà installé."
fi

# 2. S'assurer que le service tourne (systèmes basés sur systemd)
echo "⚙️  Démarrage du service Ollama..."
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama

# 3. Petite pause pour laisser le serveur s'initialiser
sleep 2

# 4. Vérification de la disponibilité sur le port 11434
if curl -s localhost:11434 > /dev/null; then
    echo "🌐 Le serveur Ollama répond bien sur http://localhost:11434"
else
    echo "❌ Erreur : Le serveur ne répond toujours pas. Tentative de lancement manuel..."
    ollama serve > /dev/null 2>&1 &
    sleep 5
fi

# 5. Téléchargement d'un modèle léger (RAM friendly)
echo "🦙 Récupération du modèle llama3.2:1b (plus léger pour petites machines)..."
ollama pull llama3.2:1b

echo "✨ Terminé ! Tu peux relancer ton application."