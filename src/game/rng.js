export class RNG {
  constructor(seed) {
    this.seed = (seed >>> 0) || 1;
  }
  nextUint() {
    // xorshift32
    let x = this.seed >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17) >>> 0;
    x ^= (x << 5) >>> 0;
    this.seed = x >>> 0;
    return this.seed;
  }
  next() {
    return (this.nextUint() / 0xFFFFFFFF);
  }
  int(n) {
    if (n <= 0) return 0;
    return (this.nextUint() % n) >>> 0;
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
}
