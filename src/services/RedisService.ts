import { createClient, RedisClientType } from 'redis';

export class RedisService {
  private client: RedisClientType;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
  }

  async connect() {
    await this.client.connect();
  }

  async addToBlacklist(address: string) {
    await this.client.sAdd('blacklist', address);
  }

  async removeFromBlacklist(address: string) {
    await this.client.sRem('blacklist', address);
  }

  async isBlacklisted(address: string): Promise<boolean> {
    return await this.client.sIsMember('blacklist', address);
  }

  async getBlacklist(): Promise<string[]> {
    return await this.client.sMembers('blacklist');
  }

  async setTokenMonitoring(tokenAddress: string, txCount: number) {
    await this.client.hSet('token_monitoring', tokenAddress, txCount.toString());
  }

  async getTokenMonitoring(tokenAddress: string): Promise<number> {
    const count = await this.client.hGet('token_monitoring', tokenAddress);
    return count ? parseInt(count) : 0;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
      return false;
    }
  }
} 