import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACT_PATHS, serializeRequest } from './logger.module';

describe('logging', () => {
  it('logs request URLs without the query string', () => {
    const req = { id: 'abc12345', method: 'GET', url: '/api/v1/card/verify?t=secret-token' };
    expect(serializeRequest(req as never)).toEqual({
      id: 'abc12345',
      method: 'GET',
      url: '/api/v1/card/verify',
    });
  });

  it('redacts secrets and credentials from log lines', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);

    logger.info({
      req: { headers: { authorization: 'Bearer eyJhbGciOi', cookie: 'rt=abc' } },
      body: {
        password: 'hunter2hunter2',
        specialistCertificateNo: '12345',
        email: 'x@example.test',
      },
    });

    const output = lines.join('');
    expect(output).not.toContain('eyJhbGciOi');
    expect(output).not.toContain('rt=abc');
    expect(output).not.toContain('hunter2hunter2');
    expect(output).not.toContain('12345');
    expect(output).toContain('[REDACTED]');
  });
});
