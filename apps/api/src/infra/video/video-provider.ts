import { Injectable } from '@nestjs/common';

/** Who is asking to watch. A hosted provider would sign a short-lived address for them. */
export interface VideoViewer {
  userId: string | null;
}

/** How a page presents a recording. Today only a link; a hosted provider adds its own kind. */
export interface VideoPlayback {
  kind: 'LINK';
  /** Opens on the site that hosts the recording. */
  url: string;
}

/**
 * Where recordings live (ARCHITECTURE.md §5, ADR 0008). A recording is stored as a reference
 * that only the provider understands: for LinkVideoProvider it is the web address itself.
 * Whether the viewer may see the item is decided before the provider is asked.
 * Demo and default: LinkVideoProvider, selected with VIDEO_PROVIDER. Later: a hosted provider.
 */
export abstract class VideoProvider {
  abstract readonly name: string;
  /** May this reference be attached to an item? */
  abstract accepts(reference: string): boolean;
  abstract playback(reference: string, viewer: VideoViewer): VideoPlayback;
}

const MAX_LINK_LENGTH = 500;

/**
 * Recordings stay where they are hosted and the item links to them (ADR 0008). Nothing is
 * uploaded, stored or tracked, and the link is the same for everyone who may see the item.
 */
@Injectable()
export class LinkVideoProvider extends VideoProvider {
  readonly name = 'links';

  accepts(reference: string): boolean {
    if (reference.length > MAX_LINK_LENGTH) return false;
    let url: URL;
    try {
      url = new URL(reference);
    } catch {
      return false;
    }
    return url.protocol === 'https:' || url.protocol === 'http:';
  }

  playback(reference: string): VideoPlayback {
    return { kind: 'LINK', url: reference };
  }
}
