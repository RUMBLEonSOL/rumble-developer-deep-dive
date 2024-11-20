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
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RumbleError } from '../src/game/rumble.errors';

describe('GameService', () => {
  let service: GameService;
  let gameRepo: Repository<GameState>;
  let playerRepo: Repository<Player>;
  let winnerRepo: Repository<Winner>;
  let tradingService: TradingService;
  let aiService: AiService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: TradingService,
          useValue: {
            fetchTradingData: jest.fn(),
          },
        },
        {
          provide: AiService,
          useValue: {
            computeScoresWithAnomalyDetection: jest.fn(),
          },
        },
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
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    gameRepo = module.get<Repository<GameState>>(getRepositoryToken(GameState));
    playerRepo = module.get<Repository<Player>>(getRepositoryToken(Player));
    winnerRepo = module.get<Repository<Winner>>(getRepositoryToken(Winner));
    tradingService = module.get<TradingService>(TradingService);
    aiService = module.get<AiService>(AiService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeGame', () => {
    it('should initialize a new game successfully', async () => {
      const gameId = 'testGameId';
      const game = { gameId, totalDeposits: 0, prizePool: 0, active: false, players: [], winners: [] };
      
      jest.spyOn(gameRepo, 'create').mockReturnValue(game as any);
      jest.spyOn(gameRepo, 'save').mockResolvedValue(game as any);
      
      const result = await service.initializeGame(gameId);
      
      expect(gameRepo.create).toHaveBeenCalledWith({
        gameId,
        totalDeposits: 0,
        prizePool: 0,
        active: false,
      });
      expect(gameRepo.save).toHaveBeenCalledWith(game);
      expect(result).toEqual(game);
    });

    it('should throw an error if game initialization fails', async () => {
      const gameId = 'testGameId';
      jest.spyOn(gameRepo, 'create').mockReturnValue({});
      jest.spyOn(gameRepo, 'save').mockRejectedValue(new Error('Database error'));
      
      await expect(service.initializeGame(gameId)).rejects.toThrow('Database error');
    });
  });

  describe('deposit', () => {
    it('should handle a successful deposit', async () => {
      const playerKey = 'player1';
      const amount = 1000;
      const gameId = 'game123';
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players: [],
      };
      
      const player = {
        key: playerKey,
        deposit: 0,
        tradingScore: 0,
        game: gameId,
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      jest.spyOn(playerRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(playerRepo, 'create').mockReturnValue(player as any);
      jest.spyOn(playerRepo, 'save').mockResolvedValue(player as any);
      jest.spyOn(gameRepo, 'save').mockResolvedValue(game as any);
      
      await service.deposit(playerKey, amount, gameId);
      
      expect(gameRepo.findOne).toHaveBeenCalledWith({ where: { gameId } });
      expect(playerRepo.findOne).toHaveBeenCalledWith({ where: { key: playerKey, game: gameId } });
      expect(playerRepo.create).toHaveBeenCalledWith({
        key: playerKey,
        deposit: amount,
        tradingScore: 0,
        game: gameId,
      });
      expect(playerRepo.save).toHaveBeenCalledWith(player);
      expect(gameRepo.save).toHaveBeenCalledWith({
        ...game,
        totalDeposits: game.totalDeposits + amount,
        prizePool: game.totalDeposits + amount,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('deposit.made', { playerKey, amount, gameId });
    });

    it('should update an existing player deposit', async () => {
      const playerKey = 'player1';
      const amount = 500;
      const gameId = 'game123';
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players: [
          { key: playerKey, deposit: 1000, tradingScore: 0, last_active: 1620000000 },
        ],
      };
      
      const updatedPlayer = {
        key: playerKey,
        deposit: 1500,
        tradingScore: 0,
        last_active: 1620000000,
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      jest.spyOn(playerRepo, 'findOne').mockResolvedValue(game.players[0] as any);
      jest.spyOn(playerRepo, 'save').mockResolvedValue(updatedPlayer as any);
      jest.spyOn(gameRepo, 'save').mockResolvedValue(game as any);
      
      await service.deposit(playerKey, amount, gameId);
      
      expect(playerRepo.findOne).toHaveBeenCalledWith({ where: { key: playerKey, game: gameId } });
      expect(playerRepo.save).toHaveBeenCalledWith(updatedPlayer);
      expect(gameRepo.save).toHaveBeenCalledWith({
        ...game,
        totalDeposits: game.totalDeposits + amount,
        prizePool: game.totalDeposits + amount,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('deposit.made', { playerKey, amount, gameId });
    });

    it('should throw an error if the game does not exist', async () => {
      const playerKey = 'player1';
      const amount = 1000;
      const gameId = 'nonexistentGame';
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(null);
      
      await expect(service.deposit(playerKey, amount, gameId)).rejects.toThrow('Game is not active or does not exist.');
    });

    it('should throw an error if the game is active', async () => {
      const playerKey = 'player1';
      const amount = 1000;
      const gameId = 'activeGame';
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: true,
        players: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      
      await expect(service.deposit(playerKey, amount, gameId)).rejects.toThrow('Game is not active or does not exist.');
    });

    it('should handle database save errors gracefully', async () => {
      const playerKey = 'player1';
      const amount = 1000;
      const gameId = 'game123';
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players: [],
      };
      
      const player = {
        key: playerKey,
        deposit: 0,
        tradingScore: 0,
        game: gameId,
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      jest.spyOn(playerRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(playerRepo, 'create').mockReturnValue(player as any);
      jest.spyOn(playerRepo, 'save').mockRejectedValue(new Error('Database save error'));
      
      await expect(service.deposit(playerKey, amount, gameId)).rejects.toThrow('Database save error');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('evaluateTradingActivities', () => {
    it('should evaluate trading activities successfully', async () => {
      const gameId = 'game123';
      const players = [
        { key: 'player1', tradingScore: 0 },
        { key: 'player2', tradingScore: 0 },
      ];
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players,
      };
      
      const scores = [
        { playerKey: 'player1', score: 150 },
        { playerKey: 'player2', score: 200 },
      ];
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players } as any);
      (aiService.computeScoresWithAnomalyDetection as jest.Mock).mockResolvedValue(scores);
      jest.spyOn(playerRepo, 'save').mockResolvedValue(null);
      
      await service.evaluateTradingActivities(gameId);
      
      expect(gameRepo.findOne).toHaveBeenCalledWith({ where: { gameId }, relations: ['players'] });
      expect(aiService.computeScoresWithAnomalyDetection).toHaveBeenCalledWith(['player1', 'player2']);
      expect(playerRepo.save).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith('trading.evaluated', { gameId });
    });

    it('should throw an error if the game does not exist', async () => {
      const gameId = 'nonexistentGame';
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(null);
      
      await expect(service.evaluateTradingActivities(gameId)).rejects.toThrow('Game not found.');
    });

    it('should handle AI service failures gracefully', async () => {
      const gameId = 'game123';
      const players = [
        { key: 'player1', tradingScore: 0 },
        { key: 'player2', tradingScore: 0 },
      ];
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players,
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players } as any);
      (aiService.computeScoresWithAnomalyDetection as jest.Mock).mockRejectedValue(new Error('AI service error'));
      
      await expect(service.evaluateTradingActivities(gameId)).rejects.toThrow('AI service error');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle empty scores gracefully', async () => {
      const gameId = 'game123';
      const players = [
        { key: 'player1', tradingScore: 0 },
        { key: 'player2', tradingScore: 0 },
      ];
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players,
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players } as any);
      (aiService.computeScoresWithAnomalyDetection as jest.Mock).mockResolvedValue([]);
      
      await service.evaluateTradingActivities(gameId);
      
      expect(playerRepo.save).toHaveBeenCalledTimes(0);
      expect(eventEmitter.emit).toHaveBeenCalledWith('trading.evaluated', { gameId });
    });
  });

  describe('selectWinners', () => {
    it('should select winners correctly and distribute prizes', async () => {
      const gameId = 'game123';
      const players = [
        { key: 'player1', tradingScore: 150 },
        { key: 'player2', tradingScore: 200 },
        { key: 'player3', tradingScore: 100 },
        { key: 'player4', tradingScore: 180 },
      ];
      
      const game = {
        gameId,
        totalDeposits: 4000,
        prizePool: 4000,
        active: false,
        players,
      };
      
      const sortedPlayers = [
        { key: 'player2', tradingScore: 200 },
        { key: 'player4', tradingScore: 180 },
        { key: 'player1', tradingScore: 150 },
        { key: 'player3', tradingScore: 100 },
      ];
      
      const numWinners = Math.ceil(players.length * 0.10); // 1 winner
      
      const winners = [sortedPlayers[0]];
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players } as any);
      jest.spyOn(winnerRepo, 'create').mockImplementation((data) => data);
      jest.spyOn(winnerRepo, 'save').mockResolvedValue(null);
      jest.spyOn(service, 'buybackAndBurnTokens').mockResolvedValue(null);
      jest.spyOn(gameRepo, 'save').mockResolvedValue({ ...game, winners, active: true, prizePool: 0 } as any);
      
      const selectedWinners = await service.selectWinners(gameId);
      
      expect(gameRepo.findOne).toHaveBeenCalledWith({ where: { gameId }, relations: ['players'] });
      expect(winnerRepo.create).toHaveBeenCalledWith({
        playerKey: 'player2',
        prize: Math.floor((4000 * 0.90) / numWinners), // 3600 / 1 = 3600
        game: gameId,
      });
      expect(winnerRepo.save).toHaveBeenCalledWith(winners[0]);
      expect(service.buybackAndBurnTokens).toHaveBeenCalledWith(4000 * 0.10); // 400
      expect(gameRepo.save).toHaveBeenCalledWith({
        ...game,
        winners,
        active: true,
        prizePool: 0,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('winners.selected', {
        gameId,
        winners,
        buybackAmount: 400,
      });
      expect(selectedWinners).toEqual(winners);
    });

    it('should throw an error if the game does not exist', async () => {
      const gameId = 'nonexistentGame';
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(null);
      
      await expect(service.selectWinners(gameId)).rejects.toThrow('Game is not active or does not exist.');
    });

    it('should throw an error if the game has no deposits', async () => {
      const gameId = 'gameNoDeposits';
      const game = {
        gameId,
        totalDeposits: 0,
        prizePool: 0,
        active: false,
        players: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      
      await expect(service.selectWinners(gameId)).rejects.toThrow(RumbleError.NoDeposits);
    });

    it('should throw an error if the game is already active', async () => {
      const gameId = 'activeGame';
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: true,
        players: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      
      await expect(service.selectWinners(gameId)).rejects.toThrow(RumbleError.GameAlreadyActive);
    });

    it('should handle division by zero when calculating prize per winner', async () => {
      const gameId = 'gameZeroWinners';
      const game = {
        gameId,
        totalDeposits: 1000,
        prizePool: 1000,
        active: false,
        players: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      jest.spyOn(service, 'selectWinners').mockImplementation(async () => {
        throw RumbleError.DivisionByZero;
      });
      
      await expect(service.selectWinners(gameId)).rejects.toThrow(RumbleError.DivisionByZero);
    });
  });

  describe('resetGame', () => {
    it('should reset the game successfully', async () => {
      const gameId = 'game123';
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: true,
        players: [{ key: 'player1' }, { key: 'player2' }],
        winners: [{ key: 'player1' }],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players: game.players, winners: game.winners } as any);
      jest.spyOn(winnerRepo, 'delete').mockResolvedValue({ affected: 1 } as any);
      jest.spyOn(playerRepo, 'delete').mockResolvedValue({ affected: 2 } as any);
      jest.spyOn(gameRepo, 'save').mockResolvedValue({ ...game, active: false, totalDeposits: 0, prizePool: 0, players: [], winners: [] } as any);
      
      await service.resetGame(gameId);
      
      expect(gameRepo.findOne).toHaveBeenCalledWith({ where: { gameId }, relations: ['players', 'winners'] });
      expect(winnerRepo.delete).toHaveBeenCalledWith({ game: gameId });
      expect(playerRepo.delete).toHaveBeenCalledWith({ game: gameId });
      expect(gameRepo.save).toHaveBeenCalledWith({
        ...game,
        active: false,
        totalDeposits: 0,
        prizePool: 0,
        players: [],
        winners: [],
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('game.reset', { gameId });
    });

    it('should throw an error if the game is not active', async () => {
      const gameId = 'inactiveGame';
      const game = {
        gameId,
        totalDeposits: 0,
        prizePool: 0,
        active: false,
        players: [],
        winners: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game } as any);
      
      await expect(service.resetGame(gameId)).rejects.toThrow(RumbleError.GameNotActive);
    });

    it('should throw an error if the game does not exist', async () => {
      const gameId = 'nonexistentGame';
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(null);
      
      await expect(service.resetGame(gameId)).rejects.toThrow('Game is not active or does not exist.');
    });

    it('should handle database deletion errors gracefully', async () => {
      const gameId = 'game123';
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: true,
        players: [{ key: 'player1' }, { key: 'player2' }],
        winners: [{ key: 'player1' }],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players: game.players, winners: game.winners } as any);
      jest.spyOn(winnerRepo, 'delete').mockRejectedValue(new Error('Database deletion error'));
      
      await expect(service.resetGame(gameId)).rejects.toThrow('Database deletion error');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('buybackAndBurnTokens', () => {
    it('should execute buyback and burn tokens successfully', async () => {
      const amount = 1000;
      jest.spyOn(service, 'buybackAndBurnTokens').mockResolvedValue(null);
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation(() => {});
      
      await service.buybackAndBurnTokens(amount);
      
      expect(loggerSpy).toHaveBeenCalledWith(`Buyback and burn of ${amount} RUMBLE tokens executed.`);
    });

    it('should handle errors during buyback and burn tokens', async () => {
      const amount = 1000;
      jest.spyOn(service, 'buybackAndBurnTokens').mockImplementation(() => {
        throw new Error('Burning failed');
      });
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation(() => {});
      
      await expect(service.buybackAndBurnTokens(amount)).rejects.toThrow('Burning failed');
      expect(loggerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Additional Edge Cases and Scenarios', () => {
    it('should handle selecting winners when there are no players', async () => {
      const gameId = 'gameNoPlayers';
      const game = {
        gameId,
        totalDeposits: 1000,
        prizePool: 1000,
        active: false,
        players: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue(game as any);
      
      await expect(service.selectWinners(gameId)).resolves.toEqual([]);
      expect(winnerRepo.create).not.toHaveBeenCalled();
      expect(winnerRepo.save).not.toHaveBeenCalled();
      expect(service.buybackAndBurnTokens).toHaveBeenCalledWith(100);
      expect(gameRepo.save).toHaveBeenCalledWith({
        ...game,
        winners: [],
        active: true,
        prizePool: 0,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('winners.selected', {
        gameId,
        winners: [],
        buybackAmount: 100,
      });
    });

    it('should handle multiple winners selection correctly', async () => {
      const gameId = 'gameMultipleWinners';
      const players = [
        { key: 'player1', tradingScore: 300 },
        { key: 'player2', tradingScore: 250 },
        { key: 'player3', tradingScore: 200 },
        { key: 'player4', tradingScore: 150 },
        { key: 'player5', tradingScore: 100 },
      ];
      
      const game = {
        gameId,
        totalDeposits: 5000,
        prizePool: 5000,
        active: false,
        players,
      };
      
      const sortedPlayers = [
        { key: 'player1', tradingScore: 300 },
        { key: 'player2', tradingScore: 250 },
        { key: 'player3', tradingScore: 200 },
        { key: 'player4', tradingScore: 150 },
        { key: 'player5', tradingScore: 100 },
      ];
      
      const numWinners = Math.ceil(players.length * 0.10); // 1 winner
      const winners = [sortedPlayers[0]];
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game, players } as any);
      jest.spyOn(winnerRepo, 'create').mockImplementation((data) => data);
      jest.spyOn(winnerRepo, 'save').mockResolvedValue(null);
      jest.spyOn(service, 'buybackAndBurnTokens').mockResolvedValue(null);
      jest.spyOn(gameRepo, 'save').mockResolvedValue({ ...game, winners, active: true, prizePool: 0 } as any);
      
      const selectedWinners = await service.selectWinners(gameId);
      
      expect(selectedWinners).toEqual(winners);
      expect(winnerRepo.create).toHaveBeenCalledTimes(1);
      expect(winnerRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should handle resetting an already reset game gracefully', async () => {
      const gameId = 'alreadyResetGame';
      const game = {
        gameId,
        totalDeposits: 0,
        prizePool: 0,
        active: false,
        players: [],
        winners: [],
      };
      
      jest.spyOn(gameRepo, 'findOne').mockResolvedValue({ ...game } as any);
      
      await expect(service.resetGame(gameId)).rejects.toThrow(RumbleError.GameNotActive);
      expect(winnerRepo.delete).not.toHaveBeenCalled();
      expect(playerRepo.delete).not.toHaveBeenCalled();
      expect(gameRepo.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
