import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { TokenInfo } from '../types';

export function formatTokenMessage(tokenInfo: TokenInfo): string {
  return `
🆕 <b>New Token Created</b>

📝 <b>Token Info:</b>
• Name: ${tokenInfo.name}
• Symbol: ${tokenInfo.symbol}
• Total Supply: ${tokenInfo.totalSupply}
• Mint Address: <code>${tokenInfo.address}</code>
• Creator: <code>${tokenInfo.creator}</code>

🔗 <b>Links:</b>
• <a href="${tokenInfo.txLink}">View Transaction</a>
• <a href="${tokenInfo.creatorLink}">Creator Profile</a>
• <a href="https://solscan.io/token/${tokenInfo.address}">View Token</a>

${tokenInfo.socialLinks ? `
🌐 <b>Social Links:</b>
${tokenInfo.socialLinks}` : ''}
`;
}

export function formatTransactionMessage(tx: ParsedTransactionWithMeta): string {
  return `
🔄 <b>New Transaction</b>

Type: ${tx.meta?.logMessages?.[0] || 'Unknown'}
From: <code>${tx.transaction.message.accountKeys[0].pubkey.toString()}</code>
To: <code>${tx.transaction.message.accountKeys[1].pubkey.toString()}</code>

🔍 <a href="https://solscan.io/tx/${tx.transaction.signatures[0]}">View on Solscan</a>
`;
} 