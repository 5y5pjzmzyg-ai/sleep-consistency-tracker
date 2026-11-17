import { initial } from './model.mjs';

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('sleep-consistency', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('store');
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
});
export async function read() {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction('store').objectStore('store').get('state');
    request.onsuccess = () => resolve(request.result ?? initial());
    request.onerror = () => reject(request.error);
  });
}
export async function update(change) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    const request = store.get('state');
    let result;
    let error;
    request.onsuccess = () => {
      try {
        result = change(request.result ?? initial());
        store.put(result, 'state');
      } catch (cause) {
        error = cause;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(error ?? tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
