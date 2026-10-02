import { useState } from "react";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    const searchQuery = query.trim();
    if (!searchQuery || loading) return;

    setLoading(true);
    setError("");
    setSources([]);

    try {
      const response = await fetch("http://localhost:5001/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The search request failed.");
      }

      setSources(data.sources || []);
    } catch (error) {
      console.error(error);
      setError(error.message || "Could not connect to the VeriScope backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <p className="eyebrow">EVIDENCE-GROUNDED RESEARCH</p>
        <h1>VeriScope</h1>
        <p className="subtitle">Search the web. Inspect the sources.</p>
      </header>

      <main className="app-main">
        <form
          className="search-container"
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
        >
          <label className="visually-hidden" htmlFor="research-query">
            Research query
          </label>
          <input
            id="research-query"
            type="search"
            placeholder="What do you want to research?"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? "Searching..." : "Research"}
          </button>
        </form>

        {error && <p className="status status-error" role="alert">{error}</p>}
        {loading && <p className="status" role="status">Searching and reading source pages...</p>}

        {!loading && !error && sources.length > 0 && (
          <section className="sources" aria-labelledby="sources-heading">
            <div className="sources-heading">
              <h2 id="sources-heading">Sources</h2>
              <span>{sources.length} found</span>
            </div>
            <div className="source-list">
              {sources.map((source, index) => (
                <details className="source-card" key={source.url}>
                  <summary>
                    <span className="source-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="source-title">{source.title || source.url}</span>
                    <span className="expand-hint">Open source</span>
                  </summary>
                  <div className="source-content">
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.url}
                    </a>
                    <p>{source.content || "No readable page text was available for this site."}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {!loading && !error && sources.length === 0 && (
          <p className="empty-state">Your search results will appear here.</p>
        )}
      </main>
    </div>
  );
}

export default App;