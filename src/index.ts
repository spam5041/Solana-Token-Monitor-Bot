import { Telegraf } from 'telegraf';
import { Connection, clusterApiUrl, ConnectionConfig } from '@solana/web3.js';
import { config } from 'dotenv';
import { SolanaMonitor } from './services/SolanaMonitor';
import { RedisService } from './services/RedisService';
import { setupBot } from './bot/setup';

config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

const connectionConfig: ConnectionConfig = {
  commitment: 'confirmed',
  wsEndpoint: process.env.SOLANA_WS_URL,
  confirmTransactionInitialTimeout: 60000,
  httpHeaders: {
    'Cache-Control': 'no-cache',
  }
};

const connection = new Connection(process.env.SOLANA_RPC_URL!, connectionConfig);

const redisService = new RedisService();
const solanaMonitor = new SolanaMonitor(connection, redisService, bot);

setupBot(bot, redisService, solanaMonitor, connection);

async function start() {
  try {
    await redisService.connect();
    console.log('Redis connected');

    try {
      const version = await connection.getVersion();
      console.log('Connected to Solana:', version['solana-core']);
      await solanaMonitor.startMonitoring();
    } catch (error) {
      console.error('Error connecting to Solana:', error);
    }

    await bot.launch();
    console.log('Bot is running...');
  } catch (error) {
    console.error('Error starting the bot:', error);
    process.exit(1);
  }
}

start();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 