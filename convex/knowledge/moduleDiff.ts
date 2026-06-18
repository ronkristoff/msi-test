export interface ModuleFingerprintInput {
  name: string;
  description?: string | null;
  files?: string[];
  apis?: unknown;
  data_models?: unknown;
  user_flows?: unknown;
  dependencies?: string[];
}

export interface ModuleFingerprint {
  name: string;
  fingerprint: string;
}

export interface ModuleDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export function computeModuleFingerprint(module: ModuleFingerprintInput): string {
  const serialized = [
    module.name,
    module.description ?? "",
    (module.files ?? []).join(","),
    JSON.stringify(module.apis ?? null),
    JSON.stringify(module.data_models ?? null),
    JSON.stringify(module.user_flows ?? null),
    (module.dependencies ?? []).join(","),
  ].join("|");
  return fnv1aHex(serialized);
}

export function diffModuleSnapshots(
  prev: ModuleFingerprint[],
  next: ModuleFingerprint[],
): ModuleDiff {
  const prevMap = new Map<string, { fingerprint: string; name: string }>();
  for (const p of prev) {
    prevMap.set(p.name.trim().toLowerCase(), { fingerprint: p.fingerprint, name: p.name });
  }
  const nextMap = new Map<string, { fingerprint: string; name: string }>();
  for (const n of next) {
    nextMap.set(n.name.trim().toLowerCase(), { fingerprint: n.fingerprint, name: n.name });
  }

  const added: string[] = [];
  const changed: string[] = [];
  for (const [key, entry] of nextMap) {
    const prevEntry = prevMap.get(key);
    if (prevEntry === undefined) {
      added.push(entry.name);
    } else if (prevEntry.fingerprint !== entry.fingerprint) {
      changed.push(entry.name);
    }
  }

  const removed: string[] = [];
  for (const [key, entry] of prevMap) {
    if (!nextMap.has(key)) removed.push(entry.name);
  }

  return { added, removed, changed };
}
