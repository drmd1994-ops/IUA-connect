import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles';
import { PostgresSearch } from './postgres-search';
import { SearchProvider } from './search-provider';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** Global search (M7). The engine sits behind SearchProvider; PostgreSQL is the first one. */
@Module({
  imports: [AccessModule, AuthModule, ProfilesModule],
  controllers: [SearchController],
  providers: [SearchService, { provide: SearchProvider, useClass: PostgresSearch }],
})
export class SearchModule {}
