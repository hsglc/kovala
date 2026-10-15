const PID_KEY = "evade:pid";
const NAME_KEY = "evade:name";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

let memoryPid: string | null = null;

/** Tarayıcıya özel kalıcı oyuncu kimliği; yeniden bağlanınca aynı yere oturmak için. */
export function getPid(): string {
  let pid = safeGet(PID_KEY);
  if (!pid || !/^[a-zA-Z0-9_-]{8,40}$/.test(pid)) {
    pid = memoryPid ?? randomId();
    memoryPid = pid;
    safeSet(PID_KEY, pid);
  }
  return pid;
}

export function getName(): string {
  return safeGet(NAME_KEY) ?? "";
}

export function setName(name: string) {
  safeSet(NAME_KEY, name.trim().slice(0, 16));
}
