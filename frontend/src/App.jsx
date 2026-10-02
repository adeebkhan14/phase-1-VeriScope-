import { useState } from "react";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;

    setLoading(true);

    try {
      const response = await fetch("http://localhost:5001/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      setSources(data.sources);
    } catch (error) {
      console.error(error);
    }

    setLoading(false);
  }

  return (
    <div className="app">
      <h1>VeriScope</h1>

      <p>Local-First Evidence-Grounded Deep Research</p>

      <div className="search-container">
        <input
          type="text"
          placeholder="What do you want to research?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              search();
            }
          }}
        />

        <button onClick={search} disabled={loading}>
          {loading ? "Researching..." : "Research"}
        </button>
      </div>

      <h2>Sources</h2>

      {sources.map((source, index) => (
        <div className="source-card" key={index}>
          <h3>
            {index + 1}. {source.title}
          </h3>

          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            {source.url}
          </a>

          <p>{source.content}</p>
        </div>
      ))}
    </div>
  );
}

export default App;