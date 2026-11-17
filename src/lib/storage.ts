import { emptyLedger, validateLedger, type Ledger } from './finance';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('fintrack', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('ledger');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Close other FinTrack tabs and try again.')); };
  });
}
export async function loadLedger(): Promise<Ledger> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('ledger').objectStore('ledger').get('current');
    request.onsuccess = () => { try { resolve(request.result ? validateLedger(request.result) : emptyLedger()); } catch (e) { reject(e); } };
    request.onerror = () => reject(request.error);
  });
}
export async function saveLedger(ledger: Ledger): Promise<void> {
  const validated = validateLedger(ledger);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ledger', 'readwrite');
    tx.objectStore('ledger').put(validated, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Save was interrupted.'));
  });
}

// A single read/write transaction serializes changes across tabs even without Web Locks.
export async function updateLedger(transform: (current: Ledger) => Ledger): Promise<Ledger> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ledger', 'readwrite');
    const store = tx.objectStore('ledger');
    let next: Ledger;
    let failure: unknown;
    const request = store.get('current');
    request.onsuccess = () => {
      try {
        const current = request.result ? validateLedger(request.result) : emptyLedger();
        next = validateLedger(transform(current));
        store.put(next, 'current');
      } catch (e) { failure = e; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('Could not save your changes.'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Save was interrupted. Existing data was kept.'));
  });
}
