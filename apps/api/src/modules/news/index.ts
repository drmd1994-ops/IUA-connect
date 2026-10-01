export { NewsModule } from './news.module';
export { NewsAdminService, parseIfMatch } from './news-admin.service';
// Text helpers shared with other content modules (events).
export { MAX_BODY_LENGTH, sanitizeMarkdown } from './markdown';
export { SLUG_PATTERN, slugify, uniqueSlug } from './slug';
