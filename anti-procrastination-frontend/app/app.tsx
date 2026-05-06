"use client";

import { useState } from "react";

type Task = {
  id: number;
  title: string;
  duration: number;
};

export default function Home() {
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const generatePlan = async () => {
    const res = await fetch("http://localhost:8000/generate-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ goal }),
    });

    const data = await res.json();
    setTasks(data.tasks);
    setCompleted([]);
    setScore(null);
  };

  const toggleTask = (id: number) => {
    if (completed.includes(id)) {
      setCompleted(completed.filter((t) => t !== id));
    } else {
      setCompleted([...completed, id]);
    }
  };

  const calculateScore = async () => {
    const res = await fetch("http://localhost:8000/score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        completed: completed.length,
        total: tasks.length,
      }),
    });

    const data = await res.json();
    setScore(data.score);
    setMessage(data.message);
  };

  const progress =
    tasks.length === 0 ? 0 : Math.round((completed.length / tasks.length) * 100);

  return (
    <main className="min-h-screen flex flex-col items-center p-6 bg-gray-100">
      <h1 className="text-3xl font-bold mb-6">
        Anti-Procrastination Coach 🚀
      </h1>

      {/* INPUT */}
      <div className="w-full max-w-xl bg-white p-4 rounded-2xl shadow">
        <textarea
          className="w-full p-2 border rounded"
          placeholder="Que veux-tu faire aujourd’hui ?"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <button
          onClick={generatePlan}
          className="mt-3 w-full bg-blue-500 text-white p-2 rounded"
        >
          Générer mon plan
        </button>
      </div>

      {/* TASK LIST */}
      {tasks.length > 0 && (
        <div className="w-full max-w-xl mt-6 bg-white p-4 rounded-2xl shadow">
          <h2 className="text-xl font-semibold mb-3">Ta journée :</h2>

          {tasks.map((task) => (
            <div key={task.id} className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={completed.includes(task.id)}
                onChange={() => toggleTask(task.id)}
                className="mr-2"
              />
              <span>
                {task.title} ({task.duration} min)
              </span>
            </div>
          ))}

          {/* PROGRESS */}
          <div className="mt-4">
            <div className="w-full bg-gray-200 h-3 rounded">
              <div
                className="bg-green-500 h-3 rounded"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm mt-1">{progress}% complété</p>
          </div>

          {/* SCORE */}
          <button
            onClick={calculateScore}
            className="mt-4 w-full bg-green-500 text-white p-2 rounded"
          >
            Voir mon score
          </button>

          {score !== null && (
            <div className="mt-4 text-center">
              <p className="text-2xl font-bold">{score}%</p>
              <p>{message}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}