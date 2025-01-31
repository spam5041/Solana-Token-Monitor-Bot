import { Telegraf, Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { RedisService } from '../services/RedisService';
import { SolanaMonitor } from '../services/SolanaMonitor';
import { Connection } from '@solana/web3.js';

interface CallbackQueryData {
  data: string;
  message?: Message;
}

export function setupBot(
  bot: Telegraf,
  redisService: RedisService,
  solanaMonitor: SolanaMonitor,
  connection: Connection
) {

  bot.command('blacklist', async (ctx) => {
    const blacklist = await redisService.getBlacklist();
    const message = blacklist.length > 0
      ? `📋 Blacklisted addresses:\n\n${blacklist.map((addr, i) => 
          `${i + 1}. ${addr}`
        ).join('\n')}`
      : '📋 Blacklist is empty';
    await ctx.reply(message);
  });

  bot.command('unblacklist', async (ctx) => {
    const address = ctx.message.text.split(' ')[1];
    if (!address) {
      await ctx.reply('❌ Please provide an address to remove from blacklist\nUsage: /unblacklist <address>');
      return;
    }

    await redisService.removeFromBlacklist(address);
    await ctx.reply(`✅ Address ${address} removed from blacklist`);
  });

  // Добавим help команду
  bot.command('help', async (ctx) => {
    const helpMessage = `
🤖 Solana Token Monitor Bot

Commands:
/blacklist - Show blacklisted addresses
/unblacklist <address> - Remove address from blacklist
/help - Show this help message

Features:
• Monitors new token creations
• Shows token metadata and social links
• Blacklist management
• Transaction monitoring
`;
    await ctx.reply(helpMessage);
  });

  bot.command('test', async (ctx) => {
    try {
      await ctx.reply('Bot is working! Checking Solana connection...');
      
      try {
        const slot = await connection.getSlot();
        await ctx.reply(`✅ Connected to Solana network\nCurrent slot: ${slot}`);
        

        const version = await connection.getVersion();
        await ctx.reply(`Solana version: ${version['solana-core']}`);
      } catch (error) {
        console.error('Solana connection error:', error);
        await ctx.reply('❌ Error connecting to Solana network. Please try again later.');
      }

      try {
        const ping = await redisService.ping();
        if (ping) {
          await ctx.reply('✅ Redis connection: OK');
        }
      } catch (error) {
        console.error('Redis connection error:', error);
        await ctx.reply('❌ Error connecting to Redis. Please check Redis server.');
      }
    } catch (error) {
      console.error('Error in test command:', error);
      await ctx.reply('❌ An error occurred while testing the bot.');
    }
  });

  bot.on('callback_query', async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const [action, address] = data.split(':');

    if (action === 'blacklist') {
      await redisService.addToBlacklist(address);
      await ctx.answerCbQuery('Address added to blacklist');
    }
    else if (action === 'monitor') {
      await solanaMonitor.monitorTokenTransactions(address);
      await ctx.answerCbQuery('Started monitoring token transactions');
    }
  });
} 