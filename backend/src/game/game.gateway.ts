import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { GameService } from './game.service';
import { Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

@WebSocketGateway(8080, { transports: ['websocket'], cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly gameService: GameService, private readonly aiService: AiService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('START_GAME')
  async handleStartGame(@MessageBody() data: { gameId: string }, @ConnectedSocket() client: Socket) {
    try {
      await this.gameService.initializeGame(data.gameId);
      client.emit('GAME_STARTED', { gameId: data.gameId });
      this.logger.log(`Game initialized: ${data.gameId}`);
    } catch (error) {
      client.emit('ERROR', { message: error.message });
      this.logger.error(`Error starting game: ${error.message}`);
    }
  }

  @SubscribeMessage('DEPOSIT')
  async handleDeposit(@MessageBody() data: { playerKey: string; amount: number; gameId: string }, @ConnectedSocket() client: Socket) {
    try {
      await this.gameService.deposit(data.playerKey, data.amount, data.gameId);
      client.emit('DEPOSIT_CONFIRMED', { playerKey: data.playerKey, amount: data.amount });
      this.logger.log(`Deposit made by ${data.playerKey} for game ${data.gameId}`);
    } catch (error) {
      client.emit('ERROR', { message: error.message });
      this.logger.error(`Error processing deposit: ${error.message}`);
    }
  }

  @SubscribeMessage('EVALUATE_TRADING')
  async handleEvaluateTrading(@MessageBody() data: { gameId: string }, @ConnectedSocket() client: Socket) {
    try {
      await this.gameService.evaluateTradingActivities(data.gameId);
      client.emit('TRADING_EVALUATED', { gameId: data.gameId });
      this.logger.log(`Trading activities evaluated for game ${data.gameId}`);
    } catch (error) {
      client.emit('ERROR', { message: error.message });
      this.logger.error(`Error evaluating trading activities: ${error.message}`);
    }
  }

  @SubscribeMessage('SELECT_WINNERS')
  async handleSelectWinners(@MessageBody() data: { gameId: string }, @ConnectedSocket() client: Socket) {
    try {
      const winners = await this.gameService.selectWinners(data.gameId);
      client.emit('WINNERS_SELECTED', { gameId: data.gameId, winners });
      this.logger.log(`Winners selected for game ${data.gameId}`);
    } catch (error) {
      client.emit('ERROR', { message: error.message });
      this.logger.error(`Error selecting winners: ${error.message}`);
    }
  }

  @SubscribeMessage('RESET_GAME')
  async handleResetGame(@MessageBody() data: { gameId: string }, @ConnectedSocket() client: Socket) {
    try {
      await this.gameService.resetGame(data.gameId);
      client.emit('GAME_RESET', { gameId: data.gameId });
      this.logger.log(`Game reset for game ${data.gameId}`);
    } catch (error) {
      client.emit('ERROR', { message: error.message });
      this.logger.error(`Error resetting game: ${error.message}`);
    }
  }
}

