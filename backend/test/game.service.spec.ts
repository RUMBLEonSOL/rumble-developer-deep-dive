import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from '../src/game/game.service';
import { TradingService } from '../src/trading/trading.service';
import { AiService } from '../src/ai/ai.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GameState } from '../src/database/entities/game-state.entity';
import { Player } from '../src/database/entities/player.entity';
import { Winner } from '../src/database/entities/winner.entity';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('GameService', () => {
  let service: GameService;
  let gameRepo: Repository<GameState>;
  let playerRepo: Repository<Player>;
  let winnerRepo: Repository<Winner>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        TradingService,
        AiService,
        EventEmitter2,
        {
          provide: getRepositoryToken(GameState),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Player),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Winner),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    gameRepo = module.get<Repository<GameState>>(getRepositoryToken(GameState));
    playerRepo = module.get<Repository<Player>>(getRepositoryToken(Player));
    winnerRepo = module.get<Repository<Winner>>(getRepositoryToken(Winner));
  });

  it('should initialize a new game', async () => {
    const gameId = 'testGameId';
    const game = { gameId, totalDeposits: 0, prizePool: 0, active: false };
    jest.spyOn(gameRepo, 'create').mockReturnValue(game as any);
    jest.spyOn(gameRepo, 'save').mockResolvedValue(game as any);

    const result = await service.initializeGame(gameId);
    expect(result.gameId).toBe(gameId);
    expect(result.totalDeposits).toBe(0);
    expect(result.active).toBe(false);
  });

  // Additional tests for deposit, evaluateTradingActivities, selectWinners, resetGame
});