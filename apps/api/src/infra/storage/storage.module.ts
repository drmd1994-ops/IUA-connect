import { Global, Module } from '@nestjs/common';
import { LocalStorage } from './local-storage';
import { MalwareScanner, NoopScanner } from './malware-scanner';
import { ObjectStorage } from './object-storage';

/** STORAGE_ADAPTER=local and MALWARE_SCANNER=noop are the demo adapters (refused in production). */
@Global()
@Module({
  providers: [
    { provide: ObjectStorage, useClass: LocalStorage },
    { provide: MalwareScanner, useClass: NoopScanner },
  ],
  exports: [ObjectStorage, MalwareScanner],
})
export class StorageModule {}
