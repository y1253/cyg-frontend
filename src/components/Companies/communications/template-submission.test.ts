import { describe, expect, it } from 'vitest';
import { templateSubmissionChrome } from './template-submission';
import { isSettledTemplateStatus } from '@/api/whatsapp';

const ALL = [
  'PENDING', 'APPROVED', 'REJECTED', 'PAUSED',
  'DISABLED', 'IN_APPEAL', 'PENDING_DELETION',
];

describe('templateSubmissionChrome', () => {
  it('gives every status Meta reports a tone, an icon and words', () => {
    for (const status of ALL) {
      const chrome = templateSubmissionChrome(status);
      expect(chrome.label).toBeTruthy();
      expect(chrome.Icon).toBeTruthy();
    }
  });

  it('separates the three the user actually cares about', () => {
    expect(templateSubmissionChrome('PENDING').tone).toBe('amber');
    expect(templateSubmissionChrome('APPROVED').tone).toBe('teal');
    expect(templateSubmissionChrome('REJECTED').tone).toBe('destructive');
  });

  it('renders an UNKNOWN status as still waiting, never blank', () => {
    // Meta extends this vocabulary without asking. A blank row would tell somebody their
    // submission vanished, which is the exact fear this strip exists to remove.
    const chrome = templateSubmissionChrome('SOMETHING_META_ADDED');
    expect(chrome.label).toBe('waiting for Meta to review');
    expect(chrome.tone).toBe('amber');
  });
});

describe('isSettledTemplateStatus agrees with the server twin', () => {
  it('keeps polling only while Meta is deciding', () => {
    // ⚠️ Mirrors `isSettledTemplateStatus` in server whatsapp.util.ts. If the two
    // disagree, one side polls for ever and the other gives up before the verdict.
    expect(isSettledTemplateStatus('PENDING')).toBe(false);
    expect(isSettledTemplateStatus('IN_APPEAL')).toBe(false);
    for (const s of ['APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'PENDING_DELETION']) {
      expect(isSettledTemplateStatus(s)).toBe(true);
    }
  });
});
