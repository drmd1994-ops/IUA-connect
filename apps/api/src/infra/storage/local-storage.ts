import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { ObjectStorage, STORAGE_KEY } from './object-storage';

/** Repository root (apps/api/{src|dist}/infra/storage → four levels up). */
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * Demo storage: files on the local disk under STORAGE_DIR (git-ignored, outside the web root).
 * Only keys the app generated are accepted, so a key can never point outside the folder.
 * Refused in production (env schema).
 */
@Injectable()
export class LocalStorage extends ObjectStorage {
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) env: Env) {
    super();
    this.root = path.resolve(REPO_ROOT, env.STORAGE_DIR);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: 'wx' }); // never overwrite
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!STORAGE_KEY.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, ...key.split('/'));
  }
}
