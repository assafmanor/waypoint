import { describe, expect, it } from 'vitest';
import { createByteLru } from './byte-lru';

describe('createByteLru', () => {
  it('evicts the least recently read entries until it fits the byte budget', () => {
    const lru = createByteLru(() => 5);
    lru.put('old', Buffer.from('123'));
    lru.put('hot', Buffer.from('45'));
    expect(lru.get('old')).toEqual(Buffer.from('123'));

    lru.put('new', Buffer.from('67'));

    expect(lru.get('hot')).toBeNull();
    expect(lru.get('old')).toEqual(Buffer.from('123'));
    expect(lru.get('new')).toEqual(Buffer.from('67'));
    expect(lru.bytes).toBe(5);
  });

  it('does not evict useful entries for one value larger than the whole budget', () => {
    const lru = createByteLru(() => 3);
    lru.put('kept', Buffer.from('123'));

    lru.put('too-large', Buffer.from('1234'));

    expect(lru.get('kept')).toEqual(Buffer.from('123'));
    expect(lru.get('too-large')).toBeNull();
  });
});
