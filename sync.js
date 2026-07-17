// ============================================================
//  sync.js — coda di sincronizzazione verso GAS (pura, testabile).
//  FIFO con coalescing: per entità conta solo l'ultima versione
//  (chiave action:id); i patch di savePrefs si fondono. Su errore
//  la coda si ferma (ordine preservato) e riprova al prossimo
//  enqueue()/flush(). Lo stato {pending,error} esce via onState.
// ============================================================
(function (root) {
  "use strict";

  function keyOf(action, payload) {
    if (action === "savePrefs") return "savePrefs";
    return action + ":" + ((payload && payload.id) || "");
  }

  function createSyncQueue(opts) {
    const send = opts.send;                       // (action, payload) => Promise
    const onState = opts.onState || (() => {});
    const queue = new Map();                      // key -> {action, payload}; Map = ordine di inserimento
    let flushing = false;
    let error = null;

    function emit() {
      onState({ pending: queue.size, error: error ? { message: error.message || String(error) } : null });
    }

    function enqueue(action, payload) {
      const key = keyOf(action, payload);
      const prev = queue.get(key);
      if (action === "savePrefs" && prev) {
        queue.set(key, { action, payload: { ...prev.payload, ...payload } });
      } else {
        queue.set(key, { action, payload });
      }
      emit();
      flush();
    }

    async function flush() {
      if (flushing) return;
      flushing = true;
      try {
        while (queue.size) {
          const [key, entry] = queue.entries().next().value;
          try {
            await send(entry.action, entry.payload);
            // se nel frattempo è arrivata una versione più nuova, NON cancellarla
            if (queue.get(key) === entry) queue.delete(key);
            error = null;
          } catch (e) {
            error = e;
            break;                                // ordine preservato: si riproverà
          } finally {
            emit();
          }
        }
      } finally {
        flushing = false;
      }
    }

    return { enqueue, flush, get size() { return queue.size; } };
  }

  const SYNC = { createSyncQueue };
  if (typeof window !== "undefined") root.MB_SYNC = SYNC;
  if (typeof module !== "undefined") module.exports = SYNC;
})(typeof window !== "undefined" ? window : globalThis);
