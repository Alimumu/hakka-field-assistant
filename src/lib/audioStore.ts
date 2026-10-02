const DB_NAME = 'hakka-field-assistant-audio';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

type AudioRecord = {
  id: string;
  blob: Blob;
  createdAt: string;
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => Promise<T> | T): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    Promise.resolve(callback(store))
      .then((result) => {
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

export const saveAudioBlob = async (id: string, blob: Blob): Promise<void> => {
  await withStore('readwrite', (store) =>
    new Promise<void>((resolve, reject) => {
      const request = store.put({ id, blob, createdAt: new Date().toISOString() } satisfies AudioRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
  );
};

export const getAudioBlob = async (id: string): Promise<Blob | null> =>
  withStore('readonly', (store) =>
    new Promise<Blob | null>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const record = request.result as AudioRecord | undefined;
        resolve(record?.blob ?? null);
      };
      request.onerror = () => reject(request.error);
    }),
  );
