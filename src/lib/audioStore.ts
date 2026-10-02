const DB_NAME = 'hakka-field-assistant-audio';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

type AudioEntry = {
  id: string;
  blob: Blob;
  createdAt: string;
};

const isIndexedDbSupported = (): boolean => typeof indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('当前浏览器不支持 IndexedDB。'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败。'));
  });

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> => {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB 事务失败。'));
    };

    callback(store, resolve, reject);
  });
};

export const saveRecordingAudio = async (id: string, blob: Blob) =>
  runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({ id, blob, createdAt: new Date().toISOString() } as AudioEntry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('写入音频失败。'));
  });

export const getRecordingAudio = async (id: string): Promise<Blob | null> =>
  runTransaction<Blob | null>('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result as AudioEntry | undefined;
      resolve(result?.blob ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('读取音频失败。'));
  });

export const deleteRecordingAudio = async (id: string) =>
  runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('删除音频失败。'));
  });

export const clearRecordingAudios = async () =>
  runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('清空音频失败。'));
  });
