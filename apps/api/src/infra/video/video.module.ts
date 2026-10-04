import { Global, Module } from '@nestjs/common';
import { LinkVideoProvider, VideoProvider } from './video-provider';

/** VIDEO_PROVIDER=links is the only implementation so far (ADR 0008; allowed in production). */
@Global()
@Module({
  providers: [{ provide: VideoProvider, useClass: LinkVideoProvider }],
  exports: [VideoProvider],
})
export class VideoModule {}
