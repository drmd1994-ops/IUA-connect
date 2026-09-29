import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SecretHasher, randomToken } from '../../infra/crypto/secrets';

export interface DeviceResult {
  deviceId: string;
  /** Set when a new device cookie must be sent to the browser. */
  newCookieToken: string | null;
  /** First sign-in from this device, and the user has signed in from other devices before. */
  isNewForUser: boolean;
}

/** Short, human-readable device description for emails and the sessions list ("Chrome on Windows"). */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'an unknown system';
  return `${browser} on ${os}`;
}

/**
 * Recognizes browsers by a random device cookie (only its hash is stored), so a sign-in from an
 * unfamiliar device can trigger a notification email.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: SecretHasher,
  ) {}

  async identify(
    userId: string,
    cookieToken: string | undefined,
    userAgent: string | null,
  ): Promise<DeviceResult> {
    const now = new Date();
    if (cookieToken) {
      const device = await this.prisma.device.findUnique({
        where: { tokenHash: this.hasher.hash(cookieToken) },
      });
      if (device && device.userId === userId) {
        await this.prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: now, userAgent },
        });
        return { deviceId: device.id, newCookieToken: null, isNewForUser: false };
      }
    }
    const knownDevices = await this.prisma.device.count({ where: { userId } });
    const token = randomToken();
    const device = await this.prisma.device.create({
      data: { id: uuidv7(), userId, tokenHash: this.hasher.hash(token), userAgent },
    });
    return { deviceId: device.id, newCookieToken: token, isNewForUser: knownDevices > 0 };
  }

  /** The device ID behind a device cookie, if it belongs to this user. */
  async findForUser(userId: string, cookieToken: string | undefined): Promise<string | null> {
    if (!cookieToken) return null;
    const device = await this.prisma.device.findUnique({
      where: { tokenHash: this.hasher.hash(cookieToken) },
      select: { id: true, userId: true },
    });
    return device?.userId === userId ? device.id : null;
  }
}
