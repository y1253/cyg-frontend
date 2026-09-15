import { describe, expect, it } from 'vitest';
import {
  formatClock,
  micErrorMessage,
  pickRecorderMime,
  recordingFilename,
} from './voice-recording';

describe('pickRecorderMime', () => {
  it('takes the first container the browser supports', () => {
    expect(pickRecorderMime(() => true)).toBe('audio/ogg;codecs=opus');
    // Chrome
    expect(pickRecorderMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    // Safari
    expect(pickRecorderMime((t) => t === 'audio/mp4')).toBe('audio/mp4');
  });

  it('returns null to let the browser choose when nothing matches', () => {
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(pickRecorderMime(null)).toBeNull();
  });
});

describe('recordingFilename', () => {
  it('matches the extension to the recorded container', () => {
    expect(recordingFilename('audio/webm;codecs=opus')).toBe('voice-message.webm');
    expect(recordingFilename('audio/ogg; codecs=opus')).toBe('voice-message.ogg');
    expect(recordingFilename('audio/mp4')).toBe('voice-message.m4a');
    expect(recordingFilename('')).toBe('voice-message.webm');
  });
});

describe('formatClock', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(300)).toBe('5:00');
    expect(formatClock(-4)).toBe('0:00');
  });
});

describe('micErrorMessage', () => {
  it('explains a blocked or missing microphone', () => {
    expect(micErrorMessage({ name: 'NotAllowedError' })).toMatch(/blocked/);
    expect(micErrorMessage({ name: 'NotFoundError' })).toMatch(/No microphone/);
    expect(micErrorMessage(new Error('boom'))).toBe('Could not start recording.');
  });
});
