use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use std::collections::HashMap;

declare_id!("YourProgramID");

#[program]
pub mod rumble {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.total_deposits = 0;
        game_state.active = false;
        game_state.players = Vec::new();
        game_state.winners = Vec::new();
        game_state.game_id = ctx.accounts.game_account.key();
        game_state.prize_pool = 0;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        let player = ctx.accounts.player.key();
        require!(amount > 0, RumbleError::InvalidDeposit);

        if let Some(existing) = game_state.players.iter_mut().find(|p| p.key == player) {
            existing.deposit = existing.deposit.checked_add(amount).ok_or(RumbleError::Overflow)?;
        } else {
            game_state.players.push(Player {
                key: player,
                deposit: amount,
                trading_score: 0,
                last_active: Clock::get()?.unix_timestamp,
            });
        }

        game_state.total_deposits = game_state
            .total_deposits
            .checked_add(amount)
            .ok_or(RumbleError::Overflow)?;
        game_state.prize_pool = game_state.total_deposits;

        emit!(DepositEvent {
            player: player,
            amount: amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn evaluate_trading_activity(ctx: Context<EvaluateTrading>, scores: Vec<(Pubkey, u32)>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        for (player_key, score) in scores {
            if let Some(player) = game_state.players.iter_mut().find(|p| p.key == player_key) {
                player.trading_score = score;
                player.last_active = Clock::get()?.unix_timestamp;
            }
        }
        emit!(TradingEvaluationEvent {
            game_id: game_state.game_id,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn select_winners(ctx: Context<SelectWinners>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        require!(game_state.total_deposits > 0, RumbleError::NoDeposits);
        require!(!game_state.active, RumbleError::GameAlreadyActive);

        let total_players = game_state.players.len();
        let num_winners = ((total_players as f64) * 0.10).ceil() as usize;

        let mut sorted_players = game_state.players.clone();
        sorted_players.sort_by(|a, b| b.trading_score.cmp(&a.trading_score));

        let winners = sorted_players.into_iter().take(num_winners).collect::<Vec<_>>();
        game_state.winners = winners.clone();

        let prize_pool = game_state.prize_pool;
        let prize_for_winners = prize_pool * 90 / 100;
        let buyback_amount = prize_pool * 10 / 100;
        let prize_per_winner = prize_for_winners.checked_div(num_winners as u64).ok_or(RumbleError::DivisionByZero)?;

        for winner in winners {
            **ctx.accounts
                .winner_accounts
                .iter_mut()
                .find(|w| w.key == winner.key)
                .ok_or(RumbleError::WinnerAccountNotFound)?
                .lamports
                .borrow_mut() += prize_per_winner;
        }

        // Buyback and burn RUMBLE tokens
        ctx.accounts.rumble_token_burner.burn(buyback_amount)?;

        emit!(WinnersSelectedEvent {
            game_id: game_state.game_id,
            winners: winners.iter().map(|w| w.key).collect(),
            prize_per_winner: prize_per_winner,
            buyback_amount: buyback_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        game_state.total_deposits = 0;
        game_state.prize_pool = 0;
        game_state.active = true;
        Ok(())
    }

    pub fn reset_game(ctx: Context<ResetGame>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        require!(game_state.active, RumbleError::GameNotActive);

        game_state.active = false;
        game_state.players.clear();
        game_state.winners.clear();
        game_state.total_deposits = 0;
        game_state.prize_pool = 0;

        emit!(GameResetEvent {
            game_id: game_state.game_id,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Player {
    pub key: Pubkey,
    pub deposit: u64,
    pub trading_score: u32,
    pub last_active: i64,
}

#[account]
pub struct GameState {
    pub total_deposits: u64,
    pub prize_pool: u64,
    pub active: bool,
    pub players: Vec<Player>,
    pub winners: Vec<Player>,
    pub game_id: Pubkey,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8 + 8 + 1 + 4 + 4 + 32)]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EvaluateTrading<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
}

#[derive(Accounts)]
pub struct SelectWinners<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub winner_accounts: Vec<AccountInfo<'info>>,
    pub rumble_token_burner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ResetGame<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[event]
pub struct DepositEvent {
    pub player: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradingEvaluationEvent {
    pub game_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WinnersSelectedEvent {
    pub game_id: Pubkey,
    pub winners: Vec<Pubkey>,
    pub prize_per_winner: u64,
    pub buyback_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct GameResetEvent {
    pub game_id: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum RumbleError {
    #[msg("Invalid deposit amount.")]
    InvalidDeposit,
    #[msg("No deposits found.")]
    NoDeposits,
    #[msg("Game is already active.")]
    GameAlreadyActive,
    #[msg("Overflow occurred during deposit.")]
    Overflow,
    #[msg("Division by zero.")]
    DivisionByZero,
    #[msg("Winner account not found.")]
    WinnerAccountNotFound,
    #[msg("Game is not active.")]
    GameNotActive,
}

