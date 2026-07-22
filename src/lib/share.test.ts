import { describe, expect, it, vi } from 'vitest';
import { shareParkingLink } from '@/lib/share';

const shareData = {
  title: 'Picardy Place cycle parking',
  url: 'https://neuk.bike/?parking=cec%3A717',
};

describe('shareParkingLink', () => {
  it('opens the native share chooser when it is available', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    const copyText = vi.fn(async () => true);

    await expect(
      shareParkingLink(shareData, {
        copyText,
        navigator: { share },
      }),
    ).resolves.toBe('shared');

    expect(share).toHaveBeenCalledWith(shareData);
    expect(copyText).not.toHaveBeenCalled();
  });

  it('copies the link when native sharing is unavailable', async () => {
    const copyText = vi.fn(async () => true);

    await expect(
      shareParkingLink(shareData, { copyText, navigator: null }),
    ).resolves.toBe('copied');

    expect(copyText).toHaveBeenCalledWith(shareData.url);
  });

  it('treats dismissing the native share chooser as cancellation', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Share cancelled', 'AbortError');
    });
    const copyText = vi.fn(async () => true);

    await expect(
      shareParkingLink(shareData, {
        copyText,
        navigator: { share },
      }),
    ).resolves.toBe('cancelled');

    expect(copyText).not.toHaveBeenCalled();
  });

  it('copies the link when native sharing fails', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Share unavailable', 'DataError');
    });
    const copyText = vi.fn(async () => true);

    await expect(
      shareParkingLink(shareData, {
        copyText,
        navigator: { share },
      }),
    ).resolves.toBe('copied');

    expect(copyText).toHaveBeenCalledWith(shareData.url);
  });

  it('reports failure when neither sharing strategy works', async () => {
    const copyText = vi.fn(async () => false);

    await expect(
      shareParkingLink(shareData, { copyText, navigator: null }),
    ).resolves.toBe('failed');
  });
});
