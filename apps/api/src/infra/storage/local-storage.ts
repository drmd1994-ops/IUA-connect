import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type ByteRange, ObjectStorage, STORAGE_KEY } from './object-storage';

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

  async putFile(key: string, sourcePath: string): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await rename(sourcePath, file);
    } catch (error) {
      // The temporary folder is on another disk: copy, then remove the source.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(sourcePath, file);
      await rm(sourcePath, { force: true });
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async open(key: string, range?: ByteRange): Promise<{ stream: Readable; size: number } | null> {
    const file = this.pathOf(key);
    try {
      const { size } = await stat(file);
      return { stream: createReadStream(file, range), size };
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
