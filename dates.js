// Pure date helpers, moved unchanged from the UTILS block in osmica.html
// (ticket 02 of the roster module). Kept in their own ES module so both the
// app and the roster module — and the test runner — can import them without
// loading the application. No behaviour change: these are the same functions,
// verbatim, now exported.

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function todayDate() { return new Date(); }
export function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day===0?-6:1-day));
  dt.setHours(0,0,0,0);
  return dt;
}
export function addDays(d, n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
export function formatDate(iso) { const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; }
export function dayOfWeek(iso) { const d=new Date(iso+'T12:00:00'); const day=d.getDay(); return day===0?6:day-1; }
