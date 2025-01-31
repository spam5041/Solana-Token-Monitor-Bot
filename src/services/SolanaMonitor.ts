import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { Telegraf } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { RedisService } from './RedisService';
import { formatTokenMessage, formatTransactionMessage } from '../utils/formatters';
import { TokenInfo } from '../types';
import { getTokenMetadata } from '../utils/tokenMetadata';

export class SolanaMonitor {
  private lastProcessedTime: number = 0;
  private readonly RATE_LIMIT_MS: number = 5000; // 5 секунд между запросами

  constructor(
    private connection: Connection,
    private redisService: RedisService,
    private bot: Telegraf
  ) {}

  async startMonitoring() {
    console.log('Starting token monitoring...');
    
    this.connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (accountInfo) => {
        try {
          // Проверяем, прошло ли достаточно времени с последнего запроса
          const currentTime = Date.now();
          if (currentTime - this.lastProcessedTime < this.RATE_LIMIT_MS) {
            return;
          }
          this.lastProcessedTime = currentTime;

          // Получаем сигнатуру последней транзакции
          const signatures = await this.connection.getSignaturesForAddress(
            accountInfo.accountId,
            { limit: 1 }
          );

          if (signatures.length > 0) {
            // Добавляем задержку перед запросом транзакции
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const tx = await this.connection.getParsedTransaction(signatures[0].signature);
            if (this.isTokenCreation(tx)) {
              console.log('New token creation detected:', signatures[0].signature);
              await this.handleNewToken(signatures[0].signature);
            }
          }
        } catch (error: any) {
          if (typeof error === 'object' && error !== null && 'message' in error) {
            if (error.message.includes('429')) {
              console.log('Rate limit reached, waiting before next request...');
              await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_MS));
            } else {
              console.error('Error processing account change:', error);
            }
          } else {
            console.error('Unknown error:', error);
          }
        }
      },
      'confirmed'
    );
  }

  private isTokenCreation(tx: ParsedTransactionWithMeta | null): boolean {
    if (!tx?.meta?.logMessages) return false;

    // Проверяем логи на создание токена
    const relevantMessages = [
      'Initialize mint',
      'Token program: initialize mint',
      'Program log: Create',
      'Program log: Instruction: InitializeMint',
      'Create token',
      'Token creation',
      'Initialize a mint',
      'Token mint initialized'
    ];

    const hasRelevantLog = tx.meta.logMessages.some(log => 
      relevantMessages.some(msg => log.toLowerCase().includes(msg.toLowerCase()))
    );

    // Проверяем инструкции
    const hasInitMintInstruction = tx.transaction.message.instructions.some(ix => {
      const parsed = (ix as any).parsed;
      return parsed && parsed.type === 'initializeMint';
    });

    return hasRelevantLog || hasInitMintInstruction;
  }

  async handleNewToken(signature: string) {
    try {
      console.log('Processing new token:', signature);
      
      // Добавляем задержку перед запросом
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const tx = await this.connection.getParsedTransaction(signature);
      if (!tx) {
        console.log('Transaction not found');
        return;
      }

      // Добавляем задержку перед следующим запросом
      await new Promise(resolve => setTimeout(resolve, 1000));

      const tokenInfo = await this.getTokenInfo(tx);
      if (!tokenInfo) {
        console.log('Could not get token info');
        return;
      }

      // Проверяем черный список
      if (await this.redisService.isBlacklisted(tokenInfo.creator)) {
        console.log('Creator is blacklisted:', tokenInfo.creator);
        return;
      }

      console.log('Sending token info to Telegram:', tokenInfo);
      
      await this.bot.telegram.sendMessage(
        process.env.TELEGRAM_GROUP_ID!,
        formatTokenMessage(tokenInfo),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Add Deployer to Blacklist',
                  callback_data: `blacklist:${tokenInfo.creator}`
                },
                {
                  text: 'Monitor Token (Next 10 TX)',
                  callback_data: `monitor:${tokenInfo.address}`
                }
              ]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling new token:', error);
    }
  }

  async monitorTokenTransactions(tokenAddress: string) {
    let txCount = await this.redisService.getTokenMonitoring(tokenAddress);
    
    if (txCount >= 10) return;

    this.connection.onLogs(
      new PublicKey(tokenAddress),
      async (logs) => {
        if (txCount >= 10) {
          return;
        }

        const tx = await this.connection.getParsedTransaction(logs.signature);
        if (!tx) return;

        await this.bot.telegram.sendMessage(
          process.env.TELEGRAM_GROUP_ID!,
          formatTransactionMessage(tx),
          { parse_mode: 'HTML' }
        );

        txCount++;
        await this.redisService.setTokenMonitoring(tokenAddress, txCount);
      },
      'confirmed'
    );
  }

  private async getTokenInfo(tx: ParsedTransactionWithMeta): Promise<TokenInfo | null> {
    try {
      // Получаем адрес токена из транзакции
      const tokenAddress = tx.meta?.postTokenBalances?.[0]?.mint || '';
      if (!tokenAddress) {
        console.error('Could not find token address in transaction');
        return null;
      }

      // Получаем информацию о минте
      const mintInfo = await getMint(this.connection, new PublicKey(tokenAddress));
      
      // Получаем метаданные токена
      const metadata = await getTokenMetadata(this.connection, tokenAddress);

      // Пытаемся получить данные из parsed инструкций
      let name = metadata.name;
      let symbol = metadata.symbol;
      let creator = tx.transaction.message.accountKeys[0].pubkey.toString();

      if (tx.meta?.innerInstructions && tx.meta.innerInstructions.length > 0) {
        for (const innerInstr of tx.meta.innerInstructions) {
          for (const ix of innerInstr.instructions) {
            const parsed = (ix as any).parsed;
            if (parsed && parsed.type === 'initializeMint') {
              symbol = parsed.info.symbol || symbol;
              name = parsed.info.name || name;
            }
          }
        }
      }

      // Проверяем основные инструкции
      if (tx.transaction.message.instructions) {
        for (const ix of tx.transaction.message.instructions) {
          const parsed = (ix as any).parsed;
          if (parsed && parsed.type === 'initializeMint') {
            symbol = parsed.info.symbol || symbol;
            name = parsed.info.name || name;
          }
        }
      }

      // Если все еще нет имени/символа, используем адрес токена
      if (!name) {
        name = `Token ${tokenAddress.slice(0, 8)}`;
      }
      if (!symbol) {
        // Пытаемся получить символ из логов
        const symbolFromLogs = tx.meta?.logMessages?.find(log => 
          log.includes('symbol:') || log.includes('Symbol:')
        );
        if (symbolFromLogs) {
          symbol = symbolFromLogs.split(':')[1].trim();
        } else {
          symbol = name.split(' ')[0];
        }
      }

      console.log('Token data found:', { name, symbol, creator });

      const tokenInfo: TokenInfo = {
        name: name,
        symbol: symbol,
        totalSupply: mintInfo.supply.toString(),
        creator: creator,
        address: tokenAddress,
        txLink: `https://solscan.io/tx/${tx.transaction.signatures[0]}`,
        creatorLink: `https://solscan.io/account/${creator}`,
        socialLinks: metadata.socialLinks
      };

      return tokenInfo;
    } catch (error) {
      console.error('Error getting token info:', error);
      return null;
    }
  }
} 