import { describe, expect, it } from 'vitest';
import {
  formatVoiceDuration,
  whatsappMediaUrl,
  whatsappMessageIdOf,
  whatsappPreviewText,
} from './whatsapp';

describe('whatsappMessageIdOf', () => {
  it('strips the inbox namespace to the numeric id the routes take', () => {
    expect(whatsappMessageIdOf('wa:42')).toBe(42);
  });
});

describe('whatsappPreviewText', () => {
  it('labels a message with no text, and prefers the text when there is one', () => {
    expect(whatsappPreviewText({ type: 'audio', body: null, isVoice: true })).toBe('Voice message');
    expect(whatsappPreviewText({ type: 'audio', body: null, isVoice: false })).toBe('Audio');
    expect(whatsappPreviewText({ type: 'image', body: 'receipt', isVoice: false })).toBe('receipt');
  });
});

describe('formatVoiceDuration', () => {
  it('formats m:ss and blanks an unknown length', () => {
    expect(formatVoiceDuration(75)).toBe('1:15');
    expect(formatVoiceDuration(null)).toBe('');
  });
});

describe('whatsappMediaUrl', () => {
  it('asks for the mp3 for playback and encodes the token', () => {
    const url = whatsappMediaUrl('a b', 9, { playback: true });
    expect(url).toBe('/api/whatsapp/media/9?token=a+b&variant=playback');
  });
});
