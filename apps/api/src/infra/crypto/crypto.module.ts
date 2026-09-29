import { Global, Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher';
import { FieldCipher, SecretHasher } from './secrets';

@Global()
@Module({
  providers: [PasswordHasher, SecretHasher, FieldCipher],
  exports: [PasswordHasher, SecretHasher, FieldCipher],
})
export class CryptoModule {}
