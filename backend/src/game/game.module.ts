import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { TradingModule } from '../trading/trading.module';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TradingModule, AiModule, DatabaseModule],
  providers: [GameService, GameGateway],
})
export class GameModule {}

