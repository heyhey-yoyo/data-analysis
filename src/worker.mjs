import { exactTwoSamplePermutation, fixedMarginExact } from './core.mjs';

self.addEventListener('message', (event) => {
  const { id, task, payload } = event.data || {};
  try {
    let result;
    if (task === 'two-sample-permutation') {
      result = exactTwoSamplePermutation(payload.valuesA, payload.valuesB, payload.options);
    } else if (task === 'fixed-margin-exact') {
      result = fixedMarginExact(payload.counts, payload.options);
    } else {
      throw new Error(`未知任务：${task}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
