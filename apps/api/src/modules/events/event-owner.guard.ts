import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { mayActOn } from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For the staff routes under one event (`/admin/events/:eventId/...`: its sessions, who
 * registered, attendance). An event is an organisation's or the platform's own (M16), and
 * `events.manage` is used where it is held: an event of an owner the caller does not work for
 * answers "not found", the same as one that does not exist.
 */
@Injectable()
export class EventOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithPrincipal & { params: Record<string, string | undefined> }>();
    const principal = principalOf(request);
    const eventId = request.params.eventId ?? '';
    // Not an id at all: the route's own check of the parameter answers that.
    if (!UUID.test(eventId)) return true;
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organisationId: true },
    });
    if (!event || !mayActOn(principal, 'events.manage', event.organisationId)) {
      throw new AppException('NOT_FOUND');
    }
    return true;
  }
}
