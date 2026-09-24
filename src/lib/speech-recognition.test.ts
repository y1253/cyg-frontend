import { describe, expect, it } from 'vitest';
import { appendSegment, joinResults } from './speech-recognition';

/** The shape `SpeechRecognition` hands back: indexable results, each with alternatives. */
function result(transcript: string, isFinal = true) {
  return { 0: { transcript }, length: 1, isFinal };
}

describe('appendSegment', () => {
  it('space-joins without a leading or doubled space', () => {
    expect(appendSegment('', 'hello')).toBe('hello');
    expect(appendSegment('hello', '')).toBe('hello');
    expect(appendSegment('hello', 'there')).toBe('hello there');
    expect(appendSegment('hello ', '  there ')).toBe('hello there');
  });

  it('is empty only when both sides are', () => {
    expect(appendSegment('', '')).toBe('');
    expect(appendSegment('  ', '\n')).toBe('');
  });
});

describe('joinResults', () => {
  it('flattens finalised segments and the interim tail into one line', () => {
    expect(
      joinResults([result('hi'), result('what is'), result('doing', false)]),
    ).toBe('hi what is doing');
  });

  it('is empty for an empty list', () => {
    expect(joinResults([])).toBe('');
  });

  /**
   * A result with no alternative is skipped rather than rendering "undefined" into the
   * preview strip the user is reading.
   */
  it('skips a result carrying no alternative', () => {
    expect(
      joinResults([
        result('hi'),
        { length: 0, isFinal: false },
        result('there'),
      ]),
    ).toBe('hi there');
  });

  it('does not double the spaces the engine already pads with', () => {
    expect(joinResults([result(' hi '), result(' there ')])).toBe('hi there');
  });
});
