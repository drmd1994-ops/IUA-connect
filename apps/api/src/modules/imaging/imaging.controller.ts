import { rm } from 'node:fs/promises';
import * as os from 'node:os';
import {
  type CallHandler,
  Controller,
  Delete,
  type ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  type NestInterceptor,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExcludeController,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { catchError } from 'rxjs';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, Public } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AppException } from '../../common/errors/app.exception';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import {
  SCAN_MAX_BYTES,
  SCAN_MAX_FILES,
  ScanDto,
  ScanUploadQueryDto,
  ScanViewerDto,
  WadoUriQueryDto,
} from './imaging.dto';
import { type DiskUpload, ImagingService, type ScanView } from './imaging.service';

/** Room for the form's own bytes around the files. */
const FORM_OVERHEAD = 1024 * 1024;

/**
 * Around a scan upload: refuses one larger than a scan may be before any of it is written to disk
 * (the upload library limits each file, not their sum), and removes the written files when
 * anything after fails (a refused query, a rate limit), so none is left behind.
 */
@Injectable()
class ScanUploadFiles implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request & { files?: DiskUpload[] }>();
    const length = Number(request.headers['content-length']);
    if (!Number.isFinite(length) || length > SCAN_MAX_BYTES + FORM_OVERHEAD) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'files', code: 'scanTooLarge' }]);
    }
    return next.handle().pipe(
      catchError(async (error: unknown) => {
        const files = Array.isArray(request.files) ? request.files : [];
        await Promise.all(files.map((f) => rm(f.path, { force: true }).catch(() => undefined)));
        throw error;
      }),
    );
  }
}

/** Scans (M36): upload, a scan's summary, and the viewer's way in. */
@ApiTags('imaging')
@Controller('imaging/scans')
@Authenticated()
export class ScansController {
  constructor(
    private readonly imaging: ImagingService,
    private readonly limits: RateLimitStore,
  ) {}

  /**
   * One study as its DICOM files, confirmed by the uploader to show nothing identifying on the
   * images themselves. The patient's details in the files are removed before anything is stored.
   */
  @Post()
  @UseInterceptors(
    ScanUploadFiles,
    FilesInterceptor('files', SCAN_MAX_FILES, {
      dest: os.tmpdir(),
      limits: { fileSize: SCAN_MAX_BYTES, files: SCAN_MAX_FILES, fields: 0 },
      defParamCharset: 'utf8',
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
      required: ['files'],
    },
  })
  @ApiCreatedResponse({ type: ScanDto })
  async upload(
    @Req() req: RequestWithPrincipal,
    @Query() _query: ScanUploadQueryDto,
    @UploadedFiles() files: DiskUpload[] | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ScanView> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.scanUploadsPerUser, principal.userId, res);
    return this.imaging.upload(principal, files ?? [], meta);
  }

  @Get(':id')
  @ApiOkResponse({ type: ScanDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ScanView> {
    return this.imaging.get(principalOf(req), id);
  }

  /** A link for the viewer to this one scan, valid for two hours. */
  @Get(':id/viewer')
  @ApiOkResponse({ type: ScanViewerDto })
  viewer(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ScanViewerDto> {
    return this.imaging.viewer(principalOf(req), id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.imaging.remove(principalOf(req), id, meta);
  }
}

/**
 * The viewer's reading paths (DICOMweb: QIDO-RS, WADO-RS metadata, WADO-URI), under a signed
 * link to one scan. Public, because the link is the permission (scan-link.ts); counted by their
 * own per-IP limit, since a viewer reads a study image by image. Not in the API reference: they
 * follow the DICOM standard, not ours.
 */
@ApiExcludeController()
@Controller('imaging/v/:token')
@Public()
export class ScanViewerController {
  constructor(private readonly imaging: ImagingService) {}

  @Get('config.json')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  config(@Param('token') token: string) {
    return this.imaging.config(token);
  }

  @Get('studies')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  async studies(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    dicomJson(res);
    return this.imaging.studies(token);
  }

  @Get('studies/:study/series')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  async series(
    @Param('token') token: string,
    @Param('study') study: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    dicomJson(res);
    return this.imaging.series(token, study);
  }

  @Get('studies/:study/metadata')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  async studyMetadata(
    @Param('token') token: string,
    @Param('study') study: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    dicomJson(res);
    return this.imaging.metadata(token, study);
  }

  @Get('studies/:study/series/:series/instances')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  async instances(
    @Param('token') token: string,
    @Param('study') study: string,
    @Param('series') series: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    dicomJson(res);
    return this.imaging.instances(token, study, series);
  }

  @Get('studies/:study/series/:series/metadata')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  async seriesMetadata(
    @Param('token') token: string,
    @Param('study') study: string,
    @Param('series') series: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    dicomJson(res);
    return this.imaging.metadata(token, study, series);
  }

  /** One image file (WADO-URI), already cleaned when it was stored. */
  @Get('wado')
  @RateLimit(RATE_LIMITS.scanImagesPerIp)
  async wado(
    @Param('token') token: string,
    @Query() query: WadoUriQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, size } = await this.imaging.file(token, query.objectUID);
    res.set({
      'Content-Type': 'application/dicom',
      'Content-Length': String(size),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(stream);
  }
}

function dicomJson(res: Response): void {
  res.set({ 'Content-Type': 'application/dicom+json', 'Cache-Control': 'private, max-age=300' });
}
