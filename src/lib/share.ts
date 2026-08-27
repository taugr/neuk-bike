import { copyTextToClipboard } from '@/lib/clipboard';

export type ShareParkingLinkResult =
  | 'cancelled'
  | 'copied'
  | 'failed'
  | 'shared';

type ShareNavigator = {
  canShare?: (data: ShareData) => boolean;
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

export function isShareCancellation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export type ShareRouteFileResult =
  | 'cancelled'
  | 'downloaded'
  | 'failed'
  | 'shared';

export async function shareRouteFile(
  file: File,
  title: string,
  options: {
    download?: (file: File) => void;
    navigator?: ShareNavigator | null;
  } = {},
): Promise<ShareRouteFileResult> {
  const shareNavigator =
    options.navigator === undefined
      ? typeof navigator === 'undefined'
        ? null
        : navigator
      : options.navigator;
  const data: ShareData = { files: [file], title };

  if (
    typeof shareNavigator?.share === 'function' &&
    (typeof shareNavigator.canShare !== 'function' ||
      shareNavigator.canShare(data))
  ) {
    try {
      await shareNavigator.share(data);
      return 'shared';
    } catch (error) {
      if (isShareCancellation(error)) {
        return 'cancelled';
      }
    }
  }

  try {
    options.download?.(file);
    return options.download ? 'downloaded' : 'failed';
  } catch {
    return 'failed';
  }
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
