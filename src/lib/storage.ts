// Piccole preferenze e statistiche salvate sul telefono (localStorage).
// Quando arriveranno gli account, le statistiche passeranno nel database.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // modalità privata o spazio pieno: pazienza
  }
}
