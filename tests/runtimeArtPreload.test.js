import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetRuntimeArtPreloadCacheForTests,
  areRuntimeArtUrlsSettled,
  getPendingRuntimeArtUrls,
  preloadRuntimeArtUrls,
} from "../src/data/runtimeArtPreload.js";

test("runtime art preloader deduplicates urls and settles loaded art", async () => {
  __resetRuntimeArtPreloadCacheForTests();
  const originalImage = global.Image;
  const requestedUrls = [];
  let decodeCount = 0;

  class MockImage {
    constructor() {
      this.complete = false;
      this.naturalWidth = 0;
    }

    set src(value) {
      requestedUrls.push(value);
      this.complete = true;
      this.naturalWidth = 64;
      queueMicrotask(() => {
        this.onload?.();
      });
    }

    decode() {
      decodeCount += 1;
      return Promise.resolve();
    }
  }

  global.Image = MockImage;

  try {
    const urls = ["card-a.png", "card-a.png", "enemy-b.png"];

    assert.equal(areRuntimeArtUrlsSettled(urls), false);
    assert.deepEqual(getPendingRuntimeArtUrls(urls), ["card-a.png", "enemy-b.png"]);

    await preloadRuntimeArtUrls(urls, { timeoutMs: 50 });

    assert.deepEqual(requestedUrls, ["card-a.png", "enemy-b.png"]);
    assert.equal(decodeCount, 2);
    assert.equal(areRuntimeArtUrlsSettled(urls), true);
    assert.deepEqual(getPendingRuntimeArtUrls(urls), []);
  } finally {
    global.Image = originalImage;
    __resetRuntimeArtPreloadCacheForTests();
  }
});
