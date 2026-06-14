import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/lib/clipboard';

function stubDocumentCopy(copied: boolean) {
  const textarea = {
    readOnly: false,
    remove: vi.fn(),
    select: vi.fn(),
    setAttribute: vi.fn(),
    setSelectionRange: vi.fn(),
    style: { cssText: '' },
    value: '',
  };

  const documentStub = {
    body: {
      appendChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => copied),
  };

  vi.stubGlobal('document', documentStub);
  return { documentStub, textarea };
}

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies with the synchronous selection fallback before using the Clipboard API', async () => {
    const { documentStub, textarea } = stubDocumentCopy(true);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://example.com')).resolves.toBe(
      true,
    );

    expect(documentStub.body.appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.value).toBe('https://example.com');
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(
      0,
      'https://example.com'.length,
    );
    expect(documentStub.execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the async Clipboard API when selection copy fails', async () => {
    stubDocumentCopy(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://example.com')).resolves.toBe(
      true,
    );

    expect(writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('returns false when no copy strategy works', async () => {
    stubDocumentCopy(false);
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://example.com')).resolves.toBe(
      false,
    );
  });
});
