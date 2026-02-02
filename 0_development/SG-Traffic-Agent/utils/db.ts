import { Camera } from '../types';

const DB_NAME = 'sg_traffic_agent_db';
const DB_VERSION = 1;
const STORES = {
  CAMERAS: 'cameras',
  METADATA: 'metadata'
};

export const DB = {
  open: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for Camera objects (key: camera_id)
        if (!db.objectStoreNames.contains(STORES.CAMERAS)) {
          db.createObjectStore(STORES.CAMERAS, { keyPath: 'id' });
        }
        
        // Store for generic metadata (key: string)
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    });
  },

  saveCameras: async (cameras: Camera[]): Promise<void> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CAMERAS], 'readwrite');
      const store = transaction.objectStore(STORES.CAMERAS);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      cameras.forEach(camera => {
        store.put(camera);
      });
    });
  },

  getCameras: async (): Promise<Camera[]> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CAMERAS], 'readonly');
      const store = transaction.objectStore(STORES.CAMERAS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  updateCamera: async (camera: Camera): Promise<void> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CAMERAS], 'readwrite');
      const store = transaction.objectStore(STORES.CAMERAS);
      const request = store.put(camera);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  clearAll: async (): Promise<void> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CAMERAS, STORES.METADATA], 'readwrite');
        transaction.objectStore(STORES.CAMERAS).clear();
        transaction.objectStore(STORES.METADATA).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
  }
};
