import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  Authenticated,
  Public,
  RequirePermission,
} from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FileDto } from '../files';
import {
  DocumentLinkDto,
  PlatformInviteDto,
  PlatformInvitationsDto,
  MedicalSchoolListDto,
  MyVerificationDto,
  ReviewVerificationDto,
  ReviewVerificationListDto,
  ReviewVerificationQueryDto,
  RevokeVerificationDto,
  SubmitVerificationDto,
  VerificationDecisionDto,
  VerificationRequestDto,
} from './verification.dto';
import { InvitationsService } from './invitations.service';
import { VerificationService } from './verification.service';

/** A school's confirmation: a picture or a PDF, 10 MB (checked again from the content). */
const DOCUMENT_UPLOAD = {
  limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1, fields: 0 },
  defParamCharset: 'utf8',
};

/**
 * The person's own verification by the platform (M17): where they stand, asking, and taking a
 * request back. Audited by the service.
 */
@ApiTags('verification')
@ApiBearerAuth()
@Controller('me/verification')
@Authenticated()
export class MyVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ApiOkResponse({ type: MyVerificationDto })
  mine(@Req() req: RequestWithPrincipal): Promise<MyVerificationDto> {
    return this.verification.mine(principalOf(req).userId);
  }

  @Post()
  @ApiCreatedResponse({ type: VerificationRequestDto })
  submit(
    @Req() req: RequestWithPrincipal,
    @Body() body: SubmitVerificationDto,
    @Meta() meta: RequestMeta,
  ): Promise<VerificationRequestDto> {
    return this.verification.submit(principalOf(req).userId, body, meta);
  }

  @Post('withdraw')
  @HttpCode(200)
  @ApiOkResponse({ type: VerificationRequestDto })
  withdraw(
    @Req() req: RequestWithPrincipal,
    @Meta() meta: RequestMeta,
  ): Promise<VerificationRequestDto> {
    return this.verification.withdraw(principalOf(req).userId, meta);
  }

  /** A student uploads their school's confirmation first, then names it in the request. */
  @Post('document')
  @RateLimit(RATE_LIMITS.uploadPerIp)
  @UseInterceptors(FileInterceptor('file', DOCUMENT_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: FileDto })
  document(
    @Req() req: RequestWithPrincipal,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<FileDto> {
    return this.verification.uploadDocument(principalOf(req).userId, file, meta);
  }
}

/** Israel's medical schools, for the student's form. Public: it is a list of universities. */
@ApiTags('verification')
@Controller('medical-schools')
export class MedicalSchoolsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: MedicalSchoolListDto })
  async list(): Promise<MedicalSchoolListDto> {
    const rows = await this.prisma.medicalSchool.findMany({
      where: { active: true },
      orderBy: { nameEn: 'asc' },
      select: { id: true, nameHe: true, nameEn: true },
    });
    return { items: rows };
  }
}

/**
 * The platform's reviewers (physicians.verify, M17): the queue, a request, a student's
 * confirmation, decisions, and ending a verification. Nobody reviews their own request.
 */
@ApiTags('verification')
@ApiBearerAuth()
@Controller('physician-verifications')
@RequirePermission('physicians.verify')
export class PhysicianVerificationsController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ApiOkResponse({ type: ReviewVerificationListDto })
  async queue(
    @Req() req: RequestWithPrincipal,
    @Query() query: ReviewVerificationQueryDto,
  ): Promise<ReviewVerificationListDto> {
    return { items: await this.verification.queue(principalOf(req), query.state) };
  }

  @Get(':id')
  @ApiOkResponse({ type: ReviewVerificationDto })
  one(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReviewVerificationDto> {
    return this.verification.one(principalOf(req), id);
  }

  @Get(':id/document')
  @ApiOkResponse({ type: DocumentLinkDto })
  document(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<DocumentLinkDto> {
    return this.verification.documentLink(principalOf(req), id, meta);
  }

  @Post(':id/decisions')
  @HttpCode(200)
  @ApiOkResponse({ type: ReviewVerificationDto })
  decide(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: VerificationDecisionDto,
    @Meta() meta: RequestMeta,
  ): Promise<ReviewVerificationDto> {
    return this.verification.decide(principalOf(req), id, body, meta);
  }

  @Post('people/:userId/revoke')
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(
    @Req() req: RequestWithPrincipal,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: RevokeVerificationDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.verification.revoke(principalOf(req), userId, body.reason, meta);
  }
}

/**
 * Inviting colleagues (M17 step 6). The answer is the same whoever the address belongs to; an
 * invitation gives nobody anything.
 */
@ApiTags('verification')
@ApiBearerAuth()
@Controller('me/invitations')
@Authenticated()
export class MyInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiOkResponse({ type: PlatformInvitationsDto })
  mine(@Req() req: RequestWithPrincipal): Promise<PlatformInvitationsDto> {
    return this.invitations.mine(principalOf(req).userId);
  }

  @Post()
  @HttpCode(202)
  @RateLimit(RATE_LIMITS.accountCreationPerIp)
  @ApiAcceptedResponse()
  invite(
    @Req() req: RequestWithPrincipal,
    @Body() body: PlatformInviteDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.invitations.invite(principalOf(req), body, meta);
  }
}
