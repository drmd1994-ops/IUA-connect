import { Injectable } from '@nestjs/common';
import { type RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { FilesService, view } from './files.service';

/**
 * A member's profile photo (M2 deferred it to M3). Replacing or removing it deletes the old file.
 * Who else may see it is the profile's PHOTO visibility; until the member directory (M7) only the
 * member (and staff) can read it.
 */
@Injectable()
export class ProfilePhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async set(
    userId: string,
    upload: { buffer: Buffer; originalname: string } | undefined,
    meta: RequestMeta,
  ) {
    const file = await this.files.upload(upload, 'PROFILE_PHOTO', userId, meta);
    const previous = await this.prisma.profile.findUnique({
      where: { userId },
      select: { photoFileId: true },
    });
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, photoFileId: file.id },
      update: { photoFileId: file.id },
    });
    await this.files.markAttached(file.id);
    if (previous?.photoFileId) await this.files.remove(previous.photoFileId);
    await this.record('profile.photo.set', userId, meta);
    const row = await this.prisma.storedFile.findUniqueOrThrow({ where: { id: file.id } });
    return { photo: view(row) };
  }

  async remove(userId: string, meta: RequestMeta): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { photoFileId: true },
    });
    if (!profile?.photoFileId) return;
    await this.prisma.profile.update({ where: { userId }, data: { photoFileId: null } });
    await this.files.remove(profile.photoFileId);
    await this.record('profile.photo.remove', userId, meta);
  }

  private record(action: string, userId: string, meta: RequestMeta) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'profile',
      entityId: userId,
    });
  }
}
