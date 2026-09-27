import { Controller, Get, Module, Post } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { testEnv } from '../testing/test-env';
import { Public, RequirePermission } from './decorators/access.decorators';
import { findUndeclaredRoutes } from './route-audit';

/**
 * Deny-by-default build gate (SECURITY_MODEL.md §3): every route of the real application must
 * declare @Public() or @RequirePermission(). If this test fails, a route was added without an
 * access declaration; add one rather than weakening this test.
 */
async function undeclaredRoutesOf(rootModule: Parameters<typeof Test.createTestingModule>[0]) {
  const moduleRef = await Test.createTestingModule(rootModule).compile();
  const result = findUndeclaredRoutes(
    moduleRef.get(DiscoveryService),
    moduleRef.get(MetadataScanner),
    moduleRef.get(Reflector),
  );
  await moduleRef.close();
  return result;
}

describe('route access declarations', () => {
  it('every route in the application declares @Public() or @RequirePermission()', async () => {
    const undeclared = await undeclaredRoutesOf({
      imports: [AppModule.forRoot(testEnv()), DiscoveryModule],
    });
    expect(undeclared).toEqual([]);
  });

  describe('the check itself', () => {
    @Controller('fixture')
    class FixtureController {
      @Get('open')
      @Public()
      open() {
        return 'ok';
      }

      @Get('guarded')
      @RequirePermission('audit.read')
      guarded() {
        return 'ok';
      }

      @Post('forgotten')
      forgotten() {
        return 'ok';
      }

      notARoute() {
        return 'helper';
      }
    }

    @Public()
    @Controller('fixture-public')
    class ClassLevelPublicController {
      @Get()
      list() {
        return [];
      }
    }

    @Module({ controllers: [FixtureController, ClassLevelPublicController] })
    class FixtureModule {}

    it('reports routes that declare neither, and only those', async () => {
      const undeclared = await undeclaredRoutesOf({ imports: [FixtureModule, DiscoveryModule] });
      expect(undeclared).toEqual([{ controller: 'FixtureController', handler: 'forgotten' }]);
    });
  });
});
