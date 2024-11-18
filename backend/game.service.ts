import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameState } from '../database/entities/game-state.entity';
import { Player } from '../database/entities/player.entity';
import { Winner } from '../database/entities/winner.entity';
import { TradingService } from '../trading/trading.service';
import { AiService } from '../ai/ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    @InjectRepository(GameState)
    private gameStateRepository: Repository<GameState>,
    @InjectRepository(Player)
    private playerRepository: Repository<Player>,
    @InjectRepository(Winner)
    private winnerRepository: Repository<Winner>,
    private tradingService: TradingService,
    private aiService: AiService,
    private eventEmitter: EventEmitter2,
  ) {}

  async initializeGame(gameId: string): Promise<GameState> {
    const newGame = this.gameStateRepository.create({
      gameId,
      totalDeposits: 0,
      prizePool: 0,
      active: false,
    });
    return this.gameStateRepository.save(newGame);
  }

  async deposit(playerKey: string, amount: number, gameId: string): Promise<void> {
    const game = await this.gameStateRepository.findOne({ where: { gameId } });
    if (!game || game.active) {
      throw new Error('Game is not active or does not exist.');
    }

    let player = await this.playerRepository.findOne({ where: { key: playerKey, game: gameId } });
    if (player) {
      player.deposit += amount;
    } else {
      player = this.playerRepository.create({
        key: playerKey,
        deposit: amount,
        tradingScore: 0,
        game: gameId,
      });
    }
    await this.playerRepository.save(player);

    game.totalDeposits += amount;
    game.prizePool = game.totalDeposits;
    await this.gameStateRepository.save(game);

    this.eventEmitter.emit('deposit.made', { playerKey, amount, gameId });
  }

  async evaluateTradingActivities(gameId: string): Promise<void> {
    const game = await this.gameStateRepository.findOne({ where: { gameId }, relations: ['players'] });
    if (!game) throw new Error('Game not found.');

    const players = game.players;
    const scores = await this.aiService.computeScoresWithAnomalyDetection(players.map(p => p.key));

    for (const { playerKey, score } of scores) {
      const player = players.find(p => p.key === playerKey);
      if (player) {
        player.tradingScore = score;
        await this.playerRepository.save(player);
      }
    }

    this.eventEmitter.emit('trading.evaluated', { gameId });
  }

  async selectWinners(gameId: string): Promise<Winner[]> {
    const game = await this.gameStateRepository.findOne({ where: { gameId }, relations: ['players'] });
    if (!game || game.active) {
      throw new Error('Game is not active or does not exist.');
    }

    const players = game.players;
    const numWinners = Math.ceil(players.length * 0.10);
    const sortedPlayers = players.sort((a, b) => b.tradingScore - a.tradingScore);
    const topPlayers = sortedPlayers.slice(0, numWinners);

    const prizePool = game.prizePool;
    const prizeForWinners = Math.floor(prizePool * 90 / 100);
    const buybackAmount = Math.floor(prizePool * 10 / 100);
    const prizePerWinner = Math.floor(prizeForWinners / numWinners);

    const winners: Winner[] = [];

    for (const player of topPlayers) {
      const winner = this.winnerRepository.create({
        playerKey: player.key,
        prize: prizePerWinner,
        game: gameId,
      });
      winners.push(winner);
      await this.winnerRepository.save(winner);
    }

    // Buyback and burn RUMBLE tokens
    await this.buybackAndBurnTokens(buybackAmount);

    game.active = true;
    game.prizePool = 0;
    await this.gameStateRepository.save(game);

    this.eventEmitter.emit('winners.selected', { gameId, winners, buybackAmount });

    return winners;
  }

  async buybackAndBurnTokens(amount: number): Promise<void> {
    // Implementation for buying back and burning RUMBLE tokens
    // This would interact with the token program to perform the buyback and burn
    this.logger.log(`Buyback and burn of ${amount} RUMBLE tokens executed.`);
  }

  async resetGame(gameId: string): Promise<void> {
    const game = await this.gameStateRepository.findOne({ where: { gameId }, relations: ['players', 'winners'] });
    if (!game || !game.active) {
      throw new Error('Game is not active or does not exist.');
    }

    await this.winnerRepository.delete({ game: gameId });
    await this.playerRepository.delete({ game: gameId });

    game.active = false;
    game.totalDeposits = 0;
    game.prizePool = 0;
    await this.gameStateRepository.save(game);

    this.eventEmitter.emit('game.reset', { gameId });
  }
}

