import React, { useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { PublicKey } from '@solana/web3.js';
import io from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import styles from '../styles/Home.module.css';

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

const socket = io('http://localhost:8080');

const Home = () => {
  const [gameState, setGameState] = useState<string>('');
  const [winners, setWinners] = useState<{ playerKey: string; prize: number }[]>([]);
  const [playerKey, setPlayerKey] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState<number>(0);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to backend WebSocket');
    });

    socket.on('GAME_STARTED', (data: { gameId: string }) => {
      toast.info(`Game Started: ${data.gameId}`);
      setGameState(`Game ${data.gameId} has started!`);
    });

    socket.on('DEPOSIT_CONFIRMED', (data: { playerKey: string; amount: number }) => {
      toast.success(`Deposit of ${data.amount} SOL confirmed for ${data.playerKey}`);
    });

    socket.on('TRADING_EVALUATED', (data: { gameId: string }) => {
      toast.info(`Trading activities evaluated for game ${data.gameId}`);
    });

    socket.on('WINNERS_SELECTED', (data: { gameId: string; winners: any[] }) => {
      setWinners(data.winners);
      toast.success(`Winners selected for game ${data.gameId}`);
    });

    socket.on('GAME_RESET', (data: { gameId: string }) => {
      setGameState(`Game ${data.gameId} has been reset.`);
      setWinners([]);
      toast.info(`Game ${data.gameId} has been reset.`);
    });

    socket.on('ERROR', (data: { message: string }) => {
      toast.error(`Error: ${data.message}`);
    });

    return () => {
      socket.off('connect');
      socket.off('GAME_STARTED');
      socket.off('DEPOSIT_CONFIRMED');
      socket.off('TRADING_EVALUATED');
      socket.off('WINNERS_SELECTED');
      socket.off('GAME_RESET');
      socket.off('ERROR');
    };
  }, []);

  const handleStartGame = () => {
    const gameId = new PublicKey().toString();
    socket.emit('START_GAME', { gameId });
  };

  const handleDeposit = () => {
    if (!playerKey || depositAmount <= 0) {
      toast.error('Invalid player key or deposit amount.');
      return;
    }
    socket.emit('DEPOSIT', { playerKey, amount: depositAmount, gameId: 'currentGameId' });
  };

  return (
    <ConnectionProvider endpoint={process.env.NEXT_PUBLIC_SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className={styles.container}>
            <header className={styles.header}>
              <h1>RUMBLE</h1>
              <WalletMultiButton />
            </header>

            <main className={styles.main}>
              <button className={styles.button} onClick={handleStartGame}>
                Start Game
              </button>

              <div className={styles.gameState}>
                <h2>Game Status</h2>
                <p>{gameState}</p>
              </div>

              <div className={styles.depositSection}>
                <h2>Make a Deposit</h2>
                <input
                  type="text"
                  placeholder="Player Public Key"
                  value={playerKey}
                  onChange={(e) => setPlayerKey(e.target.value)}
                  className={styles.input}
                />
                <input
                  type="number"
                  placeholder="Amount (SOL)"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className={styles.input}
                />
                <button className={styles.button} onClick={handleDeposit}>
                  Deposit
                </button>
              </div>

              <div className={styles.winners}>
                <h2>Winners</h2>
                {winners.length > 0 ? (
                  <ul>
                    {winners.map((winner, index) => (
                      <li key={index}>
                        {winner.playerKey} - Prize: {winner.prize} SOL
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No winners selected yet.</p>
                )}
              </div>
            </main>

            <ToastContainer position="top-right" autoClose={5000} hideProgressBar />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default Home;

