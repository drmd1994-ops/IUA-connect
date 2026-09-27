import { type DynamicModule, Global, Module } from '@nestjs/common';
import { type Env } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: Object.freeze({ ...env }) }],
      exports: [APP_CONFIG],
    };
  }
}
