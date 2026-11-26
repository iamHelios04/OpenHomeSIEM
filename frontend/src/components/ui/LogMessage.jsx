// === filename: frontend/src/components/ui/LogMessage.jsx ===
import { useSiemStore } from '../../store.js';
import { useLocation } from 'wouter';

const tokenPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}\b|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b/gi;

function matchesQuery(text, query) {
  if (!query) return text;
  const parts = [];
  let offset = 0;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  while (offset < text.length) {
    const found = lower.indexOf(needle, offset);
    if (found < 0) { parts.push(text.slice(offset)); break; }
    if (found > offset) parts.push(text.slice(offset, found));
    parts.push(<mark key={`${found}-${query}`} className="search-highlight">{text.slice(found, found + query.length)}</mark>);
    offset = found + query.length;
  }
  return parts;
}

/** Render clickable IP/domain indicators without inserting raw HTML. */
export default function LogMessage({ text = '', highlight = '', className = '' }) {
  const [, setLocation] = useLocation();
  const queueLogFilter = useSiemStore((state) => state.queueLogFilter);
  const chunks = [];
  let last = 0;
  tokenPattern.lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[0];
    if (match.index > last) chunks.push(...[].concat(matchesQuery(text.slice(last, match.index), highlight)));
    const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(token);
    const isMac = /^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$/i.test(token);
    if (isMac) chunks.push(<button key={`${match.index}-${token}`} className="indicator-link mono" title={`Search for MAC ${token}`} onClick={(event) => { event.stopPropagation(); queueLogFilter({ field: 'search', value: token.toUpperCase().replaceAll('-', ':') }); setLocation('/explorer'); }}>{token.toUpperCase().replaceAll('-', ':')}</button>);
    else chunks.push(<button key={`${match.index}-${token}`} className={isIp ? 'indicator-link mono' : 'indicator-link domain-link mono'} title={`Filter by ${token}`} onClick={(event) => { event.stopPropagation(); queueLogFilter({ field: isIp ? 'source_ip' : 'domain', value: token.toLowerCase() }); setLocation('/explorer'); }}>{matchesQuery(token, highlight)}</button>);
    last = match.index + token.length;
  }
  if (last < text.length) chunks.push(...[].concat(matchesQuery(text.slice(last), highlight)));
  return <span className={className}>{chunks.length ? chunks : text}</span>;
}
