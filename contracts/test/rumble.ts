import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { RUMBLE } from '../target/types/rumble';
import { assert } from 'chai';

describe('rumble', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.RUMBLE as Program<RUMBLE>;

  let gameAccount = anchor.web3.Keypair.generate();

  it('Initializes the game state', async () => {
    await program.methods.initialize()
      .accounts({
        gameState: gameAccount.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([gameAccount])
      .rpc();

    const gameState = await program.account.gameState.fetch(gameAccount.publicKey);
    assert.ok(gameState.totalDeposits.toNumber() === 0);
    assert.ok(gameState.active === false);
    assert.ok(gameState.players.length === 0);
    assert.ok(gameState.winners.length === 0);
  });

  it('Handles deposits correctly', async () => {
    const player = anchor.web3.Keypair.generate();
    const depositAmount = new anchor.BN(5000);

    await program.methods.deposit(depositAmount)
      .accounts({
        gameState: gameAccount.publicKey,
        player: player.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const gameState = await program.account.gameState.fetch(gameAccount.publicKey);
    assert.ok(gameState.totalDeposits.toNumber() === 5000);
    assert.ok(gameState.players.length === 1);
    assert.ok(gameState.players[0].deposit.toNumber() === 5000);
  });

  it('Evaluates trading activities', async () => {
    const scores = [
      [anchor.web3.Keypair.generate().publicKey, 150],
      [anchor.web3.Keypair.generate().publicKey, 200],
    ];

    await program.methods.evaluateTradingActivity(scores)
      .accounts({
        gameState: gameAccount.publicKey,
      })
      .rpc();

    const gameState = await program.account.gameState.fetch(gameAccount.publicKey);
    for (const [key, score] of scores) {
      const player = gameState.players.find(p => p.key.toString() === key.toString());
      assert.ok(player);
      assert.ok(player.tradingScore === score[1]);
    }
  });

  it('Selects winners correctly', async () => {
    await program.methods.selectWinners()
      .accounts({
        gameState: gameAccount.publicKey,
        winnerAccounts: [], // Mock winner accounts
        rumble_token_burner: anchor.web3.Keypair.generate().publicKey,
      })
      .rpc();

    const gameState = await program.account.gameState.fetch(gameAccount.publicKey);
    assert.ok(gameState.winners.length > 0);
    assert.ok(gameState.active === true);
    assert.ok(gameState.prizePool.toNumber() === 0);
  });

  it('Resets the game state', async () => {
    await program.methods.resetGame()
      .accounts({
        gameState: gameAccount.publicKey,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    const gameState = await program.account.gameState.fetch(gameAccount.publicKey);
    assert.ok(gameState.active === false);
    assert.ok(gameState.players.length === 0);
    assert.ok(gameState.winners.length === 0);
    assert.ok(gameState.totalDeposits.toNumber() === 0);
  });
});