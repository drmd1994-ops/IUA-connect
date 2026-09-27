import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'iua:audited';

export interface AuditedOptions {
  /** Stable action name, e.g. "membership.approve". */
  action: string;
  /** Entity type recorded as the target, e.g. "membership". */
  entityType?: string;
  /** Route parameter holding the target ID (default "id"). */
  idParam?: string;
}

/** Records a successful call to this route in the audit log (see AuditInterceptor). */
export const Audited = (options: AuditedOptions) => SetMetadata(AUDITED_KEY, options);
