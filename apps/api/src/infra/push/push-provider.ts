import { Injectable } from '@nestjs/common';
import { type Locale } from '@medconnect/i18n';

/**
 * One notice for one person's devices. It carries the notice's type and values, as the notice
 * in the app does, so the provider words it in the person's language.
 */
export interface PushMessage {
  userId: string;
  locale: Locale;
  /** The notice's type (the email template's name). */
  type: string;
  params: Record<string, string | number>;
  /** A path inside the site, never another host. */
  link: string | null;
}

/**
 * Notifications on a person's phone or browser (ARCHITECTURE.md §5). Demo and default:
 * DisabledPushProvider, selected with PUSH_PROVIDER. Later: Expo Push, FCM or APNs, together
 * with the mobile app and a list of each person's devices.
 */
export abstract class PushProvider {
  /** Whether push exists at all; callers skip the work when it doesn't. */
  abstract readonly enabled: boolean;
  /** Delivers the notice and answers how many devices it reached. */
  abstract send(message: PushMessage): Promise<number>;
}

/** No push: nothing is sent and no device is reached. */
@Injectable()
export class DisabledPushProvider extends PushProvider {
  readonly enabled = false;

  async send(): Promise<number> {
    return 0;
  }
}
