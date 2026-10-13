import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  type ApiBodyOptions,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import {
  PrincipalResolver,
  type RequestWithPrincipal,
  principalOf,
} from '../../common/auth/principal';
import {
  Authenticated,
  Public,
  RequireScopedPermission,
} from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { MAX_UPLOAD_BYTES, PROFILE_PHOTO_MAX_BYTES } from './file-processing';
import {
  FileContentQueryDto,
  FileDto,
  FileUrlQueryDto,
  ProfilePhotoDto,
  SignedUrlDto,
} from './files.dto';
import { FilesService } from './files.service';
import { ProfilePhotoService } from './profile-photo.service';

interface Upload {
  buffer: Buffer;
  originalname: string;
}

/** Multer keeps the upload in memory; the server stops reading past the largest allowed size. */
const uploadOptions = (maxBytes: number) => ({
  limits: { fileSize: maxBytes, files: 1, fields: 0 },
  // Browsers send file names as UTF-8; multer would read them as Latin-1 (garbling Hebrew).
  defParamCharset: 'utf8',
});

const MULTIPART_FILE: ApiBodyOptions = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

/** Uploads and downloads (API_DESIGN.md §4 "Files"). */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly principals: PrincipalResolver,
  ) {}

  /**
   * Staff only in demo mode (the malware scanner is a no-op, D15). Audited by the service.
   * Staff of an organisation upload too (M16): the file is its uploader's until an item uses it.
   */
  @Post()
  @ApiBearerAuth()
  @RequireScopedPermission('files.upload')
  @RateLimit(RATE_LIMITS.uploadPerIp)
  @UseInterceptors(FileInterceptor('file', uploadOptions(MAX_UPLOAD_BYTES)))
  @ApiConsumes('multipart/form-data')
  @ApiBody(MULTIPART_FILE)
  @ApiCreatedResponse({ type: FileDto })
  upload(
    @Req() req: RequestWithPrincipal,
    @UploadedFile() file: Upload | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<FileDto> {
    return this.files.upload(file, 'CONTENT', principalOf(req).userId, meta);
  }

  /**
   * A 5-minute link to the file. Public, because public content has files too; the access check
   * uses the caller when signed in. Files the caller may not read look missing.
   */
  @Get(':id/url')
  @Public()
  @ApiOkResponse({ type: SignedUrlDto })
  async url(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: FileUrlQueryDto,
  ): Promise<SignedUrlDto> {
    const principal = req.principal ?? (await this.principals.resolve(req));
    return this.files.signedUrl(principal, id, query.v);
  }

  /** The bytes, for a signed link only. Documents always download; they never open inline. */
  @Get(':id/content')
  @Public()
  @ApiOkResponse({ description: 'The file' })
  async content(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: FileContentQueryDto,
    @Headers('range') asked: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const headers = (file: { kind: string; mimeType: string; originalName: string }) => {
      const disposition = file.kind === 'DOCUMENT' ? 'attachment' : 'inline';
      res.set({
        'Content-Type': file.mimeType,
        'Content-Disposition': `${disposition}; ${filenameParams(file.originalName)}`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        // Even if a browser rendered it, nothing in it could run.
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
      });
    };
    if (query.v !== 'full') {
      const { body, file } = await this.files.content(id, query);
      headers(file);
      return new StreamableFile(body);
    }
    // The whole file is streamed, never held in memory; a video's player asks for parts.
    const { stream, size, range, file } = await this.files.stream(id, query, (total) =>
      parseRange(asked, total),
    );
    headers(file);
    res.set('Accept-Ranges', 'bytes');
    if (range) {
      res.status(206);
      res.set({
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(range.end - range.start + 1),
      });
    } else {
      res.set('Content-Length', String(size));
    }
    return new StreamableFile(stream);
  }
}

/** The member's own profile photo (image only, 5 MB; re-encoded without metadata). */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/profile/photo')
@Authenticated()
export class ProfilePhotoController {
  constructor(private readonly photos: ProfilePhotoService) {}

  @Put()
  @RateLimit(RATE_LIMITS.uploadPerIp)
  @UseInterceptors(FileInterceptor('file', uploadOptions(PROFILE_PHOTO_MAX_BYTES + 1)))
  @ApiConsumes('multipart/form-data')
  @ApiBody(MULTIPART_FILE)
  @ApiOkResponse({ type: ProfilePhotoDto })
  set(
    @Req() req: RequestWithPrincipal,
    @UploadedFile() file: Upload | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<ProfilePhotoDto> {
    return this.photos.set(principalOf(req).userId, file, meta);
  }

  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Req() req: RequestWithPrincipal, @Meta() meta: RequestMeta): Promise<void> {
    return this.photos.remove(principalOf(req).userId, meta);
  }
}

/**
 * One byte range of a file of this size, from a Range header ("bytes=0-", "bytes=100-199",
 * "bytes=-500"). Anything else, several ranges, or a range outside the file means the whole file.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || size === 0 || (match[1] === '' && match[2] === '')) return undefined;
  if (match[1] === '') {
    const last = Number(match[2]);
    return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : undefined;
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  return start <= end && start < size ? { start, end } : undefined;
}

/** `filename="ascii"; filename*=UTF-8''encoded` (RFC 6266), so Hebrew names survive. */
function filenameParams(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
