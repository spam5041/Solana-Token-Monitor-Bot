import { Connection, PublicKey } from '@solana/web3.js';
import { TokenInfo } from '../types';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export async function getTokenMetadata(
  connection: Connection,
  mintAddress: string
): Promise<Partial<TokenInfo>> {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    const accountInfo = await connection.getAccountInfo(metadataAddress);
    
    if (!accountInfo) {
      console.log('No metadata found for token:', mintAddress);
      return {};
    }

    const metadata = decodeMetadata(accountInfo.data);

    let socialLinks = '';
    try {
      if (metadata.data.uri) {
        const response = await fetch(metadata.data.uri);
        const json = await response.json();
        
        const links = [];
        if (json.external_url) links.push(`Website: ${json.external_url}`);
        if (json.twitter_url) links.push(`Twitter: ${json.twitter_url}`);
        if (json.telegram_url) links.push(`Telegram: ${json.telegram_url}`);
        
        socialLinks = links.join('\n');
      }
    } catch (error) {
      console.error('Error fetching token URI metadata:', error);
    }

    return {
      name: metadata.data.name,
      symbol: metadata.data.symbol,
      socialLinks: socialLinks || undefined
    };
  } catch (error) {
    console.error('Error getting token metadata:', error);
    return {};
  }
}

interface TokenMetadata {
  key: number;
  updateAuthority: string;
  mint: string;
  data: {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators: Array<{
      address: string;
      verified: boolean;
      share: number;
    }> | null;
  };
  primarySaleHappened: boolean;
  isMutable: boolean;
}

function decodeMetadata(buffer: Buffer): TokenMetadata {
  let offset = 0;

  const key = buffer[0];
  offset += 1;

  const updateAuthority = new PublicKey(buffer.slice(offset, offset + 32)).toString();
  offset += 32;

  const mint = new PublicKey(buffer.slice(offset, offset + 32)).toString();
  offset += 32;

  const nameLength = buffer[offset];
  offset += 1;
  const name = buffer.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '');
  offset += nameLength;

  const symbolLength = buffer[offset];
  offset += 1;
  const symbol = buffer.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '');
  offset += symbolLength;

  const uriLength = buffer[offset];
  offset += 1;
  const uri = buffer.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '');
  
  return {
    key,
    updateAuthority,
    mint,
    data: {
      name,
      symbol,
      uri,
      sellerFeeBasisPoints: 0,
      creators: null
    },
    primarySaleHappened: false,
    isMutable: true
  };
} 