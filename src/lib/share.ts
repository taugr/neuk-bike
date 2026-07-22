import { copyTextToClipboard } from '@/lib/clipboard';

export type ShareParkingLinkResult =
  | 'cancelled'
  | 'copied'
  | 'failed'
  | 'shared';

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
};

type ShareParkingLinkOptions = {
  copyText?: (text: string) => Promise<boolean>;
  navigator?: ShareNavigator | null;
};

type ParkingLinkShareData = {
  title: string;
  url: string;
};

function isShareCancellation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export async function shareParkingLink(
  data: ParkingLinkShareData,
  options: ShareParkingLinkOptions = {},
): Promise<ShareParkingLinkResult> {
  const shareNavigator =
    options.navigator === undefined
      ? typeof navigator === 'undefined'
        ? null
        : navigator
      : options.navigator;

  if (typeof shareNavigator?.share === 'function') {
    try {
      await shareNavigator.share(data);
      return 'shared';
    } catch (error) {
      if (isShareCancellation(error)) {
        return 'cancelled';
      }
    }
  }

  const copyText = options.copyText ?? copyTextToClipboard;
  return (await copyText(data.url)) ? 'copied' : 'failed';
}
