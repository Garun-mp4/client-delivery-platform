import { createConnection } from 'node:net';

export interface ScanResult {
  readonly clean: boolean;
  readonly engine: string;
  readonly resultCode: string;
}

export interface FileScanner {
  scan(content: Uint8Array): Promise<ScanResult>;
}

export class ClamAvScanner implements FileScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 120_000,
  ) {}

  ping(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => socket.destroy(new Error('SCANNER_TIMEOUT')), 2_000);
      socket.on('connect', () => socket.end('zPING\0'));
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.on('error', reject);
      socket.on('close', () => {
        clearTimeout(timer);
        if (Buffer.concat(chunks).toString('utf8').includes('PONG')) {
          resolve();
        } else {
          reject(new Error('SCANNER_UNAVAILABLE'));
        }
      });
    });
  }

  scan(content: Uint8Array): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => socket.destroy(new Error('SCANNER_TIMEOUT')), this.timeoutMs);
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < content.length; offset += 64 * 1024) {
          const chunk = Buffer.from(content.slice(offset, offset + 64 * 1024));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.on('error', reject);
      socket.on('close', () => {
        clearTimeout(timer);
        const response = Buffer.concat(chunks).toString('utf8').replaceAll('\0', '').trim();
        if (response.endsWith('OK')) {
          resolve({ clean: true, engine: 'clamav', resultCode: 'CLEAN' });
        } else if (response.includes('FOUND')) {
          resolve({ clean: false, engine: 'clamav', resultCode: 'INFECTED' });
        } else {
          reject(new Error('SCANNER_INVALID_RESPONSE'));
        }
      });
    });
  }
}
