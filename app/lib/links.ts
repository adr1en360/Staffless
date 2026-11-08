// Explorer links, safe to import from client components.
export const explorerTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const explorerAccount = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
export const explorerBlock = (height: number) => `https://testnet.nearblocks.io/blocks/${height}`;
