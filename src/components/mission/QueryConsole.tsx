import { Search } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { cannedQueries, parseQuery, queryChips } from '../../lib/queryParser';

export function QueryConsole() {
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const chips = queryChips(query);
  const result = parseQuery(query);

  return <div className="query-console">
    <div className="panel-title">NL Query</div>
    <label>
      <Search size={15} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
    </label>
    <div className="chips">
      {chips.map((chip) => <span key={chip}>{chip}</span>)}
    </div>
    <div className="suggestions">
      {cannedQueries.slice(0, 4).map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}
    </div>
    <div className="query-result">
      <h3>{result.label}</h3>
      <p>{result.summary}</p>
    </div>
  </div>;
}
