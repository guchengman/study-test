/**
 * 本地存储数据库 - 纯 localStorage 实现
 * 所有数据存储在 localStorage，键名前缀统一为 python_test_
 */

// ─── 类型定义 ───────────────────────────────────────────────

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export interface FirestoreErrorInfo {
  error: string;
  operationType: keyof typeof OperationType;
  path: string | null;
  authInfo: { userId: string | undefined; email: string | null | undefined }
}

export function handleFirestoreError(error: unknown, operationType: keyof typeof OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: 'local_user', email: 'local@localhost' },
    operationType,
    path,
  };
  console.error('LocalDB Error:', JSON.stringify(errInfo));
}

// ─── 存储键名 ───────────────────────────────────────────────

const PREFIX = 'python_test_';
const UID = 'local_user';

function storageKey(path: string): string {
  // e.g. users/uid/customQuestions -> python_test_user_uid_customQuestions
  return PREFIX + path.replace(/\//g, '_');
}

// ─── 文档 API ───────────────────────────────────────────────

export const auth = {
  currentUser: { uid: UID, email: 'local@localhost', displayName: '本地用户', photoURL: null } as any,
};

export function serverTimestamp() {
  return Date.now();
}

export function increment(n: number) {
  return n; // 简化：直接返回增量值，写入时做加法
}

/** 读单个文档 */
export async function getDoc(ref: { path: string }): Promise<{ exists: () => boolean; data: () => any }> {
  try {
    const raw = localStorage.getItem(storageKey(ref.path));
    if (!raw) return { exists: () => false, data: () => undefined };
    return { exists: () => true, data: () => JSON.parse(raw) };
  } catch (e) {
    console.warn('LocalDB: 读取文档失败', ref.path, e);
    return { exists: () => false, data: () => undefined };
  }
}

/** 写单个文档（合并） */
export async function setDoc(
  ref: { path: string },
  data: any,
  _options?: { merge?: boolean }
): Promise<void> {
  try {
    const key = storageKey(ref.path);
    const existing = localStorage.getItem(key);
    let merged = data;
    if (_options?.merge && existing) {
      merged = { ...JSON.parse(existing), ...data };
    }
    localStorage.setItem(key, JSON.stringify(merged));
    // 触发存储事件，通知 onSnapshot 监听器
    localStorage.setItem('__db_event__', JSON.stringify({ path: ref.path, ts: Date.now() }));
  } catch (e) {
    handleFirestoreError(e, 'WRITE' as any, ref.path);
  }
}

/** 增量更新指定字段 */
export async function updateDoc(
  ref: { path: string },
  data: Record<string, any>
): Promise<void> {
  try {
    const key = storageKey(ref.path);
    const existing = localStorage.getItem(key);
    const current = existing ? JSON.parse(existing) : {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'number' && k in current) {
        current[k] = (current[k] || 0) + v;
      } else {
        current[k] = v;
      }
    }
    localStorage.setItem(key, JSON.stringify(current));
    localStorage.setItem('__db_event__', JSON.stringify({ path: ref.path, ts: Date.now() }));
  } catch (e) {
    handleFirestoreError(e, 'UPDATE' as any, ref.path);
  }
}

/** 删除文档 */
export async function deleteDoc(ref: { path: string }): Promise<void> {
  try {
    localStorage.removeItem(storageKey(ref.path));
    localStorage.setItem('__db_event__', JSON.stringify({ path: ref.path, ts: Date.now() }));
  } catch (e) {
    handleFirestoreError(e, 'DELETE' as any, ref.path);
  }
}

/** 集合引用 */
export function collection(_db: any, ...parts: string[]): { path: string } {
  return { path: parts.join('/') };
}

/** 文档引用 */
export function doc(_db: any, ...parts: string[]): { path: string } {
  return { path: parts.join('/') };
}

/** 实时监听（基于 localStorage 事件驱动） */
export function onSnapshot<T = any>(
  ref: { path: string },
  callback: (snap: { docs: { id: string; data: () => T }[]; exists: () => boolean }) => void,
  _errorCallback?: (err: any) => void
): () => void {
  // 从 localStorage 初始化加载
  const key = storageKey(ref.path);
  const raw = localStorage.getItem(key);
  let lastData: any;

  try {
    lastData = raw ? JSON.parse(raw) : undefined;
  } catch (e) {
    console.warn('LocalDB: 解析文档数据失败', e);
    lastData = undefined;
  }

  const snap = {
    docs: lastData
      ? [{ id: ref.path.split('/').pop() || '', data: () => lastData }]
      : [],
    exists: () => !!lastData,
  };
  callback(snap);

  // 监听存储变化事件（跨标签页同步）
  const handler = (e: StorageEvent) => {
    if (e.key === '__db_event__') {
      try {
        const evt = JSON.parse(e.newValue || '{}');
        // 匹配当前路径或子路径
        if (evt.path === ref.path || ref.path.startsWith(evt.path)) {
          const updated = localStorage.getItem(key);
          const newData = updated ? JSON.parse(updated) : undefined;
          const newSnap = {
            docs: newData
              ? [{ id: ref.path.split('/').pop() || '', data: () => newData }]
              : [],
            exists: () => !!newData,
          };
          callback(newSnap);
        }
      } catch (e) {
        console.warn('LocalDB: 处理存储事件失败', e);
      }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// ─── 批量写入（简化实现） ───────────────────────────────────
export async function writeBatch(ops: Array<{ type: 'set' | 'delete'; ref: { path: string }; data?: any }>): Promise<void> {
  for (const op of ops) {
    if (op.type === 'set') {
      await setDoc(op.ref, op.data, { merge: true });
    } else {
      await deleteDoc(op.ref);
    }
  }
}

